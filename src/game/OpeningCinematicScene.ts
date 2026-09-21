import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { EnemyVisual } from '@/enemies/EnemyVisual';
import { PlayerVisual } from '@/player/PlayerVisual';
import { RobotExplosion } from './RobotExplosion';
import {
  OPENING_CINEMATIC_DURATION_S,
  OPENING_CINEMATIC_TIMING as BEATS,
  OpeningCinematicTimeline,
  type OpeningCinematicAnchors,
  type OpeningCinematicEvent,
  type OpeningCinematicSample,
} from './OpeningCinematicTimeline';

export interface OpeningCinematicCharacterModels {
  readonly player?: LoadedModel | null;
  readonly warden?: LoadedModel | null;
  readonly revenant?: LoadedModel | null;
}

export type OpeningCinematicSound = (kind: 'shot' | 'explosion') => void;

interface CameraKeyframe {
  readonly time: number;
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

// Camera offsets are relative to S-07's capsule centre. Keeping the target
// near the hero through the execution shots makes the robots read as action
// around the subject instead of turning the opening into a dead-enemy cutaway.
const CAMERA_KEYFRAMES: readonly CameraKeyframe[] = [
  { time: 0, position: new THREE.Vector3(-4.5, 3.7, 9), target: new THREE.Vector3(1.4, 0.1, 0) },
  {
    time: BEATS.takeoff,
    position: new THREE.Vector3(-3.8, 3.3, 10),
    target: new THREE.Vector3(1.3, 0.1, 0),
  },
  {
    time: BEATS.land,
    position: new THREE.Vector3(-2.8, 3.1, 9),
    target: new THREE.Vector3(0.7, 0.3, 0),
  },
  {
    time: BEATS.aim,
    position: new THREE.Vector3(-1.6, 2.1, 3.1),
    target: new THREE.Vector3(4.8, 3.6, 0),
  },
  {
    time: BEATS.reveal,
    position: new THREE.Vector3(9.6, 8.0, 15),
    target: new THREE.Vector3(-1, 0.2, 0),
  },
  {
    time: BEATS.handoff,
    position: new THREE.Vector3(9.6, 8.0, 15),
    target: new THREE.Vector3(-1, 0.2, 0),
  },
  {
    time: BEATS.done,
    position: new THREE.Vector3(0.62, 0.38, 3.4),
    target: new THREE.Vector3(0, 0.5, -2),
  },
];

function smooth01(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function shortestAngle(value: number): number {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function angleLerp(from: number, to: number, t: number): number {
  return from + shortestAngle(to - from) * smooth01(t);
}

/** Presentation-only opening scene. It owns no gameplay actor, damage or reward state. */
export class OpeningCinematicScene {
  readonly camera: THREE.PerspectiveCamera;
  readonly landingAnchor: THREE.Vector3;
  private readonly scene: THREE.Scene;
  private readonly timeline: OpeningCinematicTimeline;
  private readonly sound?: OpeningCinematicSound;
  private readonly player: PlayerVisual;
  private readonly pursuers: readonly [EnemyVisual, EnemyVisual];
  private readonly overlay: THREE.Group;
  private readonly overlayBars: readonly [THREE.Mesh, THREE.Mesh];
  private readonly skipCaption: THREE.Sprite | null;
  private readonly explosions: readonly [RobotExplosion, RobotExplosion];
  private readonly muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd477, transparent: true, toneMapped: false }),
  );
  private readonly tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({
      color: 0xffc46b,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    }),
  );
  private shotAge = Infinity;
  private readonly localVelocity = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private _active = false;
  private _time = 0;
  private previousTime = 0;
  private skipProgress = 0;
  private captionProgress = -1;

  constructor(
    scene: THREE.Scene,
    materials: Materials,
    anchors: OpeningCinematicAnchors,
    rifle: THREE.Object3D | null,
    sound?: OpeningCinematicSound,
    models?: OpeningCinematicCharacterModels,
  ) {
    this.scene = scene;
    this.timeline = new OpeningCinematicTimeline(anchors);
    this.landingAnchor = new THREE.Vector3(
      anchors.landingAnchor.x,
      anchors.landingAnchor.y,
      anchors.landingAnchor.z,
    );
    this.sound = sound;
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 500);
    this.camera.name = 'opening-cinematic-camera';

    this.player = new PlayerVisual(models?.player ?? null, materials);
    this.player.object3D.name = 'opening-cinematic-player';
    this.player.setHeldWeapon('rifle', rifle);
    const warden = new EnemyVisual(models?.warden ?? null, materials, { r: 0.9, g: 0.94, b: 1 });
    const revenant = new EnemyVisual(models?.revenant ?? null, materials, {
      r: 1,
      g: 0.8,
      b: 0.72,
    });
    warden.object3D.name = 'opening-cinematic-warden';
    revenant.object3D.name = 'opening-cinematic-revenant';
    warden.setPresentationOnly();
    revenant.setPresentationOnly();
    this.pursuers = [warden, revenant];
    this.scene.add(this.player.object3D, warden.object3D, revenant.object3D, this.camera);
    this.explosions = [
      new RobotExplosion(scene, anchors.rooftopLedge, false),
      new RobotExplosion(scene, anchors.rooftopLedge, false),
    ];
    this.muzzleFlash.name = 'opening-muzzle-flash';
    this.tracer.name = 'opening-shot-tracer';
    this.scene.add(this.muzzleFlash, this.tracer);
    this.clearEffects();

    this.overlay = new THREE.Group();
    this.overlay.name = 'opening-cinematic-overlay';
    const barMaterial = new THREE.MeshBasicMaterial({
      color: 0x020304,
      depthTest: false,
      depthWrite: false,
    });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMaterial);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMaterial.clone());
    top.renderOrder = 10000;
    bottom.renderOrder = 10000;
    this.overlayBars = [top, bottom];
    this.overlay.add(top, bottom);
    this.skipCaption = this.createSkipCaption();
    if (this.skipCaption) {
      this.skipCaption.renderOrder = 10001;
      this.overlay.add(this.skipCaption);
    }
    this.camera.add(this.overlay);
    this.overlay.visible = false;

    this.applySample(this.timeline.sample(0));
    this.setActorsVisible(false);
  }

  get active(): boolean {
    return this._active;
  }
  get time(): number {
    return this._time;
  }
  get lightingFocus(): THREE.Vector3 {
    return this.focus;
  }

  start(): void {
    this.clearEffects();
    this.timeline.reset();
    this._time = 0;
    this.previousTime = 0;
    this._active = true;
    this.setActorsVisible(true);
    this.overlay.visible = true;
    this.pursuers[0].reset();
    this.pursuers[1].reset();
    this.updateCaption(true);
    this.applySample(this.timeline.sample(0));
  }

  /** Prepare both overlapping detonations, shot geometry and lighting variants
   * before the clock starts. Never dispatch timeline events or play audio here. */
  prewarm(render: (camera: THREE.PerspectiveCamera, focus: THREE.Vector3) => void): void {
    this.setActorsVisible(true);
    try {
      // Include the wide reveal and the final player view: their normal/depth
      // passes can otherwise compile only when the camera first sees them.
      for (const time of [
        0,
        BEATS.land,
        BEATS.kill1,
        BEATS.kill2,
        BEATS.reveal,
        BEATS.handoff,
        BEATS.done,
      ]) {
        const sample = this.timeline.sample(time - 0.001);
        this.applySample(sample);
        this.spawnShotEffect(sample.weaponAim);
        this.explosions.forEach((effect, index) => {
          effect.trigger(sample.pursuers[index]!.position);
          effect.update(0.7, this.camera);
        });
        render(this.camera, this.focus);
      }
    } finally {
      this.clearEffects();
      for (const pursuer of this.pursuers) pursuer.reset();
      this.applySample(this.timeline.sample(0));
      this.setActorsVisible(this._active);
    }
    // Leave the opening's first clean view in the framebuffer, never a warmup blast.
    this.setActorsVisible(true);
    render(this.camera, this.focus);
    this.setActorsVisible(this._active);
  }

  fixedUpdate(dt: number): readonly OpeningCinematicEvent[] {
    if (!this._active) return [];
    this.previousTime = this._time;
    this._time = Math.min(
      OPENING_CINEMATIC_DURATION_S,
      this._time + Math.max(0, Number.isFinite(dt) ? dt : 0),
    );
    const advanced = this.timeline.advance(this._time);
    this.applySample(advanced.sample);
    for (const event of advanced.events) this.handleEvent(event, advanced.sample);
    return advanced.events;
  }

  render(alpha: number, dt: number): void {
    if (!this._active) return;
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const renderTime = THREE.MathUtils.lerp(
      this.previousTime,
      this._time,
      THREE.MathUtils.clamp(alpha, 0, 1),
    );
    const sample = this.timeline.sample(renderTime);
    this.applySample(sample);
    this.player.update(safeDt);
    this.pursuers[0].update(safeDt);
    this.pursuers[1].update(safeDt);
    this.updateEffects(safeDt);
  }

  stop(): void {
    this._active = false;
    this.overlay.visible = false;
    this.setActorsVisible(false);
    this.clearEffects();
  }

  setSkipProgress(progress: number): void {
    const next = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    if (next === this.skipProgress) return;
    this.skipProgress = next;
    this.updateCaption();
  }

  dispose(): void {
    this.stop();
    for (const explosion of this.explosions) explosion.dispose();
    this.muzzleFlash.removeFromParent();
    this.muzzleFlash.geometry.dispose();
    this.muzzleFlash.material.dispose();
    this.tracer.removeFromParent();
    this.tracer.geometry.dispose();
    this.tracer.material.dispose();
    this.player.dispose();
    this.pursuers[0].dispose();
    this.pursuers[1].dispose();
    this.player.object3D.removeFromParent();
    this.pursuers[0].object3D.removeFromParent();
    this.pursuers[1].object3D.removeFromParent();
    this.camera.removeFromParent();
    for (const bar of this.overlayBars) {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
    }
    const captionMap = this.skipCaption?.material as THREE.SpriteMaterial | undefined;
    captionMap?.map?.dispose();
    captionMap?.dispose();
    this.overlay.clear();
  }

  private applySample(sample: OpeningCinematicSample): void {
    this.player.object3D.position.set(
      sample.player.position.x,
      sample.player.position.y,
      sample.player.position.z,
    );
    const bodyYaw = this.bodyYawAt(sample.time);
    this.player.object3D.rotation.y = bodyYaw;
    const airborne = sample.stance === 'airborne';
    this.localVelocity.set(0, 0, sample.player.speed);
    this.player.setMotion(sample.player.speed, !airborne, false, this.localVelocity, 'run');
    const settle = (sample.time - BEATS.land) / 0.28;
    if (settle > 0 && settle < 1)
      this.player.object3D.position.y -= Math.sin(settle * Math.PI) * 0.13;
    const aimDelta = new THREE.Vector3(
      sample.weaponAim.x - sample.player.position.x,
      sample.weaponAim.y - sample.player.position.y,
      sample.weaponAim.z - sample.player.position.z,
    );
    const worldAimYaw = Math.atan2(aimDelta.x, aimDelta.z);
    const aiming = sample.time >= BEATS.aim && sample.time < BEATS.reveal;
    this.player.setCombatPresentation({
      weaponId: 'rifle',
      aiming,
      aimPitch: aiming
        ? Math.atan2(aimDelta.y, Math.max(0.001, Math.hypot(aimDelta.x, aimDelta.z)))
        : 0,
      aimYaw: aiming ? shortestAngle(worldAimYaw - bodyYaw) : 0,
      reloading: false,
      reloadProgress: 0,
    });
    for (let i = 0; i < this.pursuers.length; i++) {
      const actor = sample.pursuers[i]!;
      const visual = this.pursuers[i]!;
      visual.object3D.position.set(actor.position.x, actor.position.y, actor.position.z);
      visual.object3D.rotation.y = Math.atan2(
        sample.player.position.x - actor.position.x,
        sample.player.position.z - actor.position.z,
      );
      visual.setState(actor.alive ? (actor.speed > 0.15 ? 'pursue' : 'idle') : 'dead');
    }
    this.applyCamera(sample);
    this.focus.set(
      sample.player.position.x,
      sample.player.position.y + 0.9,
      sample.player.position.z,
    );
    this.layoutOverlay();
  }

  private bodyYawAt(time: number): number {
    if (time < BEATS.turnStart) return -Math.PI / 2;
    if (time < BEATS.aim)
      return angleLerp(
        -Math.PI / 2,
        Math.PI / 2,
        (time - BEATS.turnStart) / (BEATS.aim - BEATS.turnStart),
      );
    if (time < BEATS.reveal) return Math.PI / 2;
    return angleLerp(Math.PI / 2, Math.PI, (time - BEATS.reveal) / 0.65);
  }

  private applyCamera(sample: OpeningCinematicSample): void {
    const time = sample.time,
      player = sample.player.position;
    // Deliberate cuts keep the pursuer impacts above the roof parapet and
    // show the line of fire from the Nomad, rather than orbiting into the wall.
    if (time >= BEATS.aim && time < BEATS.reveal) {
      const second = time >= BEATS.secondAim;
      const enemy = sample.pursuers[second ? 1 : 0].position;
      const impactTime = second ? BEATS.kill2 : BEATS.kill1;
      const impact = time >= impactTime;
      if (impact) {
        const elapsed = time - impactTime;
        this.camera.position.set(enemy.x - 3.4, enemy.y + 1.0 + elapsed * 0.15, enemy.z + 4.9);
        this.camera.lookAt(enemy.x, enemy.y - 0.1, enemy.z);
      } else {
        this.camera.position.set(player.x - 3.7, player.y + 3.2, player.z + 7.2);
        this.camera.lookAt(
          player.x * 0.45 + enemy.x * 0.55,
          player.y * 0.45 + enemy.y * 0.55 + 0.2,
          enemy.z * 0.55,
        );
      }
      return;
    }
    const last = CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1]!;
    let before = CAMERA_KEYFRAMES[0]!;
    let after = last;
    for (let i = 1; i < CAMERA_KEYFRAMES.length; i++) {
      const candidate = CAMERA_KEYFRAMES[i]!;
      if (candidate.time >= time) {
        after = candidate;
        before = CAMERA_KEYFRAMES[i - 1]!;
        break;
      }
    }
    const blend =
      before === after ? 1 : smooth01((time - before.time) / (after.time - before.time));
    this.cameraPosition.lerpVectors(before.position, after.position, blend);
    this.cameraTarget.lerpVectors(before.target, after.target, blend);
    this.camera.position.set(
      player.x + this.cameraPosition.x,
      player.y + this.cameraPosition.y,
      player.z + this.cameraPosition.z,
    );
    this.camera.lookAt(
      player.x + this.cameraTarget.x,
      player.y + this.cameraTarget.y,
      player.z + this.cameraTarget.z,
    );
  }

  private layoutOverlay(): void {
    const depth = 1.1;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * depth;
    const height = halfHeight * 2;
    const width = height * Math.max(0.1, this.camera.aspect || 1);
    const barHeight = height * 0.1;
    const top = this.overlayBars[0]!;
    const bottom = this.overlayBars[1]!;
    top.scale.set(width, barHeight, 1);
    bottom.scale.set(width, barHeight, 1);
    top.position.set(0, halfHeight - barHeight * 0.5, -depth);
    bottom.position.set(0, -halfHeight + barHeight * 0.5, -depth);
    if (this.skipCaption) {
      this.skipCaption.position.set(0, -halfHeight + barHeight * 0.52, -depth - 0.01);
      this.skipCaption.scale.set(width * 0.52, barHeight * 0.82, 1);
    }
  }

  private handleEvent(event: OpeningCinematicEvent, sample: OpeningCinematicSample): void {
    if (event.name === 'shot1' || event.name === 'shot2') {
      this.sound?.('shot');
      this.player.kickHeldWeapon(0.045, -0.045, event.name === 'shot1' ? 0.018 : -0.018);
      const index = event.actorId === 'pursuer-2' ? 1 : 0;
      this.spawnShotEffect(sample.pursuers[index]!.position);
    } else if (event.name === 'kill1' || event.name === 'kill2') {
      const index = event.actorId === 'pursuer-2' ? 1 : 0;
      this.pursuers[index]!.setState('dead');
      this.sound?.('explosion');
      this.explosions[index]!.trigger(sample.pursuers[index]!.position);
    }
  }

  private spawnShotEffect(target: OpeningCinematicSample['weaponAim']): void {
    const origin = this.player.getMuzzleWorldPosition(this.muzzleFlash.position);
    const positions = this.tracer.geometry.getAttribute('position');
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, target.x, target.y, target.z);
    positions.needsUpdate = true;
    this.tracer.geometry.computeBoundingSphere();
    this.shotAge = 0;
    this.muzzleFlash.visible = this.tracer.visible = true;
    this.muzzleFlash.material.opacity = 1;
    this.tracer.material.opacity = 0.9;
  }

  private updateEffects(dt: number): void {
    for (const explosion of this.explosions) explosion.update(dt, this.camera);
    this.shotAge += dt;
    this.muzzleFlash.visible = this.shotAge < 0.1;
    this.tracer.visible = this.shotAge < 0.12;
    this.muzzleFlash.material.opacity = Math.max(0, 1 - this.shotAge / 0.1);
    this.tracer.material.opacity = Math.max(0, 1 - this.shotAge / 0.12) * 0.9;
  }

  private clearEffects(): void {
    for (const explosion of this.explosions) explosion.reset();
    this.shotAge = Infinity;
    this.muzzleFlash.visible = this.tracer.visible = false;
  }

  private setActorsVisible(visible: boolean): void {
    this.player.object3D.visible = visible;
    this.pursuers[0].object3D.visible = visible;
    this.pursuers[1].object3D.visible = visible;
  }

  private createSkipCaption(): THREE.Sprite | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    sprite.userData.captionCanvas = canvas;
    sprite.userData.captionContext = context;
    return sprite;
  }

  private updateCaption(force = false): void {
    if (!this.skipCaption) return;
    if (!force && this.captionProgress === this.skipProgress) return;
    this.captionProgress = this.skipProgress;
    const canvas = this.skipCaption.userData.captionCanvas as HTMLCanvasElement;
    const context = this.skipCaption.userData.captionContext as CanvasRenderingContext2D;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#d9f4ec';
    context.font = 'bold 26px monospace';
    context.textAlign = 'center';
    context.fillText('HOLD ESC TO SKIP', canvas.width / 2, 34);
    context.strokeStyle = '#68e0d0';
    context.strokeRect(170, 54, 300, 12);
    context.fillStyle = '#e9b866';
    context.fillRect(170, 54, 300 * this.skipProgress, 12);
    const map = (this.skipCaption.material as THREE.SpriteMaterial).map;
    if (map) map.needsUpdate = true;
  }
}
