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
import type { LoadedModel } from '@/art/ModelLoader';
import { PlayerVisual } from './PlayerVisual';

/**
 * The player character.
 *
 * Movement is camera-relative and runs on Rapier's kinematic character
 * controller, so it inherits autostep and ground snapping and behaves
 * identically to enemies against machine geometry.
 */
export class Player {
  readonly stats: PlayerStats;

  private visual: PlayerVisual;

  private readonly handle: CharacterHandle;
  private readonly position = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly renderPosition = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private verticalVelocity = 0;
  private grounded = false;
  /**
   * Heading, in the same convention as everything else: local +Z along it.
   *
   * Starts pointing the way the machine drives rather than at zero. Zero is
   * astern, which left the character standing on a moving deck facing the
   * back of it until the first time the player touched a movement key.
   */
  private facing = Math.PI;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    private readonly materials: Materials,
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

    this.visual = new PlayerVisual(null, materials);
    scene.add(this.object3D);
  }

  /** Where the player is drawn. Owned by the visual; positioned here. */
  get object3D(): THREE.Group {
    return this.visual.object3D;
  }

  /**
   * Swap in the character model once it has loaded.
   *
   * Not a constructor argument because `Player` is built inside `Game`'s
   * synchronous constructor and the model is not there yet.
   */
  setModel(model: LoadedModel | null): void {
    if (!model) return;
    const old = this.visual;
    const next = new PlayerVisual(model, this.materials);
    next.object3D.position.copy(old.object3D.position);
    next.object3D.rotation.copy(old.object3D.rotation);
    this.scene.remove(old.object3D);
    old.dispose();
    this.visual = next;
    this.scene.add(next.object3D);
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
  update(alpha: number, dt = 0): void {
    this.renderPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.object3D.position.copy(this.renderPosition);

    // Turn toward travel direction rather than snapping.
    const current = this.object3D.rotation.y;
    let delta = this.facing - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.object3D.rotation.y = current + delta * 0.25;

    this.visual.setMotion(this.speed, this.grounded);
    this.visual.update(dt);
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
