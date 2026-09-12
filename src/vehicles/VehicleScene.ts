import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Materials } from '@/art/Materials';
import {
  buildBoardingHookModel,
  buildSkiffCrewModel,
  buildSkiffModel,
  SKIFF_CREW_SEATS,
  aimSkiffWeapon,
  updateSkiffCrewModel,
  placeSkiffCrewOnCable,
  authoredEnemyModel,
} from '@/art/DefenseModels';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Damageable } from '@/combat/Damageable';
import { Rng } from '@/core/math/Random';
import { planVolley, type VolleyTarget } from './VolleyPlanner';
import { VehicleManager } from './VehicleManager';
import type { BoardingEncounterState } from './BoardingEncounter';
import {
  combatProfile,
  VEHICLES,
  type VehicleCombatProfile,
  type VehicleId,
} from '@/data/vehicles';
import { CHARACTER_DROP_Y, DECK_SURFACE_Y } from '@/game/constants';
import { BoardingEffects } from '@/art/BoardingEffects';
import { EnemyVisual } from '@/enemies/EnemyVisual';
import { ENEMIES } from '@/data/enemies';
import type { MechBoarder } from '@/story/RadioRaids';
import nomad from '@/data/iron-nomad.json';

interface ActorCollider {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export interface VehicleSceneCallbacks {
  terrainHeightAt?: (x: number, z: number) => number;
  boardingLanding?: (side: 'port' | 'starboard', crewIndex: number) => THREE.Vector3;
  /** Spawn a normal EnemyManager raider at this valid deck position. */
  spawnBoarder(
    position: THREE.Vector3,
    crewIndex: number,
    definitionId?: string,
    health?: number,
  ): void;
  getVolleyTargets(): readonly VolleyTarget[];
  getVolleyTargetPosition?(targetId: string): THREE.Vector3 | null;
  canDamageVolleyTarget?(targetId: string, origin: THREE.Vector3, target: THREE.Vector3): boolean;
  damageVolleyTarget(targetId: string, amount: number): void;
  onVolley(targetId: string | null): void;
  onHookAttached(state: BoardingEncounterState): void;
  onRetreat(state: BoardingEncounterState): void;
  onDestroyed(position: THREE.Vector3): void;
  onEnded(): void;
}

/** Scene/physics composition around the pure one-skiff encounter. */
export class VehicleScene {
  readonly group = new THREE.Group();
  readonly manager: VehicleManager;
  private readonly skiff: THREE.Group;
  private readonly hook: THREE.Group;
  private readonly crew: THREE.Group[] = [];
  private readonly actors: ActorCollider[] = [];
  private readonly effects: BoardingEffects;
  private readonly pendingVolleys: {
    due: number;
    targetId: string;
    shots: number;
    origin: THREE.Vector3;
    target: THREE.Vector3 | null;
  }[] = [];
  private simTime = 0;
  private cutCharge = 0;
  private state: BoardingEncounterState | null = null;
  private readonly volleyRng = new Rng(0x5a1ff);
  private activeProfile: VehicleCombatProfile = combatProfile(VEHICLES.skiff);
  private cleaned = true;
  private roster: readonly MechBoarder[] | null = null;
  private readonly mechVisuals: EnemyVisual[] = [];
  private readonly gripGeometry: THREE.BufferGeometry[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    materials: Materials,
    private readonly callbacks: VehicleSceneCallbacks,
  ) {
    this.group.name = 'boarding-skiff-encounter';
    scene.add(this.group);
    this.effects = new BoardingEffects(scene);
    this.skiff = buildSkiffModel(materials);
    // Preloaded art has no encounter position yet. Leaving it visible here
    // parks a ghost skiff at the origin underneath the moving machine.
    this.skiff.visible = false;
    this.hook = buildBoardingHookModel(materials);
    this.hook.visible = false;
    this.group.add(this.skiff, this.hook);
    this.manager = new VehicleManager({
      onSpawn: (vehicleId, state, profile) =>
        this.spawnActors(vehicleId, state, profile, materials),
      onState: (state) => this.syncState(state),
      onCrewLand: (index) => this.landCrew(index),
      onDestroyed: () => this.destroyed(),
      onRetreat: (state) => callbacks.onRetreat(state),
      onEnded: () => {
        this.cleanup();
        callbacks.onEnded();
      },
      onHookAttached: (state) => callbacks.onHookAttached(state),
      onBoarderLost: (index) => {
        const model = this.crew[index];
        if (model) model.visible = false;
      },
      onVolley: (state) => this.volley(state),
    });
  }

