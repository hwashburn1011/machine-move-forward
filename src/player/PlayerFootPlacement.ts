import * as THREE from 'three';
export interface GroundSample {
  hit: boolean;
  point?: Readonly<{ x: number; y: number; z: number }>;
  normal?: Readonly<{ x: number; y: number; z: number }>;
}
export interface GroundSampler {
  sample(origin: THREE.Vector3, maxDistance: number, ignorePlayer: boolean): GroundSample;
}
export interface FootRig {
  soleHeight?: number;
  pelvis?: THREE.Object3D;
  leftThigh?: THREE.Object3D;
  rightThigh?: THREE.Object3D;
  leftCalf?: THREE.Object3D;
  rightCalf?: THREE.Object3D;
}
const MAX_OFFSET = 0.18,
  MIN_NORMAL_Y = 0.55,
  MAX_ANKLE_TILT = 0.3;

/** Analytic two-bone visual IK. Bone translations and gameplay collision never change. */
export class PlayerFootPlacement {
  private readonly left = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly leftOrigin = new THREE.Vector3();
  private readonly rightOrigin = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly desiredKnee = new THREE.Vector3();
  private readonly q0 = new THREE.Quaternion();
  private readonly q1 = new THREE.Quaternion();
  private readonly identity = new THREE.Quaternion();
  private readonly animatedAnkleWorld = new THREE.Quaternion();
  private readonly desiredAnkleWorld = new THREE.Quaternion();
  private readonly saved: { bone: THREE.Object3D; quaternion: THREE.Quaternion; active: boolean }[];
  constructor(
    private readonly leftFoot: THREE.Object3D,
    private readonly rightFoot: THREE.Object3D,
    private readonly sampler: GroundSampler,
    private readonly rig: FootRig = {},
  ) {
    this.saved = [rig.leftThigh, rig.leftCalf, leftFoot, rig.rightThigh, rig.rightCalf, rightFoot]
      .filter((bone): bone is THREE.Object3D => !!bone)
      .map((bone) => ({ bone, quaternion: new THREE.Quaternion(), active: false }));
  }

  resetApplied(): void {
    for (const entry of this.saved)
      if (entry.active) {
        entry.bone.quaternion.copy(entry.quaternion);
        entry.active = false;
      }
  }

  update(
    _origin: THREE.Vector3,
    grounded: boolean,
    blend = 1,
    stance?: Readonly<{ left: number; right: number }>,
  ): void {
    this.resetApplied();
    const amount = grounded ? THREE.MathUtils.clamp(blend, 0, 1) : 0;
    if (amount <= 0) return;
    this.leftFoot.updateWorldMatrix(true, false);
    this.rightFoot.updateWorldMatrix(true, false);
    this.leftFoot.getWorldPosition(this.left);
    this.rightFoot.getWorldPosition(this.right);
    this.leftOrigin.copy(this.left);
    this.leftOrigin.y += 0.25;
    this.rightOrigin.copy(this.right);
    this.rightOrigin.y += 0.25;
    const leftHit = this.sampler.sample(this.leftOrigin, 0.5, true),
      rightHit = this.sampler.sample(this.rightOrigin, 0.5, true);
    if (this.rig.leftThigh && this.rig.leftCalf)
      this.solve(
        this.rig.leftThigh,
        this.rig.leftCalf,
        this.leftFoot,
        leftHit,
        this.left,
        amount * (stance?.left ?? 1),
      );
    if (this.rig.rightThigh && this.rig.rightCalf)
      this.solve(
        this.rig.rightThigh,
        this.rig.rightCalf,
        this.rightFoot,
        rightHit,
        this.right,
        amount * (stance?.right ?? 1),
      );
  }

