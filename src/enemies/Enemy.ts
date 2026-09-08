import * as THREE from 'three';
import type { PhysicsWorld, CharacterHandle } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { EnemyDefinition } from '@/data/enemies';
import { isDamageable, type Damageable } from '@/combat/Damageable';
import type { PlayerStats } from '@/player/PlayerStats';
import {
  AUTOSTEP_HEIGHT,
  CHARACTER_SKIN,
  GRAVITY,
  ON_THE_SAND_Y,
  MAX_SLOPE_CLIMB_ANGLE,
} from '@/game/constants';
import type { LoadedModel } from '@/art/ModelLoader';
import { stepEnemyAI, type EnemyAIState } from './EnemyAI';
import {
  FAN_OFFSETS,
  PROBE_RANGE,
  shoulderOrigins,
  steerAround,
  type FanProbe,
} from './EnemySteering';
import { CAPSULE_FOOT_OFFSET, CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from './EnemyMesh';
import { EnemyVisual } from './EnemyVisual';
import { levelOf, nextWaypointIndex, segmentIsClear, type NavGraph } from './NavGraph';
import { cellCenter, worldToCell, type Cell } from '@/building/BuildGrid';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import { hitboxContains, subsystemTargetFor } from './EnemyTargeting';

export { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from './EnemyMesh';

/**
 * As much of `MachineDamage` as an enemy needs to break the engine.
 *
 * Narrowed for the same reason `StructureDamage` is: an enemy has no business
 * reading the machine's speed model or repairing anything.
 */
export interface SubsystemDamage {
  damage(id: SubsystemId, amount: number): number;
}

/**
 * As much of `BuildSystem` as an enemy needs to chew through a wall.
 *
 * Narrowed to the one method on purpose: an enemy has no business placing,
 * demolishing or pricing anything, and a full `BuildSystem` here would make
 * `Enemy` untestable without Rapier and Three.
 */
export interface StructureDamage {
  damagePiece(instanceId: string, amount: number): number;
}

/**
 * Height, relative to the capsule's centre, that the probes are cast from.
 *
 * Just above what the character controller can step over. Cast at chest height
 * instead and the rays sail clean over every low lip and cargo base on the
 * deck, reporting a clear path into something the body cannot actually climb —
 * which is what the enemy then walks into and sticks on. Cast at the feet and
 * every ray hits the deck plate underfoot. This is the one band that answers
 * the question being asked: can I walk this way?
 */
const PROBE_HEIGHT = -CAPSULE_FOOT_OFFSET + AUTOSTEP_HEIGHT + 0.05;
const WALKABLE_NORMAL_Y = Math.cos(MAX_SLOPE_CLIMB_ANGLE);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * How far ahead along the route `currentWaypoint` is allowed to reach, past
 * the immediate cell, looking for a farther waypoint to aim at instead.
 *
 * A tile and a half. Short enough that the aim still tracks the route rather
 * than cutting toward some distant corner; long enough to usually reach past
 * a single 2m leg to the one after it, which is what breaks a heading that
 * would otherwise point dead broadside into flush equipment for the whole of
 * that leg.
 */
const WAYPOINT_LOOKAHEAD = 3.2;

/**
 * Half the width the body actually needs to pass through a gap.
 *
 * The radius plus the gap the controller keeps around it. Measured short of
 * this, the fan cannot tell a usable route from a slot the enemy will wedge in.
 */
const BODY_HALF_WIDTH = CAPSULE_RADIUS + CHARACTER_SKIN;

/**
 * Seconds of asking to move and not moving before an enemy is called wedged.
 *
 * Long enough not to trip on the single blocked tick that walking into a wall
 * and sliding along it produces, short enough that a scavenger does not stand
 * visibly still first.
 */
const WEDGED_AFTER = 0.35;

/**
 * Seconds spent backing out once wedged.
 *
 * It has to outlast the pinch itself, or the enemy reverses a few centimetres,
 * aims at the player again, and walks straight back into it.
 */
const BACKING_OUT_FOR = 0.9;

/** Fraction of the requested movement below which a tick counts as blocked. */
const BLOCKED_FRACTION = 0.25;

/**
 * A hostile scavenger.
 *
 * Uses the same kinematic character controller as the player, so it handles
 * deck plates, steps, and equipment identically — no separate movement code to
 * keep in sync.
 */
export class Enemy {
  private readonly visual: EnemyVisual;

  private handle: CharacterHandle | null = null;
  private readonly position = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly renderPosition = new THREE.Vector3();
  private readonly toPlayer = new THREE.Vector3();
  private readonly probeOrigin = new THREE.Vector3();
  private readonly probeDir = new THREE.Vector3();
  private readonly blockDir = new THREE.Vector3();
  /** The detour chosen last tick, so a route around an obstacle is kept. */
  private lastTurn = 0;
  /** Seconds spent asking to move and going nowhere. */
  private blockedFor = 0;
  /** Seconds left of backing out of a pinch. */
  private backingOutFor = 0;

  private path: Cell[] = [];
  private pathIndex = 0;
  /** The graph `path` was computed against, for the lookahead's wall check. */
  private nav: NavGraph | null = null;

  /**
   * How far the deck under this enemy moved this step, from the machine's
   * pose. Written by the manager before `fixedUpdate`, exactly as the player's
   * is written by `Game`; zero while the machine's body is at rest.
   *
   * Rapier's character controller does not carry a character when the surface
   * under it moves, and a scavenger is standing on a deck that heaves, pitches
   * and rolls. Without this the deck rises INTO the capsule, the controller
   * answers by reporting grounded with zero movement, and the arrival stands
   * on its landing mark for the rest of the run — which is exactly what
   * `combat.mjs` measured: 0 of 3 moved a metre in six seconds.
   */
  readonly carry = { x: 0, y: 0, z: 0 };

  private state: EnemyAIState = 'idle';
  private health: number;
  private verticalVelocity = 0;
  private timeSinceLastAttack = 999;
  private deathTimer = 0;
  private facing = 0;
  private active = false;

  constructor(
    readonly id: string,
    readonly def: EnemyDefinition,
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    materials: Materials,
    model: LoadedModel | null = null,
  ) {
    this.health = def.maxHealth;
    this.visual = new EnemyVisual(model, materials, def.tint);
    this.object3D.visible = false;
    scene.add(this.object3D);
  }

  /** Where this enemy is drawn. Owned by the visual; positioned here. */
  get object3D(): THREE.Group {
    return this.visual.object3D;
  }

  get isActive(): boolean {
    return this.active;
  }

  get aiState(): EnemyAIState {
    return this.state;
  }

  get currentHealth(): number {
    return this.health;
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  /**
   * The subsystem this enemy is here to break, or null if it wants the player.
   *
   * Data, not behaviour: a raider is told apart from a scavenger by what it is
   * trying to reach, and that lives in `enemies.ts`.
   */
  get subsystemGoal(): SubsystemId | null {
    return subsystemTargetFor(this.def);
  }

  /**
   * The cell this enemy routes to. The player's, unless it wants a subsystem.
   *
   * The goal is the subsystem's `repairAt`, NOT its hitbox: four of the five
   * hitboxes are leg hips, which sit outboard of the deck and below its plane,
   * so nothing that walks can reach one. `repairAt` is the deck cell a body
   * can actually stand on to service it, which is exactly the cell a body has
   * to stand on to hit it.
   */
  goalCell(playerCell: Cell): Cell {
    const sub = this.subsystemGoal;
    if (!sub) return playerCell;
    const at = SUBSYSTEMS[sub].repairAt;
    return worldToCell(at.x, at.z, levelOf(at.y));
  }

  /** The grid cell this enemy is standing in. */
  get gridCell(): Cell {
    const feetY = this.position.y - CAPSULE_FOOT_OFFSET;
    return worldToCell(this.position.x, this.position.z, levelOf(feetY));
  }

  /** Waypoints still ahead of this enemy. Read by the combat harness. */
  get pathLength(): number {
    return Math.max(0, this.path.length - this.pathIndex);
  }

  /**
   * Replace the route. Called by the manager, never from inside the enemy.
   *
   * `nav` is the graph `path` was computed against — kept so the lookahead in
   * `currentWaypoint` can prove a farther waypoint is reachable in a straight
   * line before aiming at it, rather than aiming on distance alone.
   */
  setPath(path: Cell[], nav: NavGraph): void {
    this.path = path;
    this.pathIndex = 0;
    this.nav = nav;
  }

  spawn(at: THREE.Vector3): void {
    this.health = this.def.maxHealth;
    this.state = 'idle';
    this.verticalVelocity = 0;
    this.timeSinceLastAttack = 999;
    this.deathTimer = 0;
    this.blockedFor = 0;
    this.backingOutFor = 0;
    // This enemy is a pooled slot, not a fresh object — anything not reset
    // here is inherited from whatever last occupied it. `path`/`pathIndex`
    // are the previous occupant's route: left alone, the new spawn would
    // steer those stale waypoints for up to a full repath rotation. `nav` is
    // worse left stale than left null — a dangling graph reference still
    // looks valid to `segmentIsClear`'s lookahead, so it would validate the
    // old occupant's route against a graph that may no longer describe the
    // deck, rather than failing loudly. `lastTurn` is a steering bias that
    // means nothing for a body now standing somewhere else entirely.
    this.path = [];
    this.pathIndex = 0;
    this.nav = null;
    this.lastTurn = 0;
    this.position.copy(at);
    this.previousPosition.copy(at);

    this.handle = this.physics.addCharacter(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT, at);

    const damageable: Damageable = {
      kind: 'enemy',
      id: this.id,
      armor: this.def.armor,
      takeDamage: (amount) => this.takeDamage(amount),
    };
    this.physics.setUserData(this.handle.collider, damageable);

    // A pooled enemy may have died in its last life still holding the death
    // pose, and `setState` ignores repeat calls for a state it thinks it is
    // already in.
    this.visual.reset();
    this.visual.setHealth(this.health, this.def.maxHealth);

    this.object3D.visible = true;
    this.active = true;
    this.bus.emit('enemy:spawned', { enemyId: this.id, position: { ...at } });
  }

  takeDamage(amount: number): void {
    if (!this.active || this.state === 'dead') return;

    this.health = Math.max(0, this.health - amount);
    // Shooting one used to produce nothing visible until it died. A scavenger
    // that does not react is indistinguishable from deck furniture, which is
    // exactly what the player took it for.
    this.visual.flash();
    this.visual.setHealth(this.health, this.def.maxHealth);
    this.bus.emit('enemy:damaged', {
      enemyId: this.id,
      amount,
      remaining: this.health,
    });

    if (this.health === 0) this.die();
  }

  private die(): void {
    this.state = 'dead';
    this.deathTimer = 0;
    // Drop the collider immediately so corpses do not block shots or bodies.
    if (this.handle) {
      this.physics.removeCollider(this.handle.collider);
      this.physics.removeBody(this.handle.body);
      this.handle = null;
    }
    this.bus.emit('enemy:killed', {
      enemyId: this.id,
      defId: this.def.id,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
    });
  }

  fixedUpdate(
    dt: number,
    playerPos: THREE.Vector3,
    playerStats: PlayerStats,
    build: StructureDamage | null = null,
    machineDamage: SubsystemDamage | null = null,
  ): void {
    if (!this.active) return;

    if (this.state === 'dead') {
      this.visual.setState('dead');
      this.deathTimer += dt;
      if (this.deathTimer > 2.5) this.despawn();
      return;
    }
    if (!this.handle) return;

    this.timeSinceLastAttack += dt;

    this.toPlayer.subVectors(playerPos, this.position);
    const distance = this.toPlayer.length();

    // Computed once and reused below, so the thing that decided the swing is
    // the same thing the swing lands on.
    const blockedBy = this.blockerToward(playerPos);

    const decision = stepEnemyAI(this.state, this.def, {
      distanceToPlayer: distance,
      health: this.health,
      timeSinceLastAttack: this.timeSinceLastAttack,
      blockedBy,
    });
    /**
     * Arriving at the subsystem it came for is its OWN attack trigger.
     *
     * `stepEnemyAI` decides swings by the distance to the player, and a raider
     * that has crossed the deck to the engine is usually nowhere near them —
     * so left to the decision alone it would stand at the engine and never
     * touch it, and engine-as-stop would be dead code. Death still wins: a
     * corpse at the engine is not attacking anything.
     */
    const sub = this.subsystemGoal;
    const atSubsystem =
      sub !== null && decision.state !== 'dead' && hitboxContains(sub, this.position);

    this.state = atSubsystem ? 'attack' : decision.state;
    this.visual.setState(this.state);

    if (atSubsystem && sub) {
      // Its own cooldown, on the same clock, because it is not going through
      // the decision that would otherwise have applied one.
      if (this.timeSinceLastAttack >= this.def.attackCooldown) {
        this.timeSinceLastAttack = 0;
        machineDamage?.damage(sub, this.def.damage);
      }
    } else if (decision.shouldAttack) {
      this.timeSinceLastAttack = 0;
      if (decision.attackTarget === 'player') {
        playerStats.damage(this.def.damage, this.def.name, {
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
        });
      } else if (decision.attackTarget === 'blocker' && blockedBy) {
        build?.damagePiece(blockedBy, this.def.damage);
      }
    }

    // Head for the player, feeling around whatever is in the way. Straight
    // steering alone was enough when the only hostiles were debug-spawned in
    // front of you; now they board at the deck edge and have to cross a deck
    // cluttered with the engine, generator, fuel tank and cargo, and roughly
    // half of them used to wedge and never arrive.
    let vx = 0;
    let vz = 0;
    if (this.state === 'navigate' || this.state === 'pursue') {
      // Aim at the next waypoint, not at the player. A* decided which way
      // round the building; the probe fan below still decides how to get down
      // the next metre and a half without walking into the generator. Those
      // are different scales of problem and stay separate systems.
      const target = this.currentWaypoint();
      // On the last leg there is no waypoint and the body steers straight at
      // what it came for. For a raider that is its subsystem, not the player —
      // otherwise it would path the whole way to the engine and then peel off
      // toward the player on the final two metres.
      const finalX = sub ? SUBSYSTEMS[sub].repairAt.x - this.position.x : this.toPlayer.x;
      const finalZ = sub ? SUBSYSTEMS[sub].repairAt.z - this.position.z : this.toPlayer.z;
      const tx = target ? target.x - this.position.x : finalX;
      const tz = target ? target.z - this.position.z : finalZ;

      const flat = Math.hypot(tx, tz);
      if (flat > 1e-4) {
        const dirX = tx / flat;
        const dirZ = tz / flat;
        const heading = steerAround(dirX, dirZ, this.probe(dirX, dirZ), {
          previousTurn: this.lastTurn,
          stuck: this.backingOutFor > 0,
        });
        this.lastTurn = heading.turn;
        vx = heading.x * this.def.moveSpeed;
        vz = heading.z * this.def.moveSpeed;
        this.facing = Math.atan2(vx, vz);
      }
    }

    const { controller, collider, body } = this.handle;
    const grounded = controller.computedGrounded();
    this.verticalVelocity =
      grounded && this.verticalVelocity <= 0 ? -2 : this.verticalVelocity + GRAVITY * dt;

    controller.computeColliderMovement(collider, {
      x: vx * dt,
      y: this.verticalVelocity * dt,
      z: vz * dt,
    });
    const moved = controller.computedMovement();

    // Wedge detection. A scavenger can slide into a gap narrower than itself —
    // the deck leaves a couple — and the controller then reports grounded, no
    // lateral collision, and exactly zero movement, forever. Nothing in the
    // fan can see that, because from inside the pinch every direction is
    // genuinely obstructed; the only way out is to stop steering at the player
    // for a moment.
    const asked = Math.hypot(vx, vz) * dt;
    const got = Math.hypot(moved.x, moved.z);
    if (asked > 1e-5 && got < asked * BLOCKED_FRACTION) {
      this.blockedFor += dt;
      if (this.blockedFor >= WEDGED_AFTER) {
        this.backingOutFor = BACKING_OUT_FOR;
        this.blockedFor = 0;
      }
    } else {
      this.blockedFor = 0;
    }
    if (this.backingOutFor > 0) this.backingOutFor = Math.max(0, this.backingOutFor - dt);

    this.previousPosition.copy(this.position);
    this.position.set(
      this.position.x + moved.x + this.carry.x,
      this.position.y + moved.y + this.carry.y,
      this.position.z + moved.z + this.carry.z,
    );
    body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });

    // Fell off the machine — no point simulating it any further.
    //
    // The threshold is the sand, not the void. It used to be -25, on the
    // assumption that anything leaving the deck kept falling forever; the
    // desert floor ended that, and a scavenger that walked off the side now
    // lands, stands there, and is simulated and counted against
    // MAX_ACTIVE_ENEMIES for the rest of the run while the machine walks away
    // from it. Same fate as the player's, minus the ceremony: there is no
    // catching a machine that moves at exactly sprint speed.
    if (this.position.y < ON_THE_SAND_Y) this.despawn();
  }

  /**
   * The structure standing between this enemy and the player, if any.
   *
   * `stepEnemyAI` used to decide attacks on straight-line distance alone. Grid
   * cells are 2m and a scavenger reaches 2.2m, so an enemy in the cell next to
   * the player was inside attack range WITH A WALL BETWEEN, and hit them
   * through it. Walls did not protect anybody.
   *
   * Cast from capsule centre to capsule centre rather than derived from the
   * grid, because the grid knows which cells hold walls but not where a body
   * standing between two of them actually is — and the enemy already owns a
   * physics world and casts a fan of rays through it every tick.
   *
   * Capped at the enemy's own reach, NOT at the whole distance to the player.
   * Uncapped, an enemy thirty metres away would stop and chew the first wall
   * on its sight line, metres before it ever got there. Only what it could
   * swing at counts as blocking it.
   *
   * Machine geometry is deliberately not a blocker: it carries no damage
   * target, so an enemy behind the generator would be told to attack something
   * that cannot be hurt and would stand there swinging at it forever.
   */
  private blockerToward(playerPos: THREE.Vector3): string | null {
    const handle = this.handle;
    if (!handle) return null;

    this.blockDir.subVectors(playerPos, this.position);
    const gap = this.blockDir.length();
    if (gap < 1e-4) return null;
    this.blockDir.divideScalar(gap);

    const reach = Math.min(gap, this.def.attackRange);
    const hit = this.physics.raycast(this.position, this.blockDir, reach, handle.collider);
    // A climbable ramp is a route, not a wall to destroy.
    if (!hit || hit.normal.y >= WALKABLE_NORMAL_Y) return null;

    const data = hit.userData;
    return isDamageable(data) && data.kind === 'structure' ? data.id : null;
  }

  /**
   * The waypoint to steer at, advancing past any already reached.
   *
   * Null on the last leg, which hands the final approach back to steering
   * straight at the player — the waypoint is a 2m cell centre and the player
   * is not standing on it.
   *
   * Advancing is delegated to `nextWaypointIndex`, which refuses to consume a
   * waypoint on a different storey no matter how close it is horizontally —
   * see its doc comment for why a stairs landing needs that guard.
   *
   * Looks past the immediate cell to the farthest upcoming one still inside
   * WAYPOINT_LOOKAHEAD. A single 2m leg is often close to axis-aligned with
   * whatever the grid happened to route round, which can aim the body dead
   * broadside into flush equipment: a heading the fan cannot hold, because
   * from flush against a flat wall the openness on either side flips every
   * tick faster than the commitment bonus can settle it, and the enemy
   * oscillates in place. Reaching one leg further lets the next corner's pull
   * bend the heading off the wall before the enemy is close enough to wedge
   * on it — the same route, aimed less myopically.
   *
   * Distance alone is not enough to accept a farther candidate: A* is blind
   * to equipment but not to walls, and a wall it routed around can sit
   * directly on the straight line between two cells that are themselves both
   * on the route (an L-shaped detour's two arms can be closer to each other,
   * as the crow flies, than either is to the corner between them). Each
   * candidate is only accepted once `segmentIsClear` proves the straight line
   * to it does not cross anything A* avoided.
   */
  private currentWaypoint(): { x: number; z: number } | null {
    this.pathIndex = nextWaypointIndex(
      this.path,
      { x: this.position.x, z: this.position.z },
      this.gridCell.y,
      this.pathIndex,
    );
    if (this.pathIndex >= this.path.length) return null;
    // The destination cell is the player's own; steer at the player there.
    if (this.pathIndex === this.path.length - 1) return null;

    let target = cellCenter(this.path[this.pathIndex] as Cell);
    if (this.nav) {
      const nav = this.nav;
      const anchor = this.gridCell;
      for (let i = this.pathIndex + 1; i < this.path.length - 1; i++) {
        const candidateCell = this.path[i] as Cell;
        const candidate = cellCenter(candidateCell);
        const dist = Math.hypot(candidate.x - this.position.x, candidate.z - this.position.z);
        if (dist > WAYPOINT_LOOKAHEAD) break;
        if (!segmentIsClear(nav, anchor, candidateCell)) break;
        target = candidate;
        // Confirmed reachable in a straight line, so everything between the
        // old pathIndex and here is subsumed — advance past it rather than
        // leaving the pointer on a waypoint the body will never approach
        // (it would otherwise only self-heal on the next repath).
        this.pathIndex = i;
      }
    }
    return { x: target.x, z: target.z };
  }

  /**
   * Cast the fan around a heading.
   *
   * Three rays per direction, at the body's own width: the nearest of them is
   * what that direction is worth, so a slot the capsule cannot fit through
   * reads as blocked rather than as open road.
   *
   * The enemy's own collider is excluded, or every probe would report a hit at
   * zero distance and it would spin on the spot. Other enemies are NOT
   * excluded: flowing around each other is the behaviour we want.
   */
  private probe(dirX: number, dirZ: number): FanProbe[] {
    const handle = this.handle;
    if (!handle) return [];

    const y = this.position.y + PROBE_HEIGHT;
    const ground = this.physics.raycast(
      this.position,
      DOWN,
      CAPSULE_FOOT_OFFSET + CHARACTER_SKIN + 0.25,
      handle.collider,
    );
    const slope = ground && ground.normal.y >= WALKABLE_NORMAL_Y ? ground.normal : null;

    return FAN_OFFSETS.map((angle) => {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const dx = dirX * cos - dirZ * sin;
      const dz = dirX * sin + dirZ * cos;
      // Follow the ground grade while climbing. Horizontal ankle-height rays
      // see the upper floor's thin edge as a wall just before reaching it.
      const dy = slope ? -(slope.x * dx + slope.z * dz) / slope.y : 0;
      this.probeDir.set(dx, dy, dz).normalize();

      let nearest: number | null = null;
      for (const offset of shoulderOrigins(dx, dz, BODY_HALF_WIDTH)) {
        this.probeOrigin.set(this.position.x + offset.x, y, this.position.z + offset.z);
        const hit = this.physics.raycast(
          this.probeOrigin,
          this.probeDir,
          PROBE_RANGE,
          handle.collider,
        );
        // Low probes intersect a ramp before the capsule reaches its slope.
        // Use the controller's slope limit so steering accepts the same ground.
        if (hit && hit.normal.y < WALKABLE_NORMAL_Y && (nearest === null || hit.distance < nearest))
          nearest = hit.distance;
      }
      return { angle, distance: nearest };
    });
  }

  /**
   * Place and animate the drawn body.
   *
   * `dt` is the frame delta, not the fixed step: animation is presentation, and
   * advancing the mixer on the fixed step stutters whenever frame rate and tick
   * rate disagree, which is most of the time.
   */
  update(alpha: number, dt: number): void {
    if (!this.active) return;

    this.renderPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.object3D.position.copy(this.renderPosition);

    // Not while dead: the death clip, or the collapsing box, should not spin to
    // face a player who walks around the corpse.
    if (this.state !== 'dead') this.object3D.rotation.y = this.facing;

    this.visual.update(dt);
  }

  despawn(): void {
    if (this.handle) {
      this.physics.removeCollider(this.handle.collider);
      this.physics.removeBody(this.handle.body);
      this.handle = null;
    }
    this.active = false;
    this.object3D.visible = false;
  }

  /** Retire this enemy for good: it leaves the scene and is not reused. */
  dispose(): void {
    this.despawn();
    this.scene.remove(this.object3D);
    this.visual.dispose();
  }
}