  spawn(
    side: 'port' | 'starboard' = 'port',
    tutorial = false,
    crew?: readonly [MechBoarder, MechBoarder],
  ): boolean {
    if (this.manager.snapshot) return false;
    this.roster = tutorial ? null : (crew ?? null);
    return this.manager.spawn(
      'skiff',
      side,
      tutorial,
      this.roster?.map((id) => ENEMIES[id]!.maxHealth),
    );
  }
  get active(): boolean {
    return this.manager.active;
  }
  get hookWorldPosition(): THREE.Vector3 | null {
    if (!this.hook.visible) return null;
    const position = new THREE.Vector3();
    this.hook.getWorldPosition(position);
    return position;
  }
  clear(): void {
    this.manager.clear();
    this.pendingVolleys.length = 0;
    this.state = null;
    this.cleanup();
  }
  damageHull(amount: number): void {
    this.manager.damageHull(amount);
  }
  damageCrew(index: number, amount: number): void {
    this.manager.damageCrew(index, amount);
  }
  damageHook(amount: number): void {
    this.manager.damageHook(amount);
  }
  setLandedBoardersAlive(count: number): void {
    this.manager.setLandedBoardersAlive(count);
  }
  /** Hold-E seam for cutting the attached hook; release resets the charge. */
  holdCutHook(dt: number): boolean {
    this.cutCharge += Math.max(0, dt);
    if (this.cutCharge < 1.25) return false;
    this.manager.fixedUpdate(0, false, true);
    this.cutCharge = 0;
    return true;
  }
  releaseCutHook(): void {
    this.cutCharge = 0;
  }
  fixedUpdate(dt: number, hookAttached = false, cutHook = false): void {
    this.simTime += Math.max(0, dt);
    for (let i = this.pendingVolleys.length - 1; i >= 0; i--) {
      const volley = this.pendingVolleys[i]!;
      if (volley.due > this.simTime) continue;
      // Shells travel to the position aimed at when the telegraph fired;
      // resolving a moving target again here would turn them into homing fire.
      const origin = volley.origin;
      if (
        volley.target &&
        (this.callbacks.canDamageVolleyTarget?.(volley.targetId, origin, volley.target) ?? true)
      ) {
        for (let shot = 0; shot < volley.shots; shot++)
          this.callbacks.damageVolleyTarget(volley.targetId, this.activeProfile.weapon.damage);
      }
      this.pendingVolleys.splice(i, 1);
    }
    this.effects.update(dt);
    this.manager.fixedUpdate(dt, hookAttached, cutHook);
    for (let i = 0; i < this.crew.length; i++) {
      updateSkiffCrewModel(this.crew[i]!, dt, this.state?.crewStatus[i] === 'crossing');
      this.mechVisuals[i]?.update(dt);
    }
  }

  private spawnActors(
    vehicleId: VehicleId,
    state: BoardingEncounterState,
    profile: VehicleCombatProfile,
    materials: Materials,
  ): void {
    if (vehicleId !== 'skiff') return;
    this.cleaned = false;
    this.state = state;
    this.activeProfile = profile;
    this.skiff.visible = true;
    for (let i = 0; i < state.crewHealth.length; i++) {
      let model: THREE.Group;
      const mechId = this.roster?.[i];
      if (mechId) {
        model = new THREE.Group();
        model.name = `Boarding-${mechId}`;
        model.userData.mechId = mechId;
        const visual = new EnemyVisual(authoredEnemyModel(mechId), materials);
        visual.setState('idle');
        visual.setPresentationOnly();
        visual.update(0);
        visual.object3D.position.y = 0.96;
        model.add(visual.object3D);
        this.mechVisuals.push(visual);
        // Powered cable trolley: a visible harness joins the armored passenger
        // to the grapple instead of pretending a weapon-holding idle is a climb.
        const grip = new THREE.Group();
        grip.name = 'BoardingGrip';
        grip.position.set(0, 2.2, 0.6);
        const rollerGeo = new THREE.TorusGeometry(0.13, 0.035, 6, 12);
        const roller = new THREE.Mesh(rollerGeo, materials.bareSteel);
        roller.rotation.y = Math.PI / 2;
        grip.add(roller);
        model.add(grip);
        const tetherGeo = new THREE.CylinderGeometry(0.024, 0.024, Math.hypot(0.9, 0.6), 6);
        const tether = new THREE.Mesh(tetherGeo, materials.bareSteel);
        tether.position.set(0, 1.72, 0.3);
        tether.rotation.x = Math.atan2(0.6, 0.9);
        model.add(tether);
        this.gripGeometry.push(rollerGeo, tetherGeo);
      } else model = buildSkiffCrewModel(materials);
      model.position.copy(SKiffSeat(i));
      model.rotation.y = state.side === 'port' ? Math.PI / 2 : -Math.PI / 2;
      this.skiff.add(model);
      this.crew.push(model);
    }
    this.addHullCollider();
    for (let i = 0; i < state.crewHealth.length; i++) this.addCrewCollider(i);
    this.addHookCollider();
    this.syncState(state);
  }

