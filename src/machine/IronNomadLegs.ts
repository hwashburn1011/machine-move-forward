import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { LEGS, FOOT_SPLAY } from '@/data/gait';
import { footAt, planted } from './Gait';

const SOURCE_NAMES = ['FrontRight', 'FrontLeft', 'RearRight', 'RearLeft'];
const DEFINITIONS = LEGS.map((l) => ({
  ...l,
  hip: { x: l.side * 4.875, y: 7.9966666667, z: l.end * 4.8 },
}));
const AXIS_X = new THREE.Vector3(1, 0, 0);
const FOOT_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const BLENDER_TO_GLTF = new THREE.Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);
const GLTF_TO_BLENDER = BLENDER_TO_GLTF.clone().invert();
const gltfPoint = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(v.x, v.z, -v.y);
const gltfRotation = (q: THREE.Quaternion): THREE.Quaternion =>
  BLENDER_TO_GLTF.clone().multiply(q).multiply(GLTF_TO_BLENDER);

/** Source geometry uses local +Z along each rigid limb. */
export function nomadSegmentRotation(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  const z = b.clone().sub(a).normalize();
  const x = AXIS_X.clone().addScaledVector(z, -z.x).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Two-link IK in the authored root's coordinates, with a stable outward knee. */
export function solveNomadKnee(
  hip: THREE.Vector3,
  restKnee: THREE.Vector3,
  restFoot: THREE.Vector3,
  foot: THREE.Vector3,
): THREE.Vector3 {
  const a = hip.distanceTo(restKnee),
    b = restKnee.distanceTo(restFoot);
  const delta = foot.clone().sub(hip),
    length = THREE.MathUtils.clamp(delta.length(), 0.01, a + b - 0.001);
  const axis = delta.normalize();
  const bend = restKnee.clone().sub(hip);
  bend.addScaledVector(axis, -bend.dot(axis)).normalize();
  const along = (a * a - b * b + length * length) / (2 * length);
  return hip
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
}

export class IronNomadLegs {
  readonly object3D = new THREE.Group();
  private root: THREE.Object3D | null = null;
  private readonly joints: ({
    upper: THREE.Object3D;
    lower: THREE.Object3D;
    foot: THREE.Object3D;
  } | null)[] = [];
  private rotor: THREE.Object3D | null = null;
  private readonly feet = DEFINITIONS.map(() => new THREE.Vector3());
  private readonly fallback: THREE.Mesh[] = [];
  private readonly plants: number[] = [];
  private distance = 0;
  constructor(materials: Materials) {
    this.object3D.name = 'NomadLegFallback';
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.hullDark);
      mesh.castShadow = true;
      this.object3D.add(mesh);
      this.fallback.push(mesh);
    }
  }
  apply(root: THREE.Object3D | null): void {
    this.root = root?.getObjectByName('IronNomad_FourLegWalker') ?? null;
    this.joints.length = 0;
    this.rotor = this.root?.getObjectByName('Turbine_Rotor') ?? null;
    if (this.root) {
      for (const name of SOURCE_NAMES) {
        const upper = this.root.getObjectByName(`Leg_${name}_Upper`);
        const lower = this.root.getObjectByName(`Leg_${name}_Lower`);
        const foot = this.root.getObjectByName(`Leg_${name}_Foot`);
        this.joints.push(upper && lower && foot ? { upper, lower, foot } : null);
      }
    }
    this.object3D.visible = !this.root;
    this.setDistance(this.distance);
  }
  setDistance(distance: number): readonly number[] {
    this.plants.length = 0;
    this.root?.updateWorldMatrix(true, false);
    for (let i = 0; i < DEFINITIONS.length; i++) {
      const leg = DEFINITIONS[i]!;
      const p = footAt(distance, leg);
      const target = this.feet[i]!.set(p.x + leg.side * (2.1375 - FOOT_SPLAY), p.y + 0.04, p.z);
      if (planted(this.distance, distance, leg)) this.plants.push(i);
      const sx = -leg.side,
        sy = leg.end;
      const h = new THREE.Vector3(sx * 6.5, sy * 6, 9.6);
      const k = new THREE.Vector3(sx * 8.7, sy * 5.1, 5.05);
      const f = new THREE.Vector3(sx * 9.35, sy * 8, 1);
      if (this.root) {
        const joint = this.joints[i];
        if (!joint) continue;
        const { upper, lower, foot } = joint;
        const gltfLocal = this.root.worldToLocal(
          target.clone().add(new THREE.Vector3(0, 0.8166667, 0)),
        );
        const local = new THREE.Vector3(gltfLocal.x, -gltfLocal.z, gltfLocal.y);
        const knee = solveNomadKnee(h, k, f, local);
        upper.quaternion.copy(gltfRotation(nomadSegmentRotation(h, knee)));
        lower.position.copy(gltfPoint(knee));
        lower.quaternion.copy(gltfRotation(nomadSegmentRotation(knee, local)));
        foot.position.copy(gltfPoint(local));
        const rotation = this.root.getWorldQuaternion(new THREE.Quaternion());
        foot.quaternion.copy(rotation.invert().multiply(FOOT_ROTATION));
      } else {
        const hip = new THREE.Vector3(leg.hip.x, leg.hip.y, leg.hip.z);
        const knee = hip
          .clone()
          .lerp(target, 0.53)
          .add(new THREE.Vector3(leg.side * 1.1, 0, -leg.end * 0.5));
        for (const [j, a, b] of [
          [0, hip, knee],
          [1, knee, target],
        ] as const) {
          const mesh = this.fallback[i * 2 + j]!;
          mesh.position.copy(a).lerp(b, 0.5);
          mesh.scale.set(0.85, 0.85, a.distanceTo(b));
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            b.clone().sub(a).normalize(),
          );
        }
      }
    }
    const rotor = this.rotor;
    if (rotor) rotor.rotation.y = distance * 0.8;
    this.distance = distance;
    return this.plants;
  }
  footPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.feet[index]!);
  }
  dispose(): void {
    for (const mesh of this.fallback) mesh.geometry.dispose();
    this.root = null;
    this.rotor = null;
    this.joints.length = 0;
  }
}
