import * as THREE from 'three';
import type { PhysicsWorld, CharacterHandle } from '@/core/physics/PhysicsWorld';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { EnemyDefinition } from '@/data/enemies';
import type { Damageable } from '@/player/PlayerCombat';
import type { PlayerStats } from '@/player/PlayerStats';
import { GRAVITY } from '@/game/constants';
import { stepEnemyAI, type EnemyAIState } from './EnemyAI';
import { bevelledBox } from '@/machine/MachineGeometry';

const CAPSULE_RADIUS = 0.36;
const CAPSULE_HALF_HEIGHT = 0.6;

/**
 * A hostile scavenger.
 *
 * Uses the same kinematic character controller as the player, so it handles
 * deck plates, steps, and equipment identically — no separate movement code to
 * keep in sync.
 */
export class Enemy {
  readonly object3D: THREE.Group;

  private handle: CharacterHandle | null = null;
  private readonly position = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly renderPosition = new THREE.Vector3();
  private readonly toPlayer = new THREE.Vector3();

  private state: EnemyAIState = 'idle';
  private health: number;
  private verticalVelocity = 0;
  private timeSinceLastAttack = 999;
  private deathTimer = 0;
  private facing = 0;
  private active = false;

  constructor(
    readonly id: string,
    readonly def: EnemyDefinition,
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly bus: EventBus,
    materials: Materials,
  ) {
    this.health = def.maxHealth;
    this.object3D = buildEnemyMesh(materials);
    this.object3D.visible = false;
    scene.add(this.object3D);
  }

  get isActive(): boolean {
    return this.active;
  }

  get aiState(): EnemyAIState {
    return this.state;
  }

  get currentHealth(): number {
    return this.health;
  }

  get worldPosition(): THREE.Vector3 {
    return this.position;
  }

  spawn(at: THREE.Vector3): void {
    this.health = this.def.maxHealth;
    this.state = 'idle';
    this.verticalVelocity = 0;
    this.timeSinceLastAttack = 999;
    this.deathTimer = 0;
    this.position.copy(at);
    this.previousPosition.copy(at);

    this.handle = this.physics.addCharacter(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT, at);

    const damageable: Damageable = {
      kind: 'enemy',
      id: this.id,
      armor: this.def.armor,
      takeDamage: (amount) => this.takeDamage(amount),
    };
    this.physics.setUserData(this.handle.collider, damageable);

    this.object3D.visible = true;
    this.object3D.rotation.z = 0;
    this.active = true;
    this.bus.emit('enemy:spawned', { enemyId: this.id, position: { ...at } });
  }

  takeDamage(amount: number): void {
    if (!this.active || this.state === 'dead') return;

    this.health = Math.max(0, this.health - amount);
    this.bus.emit('enemy:damaged', {
      enemyId: this.id,
      amount,
      remaining: this.health,
    });

    if (this.health === 0) this.die();
  }

  private die(): void {
    this.state = 'dead';
    this.deathTimer = 0;
    // Drop the collider immediately so corpses do not block shots or bodies.
    if (this.handle) {
      this.physics.removeCollider(this.handle.collider);
      this.physics.removeBody(this.handle.body);
      this.handle = null;
    }
    this.bus.emit('enemy:killed', {
      enemyId: this.id,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
    });
  }

  fixedUpdate(dt: number, playerPos: THREE.Vector3, playerStats: PlayerStats): void {
    if (!this.active) return;

    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 2.5) this.despawn();
      return;
    }
    if (!this.handle) return;

    this.timeSinceLastAttack += dt;

    this.toPlayer.subVectors(playerPos, this.position);
    const distance = this.toPlayer.length();

    const decision = stepEnemyAI(this.state, this.def, {
      distanceToPlayer: distance,
      health: this.health,
      timeSinceLastAttack: this.timeSinceLastAttack,
    });
    this.state = decision.state;

    if (decision.shouldAttack) {
      this.timeSinceLastAttack = 0;
      playerStats.damage(this.def.damage, this.def.name, {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      });
    }

    // Steer straight at the player. No navmesh: on a flat deck with one
    // hostile, direct steering plus capsule collision is the right amount of
    // machinery (handoff section 32).
    let vx = 0;
    let vz = 0;
    if (this.state === 'navigate' || this.state === 'pursue') {
      const flat = Math.hypot(this.toPlayer.x, this.toPlayer.z);
      if (flat > 1e-4) {
        vx = (this.toPlayer.x / flat) * this.def.moveSpeed;
        vz = (this.toPlayer.z / flat) * this.def.moveSpeed;
        this.facing = Math.atan2(vx, vz);
      }
    }

    const { controller, collider, body } = this.handle;
    const grounded = controller.computedGrounded();
    this.verticalVelocity = grounded && this.verticalVelocity <= 0 ? -2 : this.verticalVelocity + GRAVITY * dt;

    controller.computeColliderMovement(collider, {
      x: vx * dt,
      y: this.verticalVelocity * dt,
      z: vz * dt,
    });
    const moved = controller.computedMovement();

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

    // Fell off the machine — no point simulating it any further.
    if (this.position.y < -25) this.despawn();
  }

  update(alpha: number): void {
    if (!this.active) return;

    this.renderPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.object3D.position.copy(this.renderPosition);
    this.object3D.position.y -= CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

    if (this.state === 'dead') {
      // Topple over rather than vanishing.
      this.object3D.rotation.z = Math.min(this.deathTimer * 2.6, Math.PI / 2);
    } else {
      this.object3D.rotation.y = this.facing;
    }
  }

  despawn(): void {
    if (this.handle) {
      this.physics.removeCollider(this.handle.collider);
      this.physics.removeBody(this.handle.body);
      this.handle = null;
    }
    this.active = false;
    this.object3D.visible = false;
  }
}

/**
 * Deliberately different in proportion from the player — taller, narrower,
 * hunched — so the two are distinguishable at a glance and in silhouette.
 */
function buildEnemyMesh(materials: Materials): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  add(bevelledBox(0.44, 0.72, 0.3, 0.05), materials.rustedSteel, 1.16); // torso
  add(bevelledBox(0.56, 0.16, 0.32, 0.04), materials.hullDark, 1.5); // shoulders
  add(bevelledBox(0.22, 0.22, 0.24, 0.04), materials.hullDark, 1.66); // head
  add(bevelledBox(0.14, 0.56, 0.14, 0.03), materials.rustedSteel, 1.1, -0.3);
  add(bevelledBox(0.14, 0.56, 0.14, 0.03), materials.rustedSteel, 1.1, 0.3);
  add(bevelledBox(0.17, 0.6, 0.17, 0.03), materials.hullDark, 0.5, -0.12);
  add(bevelledBox(0.17, 0.6, 0.17, 0.03), materials.hullDark, 0.5, 0.12);
  // Hostile red eye slit — reads instantly as a threat, even at distance.
  add(bevelledBox(0.16, 0.05, 0.03, 0.01), materials.emissiveWarn, 1.68, 0, 0.13);

  return g;
}
