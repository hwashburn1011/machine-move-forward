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
  private readonly flashes: { light: THREE.PointLight; life: number; followCamera: boolean }[] = [];
  private readonly tracers: { line: THREE.Line; life: number }[] = [];
  private readonly tracerMaterial = new THREE.LineBasicMaterial({
    color: 0xffd28a,
    transparent: true,
    opacity: 0.75,
  });

  private readonly rng = new Rng(0x1337);
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly jitter = new THREE.Vector3();

  private readonly sparkColor = new THREE.Color(1.0, 0.72, 0.3);
  private readonly fleshColor = new THREE.Color(0.55, 0.09, 0.07);
  private readonly dustColor = PALETTE.sandCrest.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
  private readonly scene: THREE.Scene;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    scene: THREE.Scene,
    bus: EventBus,
    private quality: QualitySettings,
  ) {
    this.scene = scene;
    this.sparks = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.1), true, 24);
    this.puffs = new ParticleSystem(scene, Math.round(quality.particleBudget * 0.06), false, 16);

    // Pooled. Constructing a light per shot would churn the shader cache and
    // hitch the frame exactly when the player is shooting.
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffca7a, 0, 9, 2);
      light.castShadow = false;
      scene.add(light);
      this.flashes.push({ light, life: 0, followCamera: false });
    }

    for (let i = 0; i < 24; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, this.tracerMaterial.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    this.unsubscribe.push(bus.on('combat:hit', (e) => this.onHit(e)));
    this.unsubscribe.push(bus.on('enemy:fired', (e) => this.showShot(e.visualOrigin, e.aimEnd)));
    this.unsubscribe.push(
      bus.on('weapon:fired', (e) => {
        const from = e.visualOrigin;
        const to = e.aimEnd;
        if (from && to) this.showShot(from, to);
        else this.flash();
      }),
    );
    this.unsubscribe.push(
      bus.on('automatic-turret:fired', (e) => this.showShot(e.visualOrigin, e.aimEnd)),
    );
    // The mounted manual gun's legacy event falls back to its muzzle camera.
    // Independent slots keep simultaneous automatic and held guns stationary.
    this.unsubscribe.push(
      bus.on('turret:fired', () => {
        this.flash();
      }),
    );
  }

  showShot(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): void {
    this.flash(from);
    const tracer = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0]!;
    const positions = tracer.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.life = 0.06;
    tracer.line.visible = true;
    (tracer.line.material as THREE.LineBasicMaterial).opacity = 0.75;
  }

  private flash(from?: { x: number; y: number; z: number }): void {
    const available = this.flashes.find((f) => f.life <= 0);
    // Extra simultaneous guns retain their tracer but never teleport an
    // already-live flash. This keeps the lighting budget fixed at four.
    if (!available) return;
    available.life = 0.045;
    available.followCamera = !from;
    if (from) available.light.position.set(from.x, from.y, from.z);
  }

  get liveCount(): number {
    return this.sparks.liveCount + this.puffs.liveCount;
  }

  /** Apply a new particle budget while retaining live impact effects. */
  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.sparks.resizeCapacity(Math.round(quality.particleBudget * 0.1), 24);
    this.puffs.resizeCapacity(Math.round(quality.particleBudget * 0.06), 16);
  }

  private onHit(e: {
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    onMetal: boolean;
    surface?: 'flesh' | 'metal' | 'sand';
  }): void {
    this.pos.set(e.position.x, e.position.y, e.position.z);
    this.normal.set(e.normal.x, e.normal.y, e.normal.z).normalize();

    // A basis around the surface normal, so debris sprays off the surface
    // rather than in some fixed world direction.
    this.tangent.set(this.normal.z, this.normal.x, -this.normal.y).normalize();

    const count = this.quality.particleBudget > 500 ? 6 : 2;
    const surface = e.surface ?? (e.onMetal ? 'metal' : 'sand');
    const color = surface === 'metal' ? this.sparkColor : this.fleshColor;

    // Metal gets a short, bright directional burst. Organic hits use a tiny
    // dark puff instead, keeping the two cues readable without filling the
    // screen with generic sparks.
    for (let i = 0; i < (surface === 'metal' ? count : Math.min(2, count)); i++) {
      this.jitter.set(this.rng.signed(1.4), this.rng.signed(1.4), this.rng.signed(1.4));
      this.vel
        .copy(this.normal)
        .multiplyScalar(this.rng.range(1.5, 5.0))
        .addScaledVector(this.tangent, this.rng.signed(2.2))
        .add(this.jitter);

      if (surface === 'metal')
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

    if (surface === 'metal' || surface === 'sand') {
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
    } else {
      this.vel.copy(this.normal).multiplyScalar(0.35);
      this.puffs.emit({
        position: this.pos,
        velocity: this.vel,
        life: this.rng.range(0.18, 0.32),
        size: this.rng.range(0.12, 0.24),
        color: this.fleshColor,
        alpha: 0.12,
        gravity: -2.5,
        drag: 0.4,
      });
    }
  }

  update(dt: number, muzzlePosition: THREE.Vector3): void {
    for (const flash of this.flashes) {
      flash.life = Math.max(0, flash.life - dt);
      if (flash.followCamera) flash.light.position.copy(muzzlePosition);
      flash.light.intensity = flash.life > 0 ? 14 : 0;
    }

    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= Math.max(0, dt);
      (tracer.line.material as THREE.LineBasicMaterial).opacity =
        Math.max(0, tracer.life / 0.06) * 0.75;
      if (tracer.life <= 0) {
        tracer.line.visible = false;
      }
    }

    this.sparks.update(dt);
    this.puffs.update(dt);
  }

  onResize(): void {
    this.sparks.onResize();
    this.puffs.onResize();
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (const flash of this.flashes) this.scene.remove(flash.light);
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      (tracer.line.material as THREE.Material).dispose();
    }
    this.tracers.length = 0;
    this.tracerMaterial.dispose();
    this.sparks.points.removeFromParent();
    this.puffs.points.removeFromParent();
    this.sparks.dispose();
    this.puffs.dispose();
  }
}
