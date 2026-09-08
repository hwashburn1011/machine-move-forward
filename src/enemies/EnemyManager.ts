import * as THREE from 'three';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import type { PlayerStats } from '@/player/PlayerStats';
import { ENEMIES } from '@/data/enemies';
import { Enemy, type StructureDamage, type SubsystemDamage } from './Enemy';
import { findPath, levelOf, type NavGraph } from './NavGraph';
import { worldToCell } from '@/building/BuildGrid';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';

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
      if (this.pool.length >= POOL_SIZE) return null;
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
      if (!enemy.isActive) continue;

      const playerFeetY = playerPos.y - (PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS);
      const playerCell = worldToCell(playerPos.x, playerPos.z, levelOf(playerFeetY));
      // The enemy decides where it is going: a raider routes to the engine,
      // a scavenger to the player. The manager only knows where the player is.
      const goal = enemy.goalCell(playerCell);

      enemy.setPath(findPath(nav, enemy.gridCell, goal), nav);
      return;
    }
  }

  update(alpha: number, dt: number): void {
    for (const e of this.pool) e.update(alpha, dt);
  }

  despawnAll(): void {
    for (const e of this.pool) if (e.isActive) e.despawn();
  }
}
