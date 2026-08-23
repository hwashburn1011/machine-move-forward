import * as THREE from 'three';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import type { PlayerStats } from '@/player/PlayerStats';
import { ENEMIES } from '@/data/enemies';
import { Enemy } from './Enemy';

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

  fixedUpdate(dt: number, playerPos: THREE.Vector3, playerStats: PlayerStats): void {
    for (const e of this.pool) e.fixedUpdate(dt, playerPos, playerStats);
  }

  update(alpha: number, dt: number): void {
    for (const e of this.pool) e.update(alpha, dt);
  }

  despawnAll(): void {
    for (const e of this.pool) if (e.isActive) e.despawn();
  }
}
