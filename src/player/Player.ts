import * as THREE from 'three';
import type { PhysicsWorld, CharacterHandle } from '@/core/physics/PhysicsWorld';
import type { InputManager } from '@/core/input/InputManager';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import {
  GRAVITY,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_CROUCH_SPEED,
  PLAYER_JUMP_HEIGHT,
  PLAYER_SPRINT_SPEED,
  PLAYER_WALK_SPEED,
  RESPAWN_DELAY_S,
  RESPAWN_GRACE_S,
  RESPAWN_Y_THRESHOLD,
} from '@/game/constants';
import { PlayerStats } from './PlayerStats';
import { bevelledBox } from '@/machine/MachineGeometry';

/**
 * The player character.
 *
 * Movement is camera-relative and runs on Rapier's kinematic character
 * controller, so it inherits autostep and ground snapping and behaves
 * identically to enemies against machine geometry.
 */
export class Player {
  readonly object3D: THREE.Group;
  readonly stats: PlayerStats;

  private readonly handle: CharacterHandle;
  private readonly position = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly renderPosition = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private verticalVelocity = 0;
  private grounded = false;
  private facing = 0;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    materials: Materials,
    private readonly spawn: THREE.Vector3,
  ) {
    this.stats = new PlayerStats(bus);
    this.position.copy(spawn);
    this.previousPosition.copy(spawn);

    this.handle = physics.addCharacter(
      PLAYER_CAPSULE_RADIUS,
      PLAYER_CAPSULE_HALF_HEIGHT,
      spawn,
    );
    physics.setUserData(this.handle.collider, { kind: 'player' });

    this.object3D = buildPlayerMesh(materials);
    scene.add(this.object3D);
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  /** Exposed so the camera can exclude it from its collision ray. */
  get collider() {
    return this.handle.collider;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get speed(): number {
    return this.desired.length();
  }

  /** Diagnostics for the movement harness. */
  get debug(): { vy: number; grounded: boolean } {
    return { vy: this.verticalVelocity, grounded: this.grounded };
  }

  fixedUpdate(dt: number, input: InputManager, cameraYaw: number): void {
    this.stats.tick(dt);

    // --- Death ------------------------------------------------------------
    // Lie where you fell, then get put back on the deck. Returning early is
    // what makes death a state rather than a costume: without it a corpse
    // walks and shoots, because `damage` already refuses to hurt the dead.
    if (!this.stats.alive) {
      this.deathTimer += dt;
      if (this.deathTimer >= RESPAWN_DELAY_S) this.respawn();
      return;
    }

    // --- Horizontal intent, in the camera's yaw frame ----------------------
    let ix = 0;
    let iz = 0;
    if (input.isDown('forward')) iz -= 1;
    if (input.isDown('back')) iz += 1;
    if (input.isDown('left')) ix -= 1;
    if (input.isDown('right')) ix += 1;

    const crouching = input.isDown('crouch');
    const sprinting = input.isDown('sprint') && !crouching && iz < 0;
    const speed = crouching
      ? PLAYER_CROUCH_SPEED
      : sprinting
        ? PLAYER_SPRINT_SPEED
        : PLAYER_WALK_SPEED;

    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      this.desired.set((ix * cos + iz * sin) * speed, 0, (-ix * sin + iz * cos) * speed);
      this.facing = Math.atan2(this.desired.x, this.desired.z);
    } else {
      this.desired.set(0, 0, 0);
    }

    // --- Vertical ----------------------------------------------------------
    if (this.grounded && this.verticalVelocity <= 0) {
      // Rest slightly negative so the controller keeps finding the ground.
      this.verticalVelocity = -2;
      if (input.consumePressed('jump')) {
        this.verticalVelocity = Math.sqrt(2 * -GRAVITY * PLAYER_JUMP_HEIGHT);
      }
    } else {
      this.verticalVelocity += GRAVITY * dt;
    }

    // --- Resolve against the world ----------------------------------------
    const { controller, collider, body } = this.handle;
    controller.computeColliderMovement(collider, {
      x: this.desired.x * dt,
      y: this.verticalVelocity * dt,
      z: this.desired.z * dt,
    });
    const moved = controller.computedMovement();
    this.grounded = controller.computedGrounded();

    // Cancel accumulated fall speed on landing, or it makes the next jump feel
    // sticky and can punch the capsule through thin geometry.
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;

    this.previousPosition.copy(this.position);
    this.position.set(
      this.position.x + moved.x,
      this.position.y + moved.y,
      this.position.z + moved.z,
    );
    body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    });

    if (this.position.y < RESPAWN_Y_THRESHOLD) this.respawn();
  }

  /**
   * Interpolate the visual between the last two simulation states. Without
   * this the player visibly stutters whenever frame rate and tick rate
   * disagree, which is most of the time.
   */
  update(alpha: number): void {
    this.renderPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.object3D.position.copy(this.renderPosition);
    this.object3D.position.y -= PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS;

    // Turn toward travel direction rather than snapping.
    const current = this.object3D.rotation.y;
    let delta = this.facing - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.object3D.rotation.y = current + delta * 0.25;
  }

  /** Seconds since the player was killed. Only meaningful while dead. */
  private deathTimer = 0;

  respawn(): void {
    this.position.copy(this.spawn);
    this.previousPosition.copy(this.spawn);
    this.verticalVelocity = 0;
    this.handle.body.setTranslation(
      { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      true,
    );
    this.stats.reset();
    this.stats.grantGrace(RESPAWN_GRACE_S);
    this.deathTimer = 0;
    this.bus.emit('player:respawned', {
      position: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
    });
  }

  teleport(to: THREE.Vector3): void {
    this.position.copy(to);
    this.previousPosition.copy(to);
    this.verticalVelocity = 0;
    this.handle.body.setTranslation({ x: to.x, y: to.y, z: to.z }, true);
  }

  dispose(): void {
    this.physics.removeCollider(this.handle.collider);
    this.physics.removeBody(this.handle.body);
  }
}

/**
 * A blocky scavenger figure. Deliberately simple, but with a distinct
 * silhouette — the player sees this from behind for the entire game, so its
 * shape matters more than its detail.
 */
function buildPlayerMesh(materials: Materials): THREE.Group {
  const g = new THREE.Group();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  add(bevelledBox(0.52, 0.62, 0.34, 0.06), materials.hull, 1.18); // torso
  add(bevelledBox(0.62, 0.22, 0.4, 0.05), materials.hullDark, 1.44); // shoulders/pack
  add(bevelledBox(0.26, 0.26, 0.26, 0.05), materials.deckPlate, 1.68); // head
  add(bevelledBox(0.18, 0.5, 0.18, 0.04), materials.hullDark, 1.12, -0.34); // arms
  add(bevelledBox(0.18, 0.5, 0.18, 0.04), materials.hullDark, 1.12, 0.34);
  add(bevelledBox(0.2, 0.62, 0.2, 0.04), materials.hullDark, 0.56, -0.14); // legs
  add(bevelledBox(0.2, 0.62, 0.2, 0.04), materials.hullDark, 0.56, 0.14);
  // A single accent so the player reads instantly against the deck.
  add(bevelledBox(0.3, 0.1, 0.36, 0.03), materials.accent, 1.35);

  return g;
}
