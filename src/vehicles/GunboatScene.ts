import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Damageable } from '@/combat/Damageable';
import { GUNBOAT, type GunboatDefinition } from '@/data/vehicles';
import { buildGunboatModel, type GunboatVisual } from '@/art/DefenseModels';
import { Rng } from '@/core/math/Random';
import { planVolley, type VolleyTarget } from './VolleyPlanner';
import {
  createGunboatEncounter,
  damageGunboatEncounter,
  stepGunboatEncounter,
  type GunboatState,
} from './GunboatEncounter';

interface Actor {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}
interface PendingShell {
  active: boolean;
  launchedAt: number;
  dueAt: number;
  targetId: string;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  line: THREE.Line;
}
export interface GunboatSceneCallbacks {
  terrainHeightAt?: (x: number, z: number) => number;
  getVolleyTargets?(): readonly VolleyTarget[];
  damageVolleyTarget(targetId: string, amount: number): void;
  canDamageVolleyTarget?(targetId: string, origin: THREE.Vector3, target: THREE.Vector3): boolean;
  getVolleyTargetPosition?(targetId: string): THREE.Vector3 | null;
  onVolley?(state: GunboatState, origin: THREE.Vector3, target: THREE.Vector3 | null): void;
  onTelegraph?(state: GunboatState, origin: THREE.Vector3, target: THREE.Vector3): void;
  onDestroyed?(state: GunboatState): void;
  onEnded?(state: GunboatState): void;
}

