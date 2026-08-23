import * as THREE from 'three';
import { PALETTE } from '@/art/Palette';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import { GRID_TILE, MACHINE_TILES_X, MACHINE_TILES_Z } from '@/game/constants';
import { Rng } from '@/core/math/Random';
import { ParticleSystem } from './ParticleSystem';

const DECK_W = MACHINE_TILES_X * GRID_TILE;
const DECK_L = MACHINE_TILES_Z * GRID_TILE;

/**
 * Airborne sand and tread dust.
 *
 * The tread plume is the single strongest cue that the machine is actually
 * moving. Without it the world just slides past and the machine reads as
 * stationary scenery with a moving backdrop.
 */
export class SandFX {
  private readonly drift: ParticleSystem;
  private readonly dust: ParticleSystem;
  private readonly rng = new Rng(0x5a4d);

  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  // Airborne sand is far paler and less saturated than the ground it came
  // from — lit from every direction rather than only the sun.
  private readonly driftColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
  private readonly dustColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

  private driftAccumulator = 0;
  private dustAccumulator = 0;

  constructor(scene: THREE.Scene, private readonly quality: QualitySettings) {
    // Split the budget: ambient drift is constant, the plume is denser but
    // only matters near the treads.
    this.drift = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.45));
    this.dust = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.35));
  }

  get liveCount(): number {
    return this.drift.liveCount + this.dust.liveCount;
  }

  update(dt: number, machineSpeed: number, cameraPos: THREE.Vector3): void {
    const speedFactor = Math.min(machineSpeed / 7.5, 1.5);
    const budgetScale = this.quality.particleBudget / 2000;

    // --- Ambient drift, spawned in a volume around the camera ---------------
    this.driftAccumulator += 26 * speedFactor * budgetScale * dt;
    while (this.driftAccumulator >= 1) {
      this.driftAccumulator -= 1;
      this.pos.set(
        cameraPos.x + this.rng.range(-22, 22),
        this.rng.range(-1, 9),
        cameraPos.z + this.rng.range(-26, 12),
      );
      // Apparent wind is the machine's own forward motion, so grains stream
      // toward +Z relative to the deck.
      this.vel.set(
        this.rng.range(-0.8, 0.8),
        this.rng.range(-0.15, 0.5),
        machineSpeed * this.rng.range(0.75, 1.15),
      );
      this.drift.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(1.4, 3.2),
        size: this.rng.range(0.02, 0.055),
        color: this.driftColor,
        alpha: this.rng.range(0.25, 0.5),
        drag: 0.85,
      });
    }

    // --- Tread plume --------------------------------------------------------
    this.dustAccumulator += 42 * speedFactor * budgetScale * dt;
    while (this.dustAccumulator >= 1) {
      this.dustAccumulator -= 1;
      const side = this.rng.next() < 0.5 ? -1 : 1;
      this.pos.set(
        side * (DECK_W / 2 + 0.75) + this.rng.range(-0.6, 0.6),
        this.rng.range(-0.4, 0.5),
        DECK_L / 2 - this.rng.range(0, 3.5),
      );
      this.vel.set(
        side * this.rng.range(0.2, 1.4),
        this.rng.range(0.4, 1.9),
        machineSpeed * this.rng.range(0.5, 0.9),
      );
      this.dust.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(1.0, 2.4),
        // Large and very translucent: many overlapping soft sprites read as
        // a plume, a few opaque ones read as debris.
        size: this.rng.range(0.7, 2.0),
        color: this.dustColor,
        alpha: this.rng.range(0.06, 0.16),
        gravity: -1.1,
        drag: 0.4,
      });
    }

    this.drift.update(dt);
    this.dust.update(dt);
  }

  onResize(): void {
    this.drift.onResize();
    this.dust.onResize();
  }

  dispose(): void {
    this.drift.dispose();
    this.dust.dispose();
  }
}
