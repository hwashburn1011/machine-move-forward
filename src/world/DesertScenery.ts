import * as THREE from 'three';
import { Rng } from '@/core/math/Random';
import { CHUNK_SIZE_Z } from '@/game/constants';
import { chunkAspectSeed } from './WorldSeed';
import { duneHeightAt } from './DuneField';
import type { ChunkSlot } from './ChunkManager';
import {
  WorldCourseBands,
  courseBandSeed,
  renderXAt,
  WORLD_COURSE_BAND_WIDTH,
} from './WorldCourse';

export const DESERT_ARCHETYPES = [
  'ruin-house',
  'ruin-shop',
  'ruin-apartment',
  'ruin-tower',
  'ruin-factory',
  'overpass',
  'wreck-car',
  'wreck-bus',
  'wreck-tanker',
  'billboard',
  'water-sign',
  'road-sign',
  'pylon',
  'water-tower',
] as const;
export type DesertKind = (typeof DESERT_ARCHETYPES)[number];
export interface DesertModel {
  geometry: THREE.BufferGeometry;
  distant: THREE.BufferGeometry;
}
export interface DesertLibrary {
  models: Record<DesertKind, DesertModel>;
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}
export interface DesertPlacement {
  kind: DesertKind;
  x: number;
  z: number;
  width: number;
  yaw: number;
  tilt: number;
  burial: number;
  tint: number;
}

export const DESERT_MAX_PER_CHUNK = 14;
export function desertBudget(propsPerChunk: number): number {
  return Math.min(DESERT_MAX_PER_CHUNK, Math.max(5, Math.round(propsPerChunk * 0.5) + 1));
}

/** Pure seeded districts. Higher quality adds detail without relocating landmarks.
 * A footprint radius includes rotation; the starboard 8–45m band stays free for
 * outposts and their gangways. This scenery never participates in gameplay physics.
 */
export function desertLayout(
  seed: string,
  chunk: number,
  propsPerChunk: number,
): DesertPlacement[] {
  const rng = new Rng(chunkAspectSeed(seed, chunk, 'desert-district'));
  const districtRng = new Rng(chunkAspectSeed(seed, Math.floor(chunk / 3), 'desert-neighborhood'));
  const district = districtRng.int(0, 3);
  const landmarkBlock = ((chunk % 3) + 3) % 3 === 1;
  const side = districtRng.next() < 0.5 ? -1 : 1;
  const result: DesertPlacement[] = [];
  const add = (
    kind: DesertKind,
    x: number,
    z: number,
    width: number,
    yaw: number,
    burial = 0.045,
  ): void => {
    const radius = width * 0.75;
    x = Math.sign(x) * Math.max(Math.abs(x), (x > 0 ? 48 : 14) + radius);
    result.push({
      kind,
      x,
      z,
      width,
      yaw,
      burial,
      tilt: rng.signed(kind.startsWith('wreck') ? 0.12 : 0.025),
      tint: rng.range(0.78, 1),
    });
  };
  // One large, set-back silhouette, then the remains of its street or yard.
  const landmark: DesertKind =
    district === 0
      ? landmarkBlock ? 'ruin-tower' : rng.pick(['ruin-house', 'ruin-apartment'])
      : district === 1
        ? landmarkBlock ? 'ruin-factory' : rng.pick(['water-tower', 'ruin-shop'])
        : district === 2
          ? landmarkBlock ? 'overpass' : rng.pick(['pylon', 'billboard'])
          : rng.pick(['wreck-bus', 'wreck-tanker', 'road-sign']);
  add(
    landmark,
    side * rng.range(95, 115),
    rng.range(-12, 12),
    landmark === 'ruin-tower'
      ? rng.range(28, 36)
      : landmark === 'overpass'
        ? 30
        : landmark === 'ruin-factory'
          ? 25
          : landmark === 'ruin-apartment' ? rng.range(17, 22) : 10,
    rng.signed(0.3),
  );
  add(
    district === 0 ? 'ruin-apartment' : district === 3 ? 'wreck-tanker' : rng.pick(['ruin-house', 'ruin-shop']),
    side * rng.range(57, 75),
    -20,
    district === 0 ? rng.range(17, 22) : rng.range(10, 14),
    rng.signed(0.15),
    rng.range(0.035, 0.14),
  );
  add(
    rng.pick(['wreck-car', 'wreck-bus', 'wreck-tanker']),
    -rng.range(23, 32),
    rng.range(-20, 18),
    rng.range(6, 9),
    rng.signed(0.5),
    0.09,
  );
  add(
    rng.pick(['billboard', 'water-sign', 'road-sign']),
    rng.next() < 0.5 ? -40 : 65,
    19,
    rng.range(5, 9),
    rng.signed(0.3),
    0.02,
  );
  add(
    district === 3 ? rng.pick(['wreck-bus', 'billboard']) : rng.pick(['ruin-house', 'ruin-apartment']),
    -side * rng.range(83, 105),
    -17,
    district === 3 ? rng.range(5, 10) : rng.range(12, 18),
    rng.signed(0.2),
    0.1,
  );
  add('wreck-car', side * 58, 18, rng.range(5, 6.5), rng.signed(1), 0.14);
  add(
    district === 0 ? 'ruin-apartment' : district === 1 ? 'pylon' : district === 3 ? 'wreck-car' : 'water-tower',
    side * 142,
    22,
    district === 0 ? rng.range(18, 23) : rng.range(6, 9),
    rng.signed(0.15),
  );
  add('ruin-house', side * 77, 25, rng.range(8, 11), Math.PI / 2 + rng.signed(0.1), 0.2);
  add(
    rng.pick(['wreck-bus', 'wreck-tanker']),
    -side * 74,
    14,
    rng.range(10, 12),
    Math.PI / 2 + rng.signed(0.2),
    0.13,
  );
  add('wreck-car', -20, 27, 5.2, rng.signed(1.3), 0.16);
  add('ruin-shop', -side * 113, -22, rng.range(9, 12), rng.signed(0.4), 0.15);
  add('wreck-car', -side * 93, 29, 5.5, rng.signed(2), 0.18);
  add('ruin-shop', -side * 146, -27, 10, rng.signed(0.2), 0.15);
  add('ruin-house', side * 150, -24, 10, rng.signed(0.2), 0.22);
  return result.slice(0, desertBudget(propsPerChunk));
}

