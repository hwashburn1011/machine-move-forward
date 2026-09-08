import * as THREE from 'three';

const RINGS = 25;
const SIDES = 6;
const UP = new THREE.Vector3(0, 1, 0);

interface ShellTrail {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  duration: number;
}

/** Lightweight original geometry for a readable cable and incoming skiff fire. */
export class BoardingEffects {
  private readonly group = new THREE.Group();
  private readonly cableGeometry = new THREE.BufferGeometry();
  private readonly cable: THREE.Mesh;
  private readonly positions = new Float32Array(RINGS * SIDES * 3);
  private readonly normals = new Float32Array(RINGS * SIDES * 3);
  private readonly shellGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.85, 5);
  private readonly shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdc85,
    toneMapped: false,
  });
  private readonly shells: ShellTrail[] = [];
  private readonly direction = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly pulse: THREE.Mesh;
  private pulseAge = 1;

  constructor(scene: THREE.Scene) {
    this.group.name = 'boarding-cable-and-shells';
    scene.add(this.group);
    const indices: number[] = [];
    const colors = new Float32Array(this.positions.length);
    const dark = new THREE.Color(0x4c4439);
    const marker = new THREE.Color(0xd79b42);
    for (let ring = 0; ring < RINGS; ring++) {
      for (let side = 0; side < SIDES; side++) {
        const at = ring * SIDES + side;
        (ring % 5 === 0 ? marker : dark).toArray(colors, at * 3);
        if (ring === RINGS - 1) continue;
        const next = ring * SIDES + ((side + 1) % SIDES);
        indices.push(at, at + SIDES, next, next, at + SIDES, next + SIDES);
      }
    }
    this.cableGeometry.setIndex(indices);
    this.cableGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.cableGeometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.cableGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.cable = new THREE.Mesh(
      this.cableGeometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.3 }),
    );
    this.cable.name = 'taut-boarding-cable';
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.group.add(this.cable);
    this.pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffbb5c,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.pulse.visible = false;
    this.group.add(this.pulse);
  }

  /** Endpoints are world coordinates, at the skiff launcher and moving hook. */
  setCable(from: THREE.Vector3, to: THREE.Vector3, visible: boolean): void {
    this.cable.visible = visible && from.distanceToSquared(to) > 0.01;
    if (!this.cable.visible) return;
    this.direction.subVectors(to, from).normalize();
    this.across.crossVectors(this.direction, UP);
    if (this.across.lengthSq() < 0.001) this.across.set(1, 0, 0);
    this.across.normalize();
    this.normal.crossVectors(this.across, this.direction).normalize();
    const sag = Math.min(0.45, from.distanceTo(to) * 0.035);
    for (let ring = 0; ring < RINGS; ring++) {
      const t = ring / (RINGS - 1);
      this.center.lerpVectors(from, to, t);
      this.center.y -= Math.sin(t * Math.PI) * sag;
      for (let side = 0; side < SIDES; side++) {
        const angle = (side / SIDES) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const at = (ring * SIDES + side) * 3;
        const nx = this.across.x * cos + this.normal.x * sin;
        const ny = this.across.y * cos + this.normal.y * sin;
        const nz = this.across.z * cos + this.normal.z * sin;
        this.positions[at] = this.center.x + nx * 0.035;
        this.positions[at + 1] = this.center.y + ny * 0.035;
        this.positions[at + 2] = this.center.z + nz * 0.035;
        this.normals[at] = nx;
        this.normals[at + 1] = ny;
        this.normals[at + 2] = nz;
      }
    }
    this.cableGeometry.getAttribute('position').needsUpdate = true;
    this.cableGeometry.getAttribute('normal').needsUpdate = true;
  }

  volley(from: THREE.Vector3, to: THREE.Vector3, flightTime: number): void {
    this.direction.subVectors(to, from).normalize();
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.shellGeometry, this.shellMaterial);
      mesh.quaternion.setFromUnitVectors(UP, this.direction);
      mesh.position.copy(from);
      mesh.visible = i === 0;
      this.group.add(mesh);
      this.shells.push({
        mesh,
        from: from.clone(),
        to: to.clone(),
        age: -i * 0.06,
        duration: Math.max(0.1, flightTime),
      });
    }
    this.pulseAge = 0;
    this.pulse.position.copy(from);
    this.pulse.visible = true;
  }

  update(dt: number): void {
    const elapsed = Math.max(0, dt);
    this.pulseAge += elapsed;
    this.pulse.visible = this.pulseAge < 0.15;
    this.pulse.scale.setScalar(1 + this.pulseAge * 5);
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i]!;
      shell.age += elapsed;
      shell.mesh.visible = shell.age >= 0;
      if (shell.age >= shell.duration) {
        shell.mesh.removeFromParent();
        this.shells.splice(i, 1);
      } else if (shell.age >= 0) {
        shell.mesh.position.lerpVectors(shell.from, shell.to, shell.age / shell.duration);
      }
    }
  }

  clear(): void {
    this.cable.visible = this.pulse.visible = false;
    for (const shell of this.shells) shell.mesh.removeFromParent();
    this.shells.length = 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.cableGeometry.dispose();
    (this.cable.material as THREE.Material).dispose();
    this.shellGeometry.dispose();
    this.shellMaterial.dispose();
    this.pulse.geometry.dispose();
    (this.pulse.material as THREE.Material).dispose();
  }
}
