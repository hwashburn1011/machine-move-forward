import * as THREE from 'three';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import type { PlayerStats } from '@/player/PlayerStats';
import { ENEMIES } from '@/data/enemies';
import { Enemy, type StructureDamage, type SubsystemDamage } from './Enemy';
import { findPath, levelOf, type NavGraph } from './NavGraph';
import { cellCenter, worldToCell } from '@/building/BuildGrid';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';
import { chooseWardenFlank, type FlankCandidate } from './EnemyTactics';

const POOL_SIZE = 8;

/**
 * Pooled enemies (handoff section 39).
 *
 * Enemies are constructed once and reused. Building geometry and colliders per
 * spawn would hitch the frame exactly when combat starts.
 */
export class EnemyManager {
  private readonly pool: Enemy[] = [];
  private readonly modelByDefinition = new Map<string, LoadedModel | null>();
  private nextId = 0;
  private repathTick = 0;
  private readonly flankUntil = new Map<string, number>();
  private readonly flankTargets = new Map<string, { x: number; y: number; z: number }>();
  private simulationTime = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    private readonly materials: Materials,
    private model: LoadedModel | null = null,
  ) {}

  /** Whether enemies are drawn as the character model or the fallback box. */
  get hasModel(): boolean {
    return this.model !== null;
  }

  /**
   * Swap the model every future enemy is built from. Empties the pool.
   *
   * The pool is built lazily and kept for the run, so enemies constructed
   * before the model finished loading would keep their boxes forever and the
   * model would silently never appear.
   */
  setModel(model: LoadedModel | null): void {
    this.despawnAll();
    for (const enemy of this.pool) enemy.dispose();
    this.pool.length = 0;
    this.model = model;
  }

  /** Supply a visual variant for an enemy definition (e.g. authored raiders). */
  setModelFor(defId: string, model: LoadedModel | null): void {
    this.modelByDefinition.set(defId, model);
    this.despawnAll();
    for (const enemy of this.pool) enemy.dispose();
    this.pool.length = 0;
  }

  get active(): Enemy[] {
    return this.pool.filter((e) => e.isActive);
  }

  get activeCount(): number {
    let n = 0;
    for (const e of this.pool) if (e.isActive) n++;
    return n;
  }

  /** Sovereign support reduction; definitions remain immutable. */
  damageMultiplierFor(enemy: Enemy): number {
    if (!enemy.isActive) return 1;
    for (const owner of this.pool) {
      if (
        owner === enemy ||
        !owner.isActive ||
        owner.aiState === 'dead' ||
        owner.def.id !== 'sovereign'
      )
        continue;
      const support = owner.tacticalSnapshot;
      if (support?.droneAlive && owner.worldPosition.distanceTo(enemy.worldPosition) <= 7)
        return 0.8;
    }
    return 1;
  }
  chooseWardenFlank(candidates: readonly FlankCandidate[]): FlankCandidate | null {
    return chooseWardenFlank(candidates);
  }

  /** The currently committed Warden destination, for tactical visuals/tests. */
  flankTarget(enemyId: string): { x: number; y: number; z: number } | null {
    return this.flankTargets.get(enemyId) ?? null;
  }

  /** Build reusable rigs during loading, without spawning bodies or encounter events. */
  prewarm(definitions: readonly string[]): readonly Enemy[] {
    for (const id of definitions) {
      const def = ENEMIES[id];
      if (!def || this.pool.length >= POOL_SIZE) continue;
      this.pool.push(
        new Enemy(
          `enemy-${this.nextId++}`,
          def,
          this.scene,
          this.physics,
          this.bus,
          this.materials,
          this.modelByDefinition.get(id) ?? this.model,
        ),
      );
    }
    return this.pool;
  }

  spawn(defId: string, at: THREE.Vector3): Enemy | null {
    const def = ENEMIES[defId];
    if (!def) return null;

    // Same DEFINITION, not merely inactive. The pool has always reused
    // whichever slot was free, which was correct while there was one enemy
    // type and silently wrong the moment there were two: a freed scavenger
    // would have been handed back as a raider, keeping the scavenger's speed,
    // health, drops and colour, because `def` is fixed at construction and
    // `spawn` only moves a body.
    let enemy = this.pool.find((e) => !e.isActive && e.def.id === defId);
    if (!enemy) {
      if (this.pool.length >= POOL_SIZE) {
        // Retire an idle slot of another type. A full cache is not a full deck.
        const retired = this.pool.findIndex((e) => !e.isActive);
        if (retired < 0) return null;
        this.pool[retired]!.dispose();
        this.pool.splice(retired, 1);
      }
      enemy = new Enemy(
        `enemy-${this.nextId++}`,
        def,
        this.scene,
        this.physics,
        this.bus,
        this.materials,
        this.modelByDefinition.get(defId) ?? this.model,
      );
      this.pool.push(enemy);
    }

    enemy.spawn(at);
    this.flankUntil.delete(enemy.id);
    this.flankTargets.delete(enemy.id);
    return enemy;
  }

  /**
   * `carryFor` is how far the deck moved under a point this step, from the
   * machine's own pose. Sampled per enemy rather than once for the deck: under
   * pitch and roll the extremities move most, and two scavengers ten metres
   * apart are carried by measurably different amounts. Omit it and enemies
   * stand on a deck they believe is still — which is what they did.
   */
  fixedUpdate(
    dt: number,
    playerPos: THREE.Vector3,
    playerStats: PlayerStats,
    nav: NavGraph | null = null,
    carryFor: ((p: THREE.Vector3) => { x: number; y: number; z: number }) | null = null,
    /** What an enemy chews on when a wall is between it and the player. */
    build: StructureDamage | null = null,
    /** What a raider chews on once it has crossed the deck to the engine. */
    machineDamage: SubsystemDamage | null = null,
  ): void {
    this.simulationTime += Math.max(0, dt);
    for (const enemy of this.pool) {
      if (!enemy.isActive || enemy.aiState === 'dead') {
        this.flankUntil.delete(enemy.id);
        this.flankTargets.delete(enemy.id);
        enemy.clearWardenFlank();
        continue;
      }
      if (!nav || enemy.tacticalSnapshot?.missionTarget) {
        this.flankUntil.delete(enemy.id);
        this.flankTargets.delete(enemy.id);
        enemy.clearWardenFlank();
      } else if (
        this.flankTargets.has(enemy.id) &&
        (this.flankUntil.get(enemy.id) ?? 0) <= this.simulationTime
      ) {
        this.flankUntil.delete(enemy.id);
        this.flankTargets.delete(enemy.id);
        enemy.clearWardenFlank();
      }
    }
    if (nav) this.repath(nav, playerPos);
    for (const e of this.pool) {
      if (carryFor && e.isActive) {
        const c = carryFor(e.worldPosition);
        e.carry.x = c.x;
        e.carry.y = c.y;
        e.carry.z = c.z;
      } else {
        e.carry.x = 0;
        e.carry.y = 0;
        e.carry.z = 0;
      }
      e.setWardenFlankCommitted(this.flankTargets.has(e.id));
      e.setDamageTakenMultiplier(this.damageMultiplierFor(e));
      e.fixedUpdate(dt, playerPos, playerStats, build, machineDamage);
    }
  }

  /**
   * Give each live enemy a fresh route, one enemy per tick in rotation.
   *
   * Round-robin rather than a per-enemy timer: at 60Hz with a pool of 8 every
   * enemy is repathed at least eight times a second, which is far faster than
   * anything on a deck can invalidate a route, and it makes the cost per tick
   * exactly one search no matter how many enemies are aboard. A timer would
   * let four of them expire on the same frame.
   *
   * The cursor walks the pool's own stable indices, not the filtered `active`
   * list — that list is rebuilt every call and its length shifts as enemies
   * spawn and despawn, so a counter taken modulo its length can transiently
   * land on a different enemy's slot, repathing the wrong one and skipping
   * another for a tick. Indexing the pool directly and skipping the inactive
   * slots keeps each enemy's turn tied to its own fixed index.
   */
  private repath(nav: NavGraph, playerPos: THREE.Vector3): void {
    if (this.pool.length === 0) return;

    for (let i = 0; i < this.pool.length; i++) {
      this.repathTick = (this.repathTick + 1) % this.pool.length;
      const enemy = this.pool[this.repathTick] as Enemy;
      if (!enemy.isActive) {
        this.flankUntil.delete(enemy.id);
        this.flankTargets.delete(enemy.id);
        continue;
      }

      const playerFeetY = playerPos.y - (PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS);
      const playerCell = worldToCell(playerPos.x, playerPos.z, levelOf(playerFeetY));
      // The enemy decides where it is going: a raider routes to the engine,
      // a scavenger to the player. The manager only knows where the player is.
      const goal = enemy.goalCell(playerCell);

      // External mission routing owns the destination for this repath. Clear
      // any prior flank commitment first so a Warden cannot spend one more
      // search on tactical cover after its mission has begun.
      if (enemy.tacticalSnapshot?.missionTarget) {
        this.flankUntil.delete(enemy.id);
        this.flankTargets.delete(enemy.id);
        enemy.clearWardenFlank();
        enemy.setPath(findPath(nav, enemy.gridCell, goal), nav);
        return;
      }

      if (enemy.def.id === 'warden' && enemy.tacticalSnapshot?.phase === 'flank') {
        const activeUntil = this.flankUntil.get(enemy.id) ?? 0;
        const committed = this.flankTargets.get(enemy.id);
        let released = false;
        if (committed) {
          const dx = enemy.worldPosition.x - committed.x;
          const dz = enemy.worldPosition.z - committed.z;
          if (Math.hypot(dx, dz) <= 0.7) {
            this.flankUntil.delete(enemy.id);
            this.flankTargets.delete(enemy.id);
            enemy.clearWardenFlank();
            released = true;
          } else if (activeUntil > this.simulationTime) {
            continue;
          } else {
            this.flankUntil.delete(enemy.id);
            this.flankTargets.delete(enemy.id);
            enemy.clearWardenFlank();
            released = true;
          }
        }
        if (released) {
          enemy.setPath(findPath(nav, enemy.gridCell, goal), nav);
          return;
        }
        const candidates: FlankCandidate[] = [];
        const seen = new Set<string>();
        for (const cell of nav.links.values()) {
          for (const candidate of cell) {
            const key = `${candidate.x}:${candidate.y}:${candidate.z}`;
            if (seen.has(key) || candidates.length >= 12 || candidate.y !== enemy.gridCell.y)
              continue;
            seen.add(key);
            const centre = cellCenter(candidate);
            const point = new THREE.Vector3(centre.x, centre.y, centre.z);
            const distance = enemy.worldPosition.distanceTo(point);
            if (distance > 8) continue;
            // A flank is useful when the route from the Warden to the cell is
            // protected by cover, while the cell itself has a clear firing
            // lane to the player. Testing player->cell for both flags would
            // make those requirements mutually exclusive.
            point.y = enemy.worldPosition.y;
            const fromEnemy = point.clone().sub(enemy.worldPosition);
            const coverDistance = fromEnemy.length();
            const covered =
              coverDistance > 0.01 &&
              this.physics.raycast(
                enemy.worldPosition,
                fromEnemy.normalize(),
                coverDistance,
                enemy.physicsCollider ?? undefined,
              ) !== null;
            const shot = point.clone().setY(enemy.worldPosition.y);
            const aim = playerPos.clone().sub(shot);
            const shotDistance = aim.length();
            const clearShot =
              shotDistance > 0.01 &&
              this.physics.raycast(
                shot,
                aim.normalize(),
                shotDistance,
                enemy.physicsCollider ?? undefined,
                (collider) => {
                  const data = this.physics.getUserData(collider);
                  return !(
                    typeof data === 'object' &&
                    data !== null &&
                    (data as { kind?: unknown }).kind === 'player'
                  );
                },
              ) === null;
            const route = findPath(nav, enemy.gridCell, candidate);
            candidates.push({
              cell: candidate,
              distance,
              covered,
              clearShot,
              reachable: route.length > 0,
            });
          }
        }
        const flank = chooseWardenFlank(candidates);
        if (flank) {
          enemy.setPath(findPath(nav, enemy.gridCell, flank.cell), nav);
          this.flankUntil.set(enemy.id, this.simulationTime + 1.5);
          this.flankTargets.set(enemy.id, { ...cellCenter(flank.cell) });
          return;
        }
      }

      enemy.setPath(findPath(nav, enemy.gridCell, goal), nav);
      return;
    }
  }

  update(alpha: number, dt: number): void {
    for (const e of this.pool) e.update(alpha, dt);
  }

  despawnAll(): void {
    for (const e of this.pool) if (e.isActive) e.despawn();
    this.flankUntil.clear();
    this.flankTargets.clear();
  }

  dispose(): void {
    for (const enemy of this.pool) enemy.dispose();
    this.pool.length = 0;
    this.modelByDefinition.clear();
    this.flankUntil.clear();
    this.flankTargets.clear();
  }
}