interface Instance {
  id: number;
  chunk: number;
  bandIndex: number;
  worldX: number;
  groundY: number;
  placement: DesertPlacement;
  matrix: THREE.Matrix4;
  distant: boolean;
}

/** One shared geometry buffer and atlas across all nine chunks, including LODs.
 * Scroll the parent every frame, rebase instance matrices only once per 64m.
 * Recycling changes bounded instance records, never uploads new mesh geometry.
 */
export class DesertScenery {
  readonly group = new THREE.Group();
  readonly batch: THREE.BatchedMesh;
  private readonly geometryIds = new Map<DesertKind, readonly [number, number]>();
  private readonly slots = new Map<string, Instance[]>();
  private readonly slotContents = new Map<string, string>();
  private readonly courseBands = new WorldCourseBands();
  private syncedSlots: readonly ChunkSlot[] = [];
  private syncedSeed = '';
  private syncedPropsPerChunk = 0;
  private originChunk = 0;
  private distance = 0;
  private lastLodDistance = Infinity;
  private readonly color = new THREE.Color();

  constructor(
    private readonly library: DesertLibrary,
    chunkCount: number,
  ) {
    let vertices = 0;
    let indices = 0;
    for (const model of Object.values(library.models)) {
      for (const geometry of [model.geometry, model.distant]) {
        vertices += geometry.getAttribute('position').count;
        indices += geometry.index!.count;
      }
    }
    this.batch = new THREE.BatchedMesh(
      chunkCount * this.courseBands.slots.length * DESERT_MAX_PER_CHUNK,
      vertices,
      indices,
      library.material,
    );
    this.batch.name = 'Desert ruins · shared atlas and distance LODs';
    this.batch.castShadow = true;
    this.batch.receiveShadow = true;
    // Per-object culling still runs inside the batch; a huge aggregate bound
    // must not hide a nearby ruin after a floating-origin rebase.
    this.batch.frustumCulled = false;
    this.batch.sortObjects = false;
    for (const kind of DESERT_ARCHETYPES) {
      const model = library.models[kind];
      this.geometryIds.set(kind, [
        this.batch.addGeometry(model.geometry),
        this.batch.addGeometry(model.distant),
      ]);
    }
    this.group.name = 'Abandoned desert districts';
    this.group.add(this.batch);
  }

  syncSlots(slots: readonly ChunkSlot[], seed: string, propsPerChunk: number, force = false): void {
    this.syncedSlots = slots;
    this.syncedSeed = seed;
    this.syncedPropsPerChunk = propsPerChunk;
    for (const slot of slots)
      for (const band of this.courseBands.slots)
        this.syncBand(slot, band.slotId, band.bandIndex, seed, propsPerChunk, force);
    this.updateLods(true);
  }

