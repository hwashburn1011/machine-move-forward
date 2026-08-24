import * as THREE from 'three';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import type { PlayerStats } from '@/player/PlayerStats';
import { ENEMIES } from '@/data/enemies';
import { Enemy } from './Enemy';
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

    let enemy = this.pool.find((e) => !e.isActive);
    if (!enemy) {
      if (this.pool.length >= POOL_SIZE) return null;
      enemy = new Enemy(
        `enemy-${this.nextId++}`,
        def,
        this.scene,
        this.physics,
        this.bus,
        this.materials,
        this.model,
      );
      this.pool.push(enemy);
    }

    enemy.spawn(at);
    return enemy;
  }

  fixedUpdate(
    dt: number,
    playerPos: THREE.Vector3,
    playerStats: PlayerStats,
    nav: NavGraph | null = null,
  ): void {
    if (nav) this.repath(nav, playerPos);
    for (const e of this.pool) e.fixedUpdate(dt, playerPos, playerStats);
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
      const goal = worldToCell(playerPos.x, playerPos.z, levelOf(playerFeetY));

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