  private addHullCollider(): void {
    const body = this.physics.createDrivenBody();
    const damageable: Damageable = {
      kind: 'vehicle',
      id: 'skiff-hull',
      armor: 5,
      takeDamage: (amount) => this.manager.damageHull(amount),
    };
    const collider = this.physics.addBoxTo(
      body,
      new THREE.Vector3(1.5, 0.65, 2.7),
      new THREE.Vector3(),
      undefined,
      damageable,
    );
    this.actors.push({ body, collider });
  }

  private addCrewCollider(index: number): void {
    const body = this.physics.createDrivenBody();
    const damageable: Damageable = {
      kind: 'enemy',
      id: `skiff-crew-${index}`,
      armor: this.roster?.[index] ? ENEMIES[this.roster[index]!]!.armor : 0,
      takeDamage: (amount) => this.manager.damageCrew(index, amount),
    };
    const collider = this.physics.addBoxTo(
      body,
      new THREE.Vector3(0.35, 0.85, 0.3),
      new THREE.Vector3(),
      undefined,
      damageable,
    );
    this.actors.push({ body, collider });
  }

  private addHookCollider(): void {
    const body = this.physics.createDrivenBody();
    const damageable: Damageable = {
      kind: 'hook',
      id: 'skiff-hook',
      armor: 0,
      takeDamage: (amount) => this.manager.damageHook(amount),
    };
    const collider = this.physics.addBoxTo(
      body,
      new THREE.Vector3(0.16, 0.16, 0.32),
      new THREE.Vector3(),
      undefined,
      damageable,
    );
    this.actors.push({ body, collider });
  }

  private syncState(state: BoardingEncounterState): void {
    this.state = state;
    const terrain = this.callbacks.terrainHeightAt?.(state.lateral, state.forward) ?? 0;
    this.skiff.position.set(state.lateral, terrain, state.forward);
    this.hook.visible =
      state.phase === 'hook-flight' || state.phase === 'attached' || state.phase === 'boarding';
    const hookT = state.phase === 'hook-flight' ? Math.min(1, state.phaseElapsed / 0.75) : 1;
    const hookTarget = this.landingFor(state, 0).anchor;
    const launcher = new THREE.Vector3(
      state.lateral + (state.side === 'port' ? 0.9 : -0.9),
      terrain + 1.7,
      state.forward,
    );
    this.hook.position.lerpVectors(launcher, hookTarget, hookT);
    const hookWorld = new THREE.Vector3();
    this.hook.getWorldPosition(hookWorld);
    this.effects.setCable(launcher, hookWorld, this.hook.visible);
    for (let i = 0; i < this.crew.length; i++) {
      const status = state.crewStatus[i];
      this.crew[i]!.visible = status !== 'dead' && status !== 'landed';
      if (status === 'seated' && this.crew[i]!.parent !== this.skiff) {
        this.crew[i]!.removeFromParent();
        this.skiff.add(this.crew[i]!);
        this.crew[i]!.position.copy(SKiffSeat(i));
      }
      if (status === 'crossing') {
        const crossingAt = state.crossingAt[i] ?? 0;
        const t = Math.max(
          0,
          Math.min(
            1,
            (state.phaseElapsed - crossingAt) /
              Math.max(0.1, this.activeProfile.crewStaggerSeconds),
          ),
        );
        if (this.crew[i]!.parent !== this.group) {
          this.crew[i]!.removeFromParent();
          this.group.add(this.crew[i]!);
        }
        const target = this.landingFor(state, i).feet;
        const startWorld = new THREE.Vector3(
          state.lateral + SKiffSeat(i).x,
          terrain + SKiffSeat(i).y,
          state.forward + SKiffSeat(i).z,
        );
        placeSkiffCrewOnCable(
          this.crew[i]!,
          launcher,
          target,
          startWorld,
          t,
          this.roster ? this.landingFor(state, i).anchor : undefined,
        );
      }
    }
    this.group.updateMatrixWorld(true);
    this.syncActors();
  }

