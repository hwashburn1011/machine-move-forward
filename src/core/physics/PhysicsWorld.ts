import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  AUTOSTEP_HEIGHT,
  FIXED_DT,
  GRAVITY,
  CHARACTER_SKIN,
  MAX_SLOPE_CLIMB_ANGLE,
} from '@/game/constants';

let rapierReady = false;

/**
 * Load the Rapier wasm. Must be awaited before constructing anything physics
 * related. The compat build inlines its wasm as base64, so this resolves
 * without a network request.
 */
export async function initRapier(): Promise<void> {
  if (rapierReady) return;
  await RAPIER.init();
  rapierReady = true;
}

export interface RaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  userData: unknown;
}
export interface SweepHit {
  distance: number;
  collider: RAPIER.Collider;
}

export interface CharacterHandle {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
}

/**
 * Wrapper around the Rapier world (handoff section 9).
 *
 * Everything belonging to the machine is a FIXED collider, never dynamic. The
 * handoff is explicit that simulating base pieces as independent rigid bodies
 * is a trap, and the machine is pinned to the origin anyway.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  /** Rapier colliders cannot carry JS payloads, so identity lives here. */
  private readonly userData = new Map<number, unknown>();
  /** Bodies created by the single-box helpers are owned by their colliders. */
  private readonly boxBodies = new Set<number>();
  private readonly scratchRay: RAPIER.Ray;
  private readonly cameraBall: RAPIER.Ball;
  private readonly queryRotation = { x: 0, y: 0, z: 0, w: 1 };

  constructor() {
    if (!rapierReady) {
      throw new Error('PhysicsWorld constructed before initRapier() resolved');
    }

    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    // Lockstep with the simulation. Letting Rapier pick its own step would
    // decouple physics from the fixed timestep and reintroduce jitter.
    this.world.timestep = FIXED_DT;

    this.scratchRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    this.cameraBall = new RAPIER.Ball(0.15);
  }

  step(): void {
    this.world.step();
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  get colliderCount(): number {
    return this.world.colliders.len();
  }

  /** A static box. Used for the deck, tread housings, prow, and equipment. */
  /**
   * A kinematic body to hang the machine's collider shapes off.
   *
   * One body with many colliders, not many bodies: posing the machine is then
   * a single write per step instead of one per shape, and the shapes cannot
   * drift out of register with each other.
   */
  /**
   * A body that behaves like a fixed one but is DYNAMIC, so Rapier still
   * generates contacts against the kinematic player capsule.
   *
   * Rapier skips collision between two non-dynamic bodies, which is why a
   * kinematic machine left the character controller with nothing to resolve
   * against. Locked translations and rotations plus zero gravity make this
   * immovable by the solver; it is repositioned explicitly instead.
   */
  createDrivenBody(position?: THREE.Vector3, rotation?: THREE.Quaternion): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .lockTranslations()
      .lockRotations()
      .setGravityScale(0);
    if (position) desc.setTranslation(position.x, position.y, position.z);
    if (rotation) {
      desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    }
    return this.world.createRigidBody(desc);
  }

  createKinematicBody(position?: THREE.Vector3, rotation?: THREE.Quaternion): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    if (position) desc.setTranslation(position.x, position.y, position.z);
    if (rotation) {
      desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    }
    return this.world.createRigidBody(desc);
  }

  /** Attach a box to a body, positioned in that body's local space. */
  addBoxTo(
    body: RAPIER.RigidBody,
    halfExtents: THREE.Vector3,
    localPosition: THREE.Vector3,
    localRotation?: THREE.Quaternion,
    userData?: unknown,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    ).setTranslation(localPosition.x, localPosition.y, localPosition.z);
    if (localRotation) {
      desc.setRotation({
        x: localRotation.x,
        y: localRotation.y,
        z: localRotation.z,
        w: localRotation.w,
      });
    }
    const collider = this.world.createCollider(desc, body);
    if (userData !== undefined) this.setUserData(collider, userData);
    return collider;
  }

  /** Attach evaluated static surfaces to the driven hull body. */
  addTrimeshTo(
    body: RAPIER.RigidBody,
    vertices: Float32Array,
    indices: Uint32Array,
    userData?: unknown,
  ): RAPIER.Collider {
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(vertices, indices),
      body,
    );
    if (userData !== undefined) this.setUserData(collider, userData);
    return collider;
  }

  /** Move a kinematic body. Rapier interpolates over the next step. */
  setKinematicPose(
    body: RAPIER.RigidBody,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
  ): void {
    body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
    body.setNextKinematicRotation({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    });
  }

  addFixedBox(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotationY = 0,
    userData?: unknown,
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    if (rotationY !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      bodyDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    const body = this.world.createRigidBody(bodyDesc);
    this.boxBodies.add(body.handle);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      body,
    );
    if (userData !== undefined) this.userData.set(collider.handle, userData);
    return collider;
  }

  /**
   * A static box at an arbitrary orientation. Needed for the stair ramp, which
   * is the only build collider that is not axis-aligned.
   */
  addFixedBoxRotated(
    halfExtents: THREE.Vector3,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    userData?: unknown,
  ): RAPIER.Collider {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
    );
    this.boxBodies.add(body.handle);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      body,
    );
    if (userData !== undefined) this.userData.set(collider.handle, userData);
    return collider;
  }

  /**
   * A kinematic capsule with a character controller, used by both the player
   * and enemies so they behave identically against machine geometry.
   */
  addCharacter(radius: number, halfHeight: number, position: THREE.Vector3): CharacterHandle {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius),
      body,
    );

    // Small offset keeps the capsule from resting exactly on surfaces, which
    // makes grounded detection flicker.
    const controller = this.world.createCharacterController(CHARACTER_SKIN);
    controller.setUp({ x: 0, y: 1, z: 0 });
    // Deck plates, stair treads, and equipment lips are all short steps; without
    // autostep the player catches on every one of them.
    controller.enableAutostep(AUTOSTEP_HEIGHT, 0.2, true);
    controller.enableSnapToGround(0.4);
    controller.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_ANGLE);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);

    return { body, collider, controller };
  }

  /** Release both the Rapier controller allocation and its kinematic body. */
  removeCharacter(handle: CharacterHandle): void {
    handle.controller.free();
    this.removeBody(handle.body);
  }

  /**
   * Move a character by its own movement, then carry it with its platform.
   *
   * `own` is what the character is trying to do — input, gravity, a jump — and
   * is resolved against the world by the controller, which is what stops it
   * walking through walls. `carry` is how far the ground under it moved this
   * step, and is applied AFTERWARDS, untouched.
   *
   * The two must not be added together and handed to the controller as one
   * vector, which is what this used to do. A character standing still is
   * pushed gently downward every step so the controller keeps finding the
   * ground (`Player.fixedUpdate`), and that push is an order of magnitude
   * larger than a step of platform rise. Summed, the rise vanishes into it,
   * the controller resolves the whole thing as "down", and a deck moving up
   * climbs straight through the character instead of lifting them. They track
   * a falling deck, because gravity does that work, and not a rising one:
   * measured at 0.24m of sink on a deck heaving 0.11m.
   *
   * Applying it separately is also what makes carrying exact. The machine
   * moves rigidly, so a point on it cannot be carried into another part of it,
   * and a displacement that never passes through the solver cannot be
   * partially absorbed, projected along a slope, or otherwise ratcheted.
   *
   * Returns whether the character is on the ground.
   */
  moveCharacter(
    handle: CharacterHandle,
    position: THREE.Vector3,
    own: THREE.Vector3,
    carry: { x: number; y: number; z: number },
  ): boolean {
    handle.controller.computeColliderMovement(handle.collider, {
      x: own.x,
      y: own.y,
      z: own.z,
    });
    let moved = handle.controller.computedMovement();
    let grounded = handle.controller.computedGrounded();
    // Rapier can stop a grounded capsule at the foot of a climbable ramp when
    // gravity is included in the same downward movement vector. Give it one
    // bounded uphill retry only when the first solve is substantially blocked;
    // flat walls still win because the retry cannot improve their horizontal
    // movement. This keeps normal gravity and movement speeds unchanged while
    // making smooth ramps traversable from a grounded approach.
    const wantedHorizontal = Math.hypot(own.x, own.z);
    const firstHorizontal = Math.hypot(moved.x, moved.z);
    const retryCandidate =
      own.y < 0 && wantedHorizontal > 1e-5 && firstHorizontal < wantedHorizontal * 0.5 && grounded;
    let climbableUphillContact = false;
    const minimumClimbNormalY = Math.cos(handle.controller.maxSlopeClimbAngle());
    for (
      let index = 0;
      retryCandidate && index < handle.controller.numComputedCollisions();
      index++
    ) {
      const collision = handle.controller.computedCollision(index);
      if (!collision) continue;
      const normal = collision.normal1;
      // The retry exists only for a ramp that the controller already classifies
      // as climbable and that faces against this movement. A wall, the flat
      // floor, a ceiling, or a slope above the configured limit cannot opt in.
      if (normal.y >= minimumClimbNormalY - 1e-6 && normal.x * own.x + normal.z * own.z < -1e-6) {
        climbableUphillContact = true;
        break;
      }
    }
    if (retryCandidate && climbableUphillContact) {
      handle.controller.computeColliderMovement(handle.collider, {
        x: own.x,
        y: Math.max(0.03, Math.min(0.12, -own.y)),
        z: own.z,
      });
      const retry = handle.controller.computedMovement();
      if (Math.hypot(retry.x, retry.z) > firstHorizontal + 1e-5) {
        moved = retry;
        grounded = handle.controller.computedGrounded();
      } else {
        // Restore the original solve if the speculative uphill pass did not
        // improve horizontal travel, including its grounded result.
        handle.controller.computeColliderMovement(handle.collider, {
          x: own.x,
          y: own.y,
          z: own.z,
        });
        moved = handle.controller.computedMovement();
        grounded = handle.controller.computedGrounded();
      }
    }

    position.set(
      position.x + moved.x + carry.x,
      position.y + moved.y + carry.y,
      position.z + moved.z + carry.z,
    );
    handle.body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
    return grounded;
  }

  setUserData(collider: RAPIER.Collider, data: unknown): void {
    this.userData.set(collider.handle, data);
  }

  getUserData(collider: RAPIER.Collider): unknown {
    return this.userData.get(collider.handle);
  }

  /** Hitscan. Returns the closest hit, or null. */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    exclude?: RAPIER.Collider,
    predicate?: (collider: RAPIER.Collider) => boolean,
  ): RaycastHit | null {
    this.scratchRay.origin.x = origin.x;
    this.scratchRay.origin.y = origin.y;
    this.scratchRay.origin.z = origin.z;
    this.scratchRay.dir.x = direction.x;
    this.scratchRay.dir.y = direction.y;
    this.scratchRay.dir.z = direction.z;

    const hit = this.world.castRayAndGetNormal(
      this.scratchRay,
      maxDistance,
      true,
      undefined,
      undefined,
      exclude,
      undefined,
      predicate,
    );
    if (!hit) return null;

    const distance = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
        origin.z + direction.z * distance,
      ),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance,
      collider: hit.collider,
      userData: this.userData.get(hit.collider.handle),
    };
  }

  /** Camera-only volume query; never changes world colliders or their masks. */
  sweepSphere(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    radius: number,
    exclude?: RAPIER.Collider,
  ): SweepHit | null {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(distance) || distance <= 0)
      return null;
    this.cameraBall.radius = radius;
    const hit = this.world.castShape(
      origin,
      this.queryRotation,
      direction,
      this.cameraBall,
      0.005,
      distance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      exclude,
    );
    if (!hit || hit.collider === exclude) return null;
    return { distance: Math.max(0, hit.time_of_impact), collider: hit.collider };
  }

  overlapsSphere(
    position: THREE.Vector3,
    radius: number,
    exclude?: RAPIER.Collider,
    excludeKinematic = false,
  ): boolean {
    this.cameraBall.radius = radius;
    return (
      this.world.intersectionWithShape(
        position,
        this.queryRotation,
        this.cameraBall,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS |
          (excludeKinematic ? RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC : 0),
        undefined,
        exclude,
      ) !== null
    );
  }

  /**
   * Return whether a character capsule can occupy a pose right now.
   *
   * This is an immediate query against Rapier's current collider set; callers
   * may use it directly after adding or posing colliders without waiting for a
   * simulation step. Sensors are ignored and the supplied player collider is
   * excluded, so the query cannot report the capsule against itself.
   * A tiny upward query epsilon treats a capsule resting on a floor as fitting
   * while still detecting ceilings and embedded side geometry.
   */
  capsuleFits(
    position: THREE.Vector3,
    radius: number,
    halfHeight: number,
    exclude?: RAPIER.Collider,
  ): boolean {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      !Number.isFinite(radius) ||
      !Number.isFinite(halfHeight) ||
      radius <= 0 ||
      halfHeight < 0
    )
      return false;
    const capsule = new RAPIER.Capsule(halfHeight, radius);
    this.world.propagateModifiedBodyPositionsToColliders();
    let blocked = false;
    this.world.forEachCollider((collider) => {
      if (blocked || collider === exclude || !collider.isEnabled() || collider.isSensor()) return;
      blocked = collider.intersectsShape(
        capsule,
        { x: position.x, y: position.y + 1e-4, z: position.z },
        this.queryRotation,
      );
    });
    return !blocked;
  }

  /** Find immediate walkable support below a capsule; the nearest hit wins. */
  hasCapsuleSupport(
    position: THREE.Vector3,
    radius: number,
    halfHeight: number,
    exclude?: RAPIER.Collider,
  ): boolean {
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      !Number.isFinite(radius) ||
      !Number.isFinite(halfHeight) ||
      radius <= 0 ||
      halfHeight < 0
    )
      return false;
    // The world's broadphase may still describe the previous save. Per-shape
    // casts see newly rebuilt floors without stepping any actor or simulation.
    this.world.propagateModifiedBodyPositionsToColliders();
    const ray = new RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
    let nearest = halfHeight + radius + 0.12;
    let supported = false;
    this.world.forEachCollider((collider) => {
      if (
        collider === exclude ||
        !collider.isEnabled() ||
        collider.isSensor() ||
        collider.parent()?.isKinematic()
      )
        return;
      const hit = collider.castRayAndGetNormal(ray, nearest, true);
      if (!hit) return;
      nearest = hit.timeOfImpact;
      supported = hit.normal.y >= 0.65;
    });
    return supported;
  }

  removeCollider(collider: RAPIER.Collider): void {
    const body = collider.parent();
    this.userData.delete(collider.handle);
    this.world.removeCollider(collider, true);
    // Building replacement/removal owns only the returned collider. Reclaim
    // its helper body too, while retaining explicitly owned shared bodies.
    if (body && this.boxBodies.has(body.handle) && body.numColliders() === 0) {
      this.boxBodies.delete(body.handle);
      this.world.removeRigidBody(body);
    }
  }

  removeBody(body: RAPIER.RigidBody): void {
    for (let i = 0; i < body.numColliders(); i++) this.userData.delete(body.collider(i).handle);
    this.boxBodies.delete(body.handle);
    this.world.removeRigidBody(body);
  }

  dispose(): void {
    this.userData.clear();
    this.boxBodies.clear();
    this.world.free();
  }
}
