import * as THREE from 'three';
import { PALETTE } from '@/art/Palette';
import type { EventBus } from '@/core/events/EventBus';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import { Rng } from '@/core/math/Random';
import { ParticleSystem } from './ParticleSystem';

/**
 * Weapon and impact effects.
 *
 * Subscribes to the event bus rather than being called by the combat code, so
 * gameplay never needs to know FX exist (handoff section 45).
 */
export class ImpactFX {
  private readonly sparks: ParticleSystem;
  private readonly puffs: ParticleSystem;
  private readonly muzzleLight: THREE.PointLight;

  private readonly rng = new Rng(0x1337);
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly jitter = new THREE.Vector3();

  private readonly sparkColor = new THREE.Color(1.0, 0.72, 0.3);
  private readonly fleshColor = new THREE.Color(0.55, 0.09, 0.07);
  private readonly dustColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

  private muzzleTimer = 0;

  constructor(
    scene: THREE.Scene,
    bus: EventBus,
    private readonly quality: QualitySettings,
  ) {
    this.sparks = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.12), true);
    this.puffs = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.08));

    // Pooled. Constructing a light per shot would churn the shader cache and
    // hitch the frame exactly when the player is shooting.
    this.muzzleLight = new THREE.PointLight(0xffca7a, 0, 9, 2);
    this.muzzleLight.castShadow = false;
    scene.add(this.muzzleLight);

    bus.on('combat:hit', (e) => this.onHit(e));
    bus.on('weapon:fired', () => {
      this.muzzleTimer = 0.045;
    });
  }

  get liveCount(): number {
    return this.sparks.liveCount + this.puffs.liveCount;
  }

  private onHit(e: {
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    onMetal: boolean;
  }): void {
    this.pos.set(e.position.x, e.position.y, e.position.z);
    this.normal.set(e.normal.x, e.normal.y, e.normal.z);

    // A basis around the surface normal, so debris sprays off the surface
    // rather than in some fixed world direction.
    this.tangent.set(this.normal.z, this.normal.x, -this.normal.y).normalize();

    const count = this.quality.particleBudget > 500 ? 8 : 3;
    const color = e.onMetal ? this.sparkColor : this.fleshColor;

    for (let i = 0; i < count; i++) {
      this.jitter.set(this.rng.signed(1.4), this.rng.signed(1.4), this.rng.signed(1.4));
      this.vel
        .copy(this.normal)
        .multiplyScalar(this.rng.range(1.5, 5.0))
        .addScaledVector(this.tangent, this.rng.signed(2.2))
        .add(this.jitter);

      this.sparks.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(0.12, 0.4),
        size: this.rng.range(0.02, 0.06),
        color,
        gravity: -9,
        drag: 0.25,
      });
    }

    if (e.onMetal) {
      this.vel.copy(this.normal).multiplyScalar(0.8);
      this.puffs.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(0.3, 0.6),
        size: this.rng.range(0.25, 0.5),
        color: this.dustColor,
        alpha: 0.3,
        drag: 0.2,
      });
    }
  }

  update(dt: number, muzzlePosition: THREE.Vector3): void {
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      this.muzzleLight.position.copy(muzzlePosition);
      this.muzzleLight.intensity = this.muzzleTimer > 0 ? 14 : 0;
    } else if (this.muzzleLight.intensity !== 0) {
      this.muzzleLight.intensity = 0;
    }

    this.sparks.update(dt);
    this.puffs.update(dt);
  }

  onResize(): void {
    this.sparks.onResize();
    this.puffs.onResize();
  }

  dispose(): void {
    this.sparks.dispose();
    this.puffs.dispose();
  }
}