  private syncActors(): void {
    if (!this.state) return;
    const terrain = this.callbacks.terrainHeightAt?.(this.state.lateral, this.state.forward) ?? 0;
    const root = new THREE.Vector3(this.state.lateral, terrain, this.state.forward);
    const positions = [
      new THREE.Vector3(0, 0.78, 0),
      ...this.state.crewHealth.map((_, i) => {
        const status = this.state!.crewStatus[i];
        if (status === 'dead' || status === 'landed') return new THREE.Vector3(0, -100, 0);
        const world = new THREE.Vector3();
        this.crew[i]?.getWorldPosition(world);
        return new THREE.Vector3(world.x - root.x, world.y + 0.85 - root.y, world.z - root.z);
      }),
      this.state.phase === 'hook-flight' ||
      this.state.phase === 'attached' ||
      this.state.phase === 'boarding'
        ? (() => {
            const hook = new THREE.Vector3();
            this.hook.getWorldPosition(hook);
            return new THREE.Vector3(hook.x - root.x, hook.y - root.y, hook.z - root.z);
          })()
        : new THREE.Vector3(0, -100, 0),
    ];
    this.actors.forEach((actor, i) =>
      actor.body.setTranslation(
        { x: root.x + positions[i]!.x, y: root.y + positions[i]!.y, z: root.z + positions[i]!.z },
        true,
      ),
    );
  }

  private landCrew(index: number): void {
    if (!this.state) return;
    const position = this.landingFor(this.state, index).spawn;
    const id = this.roster?.[index];
    if (id)
      this.callbacks.spawnBoarder(position, index, id, this.manager.snapshot?.crewHealth[index]);
    else this.callbacks.spawnBoarder(position, index);
  }

  private landingFor(
    state: BoardingEncounterState,
    index: number,
  ): { feet: THREE.Vector3; spawn: THREE.Vector3; anchor: THREE.Vector3 } {
    const spawn =
      this.callbacks.boardingLanding?.(state.side, index) ??
      new THREE.Vector3(state.side === 'port' ? -4 : 4, CHARACTER_DROP_Y, -2);
    return {
      spawn: spawn.clone(),
      feet: new THREE.Vector3(spawn.x, DECK_SURFACE_Y + 0.05, spawn.z),
      anchor: this.roster
        ? new THREE.Vector3(
            (state.side === 'port' ? -1 : 1) * nomad.deckHalfWidth,
            DECK_SURFACE_Y + 1.1,
            spawn.z,
          )
        : new THREE.Vector3(spawn.x, DECK_SURFACE_Y + 0.05, spawn.z),
    };
  }

  private volley(_state: BoardingEncounterState): void {
    // Exposure is evaluated from the actual muzzle for each candidate before
    // planning. This keeps a player behind cover from winning target
    // selection merely because they are the highest-ranked candidate.
    const candidates = this.callbacks.getVolleyTargets().map((candidate) => {
      const target = this.callbacks.getVolleyTargetPosition?.(candidate.id) ?? null;
      if (!target) return { ...candidate, exposed: false };
      const origin = aimSkiffWeapon(this.skiff, target);
      return {
        ...candidate,
        exposed:
          candidate.exposed &&
          (this.callbacks.canDamageVolleyTarget?.(candidate.id, origin, target) ?? true),
      };
    });
    const volleyDefinition = {
      ...VEHICLES.skiff,
      weapon: this.activeProfile.weapon,
    };
    const plan = planVolley(this.volleyRng, volleyDefinition, candidates);
    if (!plan) {
      this.callbacks.onVolley(null);
      return;
    }
    const target = this.callbacks.getVolleyTargetPosition?.(plan.targetId);
    const origin = target
      ? aimSkiffWeapon(this.skiff, target)
      : this.skiff.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    this.pendingVolleys.push({
      due: this.simTime + this.activeProfile.weapon.flightTime,
      targetId: plan.targetId,
      shots: plan.shots,
      origin: origin.clone(),
      target: target?.clone() ?? null,
    });
    if (target) {
      this.effects.volley(origin, target, this.activeProfile.weapon.flightTime);
    }
    this.callbacks.onVolley(plan.targetId);
  }

  private destroyed(): void {
    this.callbacks.onDestroyed(
      new THREE.Vector3(this.skiff.position.x, this.skiff.position.y, this.skiff.position.z),
    );
    this.cleanup();
  }

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    for (const actor of this.actors) {
      this.physics.removeCollider(actor.collider);
      this.physics.removeBody(actor.body);
    }
    this.actors.length = 0;
    this.pendingVolleys.length = 0;
    this.simTime = 0;
    this.cutCharge = 0;
    this.skiff.visible = false;
    this.hook.visible = false;
    this.effects.setCable(new THREE.Vector3(), new THREE.Vector3(), false);
    this.effects.clear();
    for (const model of this.crew) {
      model.removeFromParent();
      model.visible = false;
    }
    this.crew.length = 0;
    for (const visual of this.mechVisuals) visual.dispose();
    this.mechVisuals.length = 0;
    for (const geometry of this.gripGeometry) geometry.dispose();
    this.gripGeometry.length = 0;
    this.roster = null;
  }
}

function SKiffSeat(index: number): THREE.Vector3 {
  return (SKIFF_CREW_SEATS[index] ?? SKIFF_CREW_SEATS[0]!).clone();
}