/** Runtime composition for the ranged gunboat. It has no gangway or boarding surface. */
export class GunboatScene {
  readonly group = new THREE.Group();
  private readonly root = new THREE.Group();
  private readonly actors: Actor[] = [];
  private readonly visual: GunboatVisual;
  private readonly shellPool: PendingShell[] = [];
  private readonly telegraphBeam: THREE.Line;
  private readonly telegraphLight: THREE.PointLight;
  private readonly effectMaterial = new THREE.LineBasicMaterial({
    color: 0xffc46b,
    transparent: true,
    opacity: 0.7,
  });
  private telegraphedVolley = -1;
  private plannedTarget: string | null = null;
  private readonly volleyRng = new Rng(0x6b0a7);
  private simTime = 0;
  private state: GunboatState | null = null;
  private previousPhase: GunboatState['phase'] | null = null;
  private readonly definition: GunboatDefinition = GUNBOAT;

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    materials: Materials,
    private readonly callbacks: GunboatSceneCallbacks,
  ) {
    this.group.name = 'ranged-gunboat-encounter';
    this.visual = buildGunboatModel(materials);
    this.root.add(this.visual.root);
    this.group.add(this.root);
    this.telegraphBeam = this.makeLine();
    this.telegraphBeam.visible = false;
    this.telegraphBeam.frustumCulled = false;
    this.group.add(this.telegraphBeam);
    this.telegraphLight = new THREE.PointLight(0xffb45c, 0, 8, 2);
    this.group.add(this.telegraphLight);
    for (let i = 0; i < 8; i++) {
      const line = this.makeLine();
      this.group.add(line);
      this.shellPool.push({
        active: false,
        launchedAt: 0,
        dueAt: 0,
        targetId: 'player',
        origin: new THREE.Vector3(),
        target: new THREE.Vector3(),
        line,
      });
    }
    this.root.visible = false;
    scene.add(this.group);
  }

  get active(): boolean {
    return (
      this.pendingShellCount > 0 ||
      (this.state !== null && this.state.phase !== 'ended' && this.state.phase !== 'destroyed')
    );
  }
  get snapshot(): GunboatState | null {
    return this.state ? { ...this.state } : null;
  }
  get pendingShellCount(): number {
    return this.shellPool.filter((shell) => shell.active).length;
  }
  get telegraphActive(): boolean {
    return this.telegraphBeam.visible;
  }

  getTargetPosition(part: 'hull' | 'weapon' | 'engine'): THREE.Vector3 | null {
    if (!this.state || !this.active || this.state[`${part}Health`] <= 0) return null;
    const at =
      part === 'hull'
        ? this.definition.hullBounds.center
        : part === 'weapon'
          ? this.definition.weaponTarget.center
          : this.definition.engineTarget.center;
    this.root.updateMatrixWorld(true);
    return this.root.localToWorld(new THREE.Vector3(at.x, at.y, at.z));
  }

  getTargetArmor(part: 'hull' | 'weapon' | 'engine'): number {
    return part === 'hull'
      ? this.definition.hull.armor
      : part === 'weapon'
        ? this.definition.weaponSubsystem.armor
        : this.definition.engineSubsystem.armor;
  }

  spawn(side: 'port' | 'starboard' = 'port'): boolean {
    if (this.state || this.pendingShellCount > 0) return false;
    this.state = createGunboatEncounter(side);
    this.previousPhase = this.state.phase;
    this.simTime = 0;
    this.telegraphedVolley = -1;
    this.plannedTarget = null;
    this.root.visible = true;
    this.addActors();
    this.sync(this.state);
    return true;
  }

  clear(preserveLaunchedShells = false): void {
    for (const actor of this.actors) {
      this.physics.removeCollider(actor.collider);
      this.physics.removeBody(actor.body);
    }
    this.actors.length = 0;
    if (!preserveLaunchedShells) {
      for (const shell of this.shellPool) {
        shell.active = false;
        shell.line.visible = false;
      }
      this.simTime = 0;
    }
    this.telegraphedVolley = -1;
    this.plannedTarget = null;
    this.state = null;
    this.previousPhase = null;
    this.root.visible = false;
    this.telegraphBeam.visible = false;
    this.telegraphLight.intensity = 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    if (!this.visual.root.userData.authored) {
      this.visual.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
    this.telegraphBeam.geometry.dispose();
    this.effectMaterial.dispose();
    for (const shell of this.shellPool) shell.line.geometry.dispose();
  }

  damage(part: 'hull' | 'weapon' | 'engine', amount: number): void {
    if (!this.state) return;
    this.state = damageGunboatEncounter(this.state, part, amount);
    this.sync(this.state);
    if (this.state.phase === 'destroyed' && this.previousPhase !== 'destroyed') {
      const terminal = this.state;
      this.previousPhase = terminal.phase;
      this.callbacks.onDestroyed?.(terminal);
    }
  }

  fixedUpdate(dt: number): void {
    this.simTime += Math.max(0, Math.min(1, Number.isFinite(dt) ? dt : 0));
    this.updatePresentation();
    this.resolveShells();
    if (!this.state || this.state.phase === 'ended' || this.state.phase === 'destroyed') return;
    const before = this.state;
    this.state = stepGunboatEncounter(this.state, dt);
    this.sync(this.state);
    if (
      this.state &&
      this.state.volleySerial > before.volleySerial &&
      this.state.weaponHealth > 0
    ) {
      const targetId = this.plannedTarget ?? this.selectVolleyTarget();
      this.plannedTarget = null;
      if (targetId) this.aimWeapon(targetId);
      const origin = this.visual.muzzle.getWorldPosition(new THREE.Vector3());
      const target = targetId ? (this.callbacks.getVolleyTargetPosition?.(targetId) ?? null) : null;
      if (target && targetId) {
        for (let shot = 0; shot < this.definition.shell.volleyShots; shot++) {
          const shell = this.shellPool.find((candidate) => !candidate.active);
          if (!shell) break;
          shell.active = true;
          shell.launchedAt = this.simTime;
          shell.dueAt = this.simTime + this.definition.shell.flightTime;
          shell.targetId = targetId;
          shell.origin.copy(origin);
          shell.target.copy(target);
          shell.line.visible = true;
        }
      }
      this.callbacks.onVolley?.(this.state, origin, target);
    }
    if (!this.state) return;
    if (this.state.phase !== this.previousPhase) {
      const changedPhase = this.state.phase;
      const changedState = this.state;
      if (changedPhase === 'destroyed') this.callbacks.onDestroyed?.(changedState);
      if (changedPhase === 'ended') this.callbacks.onEnded?.(changedState);
      if (this.state) this.previousPhase = changedPhase;
    }
    this.updatePresentation();
  }

  private addActors(): void {
    const hullHalf = this.definition.hullBounds.half;
    const hullCenter = this.definition.hullBounds.center;
    const weaponHalf = this.definition.weaponTarget.half;
    const weaponCenter = this.definition.weaponTarget.center;
    const engineHalf = this.definition.engineTarget.half;
    const engineCenter = this.definition.engineTarget.center;
    const add = (
      id: string,
      kind: Damageable['kind'],
      half: THREE.Vector3,
      position: THREE.Vector3,
      armor: number,
      damage: (amount: number) => void,
    ) => {
      const body = this.physics.createDrivenBody();
      const data: Damageable = { kind, id, armor, takeDamage: damage };
      const collider = this.physics.addBoxTo(body, half, position, undefined, data);
      this.actors.push({ id, body, collider });
    };
    add(
      'gunboat-hull',
      'vehicle',
      new THREE.Vector3(hullHalf.x, hullHalf.y, hullHalf.z),
      new THREE.Vector3(hullCenter.x, hullCenter.y, hullCenter.z),
      this.definition.hull.armor,
      (amount) => this.damage('hull', amount),
    );
    add(
      'gunboat-weapon',
      'subsystem',
      new THREE.Vector3(weaponHalf.x, weaponHalf.y, weaponHalf.z),
      new THREE.Vector3(weaponCenter.x, weaponCenter.y, weaponCenter.z),
      this.definition.weaponSubsystem.armor,
      (amount) => this.damage('weapon', amount),
    );
    add(
      'gunboat-engine',
      'subsystem',
      new THREE.Vector3(engineHalf.x, engineHalf.y, engineHalf.z),
      new THREE.Vector3(engineCenter.x, engineCenter.y, engineCenter.z),
      this.definition.engineSubsystem.armor,
      (amount) => this.damage('engine', amount),
    );
  }

  private selectVolleyTarget(): string | null {
    const candidates = this.callbacks.getVolleyTargets?.() ?? [
      { id: 'player', kind: 'player' as const, exposed: true },
    ];
    const exposed = candidates.map((candidate) => {
      const target = this.callbacks.getVolleyTargetPosition?.(candidate.id);
      if (!candidate.exposed || !target) return { ...candidate, exposed: false };
      this.aimWeapon(candidate.id);
      const origin = this.visual.muzzle.getWorldPosition(new THREE.Vector3());
      return {
        ...candidate,
        exposed: this.callbacks.canDamageVolleyTarget?.(candidate.id, origin, target) ?? true,
      };
    });
    return planVolley(this.volleyRng, { weapon: this.definition.shell }, exposed)?.targetId ?? null;
  }

  private aimWeapon(targetId: string): void {
    const target = this.callbacks.getVolleyTargetPosition?.(targetId);
    if (!target) return;
    this.root.updateMatrixWorld(true);
    const local = this.visual.yaw
      .parent!.worldToLocal(target.clone())
      .sub(this.visual.yaw.position);
    this.visual.yaw.rotation.y = Math.atan2(-local.x, -local.z);
    this.visual.yaw.updateMatrixWorld(true);
    const delta = this.visual.yaw.worldToLocal(target.clone()).sub(this.visual.pitch.position);
    this.visual.pitch.rotation.x = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    this.visual.root.updateMatrixWorld(true);
  }

  private resolveShells(): void {
    for (const shell of this.shellPool) {
      if (!shell.active || shell.dueAt > this.simTime + 1e-8) continue;
      shell.active = false;
      shell.line.visible = false;
      // Shells hit their launch aim point. Moving out of that footprint lets
      // the player dodge; a clear old ray alone must not cause remote damage.
      const current = this.callbacks.getVolleyTargetPosition?.(shell.targetId);
      const clear =
        this.callbacks.canDamageVolleyTarget?.(shell.targetId, shell.origin, shell.target) ?? true;
      if (clear && current && current.distanceToSquared(shell.target) <= 0.85 ** 2)
        this.callbacks.damageVolleyTarget(shell.targetId, this.definition.shell.damage);
    }
  }

  private sync(state: GunboatState): void {
    const y = this.callbacks.terrainHeightAt?.(state.lateral, state.forward) ?? 0;
    this.root.position.set(state.lateral, y, state.forward);
    this.visual.weaponTarget.visible = state.weaponHealth > 0;
    this.visual.engineTarget.visible = state.engineHealth > 0;
    if (this.visual.weaponDisabled) this.visual.weaponDisabled.visible = state.weaponHealth <= 0;
    if (this.visual.engineDisabled) this.visual.engineDisabled.visible = state.engineHealth <= 0;
    if (this.visual.engineExhaust) this.visual.engineExhaust.visible = state.engineHealth > 0;
    for (let index = this.actors.length - 1; index >= 0; index--) {
      const actor = this.actors[index]!;
      if (
        (actor.id === 'gunboat-weapon' && state.weaponHealth <= 0) ||
        (actor.id === 'gunboat-engine' && state.engineHealth <= 0)
      ) {
        this.physics.removeCollider(actor.collider);
        this.physics.removeBody(actor.body);
        this.actors.splice(index, 1);
      }
    }
    for (const actor of this.actors)
      actor.body.setTranslation({ x: state.lateral, y, z: state.forward }, true);
  }

  private updatePresentation(): void {
    const state = this.state;
    this.telegraphBeam.visible = Boolean(
      state &&
      state.phase === 'broadside' &&
      state.weaponHealth > 0 &&
      state.nextVolleyAt - state.phaseElapsed <= this.definition.telegraphSeconds + 1e-8,
    );
    this.telegraphLight.intensity = this.telegraphBeam.visible ? 10 : 0;
    if (this.telegraphBeam.visible && state) {
      if (this.telegraphedVolley !== state.volleySerial) {
        this.plannedTarget = this.selectVolleyTarget();
        this.telegraphedVolley = state.volleySerial;
        if (this.plannedTarget) {
          this.aimWeapon(this.plannedTarget);
          const aim = this.callbacks.getVolleyTargetPosition?.(this.plannedTarget);
          if (aim)
            this.callbacks.onTelegraph?.(
              state,
              this.visual.muzzle.getWorldPosition(new THREE.Vector3()),
              aim.clone(),
            );
        }
      }
      if (this.plannedTarget) this.aimWeapon(this.plannedTarget);
      const origin = this.visual.muzzle.getWorldPosition(new THREE.Vector3());
      const target = this.plannedTarget
        ? this.callbacks.getVolleyTargetPosition?.(this.plannedTarget)
        : null;
      if (target) {
        this.writeLine(this.telegraphBeam, origin, target);
        this.telegraphLight.position.copy(origin);
      } else this.telegraphBeam.visible = false;
    }
    for (const shell of this.shellPool) {
      if (!shell.active) continue;
      const alpha = THREE.MathUtils.clamp(
        (this.simTime - shell.launchedAt) / this.definition.shell.flightTime,
        0,
        1,
      );
      const head = shell.origin.clone().lerp(shell.target, alpha);
      const tail = shell.origin.clone().lerp(shell.target, Math.max(0, alpha - 0.06));
      this.writeLine(shell.line, tail, head);
    }
  }

  private makeLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, this.effectMaterial);
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }
  private writeLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3): void {
    const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, a.x, a.y, a.z);
    positions.setXYZ(1, b.x, b.y, b.z);
    positions.needsUpdate = true;
  }
}
