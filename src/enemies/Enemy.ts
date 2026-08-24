import * as THREE from 'three';
import type { PhysicsWorld, CharacterHandle } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { EnemyDefinition } from '@/data/enemies';
import type { Damageable } from '@/player/PlayerCombat';
import type { PlayerStats } from '@/player/PlayerStats';
import { AUTOSTEP_HEIGHT, CHARACTER_SKIN, GRAVITY } from '@/game/constants';
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
import { levelOf } from './NavGraph';
import { cellCenter, worldToCell, type Cell } from '@/building/BuildGrid';

export { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from './EnemyMesh';

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

/**
 * How close counts as having reached a waypoint.
 *
 * A little over half a tile. Tighter and an enemy nudged off line by the probe
 * fan orbits a waypoint it can never quite touch; looser and it cuts corners
 * through the wall the waypoint existed to route it around.
 */
const WAYPOINT_REACHED = 1.1;

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
  /** The detour chosen last tick, so a route around an obstacle is kept. */
  private lastTurn = 0;
  /** Seconds spent asking to move and going nowhere. */
  private blockedFor = 0;
  /** Seconds left of backing out of a pinch. */
  private backingOutFor = 0;

  private path: Cell[] = [];
  private pathIndex = 0;

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
    this.visual = new EnemyVisual(model, materials);
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

  /** The grid cell this enemy is standing in. */
  get gridCell(): Cell {
    const feetY = this.position.y - CAPSULE_FOOT_OFFSET;
    return worldToCell(this.position.x, this.position.z, levelOf(feetY));
  }

  /** Waypoints still ahead of this enemy. Read by the combat harness. */
  get pathLength(): number {
    return Math.max(0, this.path.length - this.pathIndex);
  }

  /** Replace the route. Called by the manager, never from inside the enemy. */
  setPath(path: Cell[]): void {
    this.path = path;
    this.pathIndex = 0;
  }

  spawn(at: THREE.Vector3): void {
    this.health = this.def.maxHealth;
    this.state = 'idle';
    this.verticalVelocity = 0;
    this.timeSinceLastAttack = 999;
    this.deathTimer = 0;
    this.blockedFor = 0;
    this.backingOutFor = 0;
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

  fixedUpdate(dt: number, playerPos: THREE.Vector3, playerStats: PlayerStats): void {
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

    const decision = stepEnemyAI(this.state, this.def, {
      distanceToPlayer: distance,
      health: this.health,
      timeSinceLastAttack: this.timeSinceLastAttack,
    });
    this.state = decision.state;
    this.visual.setState(this.state);

    if (decision.shouldAttack) {
      this.timeSinceLastAttack = 0;
      playerStats.damage(this.def.damage, this.def.name, {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      });
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
      const tx = target ? target.x - this.position.x : this.toPlayer.x;
      const tz = target ? target.z - this.position.z : this.toPlayer.z;

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
    this.verticalVelocity = grounded && this.verticalVelocity <= 0 ? -2 : this.verticalVelocity + GRAVITY * dt;

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
      this.position.x + moved.x,
      this.position.y + moved.y,
      this.position.z + moved.z,
    );
    body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });

    // Fell off the machine — no point simulating it any further.
    if (this.position.y < -25) this.despawn();
  }

  /**
   * The waypoint to steer at, advancing past any already reached.
   *
   * Null on the last leg, which hands the final approach back to steering
   * straight at the player — the waypoint is a 2m cell centre and the player
   * is not standing on it.
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
   */
  private currentWaypoint(): { x: number; z: number } | null {
    while (this.pathIndex < this.path.length) {
      const cell = this.path[this.pathIndex] as Cell;
      const centre = cellCenter(cell);
      const dx = centre.x - this.position.x;
      const dz = centre.z - this.position.z;
      if (Math.hypot(dx, dz) > WAYPOINT_REACHED) break;
      this.pathIndex++;
    }
    if (this.pathIndex >= this.path.length) return null;
    // The destination cell is the player's own; steer at the player there.
    if (this.pathIndex === this.path.length - 1) return null;

    let target = cellCenter(this.path[this.pathIndex] as Cell);
    for (let i = this.pathIndex + 1; i < this.path.length - 1; i++) {
      const candidate = cellCenter(this.path[i] as Cell);
      const dist = Math.hypot(candidate.x - this.position.x, candidate.z - this.position.z);
      if (dist > WAYPOINT_LOOKAHEAD) break;
      target = candidate;
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

    return FAN_OFFSETS.map((angle) => {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const dx = dirX * cos - dirZ * sin;
      const dz = dirX * sin + dirZ * cos;
      this.probeDir.set(dx, 0, dz);

      let nearest: number | null = null;
      for (const offset of shoulderOrigins(dx, dz, BODY_HALF_WIDTH)) {
        this.probeOrigin.set(
          this.position.x + offset.x,
          y,
          this.position.z + offset.z,
        );
        const hit = this.physics.raycast(
          this.probeOrigin,
          this.probeDir,
          PROBE_RANGE,
          handle.collider,
        );
        if (hit && (nearest === null || hit.distance < nearest)) nearest = hit.distance;
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

