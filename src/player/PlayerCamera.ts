import * as THREE from 'three';
import type { InputManager } from '@/core/input/InputManager';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER_EYE_HEIGHT } from '@/game/constants';

const HIP_FOV = 55;
const AIM_FOV = 38;
// Offsets are relative to the anchor, which already sits at chest height —
// adding a full body-height again here puts the camera above the player's
// head and drops the character out of frame entirely.
const HIP_OFFSET = new THREE.Vector3(0.62, 0.38, 3.4);
const AIM_OFFSET = new THREE.Vector3(0.48, 0.30, 2.0);

const PITCH_MIN = THREE.MathUtils.degToRad(-70);
const PITCH_MAX = THREE.MathUtils.degToRad(75);
const LOOK_SENSITIVITY = 0.0022;

/**
 * Third-person over-the-shoulder rig (handoff section 8).
 *
 * Yaw and pitch are applied raw, with no smoothing. Position is smoothed, but
 * aim never is — a smoothed crosshair feels like input lag, and this is a
 * shooter first.
 */
export class PlayerCamera {
  readonly camera: THREE.PerspectiveCamera;

  private yaw = 0;
  private pitch = -0.08;
  private aimed = false;
  private aimBlend = 0;

  /** Recoil kick, added to pitch and decayed back out. */
  private recoilPitch = 0;
  private recoilYaw = 0;

  private readonly goal = new THREE.Vector3();
  private readonly smoothed = new THREE.Vector3();
  private readonly anchor = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly forwardVec = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(HIP_FOV, aspect, 0.1, 2000);
  }

  get yawAngle(): number {
    return this.yaw;
  }

  get isAiming(): boolean {
    return this.aimed;
  }

  /** Unit vector the camera is looking along. */
  get forward(): THREE.Vector3 {
    this.camera.getWorldDirection(this.forwardVec);
    return this.forwardVec;
  }

  /** Where hitscan shots originate — the camera itself, so aim is exact. */
  get muzzleOrigin(): THREE.Vector3 {
    return this.camera.position;
  }

  addRecoil(pitch: number, yaw: number): void {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  fixedUpdate(
    dt: number,
    input: InputManager,
    target: THREE.Vector3,
    physics: PhysicsWorld,
    ignore?: RAPIER.Collider,
  ): void {
    const look = input.lookDelta;
    this.yaw -= look.x * LOOK_SENSITIVITY;
    this.pitch -= look.y * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, PITCH_MIN, PITCH_MAX);

    // Recoil recovers over roughly a quarter second.
    const recover = 1 - Math.exp(-dt * 9);
    this.recoilPitch -= this.recoilPitch * recover;
    this.recoilYaw -= this.recoilYaw * recover;

    this.aimed = input.isDown('aim');
    const aimTarget = this.aimed ? 1 : 0;
    // ~120ms blend between hip and aim.
    this.aimBlend += (aimTarget - this.aimBlend) * (1 - Math.exp(-dt * 18));

    this.camera.fov = THREE.MathUtils.lerp(HIP_FOV, AIM_FOV, this.aimBlend);
    this.camera.updateProjectionMatrix();

    this.offset.lerpVectors(HIP_OFFSET, AIM_OFFSET, this.aimBlend);

    const pitch = this.pitch + this.recoilPitch;
    const yaw = this.yaw + this.recoilYaw;

    this.anchor.copy(target);
    // Slightly above the capsule centre: shoulder height, not eye height.
    this.anchor.y += PLAYER_EYE_HEIGHT * 0.31;

    // Build the goal in the yaw frame: right, up, then back along view.
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const back = this.offset.z * Math.cos(pitch);
    const up = this.offset.y - this.offset.z * Math.sin(pitch);

    this.goal.set(
      this.anchor.x + cosY * this.offset.x + sinY * back,
      this.anchor.y + up,
      this.anchor.z - sinY * this.offset.x + cosY * back,
    );

    // Pull in on contact so the machine's own structures never clip through.
    const toCamera = this.goal.clone().sub(this.anchor);
    const dist = toCamera.length();
    if (dist > 0.001) {
      toCamera.divideScalar(dist);
      // The anchor sits INSIDE the player's own capsule, and a solid raycast
      // starting inside a collider reports a hit at distance zero — which
      // would pin the camera to the player's head every single frame.
      const hit = physics.raycast(this.anchor, toCamera, dist + 0.3, ignore);
      if (hit) this.goal.copy(this.anchor).addScaledVector(toCamera, Math.max(hit.distance - 0.3, 0.4));
    }

    if (!this.initialised) {
      this.smoothed.copy(this.goal);
      this.initialised = true;
    } else {
      // Frame-rate independent smoothing on position only.
      this.smoothed.lerp(this.goal, 1 - Math.pow(0.0008, dt));
    }

    this.camera.position.copy(this.smoothed);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(yaw);
    this.camera.rotateX(pitch);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
