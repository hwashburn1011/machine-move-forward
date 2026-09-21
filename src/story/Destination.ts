import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import {
  DECK_SURFACE_Y,
  LEVEL_HEIGHT,
  NOMAD_WALKABLE_HALF_LENGTH,
  NOMAD_WALKABLE_HALF_WIDTH,
  NOMAD_WRAPAROUND_HALF_LENGTH,
  NOMAD_WRAPAROUND_HALF_WIDTH,
} from '@/game/constants';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Interactable } from '@/interaction/InteractionSystem';
import {
  buildFoundryModel,
  buildWreckModel,
  buildOrchardModel,
  buildMeridianModel,
} from '@/art/ExpeditionModels';
import {
  WRECK_ONE,
  type ExpeditionDefinition,
  type StoryUniqueId,
  type StoryObjectiveId,
} from '@/data/story';
import sideStairs from '@/data/iron-nomad-side-stairs.json';
export type DestinationDefinition = Omit<
  Pick<ExpeditionDefinition, 'title' | 'modelId' | 'placement' | 'interactables' | 'colliders'>,
  'modelId'
> & { id: string; modelId: string };

export interface NomadDeckBounds {
  readonly level: -2 | -1 | 0;
  readonly halfWidth: number;
  readonly halfLength: number;
}

/** Runtime machine presence envelope, including the wider lower/middle wraps. */
export function nomadDeckBoundsAtY(y: number): NomadDeckBounds {
  const level = Math.max(-2, Math.min(0, Math.round((y - DECK_SURFACE_Y) / LEVEL_HEIGHT))) as
    -2 | -1 | 0;
  return level === 0
    ? { level, halfWidth: NOMAD_WALKABLE_HALF_WIDTH, halfLength: NOMAD_WALKABLE_HALF_LENGTH }
    : { level, halfWidth: NOMAD_WRAPAROUND_HALF_WIDTH, halfLength: NOMAD_WRAPAROUND_HALF_LENGTH };
}

export function nomadUpperStairExtension(p: Vec3Like): boolean {
  return (
    p.y >= DECK_SURFACE_Y - 0.3 &&
    p.y <= DECK_SURFACE_Y + 1.8 &&
    p.x >= sideStairs.upperExtension.xMin &&
    p.x <= sideStairs.upperExtension.xMax &&
    p.z >= sideStairs.upperExtension.zMin &&
    p.z <= sideStairs.upperExtension.zMax
  );
}

/** The lower and middle port bypass is a real supported machine deck. */
export function nomadFlatBypass(p: Vec3Like): boolean {
  const level = Math.round((p.y - DECK_SURFACE_Y) / LEVEL_HEIGHT);
  if (level !== -2 && level !== -1) return false;
  const yMin = DECK_SURFACE_Y + LEVEL_HEIGHT * level - 0.5;
  const yMax = DECK_SURFACE_Y + LEVEL_HEIGHT * level + 1.25;
  if (p.y < yMin || p.y > yMax) return false;
  return (
    p.x >= sideStairs.flatBypass.xMin &&
    p.x <= sideStairs.flatBypass.xMax &&
    p.z >= sideStairs.flatBypass.zMin &&
    p.z <= sideStairs.flatBypass.zMax
  );
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}
export interface DestinationOptions {
  scene: THREE.Scene;
  physics?: PhysicsWorld;
  materials?: Materials;
  arrivalDistance: number;
  modelFactory?: (materials: Materials) => THREE.Group;
  model?: THREE.Group;
  definition?: DestinationDefinition;
}
export interface DestinationProgress {
  uniqueCollected?: boolean;
  uniqueIds?: readonly string[];
  journalsRead: readonly string[];
  completedObjectives?: readonly StoryObjectiveId[];
}
export interface DestinationConstructor {
  new (options: DestinationOptions): Destination;
  new (
    scene: THREE.Scene,
    physics: PhysicsWorld | undefined,
    materials: Materials | undefined,
    arrivalDistance: number,
    modelFactory?: (materials: Materials) => THREE.Group,
  ): Destination;
}

