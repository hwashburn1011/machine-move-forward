import * as THREE from 'three';
import { authoredModel, buildGunboatModel, type GunboatVisual } from '@/art/DefenseModels';
import type { Materials } from '@/art/Materials';
import { EnemyVisual } from '@/enemies/EnemyVisual';
import { PlayerVisual } from '@/player/PlayerVisual';
import { SIGNAL_BATTLE_SECONDS, signalBattleCaption } from './RadioRaids';

const ease = (time: number, from: number, to: number): number =>
  THREE.MathUtils.smootherstep(time, from, to);
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

interface BattleShip {
  root: THREE.Group;
  gun: GunboatVisual;
  faction: 'human' | 'robot';
}
interface Particle {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;
  smoke: boolean;
}
interface Tracer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
}

/** A short, local set. No physics bodies or live combat damage belong to this scene. */
export class SignalBattleScene {
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.08, 1800);
  readonly root = new THREE.Group();
  private readonly actors: EnemyVisual[] = [];
  private readonly humans: PlayerVisual[] = [];
  private readonly ships: BattleShip[] = [];
  private readonly ownedGeometry = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly particles: Particle[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly bursts: { sprite: THREE.Sprite; position: THREE.Vector3; age: number }[] = [];
  private readonly hero: EnemyVisual;
  private readonly heroHead: THREE.Object3D | undefined;
  private readonly headRest = new THREE.Quaternion();
  private readonly heroLight = new THREE.PointLight(0xc7deff, 45, 12, 2);
  private readonly overlay = document.createElement('div');
  private readonly caption = document.createElement('div');
  private readonly skip = document.createElement('div');
  private readonly flashTexture: THREE.CanvasTexture;
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly startPosition = new THREE.Vector3();
  private readonly startRotation = new THREE.Quaternion();
  private readonly startLook = new THREE.Vector3();
  private readonly face = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly robotRoot: THREE.Group;
  private readonly flags: THREE.Mesh[] = [];
  private elapsed = 0;
  private skipHeld = 0;
  private shotClock = 0;
  private burstClock = 1.7;
  private shotIndex = 0;
  private startDistance = 0;
  private startFov = 55;
  private running = false;
  private warming = false;

  constructor(
    scene: THREE.Scene,
    private readonly materials: Materials,
    private readonly terrainHeight: (x: number, z: number) => number,
    private readonly sound: (kind: 'shot' | 'explosion') => void,
    rifle: THREE.Object3D | null = null,
  ) {
    this.root.name = 'SignalCrossfire';
    this.root.visible = false;
    scene.add(this.root);
    this.flashTexture = this.radial(false);
    this.smokeTexture = this.radial(true);
    const humans = this.ship('human', v(-17, 0, -6));
    const robots = this.ship('robot', v(13, 0, 5));
    this.robotRoot = robots.root;
    for (const z of [-1.8, 1.2]) {
      const human = new PlayerVisual(authoredModel('player'), materials);
      human.setHeldWeapon('rifle', rifle);
      human.setMotion(0, true);
      human.update(0);
      human.object3D.position.set(2.7, 9.06, z);
      human.object3D.rotation.y = Math.PI / 2;
      humans.root.add(human.object3D);
      this.humans.push(human);
    }
    this.actor('warden', robots.root, v(-2.7, 8.1, -1.2), -Math.PI / 2);
    this.actor('bastion', robots.root, v(-2.4, 8.1, 2.1), -Math.PI / 2);
    this.hero = this.actor('revenant', robots.root, v(-3.35, 8.1, -5), -Math.PI / 2);
    this.hero.object3D.name = 'SignalRevenant';
    this.heroHead = this.hero.object3D.getObjectByName('head');
    if (this.heroHead) this.headRest.copy(this.heroHead.quaternion);
    robots.root.add(this.heroLight);
    this.heroLight.position.set(-5, 10.4, -9);
    this.overlay.dataset.testid = 'signal-cinematic';
    this.overlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:90;display:none;border-top:7vh solid #080b10;border-bottom:9vh solid #080b10;box-sizing:border-box;color:#e6e9e9;font-family:monospace';
    this.caption.style.cssText =
      'position:absolute;bottom:2vh;left:8%;right:8%;text-align:center;font-size:clamp(12px,1.25vw,20px);letter-spacing:.12em;text-shadow:0 2px 6px #000,0 0 12px #000';
    this.skip.style.cssText =
      'position:absolute;right:3%;bottom:-6vh;font-size:12px;color:#a7b5bd;letter-spacing:.1em';
    this.overlay.append(this.caption, this.skip);
    document.body.append(this.overlay);
  }

  get active(): boolean {
    return this.running;
  }
  get time(): number {
    return this.elapsed;
  }
  get lightingFocus(): THREE.Vector3 {
    return this.elapsed > 6 ? this.face : this.root.position.clone().add(v(0, 8, 0));
  }

  start(from: THREE.PerspectiveCamera, distance: number): void {
    this.elapsed = this.skipHeld = this.shotClock = this.shotIndex = 0;
    this.burstClock = 1.7;
    this.startDistance = distance;
    this.startFov = from.fov;
    this.startPosition.copy(from.position);
    this.startRotation.copy(from.quaternion);
    from.getWorldDirection(this.startLook).multiplyScalar(70).add(from.position);
    this.camera.copy(from);
    this.camera.near = 0.08;
    this.running = this.root.visible = true;
    this.overlay.style.display = this.warming ? 'none' : 'block';
    this.root.position.set(54, 0, -76);
    for (const ship of this.ships) {
      const at = this.root.position.clone().add(ship.root.position);
      ship.root.position.y = this.terrainHeight(at.x, at.z) + 1.3;
    }
    this.update(0, distance, false);
  }

  /** Returns true once either the final shot or a deliberate hold-to-skip ends. */
  update(dt: number, distance: number, skipDown: boolean): boolean {
    if (!this.running) return false;
    this.elapsed += dt;
    this.skipHeld = skipDown ? this.skipHeld + dt : 0;
    if (this.elapsed >= SIGNAL_BATTLE_SECONDS || this.skipHeld >= 0.8) {
      this.stop();
      return true;
    }
    const t = this.elapsed;
    // A passing encounter: the battle falls behind the moving Nomad. A small
    // drift still reads when its engine is stopped for repairs.
    this.root.position.z = -76 + Math.max(distance - this.startDistance, t * 2.6);
    for (const actor of this.actors) actor.update(dt);
    for (const human of this.humans) human.update(dt);
    // The sword mech starts watching the other ship, then visibly turns to us.
    this.hero.object3D.rotation.y = THREE.MathUtils.lerp(
      -Math.PI / 2,
      -Math.PI * 0.79,
      ease(t, 8, 10),
    );
    if (this.heroHead)
      this.heroHead.quaternion
        .copy(this.headRest)
        .multiply(new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), -0.12 * ease(t, 8.3, 9.8)));
    this.root.updateMatrixWorld(true);
    this.face.copy(this.hero.object3D.position).add(v(0, 0.7, 0));
    this.robotRoot.localToWorld(this.face);
    if (this.heroHead) this.heroHead.getWorldPosition(this.face);
    this.face.y += 0.09;

    // The establishing shot clears the Nomad's cabin to reveal both ships off
    // the forward-right bow; the same side of the action is kept for every cut.
    const wideEye = v(9, 21, -16);
    const wideTarget = this.root.localToWorld(v(0, 5, 0));
    this.eye.copy(this.startPosition).lerp(wideEye, ease(t, 0, 2.3));
    this.target.copy(this.startLook).lerp(wideTarget, ease(t, 0, 2.3));
    this.camera.fov = 56;
    if (t > 5.5) {
      const medium = this.robotRoot.localToWorld(v(-14, 12.5, -21));
      this.eye.lerp(medium, ease(t, 5.5, 8));
      this.target.lerp(this.face.clone().add(v(0, -0.6, 0)), ease(t, 5.5, 8));
    }
    if (t > 10) {
      // +Z is the authored face direction. Keep the lens in front of the
      // turned head instead of zooming into the back of the helmet.
      const close = this.face.clone().add(v(-0.82, 0.08, -1.04));
      this.eye.lerp(close, ease(t, 10, 12.8));
      this.target.lerp(this.face, ease(t, 10, 12.8));
      this.camera.fov = THREE.MathUtils.lerp(56, 30, ease(t, 10, 12.8));
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
    if (t > 15.3) {
      const back = ease(t, 15.3, SIGNAL_BATTLE_SECONDS);
      this.camera.position.lerp(this.startPosition, back);
      this.camera.quaternion.slerp(this.startRotation, back);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.startFov, back);
    }
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.caption.textContent = signalBattleCaption(t);
    this.skip.textContent =
      this.skipHeld > 0
        ? `SKIPPING ${Math.min(100, Math.round((this.skipHeld / 0.8) * 100))}%`
        : 'HOLD ESC TO SKIP';
    this.animateEffects(dt);
    return false;
  }

  stop(): void {
    this.running = this.root.visible = false;
    this.overlay.style.display = 'none';
    for (const tracer of this.tracers) {
      tracer.age = 1;
      tracer.mesh.visible = false;
    }
    for (const burst of this.bursts) {
      burst.age = 2;
      burst.sprite.visible = false;
    }
  }

  /** Exercise the real shot cameras, shadow casters and post passes during boot. */
  prewarm(
    from: THREE.PerspectiveCamera,
    render: (camera: THREE.PerspectiveCamera, focus: THREE.Vector3) => void,
  ): void {
    this.warming = true;
    try {
      this.start(from, 0);
      for (const time of [3.5, 8, 13.5]) {
        this.update(time - this.elapsed, 0, false);
        render(this.camera, this.lightingFocus);
      }
    } finally {
      this.stop();
      this.warming = false;
    }
  }

  private actor(id: string, parent: THREE.Group, feet: THREE.Vector3, yaw: number): EnemyVisual {
    const actor = new EnemyVisual(authoredModel(id), this.materials);
    actor.setState('idle');
    actor.setPresentationOnly();
    actor.update(0);
    actor.object3D.position.copy(feet).add(v(0, 0.96, 0));
    actor.object3D.rotation.y = yaw;
    parent.add(actor.object3D);
    this.actors.push(actor);
    return actor;
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
  ): THREE.Mesh {
    this.ownedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private ship(faction: 'human' | 'robot', position: THREE.Vector3): BattleShip {
    const root = new THREE.Group();
    root.name = faction === 'human' ? 'HumanConvoyShip' : 'RobotWarship';
    root.position.copy(position);
    this.root.add(root);
    const gun = buildGunboatModel(this.materials);
    gun.root.scale.set(2.5, 2.5, 2.8);
    root.add(gun.root);
    if (!gun.root.userData.authored)
      gun.root.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) this.ownedGeometry.add((object as THREE.Mesh).geometry);
      });
    // The old gunboat's plain shader was acceptable at encounter distance.
    // Close shots get the same weathered surfaces as the playable machine.
    gun.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const replace = (mat: THREE.Material): THREE.Material =>
        /_Paint/.test(mat.name)
          ? this.materials.hull
          : /_Dark/.test(mat.name)
            ? this.materials.hullDark
            : /_Steel/.test(mat.name)
              ? this.materials.stationMetal
              : mat;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(replace)
        : replace(mesh.material);
    });
    const edge = new THREE.MeshStandardMaterial({
      color: faction === 'human' ? 0x418c9e : 0x732825,
      roughness: 0.68,
      metalness: 0.6,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: faction === 'human' ? 0x67d9ff : 0xff4430,
      toneMapped: false,
    });
    this.ownedMaterials.add(edge);
    this.ownedMaterials.add(glow);
    this.mesh(new THREE.BoxGeometry(8, 0.3, 11), this.materials.deckPlate, root).position.set(
      0,
      7.93,
      -1,
    );
    for (const side of [-1, 1]) {
      for (const z of [-5.8, -3.5, 0.4, 3.8]) {
        this.mesh(
          new THREE.BoxGeometry(0.16, 1.05, 0.16),
          this.materials.bareSteel,
          root,
        ).position.set(side * 3.9, 8.6, z);
      }
      this.mesh(new THREE.BoxGeometry(0.13, 0.12, 10), edge, root).position.set(
        side * 3.9,
        9.1,
        -1,
      );
      this.mesh(new THREE.BoxGeometry(0.08, 0.15, 8), glow, root).position.set(
        side * 4.05,
        7.85,
        -0.8,
      );
      this.mesh(new THREE.BoxGeometry(0.18, 2.3, 3.9), edge, root).position.set(side * 4, 6.6, 0.8);
      for (const z of [-8, -5.2, -2.4, 0.4, 3.2, 6]) {
        this.mesh(
          new THREE.BoxGeometry(0.22, 1.1, 2.5),
          this.materials.hullDark,
          root,
        ).position.set(side * 4.2, 3.8, z);
        this.mesh(new THREE.BoxGeometry(0.24, 0.13, 1.85), edge, root).position.set(
          side * 4.22,
          4.45,
          z,
        );
        this.mesh(new THREE.BoxGeometry(0.18, 0.12, 1.55), glow, root).position.set(
          side * 3.8,
          0.6,
          z,
        );
      }
    }
    this.mesh(
      new THREE.CylinderGeometry(0.07, 0.1, 6, 10),
      this.materials.bareSteel,
      root,
    ).position.set(2.2, 10.7, 3.1);
    const flagMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.factionFlag(faction),
      side: THREE.DoubleSide,
      roughness: 1,
    });
    this.ownedMaterials.add(flagMaterial);
    const flag = this.mesh(new THREE.PlaneGeometry(2.5, 1.5, 12, 4), flagMaterial, root);
    flag.position.set(3.5, 12.5, 3.1);
    this.flags.push(flag);
    for (const at of [v(-2.8, 4.9, 6.5), v(3.6, 6.6, 2.4)]) {
      for (let i = 0; i < 14; i++) {
        const smoke = i >= 6;
        const mat = new THREE.SpriteMaterial({
          map: smoke ? this.smokeTexture : this.flashTexture,
          color: smoke ? 0x55504a : 0xffa43c,
          blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: smoke ? 0.38 : 0.8,
          toneMapped: smoke,
        });
        this.ownedMaterials.add(mat);
        const sprite = new THREE.Sprite(mat);
        root.add(sprite);
        this.particles.push({ sprite, origin: at.clone(), phase: i / 14, smoke });
      }
    }
    const ship = { root, gun, faction };
    this.ships.push(ship);
    return ship;
  }

  private radial(smoke: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, smoke ? '#ffffffbc' : '#ffffffff');
    gradient.addColorStop(smoke ? 0.4 : 0.12, smoke ? '#ffffffe0' : '#ffdc82ed');
    gradient.addColorStop(0.7, smoke ? '#ffffff38' : '#ed45151a');
    gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    this.ownedTextures.add(texture);
    return texture;
  }

  private factionFlag(faction: 'human' | 'robot'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = faction === 'human' ? '#184f65' : '#571919';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#d7ccb3';
    ctx.lineWidth = 14;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(90, 40 + i * 55);
      ctx.lineTo(150, 75 + i * 55);
      ctx.lineTo(210, 40 + i * 55);
      ctx.stroke();
    }
    ctx.fillStyle = '#e2d7be';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(faction === 'human' ? 'HUMAN' : 'MACHINE', 255, 91);
    ctx.fillText(faction === 'human' ? 'CONVOY' : 'ORDER', 255, 136);
    ctx.font = '18px monospace';
    ctx.fillText(faction === 'human' ? 'HUMANITY ENDURES' : 'HUMANITY WAS A PHASE', 86, 218);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.add(texture);
    return texture;
  }

  private animateEffects(dt: number): void {
    const t = this.elapsed;
    for (const p of this.particles) {
      const cycle = (p.phase + t * (p.smoke ? 0.16 : 0.8)) % 1;
      const size = p.smoke ? 1.9 + cycle * 4.2 : 0.7 + cycle * 1.4;
      p.sprite.position
        .copy(p.origin)
        .add(
          v(
            Math.sin(p.phase * 37 + cycle * 3) * 0.6 + cycle * (p.smoke ? 3 : 0),
            cycle * (p.smoke ? 11 : 3),
            cycle * 1.7,
          ),
        );
      p.sprite.scale.set(size, size * (p.smoke ? 0.85 : 1.8), 1);
      p.sprite.material.opacity = Math.sin(Math.PI * cycle) * (p.smoke ? 0.45 : 0.88);
    }
    for (const flag of this.flags) {
      const pos = flag.geometry.attributes.position!;
      for (let i = 0; i < pos.count; i++)
        pos.setZ(i, Math.sin(pos.getX(i) * 3 - t * 5) * 0.12 * (pos.getX(i) + 1.25));
      pos.needsUpdate = true;
    }
    this.shotClock -= dt;
    if (this.shotClock <= 0) {
      this.shotClock = 0.19;
      const index = this.shotIndex++;
      const fromShip = this.ships[index % 2]!;
      const toShip = this.ships[(index + 1) % 2]!;
      const from = fromShip.root.localToWorld(
        v(fromShip.faction === 'human' ? 3.5 : -3.5, 9.25, -2 + (index % 3) * 1.7),
      );
      const to = toShip.root.localToWorld(
        v(
          toShip.faction === 'human' ? 3.5 : -3.5,
          8.3 + Math.sin(index) * 0.6,
          -1.5 + Math.cos(index * 3) * 4,
        ),
      );
      this.fire(from, to, index % 2 === 0);
      const local = fromShip.gun.root.worldToLocal(to.clone()).sub(fromShip.gun.yaw.position);
      fromShip.gun.yaw.rotation.y = Math.atan2(-local.x, -local.z);
      fromShip.gun.pitch.rotation.x = Math.atan2(local.y, Math.hypot(local.x, local.z));
      if (index % 7 === 0 && !this.warming) this.sound('shot');
      if (fromShip.faction === 'human')
        this.humans[Math.floor(index / 2) % this.humans.length]?.kickHeldWeapon(0.045, 0.045, 0);
      else this.actors[0]?.attack();
    }
    this.burstClock -= dt;
    if (this.burstClock <= 0 && t < 10.5) {
      this.burstClock = 2.3;
      const ship = this.ships[this.shotIndex % 2]!;
      this.explode(ship.root.localToWorld(v(3.5, 8, 3)));
      if (!this.warming) this.sound('explosion');
    }
    for (const tracer of this.tracers) {
      tracer.age += dt;
      tracer.mesh.visible = tracer.age < 0.4;
      if (tracer.mesh.visible)
        tracer.mesh.position.copy(tracer.from).lerp(tracer.to, tracer.age / 0.4);
    }
    for (const burst of this.bursts) {
      burst.age += dt;
      burst.sprite.visible = burst.age < 1.2;
      burst.sprite.scale.setScalar(1.5 + burst.age * 8);
      burst.sprite.material.opacity = Math.max(0, 1 - burst.age / 1.2);
    }
  }

  private fire(from: THREE.Vector3, to: THREE.Vector3, human: boolean): void {
    let tracer = this.tracers.find((item) => item.age >= 0.4);
    if (!tracer && this.tracers.length < 8) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      this.ownedMaterials.add(mat);
      const mesh = this.mesh(
        new THREE.CylinderGeometry(0.035, 0.055, 2.5, 5),
        mat,
        this.root.parent!,
      );
      tracer = { mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), age: 1 };
      this.tracers.push(tracer);
    }
    if (!tracer) return;
    tracer.age = 0;
    tracer.from.copy(from);
    tracer.to.copy(to);
    (tracer.mesh.material as THREE.MeshBasicMaterial).color.setHex(human ? 0x9de6ff : 0xff7845);
    tracer.mesh.quaternion.setFromUnitVectors(v(0, 1, 0), to.clone().sub(from).normalize());
  }

  private explode(position: THREE.Vector3): void {
    let burst = this.bursts.find((item) => item.age >= 1.2);
    if (!burst && this.bursts.length < 3) {
      const mat = new THREE.SpriteMaterial({
        map: this.flashTexture,
        color: 0xff9d42,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      this.ownedMaterials.add(mat);
      const sprite = new THREE.Sprite(mat);
      this.root.parent!.add(sprite);
      burst = { sprite, position: new THREE.Vector3(), age: 2 };
      this.bursts.push(burst);
    }
    if (!burst) return;
    burst.age = 0;
    burst.position.copy(position);
    burst.sprite.position.copy(position);
  }

  dispose(): void {
    this.stop();
    this.root.removeFromParent();
    this.overlay.remove();
    for (const actor of this.actors) actor.dispose();
    for (const human of this.humans) human.dispose();
    for (const tracer of this.tracers) tracer.mesh.removeFromParent();
    for (const burst of this.bursts) burst.sprite.removeFromParent();
    for (const geometry of this.ownedGeometry) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
  }
}
