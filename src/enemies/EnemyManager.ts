import * as THREE from 'three';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
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
  ) {}

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
      );
      this.pool.push(enemy);
    }

    enemy.spawn(at);
    return enemy;
  }

  fixedUpdate(dt: number, playerPos: THREE.Vector3, playerStats: PlayerStats): void {
    for (const e of this.pool) e.fixedUpdate(dt, playerPos, playerStats);
  }

  update(alpha: number): void {
    for (const e of this.pool) e.update(alpha);
  }

  despawnAll(): void {
    for (const e of this.pool) if (e.isActive) e.despawn();
  }
}