  private syncBand(
    slot: ChunkSlot,
    bandSlotId: number,
    bandIndex: number,
    seed: string,
    propsPerChunk: number,
    force: boolean,
  ): void {
    const key = `${slot.slotId}:${bandSlotId}`;
    const identity = `${slot.chunkIndex}:${bandIndex}`;
    if (!force && this.slotContents.get(key) === identity) return;
    for (const instance of this.slots.get(key) ?? []) this.batch.deleteInstance(instance.id);
    const bandSeed = courseBandSeed(seed, bandIndex);
    const instances = desertLayout(bandSeed, slot.chunkIndex, propsPerChunk).map((placement) => {
      const id = this.batch.addInstance(this.geometryIds.get(placement.kind)![0]);
      const geometry = this.library.models[placement.kind].geometry;
      const half = placement.width * 0.32;
      const worldZ = slot.chunkIndex * CHUNK_SIZE_Z + placement.z;
      const worldX = bandIndex * WORLD_COURSE_BAND_WIDTH + placement.x;
      // Seat broad structures against the surrounding dune, leaving their
      // lower walls swallowed by sand instead of hanging above a trough.
      let ground = duneHeightAt(worldX, worldZ);
      for (const dx of [-half, half]) {
        for (const dz of [-half, half])
          ground = Math.min(ground, duneHeightAt(worldX + dx, worldZ + dz));
      }
      const height = geometry.boundingBox!.max.y * placement.width;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(worldX, ground - height * placement.burial, placement.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placement.yaw, placement.tilt)),
        new THREE.Vector3().setScalar(placement.width),
      );
      this.batch.setColorAt(
        id,
        this.color.setRGB(placement.tint, placement.tint * 0.98, placement.tint * 0.94),
      );
      const instance = {
        id,
        chunk: slot.chunkIndex,
        bandIndex,
        worldX,
        groundY: ground,
        placement,
        matrix,
        distant: false,
      };
      this.place(instance);
      return instance;
    });
    this.slots.set(key, instances);
    this.slotContents.set(key, identity);
  }

  setDistance(distance: number, renderOffset = 0): void {
    this.distance = distance;
    const origin = Math.floor(distance / CHUNK_SIZE_Z);
    if (origin !== this.originChunk) {
      this.originChunk = origin;
      for (const instances of this.slots.values())
        for (const instance of instances) this.place(instance);
    }
    this.group.position.z = distance - origin * CHUNK_SIZE_Z + renderOffset;
    this.updateLods(false);
  }

  setLateralOffset(offset: number): void {
    const lateral = Number.isFinite(offset) ? offset : 0;
    const recycled = this.courseBands.advance(lateral);
    this.group.position.x = -lateral;
    if (recycled.length && this.syncedSlots.length) {
      for (const slot of this.syncedSlots)
        for (const band of recycled)
          this.syncBand(
            slot,
            band.slotId,
            band.bandIndex,
            this.syncedSeed,
            this.syncedPropsPerChunk,
            false,
          );
      this.updateLods(true);
    }
  }

  /** Readonly diagnostics for streaming and real-matrix acceptance tests. */
  get placementSnapshot(): readonly {
    bandIndex: number;
    worldX: number;
    renderX: number;
    worldZ: number;
    y: number;
    groundY: number;
  }[] {
    const out: {
      bandIndex: number;
      worldX: number;
      renderX: number;
      worldZ: number;
      y: number;
      groundY: number;
    }[] = [];
    for (const instances of this.slots.values())
      for (const instance of instances)
        out.push({
          bandIndex: instance.bandIndex,
          worldX: instance.worldX,
          renderX: renderXAt(instance.worldX, -this.group.position.x),
          worldZ: instance.chunk * CHUNK_SIZE_Z + instance.placement.z,
          y: instance.matrix.elements[13]!,
          groundY: instance.groundY,
        });
    return out;
  }

  private place(instance: Instance): void {
    instance.matrix.elements[14] =
      (instance.chunk + this.originChunk) * CHUNK_SIZE_Z + instance.placement.z;
    this.batch.setMatrixAt(instance.id, instance.matrix);
  }

  private updateLods(force: boolean): void {
    if (!force && Math.abs(this.distance - this.lastLodDistance) < 2) return;
    this.lastLodDistance = this.distance;
    for (const instances of this.slots.values())
      for (const instance of instances) {
        const p = instance.placement;
        const distance = Math.hypot(
          renderXAt(instance.worldX, -this.group.position.x),
          instance.chunk * CHUNK_SIZE_Z + p.z + this.distance,
        );
        const distant = distance > (instance.distant ? 116 : 136);
        if (distant === instance.distant) continue;
        instance.distant = distant;
        this.batch.setGeometryIdAt(instance.id, this.geometryIds.get(p.kind)![distant ? 1 : 0]);
      }
  }

  dispose(): void {
    this.batch.dispose();
    this.group.clear();
    this.slots.clear();
    this.slotContents.clear();
    this.syncedSlots = [];
  }
}
