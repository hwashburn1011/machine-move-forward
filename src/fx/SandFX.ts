import * as THREE from 'three';
import { PALETTE } from '@/art/Palette';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import { Rng } from '@/core/math/Random';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { ParticleSystem } from './ParticleSystem';

/**
 * Airborne sand, and the dust a foot throws up when it lands.
 *
 * Dust is the single strongest cue that the machine is actually moving.
 * Without it the world just slides past and the machine reads as stationary
 * scenery with a moving backdrop.
 *
 * It used to be a continuous plume off the treads, spawned by the metre. A
 * walker does not raise dust continuously — it raises it four times a stride,
 * hard, where a foot lands, and not at all in between. So the plume is now a
 * burst per plant and the caller says when, exactly as the footfall prints do.
 *
 * Grains drift the way the WORLD goes, not the way the machine faces: sand
 * hanging in the air is stationary in the world, so relative to a machine
 * holding station it streams at `WORLD_Z_PER_METRE` times its speed.
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

  constructor(scene: THREE.Scene, private readonly quality: QualitySettings) {
    // Split the budget: ambient drift is constant, the plume is denser but
    // only matters near the treads.
    this.drift = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.45));
    this.dust = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.35));
  }

  get liveCount(): number {
    return this.drift.liveCount + this.dust.liveCount;
  }

  /**
   * A burst of dust under a foot that has just landed.
   *
   * Sized off the machine's speed rather than fixed: a foot coming down at a
   * crawl should not throw up what one coming down at seven metres a second
   * does. Most of the burst is thrown outward and up from the point of impact,
   * and all of it then drifts with the world like everything else airborne.
   */
  footfall(at: THREE.Vector3, machineSpeed: number): void {
    const budgetScale = this.quality.particleBudget / 2000;
    const force = Math.min(machineSpeed / 7.5, 1.2);
    const count = Math.max(3, Math.round(14 * budgetScale * force));

    for (let i = 0; i < count; i++) {
      this.pos.set(
        at.x + this.rng.range(-0.5, 0.5),
        at.y + this.rng.range(0, 0.3),
        at.z + this.rng.range(-0.7, 0.7),
      );
      const out = this.rng.range(0, Math.PI * 2);
      const spread = this.rng.range(0.5, 2.2) * force;
      this.vel.set(
        Math.cos(out) * spread,
        this.rng.range(0.6, 2.4) * force,
        Math.sin(out) * spread + WORLD_Z_PER_METRE * machineSpeed * this.rng.range(0.5, 0.9),
      );
      this.dust.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(0.9, 2.1),
        // Large and very translucent: many overlapping soft sprites read as a
        // cloud, a few opaque ones read as debris.
        size: this.rng.range(0.6, 1.8),
        color: this.dustColor,
        alpha: this.rng.range(0.07, 0.18),
        gravity: -1.4,
        drag: 0.45,
      });
    }
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
      // Apparent wind is the machine's own motion past sand that is standing
      // still, so grains stream the way the world does.
      this.vel.set(
        this.rng.range(-0.8, 0.8),
        this.rng.range(-0.15, 0.5),
        WORLD_Z_PER_METRE * machineSpeed * this.rng.range(0.75, 1.15),
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
