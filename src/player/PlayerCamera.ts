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
const AIM_OFFSET = new THREE.Vector3(0.48, 0.3, 2.0);

const PITCH_MIN = THREE.MathUtils.degToRad(-70);
const PITCH_MAX = THREE.MathUtils.degToRad(75);
const LOOK_SENSITIVITY = 0.0022;

/** Enclose the near-plane corners, including wide aspect ratios and FOV settings. */
export function cameraCollisionRadius(near: number, fov: number, aspect: number): number {
  const halfHeight = near * Math.tan(THREE.MathUtils.degToRad(fov / 2));
  return Math.max(0.12, Math.min(0.35, Math.hypot(near, halfHeight, halfHeight * aspect) + 0.015));
}

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
  private readonly previousSmoothed = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private previousAimBlend = 0;
  private readonly anchor = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly forwardVec = new THREE.Vector3();
  private initialised = false;
  private sensitivity = 1;
  private hipFov = HIP_FOV;
  private shoulder: 'left' | 'right' = 'right';
  private physics: PhysicsWorld | null = null;
  private ignoreCollider: RAPIER.Collider | undefined;
  private readonly safeAnchor = new THREE.Vector3();
  private readonly lastRendered = new THREE.Vector3();
  private readonly motionDirection = new THREE.Vector3();
  private renderedOnce = false;

  constructor(
    aspect: number,
    options: { sensitivity?: number; hipFov?: number; shoulder?: 'left' | 'right' } = {},
  ) {
    this.camera = new THREE.PerspectiveCamera(HIP_FOV, aspect, 0.1, 2000);
    this.setOptions(options);
  }

  setOptions(options: {
    sensitivity?: number;
    hipFov?: number;
    shoulder?: 'left' | 'right';
  }): void {
    if (options.sensitivity !== undefined && Number.isFinite(options.sensitivity))
      this.sensitivity = THREE.MathUtils.clamp(options.sensitivity, 0.25, 3);
    if (options.hipFov !== undefined && Number.isFinite(options.hipFov))
      this.hipFov = THREE.MathUtils.clamp(options.hipFov, 50, 80);
    if (options.shoulder !== undefined) this.shoulder = options.shoulder;
  }
  get shoulderSide(): 'left' | 'right' {
    return this.shoulder;
  }
  swapShoulder(): void {
    this.shoulder = this.shoulder === 'right' ? 'left' : 'right';
  }
  resetHistory(): void {
    this.initialised = false;
    this.renderedOnce = false;
    this.previousSmoothed.copy(this.smoothed);
  }

  get pitchAngle(): number {
    return this.pitch;
  }

  get yawAngle(): number {
    return this.yaw;
  }

  /**
   * Point the view somewhere, without a mouse.
   *
   * For the browser harnesses. The player moves in the CAMERA's yaw frame, so
   * a harness that walks someone in a particular direction has to agree with
   * the camera about which direction that is — and one that nudges the mouse
   * until it looks about right is measuring its own nudging.
   */
  setYaw(radians: number): void {
    this.yaw = radians;
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
    this.physics = physics;
    this.ignoreCollider = ignore;
    this.applyLook(input);
    this.previousSmoothed.copy(this.smoothed);
    this.previousAimBlend = this.aimBlend;

    // Recoil recovers over roughly a quarter second.
    const recover = 1 - Math.exp(-dt * 9);
    this.recoilPitch -= this.recoilPitch * recover;
    this.recoilYaw -= this.recoilYaw * recover;

    this.aimed = input.isDown('aim');
    const aimTarget = this.aimed ? 1 : 0;
    // ~120ms blend between hip and aim.
    this.aimBlend += (aimTarget - this.aimBlend) * (1 - Math.exp(-dt * 18));

    this.setFov(this.aimBlend);
    this.offset.lerpVectors(HIP_OFFSET, AIM_OFFSET, this.aimBlend);
    if (this.shoulder === 'left') this.offset.x *= -1;

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

    this.recoverAnchor();
    const obstructed = this.restrictToVisibleSegment(this.goal, this.safeAnchor);

    if (!this.initialised) {
      this.smoothed.copy(this.goal);
      this.previousSmoothed.copy(this.goal);
      this.initialised = true;
    } else if (
      obstructed &&
      this.goal.distanceToSquared(this.safeAnchor) <
        this.smoothed.distanceToSquared(this.safeAnchor)
    ) {
      // Inward motion is immediate. Only easing outward is safe near a wall.
      this.smoothed.copy(this.goal);
      this.previousSmoothed.copy(this.goal);
    } else {
      this.smoothed.lerp(this.goal, 1 - Math.pow(0.0008, dt));
    }

    this.camera.position.copy(this.smoothed);
    this.restrictToVisibleSegment(this.camera.position, this.safeAnchor);
    this.applyRotation();
  }

  /** Interpolate the camera alongside the character; mouse aim remains immediate. */
  update(alpha: number, input: InputManager): void {
    this.applyLook(input);
    if (this.initialised)
      this.camera.position.lerpVectors(this.previousSmoothed, this.smoothed, alpha);
    this.setFov(THREE.MathUtils.lerp(this.previousAimBlend, this.aimBlend, alpha));
    if (this.initialised) {
      this.recoverAnchor();
      // Validate AFTER interpolation; a fixed-step-only check is overwritten above.
      if (this.renderedOnce && !this.overlaps(this.lastRendered)) {
        this.restrictToVisibleSegment(
          this.camera.position,
          this.lastRendered,
          this.motionDirection,
        );
      }
      this.restrictToVisibleSegment(this.camera.position, this.safeAnchor);
      this.lastRendered.copy(this.camera.position);
      this.renderedOnce = true;
    }
    this.applyRotation();
  }

  private get radius(): number {
    return cameraCollisionRadius(this.camera.near, this.camera.fov, this.camera.aspect);
  }

  private overlaps(at: THREE.Vector3): boolean {
    return this.physics?.overlapsSphere?.(at, this.radius, this.ignoreCollider) ?? false;
  }

  private recoverAnchor(): void {
    this.safeAnchor.copy(this.anchor);
    // A low ceiling can touch the shoulder anchor even though the capsule is
    // valid. Retreat toward its centre, never push the camera through the ceiling.
    for (let i = 0; i < 6 && this.overlaps(this.safeAnchor); i++) this.safeAnchor.y -= 0.08;
  }

  private restrictToVisibleSegment(
    at: THREE.Vector3,
    from: THREE.Vector3,
    direction = this.toCamera,
  ): boolean {
    if (!this.physics) return false;
    direction.subVectors(at, from);
    const distance = direction.length();
    if (distance <= 0.0001) return false;
    direction.divideScalar(distance);
    const hit = this.physics.sweepSphere
      ? this.physics.sweepSphere(from, direction, distance, this.radius, this.ignoreCollider)
      : this.physics.raycast(from, direction, distance, this.ignoreCollider);
    if (!hit) return false;
    // No arbitrary minimum pull-in: that would place the near plane through
    // obstacles closer than the old 0.4m clamp. Player fading handles close views.
    at.copy(from).addScaledVector(direction, Math.max(0, hit.distance - 0.01));
    return true;
  }

  private applyLook(input: InputManager): void {
    const look = input.consumeLook();
    this.yaw -= look.x * LOOK_SENSITIVITY * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - look.y * LOOK_SENSITIVITY * this.sensitivity,
      PITCH_MIN,
      PITCH_MAX,
    );
  }

  private setFov(blend: number): void {
    const ratio =
      Math.tan(THREE.MathUtils.degToRad(AIM_FOV / 2)) /
      Math.tan(THREE.MathUtils.degToRad(HIP_FOV / 2));
    const aimFov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.hipFov / 2)) * ratio),
    );
    const fov = THREE.MathUtils.lerp(this.hipFov, aimFov, blend);
    if (Math.abs(this.camera.fov - fov) < 0.00001) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private applyRotation(): void {
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