  private solve(
    thigh: THREE.Object3D,
    calf: THREE.Object3D,
    ankle: THREE.Object3D,
    sample: GroundSample,
    ankleWorld: THREE.Vector3,
    amount: number,
  ): void {
    if (
      amount <= 0 ||
      !sample.hit ||
      !sample.point ||
      (sample.normal && sample.normal.y < MIN_NORMAL_Y)
    )
      return;
    this.target.set(sample.point.x, sample.point.y + (this.rig.soleHeight ?? 0), sample.point.z);
    if (
      !Number.isFinite(this.target.x) ||
      !Number.isFinite(this.target.y) ||
      !Number.isFinite(this.target.z)
    )
      return;
    this.target.sub(ankleWorld).clampLength(0, MAX_OFFSET).multiplyScalar(amount).add(ankleWorld);
    ankle.getWorldQuaternion(this.animatedAnkleWorld);
    thigh.getWorldPosition(this.a);
    calf.getWorldPosition(this.b);
    ankle.getWorldPosition(this.c);
    const upper = this.a.distanceTo(this.b),
      lower = this.b.distanceTo(this.c);
    if (upper < 1e-5 || lower < 1e-5) return;
    this.direction.subVectors(this.target, this.a);
    let reach = this.direction.length();
    const low = Math.abs(upper - lower) + 1e-5,
      high = upper + lower - 1e-5;
    if (high <= low) return;
    reach = THREE.MathUtils.clamp(reach, low, high);
    this.direction.normalize();
    this.pole
      .subVectors(this.b, this.a)
      .addScaledVector(this.direction, -this.pole.dot(this.direction));
    if (this.pole.lengthSq() < 1e-8) {
      this.pole.set(0, 0, 1).addScaledVector(this.direction, -this.direction.z);
      if (this.pole.lengthSq() < 1e-8)
        this.pole.set(1, 0, 0).addScaledVector(this.direction, -this.direction.x);
    }
    this.pole.normalize();
    const along = (upper * upper + reach * reach - lower * lower) / (2 * reach),
      bend = Math.sqrt(Math.max(0, upper * upper - along * along));
    this.desiredKnee
      .copy(this.a)
      .addScaledVector(this.direction, along)
      .addScaledVector(this.pole, bend);
    this.remember(thigh);
    this.c.subVectors(this.b, this.a).normalize();
    this.pole.subVectors(this.desiredKnee, this.a).normalize();
    this.rotateWorldVector(thigh, this.c, this.pole);
    thigh.updateWorldMatrix(true, true);
    calf.getWorldPosition(this.b);
    ankle.getWorldPosition(this.c);
    this.remember(calf);
    this.a.subVectors(this.c, this.b).normalize();
    this.direction.subVectors(this.target, this.b).normalize();
    this.rotateWorldVector(calf, this.a, this.direction);
    calf.updateWorldMatrix(true, true);
    // The ankle inherits both IK rotations. Restore its authored world pose,
    // then optionally tilt that pose from world-up toward the ground normal.
    // glTF ankle local Y usually points toward the toe, so it is not a sole-up
    // vector and cannot be used to derive ground alignment.
    this.remember(ankle);
    this.q1.identity();
    if (sample.normal) {
      this.a.set(0, 1, 0);
      this.b.set(sample.normal.x, sample.normal.y, sample.normal.z).normalize();
      this.q1.setFromUnitVectors(this.a, this.b);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(this.q1.w, -1, 1));
      if (angle > MAX_ANKLE_TILT) this.q1.slerp(this.identity, 1 - MAX_ANKLE_TILT / angle);
    }
    this.desiredAnkleWorld.copy(this.animatedAnkleWorld).premultiply(this.q1);
    this.setWorldQuaternion(ankle, this.desiredAnkleWorld);
  }
  private remember(bone: THREE.Object3D): void {
    const entry = this.saved.find((candidate) => candidate.bone === bone);
    if (entry && !entry.active) {
      entry.quaternion.copy(bone.quaternion);
      entry.active = true;
    }
  }
  private rotateWorldVector(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
    this.q1.setFromUnitVectors(from, to);
    this.applyWorldDelta(bone, this.q1);
  }
  private applyWorldDelta(bone: THREE.Object3D, delta: THREE.Quaternion): void {
    bone.getWorldQuaternion(this.q0);
    this.q0.premultiply(delta);
    if (bone.parent) {
      bone.parent.getWorldQuaternion(this.q1).invert();
      bone.quaternion.copy(this.q1.multiply(this.q0));
    } else bone.quaternion.copy(this.q0);
  }
  private setWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
    if (bone.parent) {
      bone.parent.getWorldQuaternion(this.q0).invert();
      bone.quaternion.copy(this.q0.multiply(world));
    } else bone.quaternion.copy(world);
  }
}