export class Destination {
  readonly root: THREE.Group;
  arrivalDistance: number;
  private readonly scene: THREE.Scene;
  private readonly physics?: PhysicsWorld;
  private body?: ReturnType<PhysicsWorld['createDrivenBody']>;
  private colliders: ReturnType<PhysicsWorld['addBoxTo']>[] = [];
  private localInteractables: {
    id: string;
    label: string;
    kind: Interactable['kind'];
    position: THREE.Vector3;
    local: THREE.Vector3;
  }[] = [];
  private _docked = false;
  private _active = false;
  private currentDistance = 0;
  private readonly uniqueIds = new Set<string>();
  private readonly journalsRead = new Set<string>();
  private readonly completedObjectives = new Set<StoryObjectiveId>();
  private definition: DestinationDefinition;
  private readonly materials?: Materials;
  private ownsVisuals = false;
  constructor(options: DestinationOptions);
  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld | undefined,
    materials: Materials | undefined,
    arrivalDistance: number,
    modelFactory?: (materials: Materials) => THREE.Group,
  );
  constructor(
    first: DestinationOptions | THREE.Scene,
    physics?: PhysicsWorld,
    materials?: Materials,
    arrivalDistance = 0,
    modelFactory?: (materials: Materials) => THREE.Group,
  ) {
    const o: DestinationOptions =
      first instanceof THREE.Scene
        ? { scene: first, physics, materials, arrivalDistance, modelFactory }
        : first;
    this.scene = o.scene;
    this.physics = o.physics;
    this.arrivalDistance = Number.isFinite(o.arrivalDistance) ? o.arrivalDistance : 0;
    this.definition = o.definition ?? WRECK_ONE;
    const factory =
      o.modelFactory ??
      (this.definition.id === 'relay-foundry'
        ? buildFoundryModel
        : this.definition.id === 'last-garden-meridian'
          ? buildMeridianModel
          : this.definition.id === 'glass-orchard'
            ? buildOrchardModel
            : buildWreckModel);
    this.materials = o.materials;
    this.root =
      o.model ??
      (o.materials && this.definition.id !== 'quiet-array'
        ? factory(o.materials)
        : new THREE.Group());
    this.ownsVisuals = !o.model && Boolean(o.materials) && !this.root.userData.authored;
    this.root.name ||=
      this.definition.id === 'relay-foundry'
        ? 'MMF_Relay_Foundry'
        : this.definition.id === 'quiet-array'
          ? 'MMF_Quiet_Array'
          : this.definition.id === 'glass-orchard'
            ? 'MMF_Glass_Orchard'
            : 'MMF_Wreck_One';
    this.root.position.set(
      this.definition.placement.root.x,
      DECK_SURFACE_Y + this.definition.placement.root.y,
      0,
    );
    this.scene.add(this.root);
    this.root.visible = false;
    this.installDefinition();
    this.syncProgress({ journalsRead: [] });
    this.fixedUpdate(0);
  }
  get docked() {
    return this._docked;
  }
  get gangwayEnabled() {
    return this._docked;
  }
  get active() {
    return this._active;
  }
  get interactables(): readonly Interactable[] {
    if (!this._active || !this._docked) return [];
    return this.localInteractables.filter(
      (x) =>
        (x.kind !== 'unique' || !this.uniqueIds.has(this.factForInteractable(x.id) ?? '')) &&
        (x.kind !== 'objective' ||
          !this.completedObjectives.has(this.objectiveForInteractable(x.id)!)),
    );
  }
  factForInteractable(id: string): StoryUniqueId | null {
    const item = this.definition.interactables.find((entry) => entry.id === id);
    if (item?.kind !== 'unique') return null;
    return item.factId ?? null;
  }
  objectiveForInteractable(id: string): StoryObjectiveId | null {
    return (
      this.definition.interactables.find((x) => x.id === id && x.kind === 'objective')
        ?.objectiveId ?? null
    );
  }
  configure(definition: DestinationDefinition, model?: THREE.Group) {
    if (this._active) return false;
    this.clearDefinition();
    const generated =
      !model && this.materials
        ? definition.id === 'relay-foundry'
          ? buildFoundryModel(this.materials)
          : definition.id === 'last-garden-meridian'
            ? buildMeridianModel(this.materials)
            : definition.id === 'glass-orchard'
              ? buildOrchardModel(this.materials)
              : definition.id === 'quiet-array'
                ? undefined
                : buildWreckModel(this.materials)
        : model;
    this.replaceVisual(generated);
    this.definition = definition;
    this.root.name =
      definition.id === 'relay-foundry'
        ? 'MMF_Relay_Foundry'
        : definition.id === 'quiet-array'
          ? 'MMF_Quiet_Array'
          : definition.id === 'glass-orchard'
            ? 'MMF_Glass_Orchard'
            : 'MMF_Wreck_One';
    this.root.position.set(
      definition.placement.root.x,
      DECK_SURFACE_Y + definition.placement.root.y,
      0,
    );
    this.installDefinition();
    this.syncProgress({ journalsRead: [] });
    return true;
  }
  syncProgress(progress: DestinationProgress) {
    this.completedObjectives.clear();
    for (const id of progress.completedObjectives ?? []) this.completedObjectives.add(id);
    this.uniqueIds.clear();
    if (progress.uniqueIds) for (const id of progress.uniqueIds) this.uniqueIds.add(id);
    else if (progress.uniqueCollected) this.uniqueIds.add('course-gyro');
    this.journalsRead.clear();
    for (const id of progress.journalsRead) if (typeof id === 'string') this.journalsRead.add(id);
    const gyro = this.root.getObjectByName('CourseGyro');
    if (gyro) gyro.visible = !this.uniqueIds.has('course-gyro');
    for (const item of this.definition.interactables.filter((item) => item.kind === 'unique')) {
      const anchor = this.root.getObjectByName(item.anchor);
      const fact = this.factForInteractable(item.id);
      if (anchor && fact) anchor.visible = !this.uniqueIds.has(fact);
    }
    for (const x of this.localInteractables)
      if (x.kind === 'journal') {
        const base = x.label.replace(/^Reread /, '').replace(/^Read /, '');
        x.label = this.journalsRead.has(x.id) ? `Reread ${base}` : `Read ${base}`;
      }
  }
  setArrivalDistance(distance: number) {
    if (!this._docked && Number.isFinite(distance)) {
      this.arrivalDistance = distance;
      this.fixedUpdate(this.currentDistance);
    }
  }
  setLateralRoot(renderX: number): void {
    if (!Number.isFinite(renderX)) return;
    this.root.position.x = renderX;
    this.fixedUpdate(this.currentDistance);
  }
  setActive(active: boolean) {
    this._active = active;
    this.root.visible = active;
    if (!active) this.setDocked(false);
    else this.fixedUpdate(this.currentDistance);
  }
  fixedUpdate(distance: number) {
    if (Number.isFinite(distance)) this.currentDistance = distance;
    const z = this._docked ? 0 : WORLD_Z_PER_METRE * (this.currentDistance - this.arrivalDistance);
    this.root.position.z = z;
    if (this.body)
      this.body.setTranslation({ x: this.root.position.x, y: this.root.position.y, z }, true);
    for (const x of this.localInteractables)
      x.position.set(
        this.root.position.x + x.local.x,
        this.root.position.y + x.local.y,
        z + x.local.z,
      );
  }
  setDocked(docked: boolean) {
    if (docked && !this._active) {
      this._docked = false;
      return;
    }
    this._docked = docked;
    this.root.visible = this._active;
    const gangway = this.root.getObjectByName('Gangway');
    if (gangway) gangway.visible = docked;
    for (const c of this.colliders) c.setEnabled(docked);
    this.fixedUpdate(this.currentDistance);
  }
  containsPlayer(p: Vec3Like) {
    if (!this._active || !this._docked) return false;
    const l = {
      x: p.x - this.root.position.x,
      y: p.y - this.root.position.y,
      z: p.z - this.root.position.z,
    };
    const floor = this.definition.colliders.find((collider) => collider.id === 'floor');
    const halfX = floor?.half.x ?? (this.definition.id === 'relay-foundry' ? 7 : 6);
    const halfZ = floor?.half.z ?? (this.definition.id === 'relay-foundry' ? 5 : 9);
    const inside =
      l.x >= -halfX && l.x <= halfX && l.z >= -halfZ && l.z <= halfZ && l.y >= -0.3 && l.y <= 5;
    return inside || this.playerOnGangway(p);
  }
  playerOnGangway(p: Vec3Like) {
    if (!this._active || !this._docked) return false;
    const l = {
      x: p.x - this.root.position.x,
      y: p.y - this.root.position.y,
      z: p.z - this.root.position.z,
    };
    const g = this.definition.placement.gangway;
    return Math.abs(l.x - g.x) <= 0.6 && Math.abs(l.z - g.z) <= 1.4 && l.y >= -0.5 && l.y <= 2;
  }
  playerOnMachine(p: Vec3Like) {
    const bounds = nomadDeckBoundsAtY(p.y);
    return (
      (Math.abs(p.x) <= bounds.halfWidth &&
        Math.abs(p.z) <= bounds.halfLength &&
        p.y >= DECK_SURFACE_Y - LEVEL_HEIGHT * 2 - 0.5 &&
        p.y <= DECK_SURFACE_Y + LEVEL_HEIGHT * 1.25) ||
      nomadUpperStairExtension(p) ||
      nomadFlatBypass(p)
    );
  }
  dispose() {
    this.clearDefinition();
    if (this.ownsVisuals) this.disposeVisualChildren();
    this.scene.remove(this.root);
    this._active = false;
    this.localInteractables.length = 0;
  }
  private clearDefinition() {
    for (const c of this.colliders) this.physics?.removeCollider(c);
    this.colliders = [];
    if (this.body) this.physics?.removeBody(this.body);
    this.body = undefined;
    this.localInteractables = [];
  }
  private replaceVisual(model?: THREE.Group) {
    if (this.ownsVisuals) this.disposeVisualChildren();
    while (this.root.children.length) this.root.remove(this.root.children[0]!);
    if (!model) {
      this.ownsVisuals = false;
      return;
    }
    this.root.add(...model.children.map((child) => child));
    this.root.userData.authored = Boolean(model.userData.authored);
    this.ownsVisuals = !model.userData.authored;
  }
  private disposeVisualChildren() {
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      // Fallback geometry belongs to this destination; its Materials palette
      // belongs to the whole game. Authored clones use the loader's cache.
    });
  }
  private installDefinition() {
    if (this.physics) {
      this.body = this.physics.createDrivenBody(
        new THREE.Vector3(this.root.position.x, this.root.position.y, 0),
      );
      for (const d of this.definition.colliders)
        this.colliders.push(
          this.physics.addBoxTo(
            this.body,
            new THREE.Vector3(d.half.x, d.half.y, d.half.z),
            new THREE.Vector3(d.at.x, d.at.y, d.at.z),
          ),
        );
      for (const c of this.colliders) c.setEnabled(false);
    }
    for (const d of this.definition.interactables) {
      const anchor = this.root.getObjectByName(d.anchor);
      let local: THREE.Vector3;
      if (anchor) {
        this.root.updateWorldMatrix(true, false);
        anchor.updateWorldMatrix(true, false);
        local = this.root.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));
      } else local = new THREE.Vector3(d.fallback.x, d.fallback.y, d.fallback.z);
      this.localInteractables.push({
        id: d.id,
        label: d.label,
        kind: d.kind,
        position: new THREE.Vector3(),
        local,
      });
    }
  }
}
