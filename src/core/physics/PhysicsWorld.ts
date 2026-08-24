import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { AUTOSTEP_HEIGHT, FIXED_DT, GRAVITY, CHARACTER_SKIN } from '@/game/constants';

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
  private readonly scratchRay: RAPIER.Ray;

  constructor() {
    if (!rapierReady) {
      throw new Error('PhysicsWorld constructed before initRapier() resolved');
    }

    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    // Lockstep with the simulation. Letting Rapier pick its own step would
    // decouple physics from the fixed timestep and reintroduce jitter.
    this.world.timestep = FIXED_DT;

    this.scratchRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
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

  createKinematicBody(
    position?: THREE.Vector3,
    rotation?: THREE.Quaternion,
  ): RAPIER.RigidBody {
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

  /** Move a kinematic body. Rapier interpolates to this over the next step. */
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
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);

    return { body, collider, controller };
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

  removeCollider(collider: RAPIER.Collider): void {
    this.userData.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  dispose(): void {
    this.userData.clear();
    this.world.free();
  }
}
