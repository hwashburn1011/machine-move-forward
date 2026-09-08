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
  /** Sand skimming the surface, close and fast. See `update`. */
  private readonly sheet: ParticleSystem;
  private readonly rng = new Rng(0x5a4d);

  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  // Airborne sand is far paler and less saturated than the ground it came
  // from — lit from every direction rather than only the sun.
  private readonly driftColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
  private readonly dustColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

  private driftAccumulator = 0;
  private sheetAccumulator = 0;

  constructor(scene: THREE.Scene, private quality: QualitySettings) {
    // Split the budget: ambient drift is constant, the plume is denser but
    // only matters near the treads.
    // Leave headroom for impact FX and keep the three streams visually
    // distinct: a thin ambient veil, brief footfall puffs, and a sparse close
    // sheet that communicates speed without becoming weather.
    this.drift = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.22));
    this.dust = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.2), false, 28);
    this.sheet = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.24), false, 36);
  }

  /** Apply a new particle budget while retaining the existing dust where it fits. */
  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.drift.resizeCapacity(Math.round(quality.particleBudget * 0.22));
    this.dust.resizeCapacity(Math.round(quality.particleBudget * 0.2), 28);
    this.sheet.resizeCapacity(Math.round(quality.particleBudget * 0.24), 36);
  }

  get liveCount(): number {
    return this.drift.liveCount + this.dust.liveCount + this.sheet.liveCount;
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
    if (force < 0.08) return;
    const count = Math.max(2, Math.round(11 * budgetScale * force));

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
        alpha: this.rng.range(0.055, 0.14),
        gravity: -1.4,
        drag: 0.45,
      });
    }
  }

  update(dt: number, machineSpeed: number, cameraPos: THREE.Vector3): void {
    const speedFactor = Math.min(machineSpeed / 7.5, 1.5);
    const budgetScale = this.quality.particleBudget / 2000;

    // --- Ambient drift, spawned in a volume around the camera ---------------
    // Denser than it was, and spawned AHEAD rather than behind. Grains travel
    // the way the world does, so a grain born astern spends its whole life
    // receding and is never seen sweeping past anything. Born ahead, it
    // crosses the view — which is the only part of its life that says the
    // machine is moving.
    this.driftAccumulator += 52 * speedFactor * budgetScale * dt;
    while (this.driftAccumulator >= 1) {
      this.driftAccumulator -= 1;
      // Biased toward the camera: flow is speed over distance, so a grain at
      // four metres is worth ten at forty.
      const lateral = this.rng.next() ** 2 * 22;
      this.pos.set(
        cameraPos.x + (this.rng.next() < 0.5 ? -lateral : lateral),
        this.rng.range(-1, 9),
        cameraPos.z + this.rng.range(-8, 34),
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
        // A touch larger than they were: a grain too small to resolve carries
        // no motion at all, however many of them there are.
        size: this.rng.range(0.03, 0.075),
        color: this.driftColor,
        alpha: this.rng.range(0.25, 0.5),
        drag: 0.85,
      });
    }

    // --- Sand skimming the surface ------------------------------------------
    // The one cue that says the MACHINE is moving rather than the world.
    //
    // Self-motion is read from optic flow, and flow is speed over distance: at
    // 7.5 m/s something 10m away sweeps the eye at 43 degrees a second and the
    // same thing at 130m sweeps at 3. Measured, the median thing in view was
    // 127m away and the median flow 1.74 degrees a second — the rate of a
    // clock's minute hand, which is why the desert read as drifting past a
    // machine standing still.
    //
    // The machine cannot be given a closer horizon; it occupies its own near
    // field, and the deck a player stands on is by definition stationary. What
    // it can be given is sand: low, close, fast, and large enough to resolve.
    // These spawn within a few metres of the camera, hug the surface, and
    // travel the way the world does, so they streak across the view instead of
    // hanging in it.
    this.sheetAccumulator += 78 * speedFactor * budgetScale * dt;
    while (this.sheetAccumulator >= 1) {
      this.sheetAccumulator -= 1;
      // Hard against the camera. Flow is worth more here than anywhere else in
      // the scene, and these are the only particles that can be put here.
      const lateral = 2.5 + this.rng.next() ** 1.7 * 15;
      this.pos.set(
        cameraPos.x + (this.rng.next() < 0.5 ? -lateral : lateral),
        this.rng.range(-0.6, 2.2),
        cameraPos.z + this.rng.range(6, 30),
      );
      this.vel.set(
        this.rng.range(-0.5, 0.5),
        this.rng.range(-0.1, 0.35),
        WORLD_Z_PER_METRE * machineSpeed * this.rng.range(0.95, 1.05),
      );
      this.sheet.emit({
        position: this.pos,
        velocity: this.vel,
        // Short: just long enough to cross the view once.
        life: this.rng.range(0.7, 1.5),
        // Large enough to resolve. A grain too small to see carries no motion
        // however many of them there are.
        size: this.rng.range(0.18, 0.55),
        color: this.dustColor,
        // Faint. These are a cue, not weather — dense enough to read as motion
        // at the edge of vision, thin enough not to be a dust storm sitting on
        // the deck. If the machine still reads as stationary, the spawn rate
        // above is the number to raise, and this one after it.
        alpha: this.rng.range(0.045, 0.12),
        drag: 0.08,
      });
    }

    this.drift.update(dt);
    this.dust.update(dt);
    this.sheet.update(dt);
  }

  onResize(): void {
    this.sheet.onResize();
    this.drift.onResize();
    this.dust.onResize();
  }

  dispose(): void {
    this.sheet.dispose();
    this.drift.dispose();
    this.dust.dispose();
  }
}
