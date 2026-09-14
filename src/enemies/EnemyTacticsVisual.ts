import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { LoadedModel } from '@/art/ModelLoader';
import type { Enemy } from './Enemy';
import type { EnemyManager } from './EnemyManager';
import type { RaidMissionSystem } from './RaidMissionSystem';

interface Presentation {
  enemy: Enemy;
  root: THREE.Group;
  vent: THREE.Object3D;
  radiator: THREE.Object3D | null;
  drone: THREE.Object3D;
  warning: THREE.Mesh;
  cargo: THREE.Mesh;
  shield: THREE.Mesh;
  tether: THREE.Line;
  ventHit: RAPIER.Collider | null;
  droneHit: RAPIER.Collider | null;
}

/** Bounded, reused presentation and targetable sensors. No lights, particles or extra enemy bodies. */
export class EnemyTacticsVisual {
  readonly warmupObject = new THREE.Group();
  private readonly slots = new Map<string, Presentation>();
  private model: LoadedModel | null = null;
  private readonly glow = new THREE.MeshBasicMaterial({
    color: 0xff3920,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly amber = new THREE.MeshStandardMaterial({
    color: 0xbc8338,
    metalness: 0.65,
    roughness: 0.65,
    emissive: 0x6b3509,
    emissiveIntensity: 0.8,
  });
  private readonly shieldMat = new THREE.MeshBasicMaterial({
    color: 0xf4734a,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly lineMat = new THREE.LineBasicMaterial({
    color: 0xeb6447,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  private readonly ring = new THREE.RingGeometry(0.55, 0.61, 40);
  private readonly cargoShape = new THREE.BoxGeometry(0.27, 0.22, 0.19);
  private readonly warningShape = new THREE.PlaneGeometry(0.62, 4.5);
  private readonly ball = new THREE.SphereGeometry(0.21, 24, 16);
  private readonly ventShape = new THREE.BoxGeometry(0.4, 0.17, 0.34);
  private readonly droneOffset = new THREE.Vector3(0.95, 1.03, 0.05);
  private readonly ventOffset = new THREE.Vector3(0.48, 0.36, 0.3);
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly enemies: EnemyManager,
    private readonly raids: RaidMissionSystem,
  ) {
    this.warmupObject.add(
      new THREE.Mesh(this.warningShape, this.glow),
      new THREE.Mesh(this.ring, this.shieldMat),
      new THREE.Mesh(this.cargoShape, this.amber),
      new THREE.Line(this.warningShape, this.lineMat),
    );
  }
  setModel(model: LoadedModel | null): void {
    this.clear();
    this.model = model;
  }

  fixedUpdate(): void {
    const live = this.enemies.active.filter((e) => e.aiState !== 'dead');
    const ids = new Set(live.map((e) => e.id));
    // Retired pooled definitions have unique IDs. Reclaim their presentation instead of growing a cache.
    for (const [id, slot] of this.slots)
      if (!ids.has(id)) {
        this.remove(slot);
        this.slots.delete(id);
      }
    for (const enemy of live) {
      const tactic = enemy.tacticalSnapshot;
      if (!tactic) continue;
      let slot = this.slots.get(enemy.id);
      if (!slot) {
        slot = this.create(enemy);
        this.slots.set(enemy.id, slot);
      }
      if (tactic.kind === 'bastion' && tactic.ventOpen) {
        if (!slot.ventHit) {
          slot.ventHit = this.physics.world.createCollider(
            RAPIER.ColliderDesc.ball(0.245).setSensor(true),
          );
          this.physics.setUserData(slot.ventHit, {
            kind: 'enemy',
            id: enemy.id,
            armor: enemy.def.armor,
            surface: 'metal',
            takeDamage: (amount: number) => enemy.applyHit({ amount, weakpoint: 'vent' }),
          });
        }
        this.at
          .copy(this.ventOffset)
          .applyQuaternion(enemy.object3D.quaternion)
          .add(enemy.worldPosition);
        slot.ventHit.setTranslation(this.at);
      } else if (slot.ventHit) {
        this.physics.removeCollider(slot.ventHit);
        slot.ventHit = null;
      }
      if (tactic.kind === 'sovereign' && tactic.droneAlive) {
        if (!slot.droneHit) {
          slot.droneHit = this.physics.world.createCollider(
            RAPIER.ColliderDesc.ball(0.25).setSensor(true),
          );
          this.physics.setUserData(slot.droneHit, {
            kind: 'enemy',
            id: `${enemy.id}:drone`,
            armor: 0,
            surface: 'metal',
            takeDamage: (amount: number) => enemy.damageDrone(amount),
          });
        }
        this.at
          .copy(this.droneOffset)
          .applyQuaternion(enemy.object3D.quaternion)
          .add(enemy.worldPosition);
        slot.droneHit.setTranslation(this.at);
      } else if (slot.droneHit) {
        this.physics.removeCollider(slot.droneHit);
        slot.droneHit = null;
      }
    }
  }

  render(): void {
    const mission = this.raids.ledger.snapshot;
    const live = this.enemies.active.filter((e) => e.aiState !== 'dead');
    const support = live.filter((e) => e.tacticalSnapshot?.droneAlive);
    for (const slot of this.slots.values()) {
      const enemy = slot.enemy,
        state = enemy.tacticalSnapshot!;
      slot.root.visible = enemy.isActive && enemy.aiState !== 'dead';
      if (!slot.root.visible) continue;
      slot.root.position.copy(enemy.object3D.position);
      slot.root.quaternion.copy(enemy.object3D.quaternion);
      slot.vent.visible = state.kind === 'bastion';
      if (slot.radiator) slot.radiator.visible = state.ventOpen;
      slot.drone.visible = state.kind === 'sovereign' && state.droneAlive;
      slot.warning.visible = state.kind === 'revenant' && state.phase === 'telegraph';
      slot.cargo.visible = mission?.carrierId === enemy.id && mission.state === 'carrying';
      slot.shield.visible = support.some(
        (source) =>
          source !== enemy && source.worldPosition.distanceToSquared(enemy.worldPosition) <= 49,
      );
      slot.tether.visible =
        slot.drone.visible &&
        live.some(
          (other) =>
            other !== enemy && other.worldPosition.distanceToSquared(enemy.worldPosition) <= 49,
        );
      if (slot.warning.visible) {
        // The warning stays in world space; it must not track a dodging player.
        const direction = state.lungeDirection;
        if (direction) {
          this.at.copy(direction).applyQuaternion(enemy.object3D.quaternion.clone().invert());
          slot.warning.position.set(this.at.x * 2.25, -0.9, this.at.z * 2.25);
          slot.warning.rotation.z = Math.atan2(-this.at.x, -this.at.z);
        }
      }
    }
  }

  private create(enemy: Enemy): Presentation {
    const root = new THREE.Group();
    root.name = `${enemy.id} tactical cues`;
    this.scene.add(root);
    const drone =
      this.model?.scene.getObjectByName('SupportDrone')?.clone(true) ??
      new THREE.Mesh(this.ball, this.amber);
    const vent =
      this.model?.scene.getObjectByName('CoolingVent')?.clone(true) ??
      new THREE.Mesh(this.ventShape, this.amber);
    drone.position.copy(this.droneOffset);
    vent.position.copy(this.ventOffset);
    const radiator = vent.getObjectByName('MECH_VentHeat') ?? null;
    // The static hand-held ornament is replaced by the identical authored hovering orb.
    if (enemy.def.id === 'sovereign') {
      enemy.object3D.traverse((object) => {
        if (object.name === 'equipment_0') object.visible = false;
      });
    }
    const warning = new THREE.Mesh(this.warningShape, this.glow);
    warning.rotation.x = -Math.PI / 2;
    warning.position.set(0, -0.9, -2.25);
    const shield = new THREE.Mesh(this.ring, this.shieldMat);
    shield.rotation.x = -Math.PI / 2;
    shield.position.y = -0.9;
    const cargo = new THREE.Mesh(this.cargoShape, this.amber);
    cargo.position.set(-0.48, 0.25, 0.15);
    const tether = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([this.droneOffset, new THREE.Vector3(0, 0.5, 0)]),
      this.lineMat,
    );
    root.add(drone, vent, warning, shield, cargo, tether);
    return {
      enemy,
      root,
      drone,
      vent,
      radiator,
      warning,
      shield,
      cargo,
      tether,
      droneHit: null,
      ventHit: null,
    };
  }
  private remove(slot: Presentation): void {
    if (slot.droneHit) this.physics.removeCollider(slot.droneHit);
    if (slot.ventHit) this.physics.removeCollider(slot.ventHit);
    slot.tether.geometry.dispose();
    slot.root.removeFromParent();
  }
  clear(): void {
    for (const slot of this.slots.values()) this.remove(slot);
    this.slots.clear();
  }
  dispose(): void {
    this.clear();
    for (const geometry of [
      this.ring,
      this.cargoShape,
      this.warningShape,
      this.ball,
      this.ventShape,
    ])
      geometry.dispose();
    for (const material of [this.glow, this.amber, this.shieldMat, this.lineMat])
      material.dispose();
  }
}
