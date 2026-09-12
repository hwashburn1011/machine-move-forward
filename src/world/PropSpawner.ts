import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '@/core/math/Random';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '@/game/constants';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import type { Materials } from '@/art/Materials';
import { chunkAspectSeed } from './WorldSeed';
import { duneHeightAt, PROP_SINK } from './DuneField';
import type { PropModelGeometries } from './PropModels';

/**
 * Scattered rocks and wreck debris for one terrain chunk.
 *
 * Everything is instanced. Handoff section 39 is explicit that one draw call
 * per prop is a failure mode, and with 9 live chunks it would be hundreds of
 * calls for objects the player mostly sees in passing.
 *
 * Geometry is created once and shared across every chunk; recycling only
 * rewrites instance matrices.
 */

/**
 * Props are kept out of this half-width corridor so none spawn inside the
 * machine.
 *
 * The hull is 10m wide and the legs swing out to about 7m, so this is as close
 * as anything can be scattered without standing in the machine.
 */
const MACHINE_CLEARANCE_X = 8;

/**
 * A band of small scatter kept deliberately close, and why it exists.
 *
 * This is the fix for the machine reading as stationary while the world drifts
 * past. Self-motion is read from OPTIC FLOW — the angular rate at which things
 * sweep across the eye — and that rate is speed divided by distance. At 7.5
 * m/s a rock 10m away sweeps past at 43 degrees a second; the same rock at
 * 130m sweeps at 3. Measured before this existed, the median thing in view was
 * 127m away and the median flow was 1.74 degrees a second, which is the rate
 * of a clock's minute hand. Nothing about that reads as travelling.
 *
 * The wide scatter is still what fills the horizon. This is a second, denser
 * population confined to the band where the arithmetic actually pays: close
 * enough to sweep, far enough not to be inside the machine.
 */
const NEAR_BAND_MIN_X = MACHINE_CLEARANCE_X;
const NEAR_BAND_MAX_X = 26;

export interface PropGeometries {
  rock: THREE.BufferGeometry;
  slab: THREE.BufferGeometry;
  debris: THREE.BufferGeometry;
  scrap: THREE.BufferGeometry;
  scrub: THREE.BufferGeometry;
  dispose(): void;
}

export function createPropGeometries(): PropGeometries {
  // An eroded icosphere gives boulders a rounded silhouette while the seeded
  // radial distortion keeps them from reading as repeated golf balls. Detail
  // 3 is still inexpensive when instanced and avoids the sharp tetrahedron
  // profile of the former detail-0 primitive.
  const rockSource = new THREE.IcosahedronGeometry(1, 3);
  const rock = BufferGeometryUtils.mergeVertices(rockSource);
  rockSource.dispose();
  erodeBoulder(rock, 991);

  const slab = new THREE.BoxGeometry(1, 0.34, 1.6, 2, 1, 2);
  softenEdges(slab, 313, 0.08);

  const debris = new THREE.BoxGeometry(0.5, 0.5, 0.5, 1, 1, 1);
  softenEdges(debris, 577, 0.12);

  // Scrap is a compact, bent-sheet archetype: a folded plate, short pipe and
  // a brace. Merging them keeps it to one instanced draw while its silhouette
  // has more construction logic than another cube.
  const scrapParts = [
    new THREE.BoxGeometry(0.8, 0.08, 0.45),
    new THREE.CylinderGeometry(0.08, 0.11, 0.7, 8),
    new THREE.BoxGeometry(0.12, 0.5, 0.12),
  ];
  scrapParts[0]!.rotateZ(-0.18);
  scrapParts[0]!.translate(0, 0.18, 0);
  scrapParts[1]!.rotateZ(Math.PI / 2);
  scrapParts[1]!.translate(0.12, 0.12, 0);
  scrapParts[2]!.rotateZ(0.3);
  scrapParts[2]!.translate(-0.28, 0.25, 0.12);
  const scrap = BufferGeometryUtils.mergeGeometries(scrapParts, false) ?? debris.clone();
  for (const part of scrapParts) part.dispose();
  scrap.computeVertexNormals();

  // Three tapered branches crossing at the root make a sparse dry scrub tuft.
  // It is intentionally a small 3D form rather than a camera-facing card, so
  // silhouettes hold up in grazing views without a texture dependency.
  const scrubParts: THREE.BufferGeometry[] = [];
  for (const [yaw, lean] of [
    [0, 0.22],
    [2.1, -0.16],
    [4.2, 0.12],
  ] as const) {
    const branch = new THREE.CylinderGeometry(0.018, 0.07, 0.9, 5, 1);
    branch.rotateZ(lean);
    branch.rotateY(yaw);
    branch.translate(0, 0.42, 0);
    scrubParts.push(branch);
  }
  const scrub = BufferGeometryUtils.mergeGeometries(scrubParts, false) ?? debris.clone();
  for (const part of scrubParts) part.dispose();
  scrub.computeVertexNormals();

  return {
    rock,
    slab,
    debris,
    scrap,
    scrub,
    dispose() {
      rock.dispose();
      slab.dispose();
      debris.dispose();
      scrap.dispose();
      scrub.dispose();
    },
  };
}

/** Push vertices around so instances do not read as identical primitives. */
function jitterVertices(geo: THREE.BufferGeometry, amount: number, seed: number): void {
  const rng = new Rng(seed);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + rng.signed(amount),
      pos.getY(i) + rng.signed(amount),
      pos.getZ(i) + rng.signed(amount),
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function erodeBoulder(geo: THREE.BufferGeometry, seed: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const phase = seed * 0.017;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const length = Math.max(Math.sqrt(x * x + y * y + z * z), 1e-5);
    const dx = x / length,
      dy = y / length,
      dz = z / length;
    // A continuous surface keeps shared positions together; independent
    // per-vertex randomness tore the old boulders into triangular shards.
    const broad = 0.93 + Math.sin(dx * 4.1 + dz * 2.7 + phase) * 0.11;
    const erosion = Math.sin(dz * 8 + dy * 4 + phase) * Math.sin(dx * 6 - dy * 3) * 0.035;
    pos.setXYZ(
      i,
      dx * (broad + erosion),
      dy * (0.72 + broad * 0.2 + erosion),
      dz * (broad + erosion),
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

function softenEdges(geo: THREE.BufferGeometry, seed: number, amount: number): void {
  jitterVertices(geo, amount, seed);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/**
 * The one material every model prop draws with.
 *
 * Shared, because there are nine prop spawners alive at once and they would
 * otherwise be nine identical materials and nine shader programs. Vertex
 * colours because the packs carry their palette that way — `PropModels` bakes
 * each primitive's material colour into the mesh — and a warm tint on top,
 * which pulls three different authors' palettes into one sun-bleached, rusted
 * desert instead of leaving them looking like three different downloads.
 */
let sharedWreckMaterial: THREE.MeshStandardMaterial | null = null;
function wreckMaterial(): THREE.MeshStandardMaterial {
  sharedWreckMaterial ??= new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: new THREE.Color(0.82, 0.6, 0.45),
    roughness: 0.93,
    metalness: 0.06,
    // Authored normals and smooth procedural boulders should reach the PBR
    // shader intact; hard edges belong in the exported normals, not here.
    flatShading: false,
  });
  return sharedWreckMaterial;
}

/**
 * How far each kind of wreck sinks into the sand, as a fraction of its own
 * height, and how big it is.
 *
 * The burial is the whole point of these: a world the sand has swallowed, not
 * a world with objects sitting on it. A hull buried to a third of its height
 * reads as wreckage the desert is taking; the same hull sitting on the surface
 * reads as a model on a table.
 */
const WRECK_KINDS = {
  wreck: { share: 0.16, minScale: 9, maxScale: 17, sink: 0.34, tilt: 0.26 },
  containers: { share: 0.3, minScale: 4, maxScale: 7.5, sink: 0.26, tilt: 0.16 },
  debris: { share: 0.54, minScale: 1.6, maxScale: 3.4, sink: 0.2, tilt: 0.3 },
} as const;

type WreckKind = keyof typeof WRECK_KINDS;

export class PropSpawner {
  readonly group = new THREE.Group();

  private rocks: THREE.InstancedMesh;
  private slabs: THREE.InstancedMesh;
  private debris: THREE.InstancedMesh;
  private scrap: THREE.InstancedMesh;
  private scrub: THREE.InstancedMesh;
  /** Small scatter held close to the machine, for the flow it makes. */
  private nearField: THREE.InstancedMesh;
  /** Model props, when the packs loaded. Empty is a complete, valid state. */
  private readonly wrecks: { kind: WreckKind; mesh: THREE.InstancedMesh }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVec = new THREE.Vector3();
  private readonly posVec = new THREE.Vector3();
  private quality: QualitySettings;
  private readonly geometries: PropGeometries;
  private readonly materials: Materials;
  private models: PropModelGeometries | null = null;

  constructor(
    quality: QualitySettings,
    geometries: PropGeometries,
    materials: Materials,
    models?: PropModelGeometries,
  ) {
    this.quality = quality;
    this.geometries = geometries;
    this.materials = materials;
    const n = quality.propsPerChunk;
    const rockCount = Math.max(1, Math.round(n * 0.55));
    const slabCount = Math.max(1, Math.round(n * 0.18));
    const debrisCount = Math.max(1, Math.round(n * 0.14));
    const scrapCount = Math.max(1, Math.round(n * 0.08));
    const scrubCount = Math.max(1, Math.round(n * 0.05));

    this.rocks = this.makeInstanced(geometries.rock, materials.rustedSteel, rockCount, true);
    this.slabs = this.makeInstanced(geometries.slab, materials.hullDark, slabCount, true);
    this.debris = this.makeInstanced(geometries.debris, materials.bareSteel, debrisCount, false);
    this.scrap = this.makeInstanced(geometries.scrap, materials.rustedSteel, scrapCount, false);
    this.scrub = this.makeInstanced(geometries.scrub, materials.rustedSteel, scrubCount, false);
    // Deliberately generous. These are small, they are cheap, and they are the
    // only things in the scene close enough to read as speed.
    this.nearField = this.makeInstanced(
      geometries.debris,
      materials.rustedSteel,
      Math.max(6, Math.round(n * 1.1)),
      false,
    );

    this.group.add(this.rocks, this.slabs, this.debris, this.scrap, this.scrub, this.nearField);

    if (models) this.attachModels(models);
  }

  /**
   * Hang the model props on, once their packs have loaded.
   *
   * Separate from the constructor because the world is built synchronously at
   * boot and the packs are fetched. Wrecks are added ON TOP of the procedural
   * scatter rather than replacing it: the rocks and slabs are what fill the
   * middle distance cheaply, and these are the few things worth looking at.
   */
  attachModels(models: PropModelGeometries): void {
    this.models = models;
    for (const { mesh } of this.wrecks) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.wrecks.length = 0;
    const budget = Math.max(2, Math.round(this.quality.propsPerChunk * 0.45));

    for (const kind of Object.keys(WRECK_KINDS) as WreckKind[]) {
      const template = models.templates?.[kind];
      const geometry = template?.geometry ?? models[kind];
      if (!geometry) continue;
      const count = Math.max(1, Math.round(budget * WRECK_KINDS[kind].share));
      const mesh = this.makeInstanced(
        geometry,
        template?.material ?? wreckMaterial(),
        count,
        kind === 'wreck',
      );
      this.wrecks.push({ kind, mesh });
      this.group.add(mesh);
    }
  }

  /**
   * Rebuild only this chunk's instance buffers after a quality transition.
   * The seed and chunk index are supplied by WorldManager, so the same slot
   * gets the same authored scatter at every quality tier.
   */
  applyQuality(quality: QualitySettings, worldSeed: string, chunkIndex: number): void {
    if (quality.propsPerChunk === this.quality.propsPerChunk) return;
    this.quality = quality;

    for (const mesh of [
      this.rocks,
      this.slabs,
      this.debris,
      this.scrap,
      this.scrub,
      this.nearField,
    ]) {
      this.group.remove(mesh);
      mesh.dispose();
    }

    const n = quality.propsPerChunk;
    const rockCount = Math.max(1, Math.round(n * 0.55));
    const slabCount = Math.max(1, Math.round(n * 0.18));
    const debrisCount = Math.max(1, Math.round(n * 0.14));
    const scrapCount = Math.max(1, Math.round(n * 0.08));
    const scrubCount = Math.max(1, Math.round(n * 0.05));
    this.rocks = this.makeInstanced(
      this.geometries.rock,
      this.materials.rustedSteel,
      rockCount,
      true,
    );
    this.slabs = this.makeInstanced(this.geometries.slab, this.materials.hullDark, slabCount, true);
    this.debris = this.makeInstanced(
      this.geometries.debris,
      this.materials.bareSteel,
      debrisCount,
      false,
    );
    this.scrap = this.makeInstanced(
      this.geometries.scrap,
      this.materials.rustedSteel,
      scrapCount,
      false,
    );
    this.scrub = this.makeInstanced(
      this.geometries.scrub,
      this.materials.rustedSteel,
      scrubCount,
      false,
    );
    this.nearField = this.makeInstanced(
      this.geometries.debris,
      this.materials.rustedSteel,
      Math.max(6, Math.round(n * 1.1)),
      false,
    );
    this.group.add(this.rocks, this.slabs, this.debris, this.scrap, this.scrub, this.nearField);
    if (this.models) this.attachModels(this.models);
    this.populate(worldSeed, chunkIndex);
  }

  private makeInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    castShadow: boolean,
  ): THREE.InstancedMesh {
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    // Tiny repeated decor is intentionally receive-only. Large rocks and
    // wrecks keep the contact shadow that sells their scale without making
    // every pebble consume a shadow pass.
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Repopulate for a new chunk. Called on every recycle, so this must not
   * allocate — hence the reused Matrix4/Quaternion/Vector3 members.
   */
  /**
   * Repopulate for a new chunk. Called on every recycle, so this must not
   * allocate — hence the reused Matrix4/Quaternion/Vector3 members.
   *
   * Takes the chunk's INDEX, not where it is drawn: props are seated on the
   * dune field, and that field is a function of permanent world position.
   */
  populate(worldSeed: string, chunkIndex: number): void {
    this.fill(this.rocks, worldSeed, chunkIndex, 'rock', 0.8, 3.4);
    this.fill(this.slabs, worldSeed, chunkIndex, 'slab', 1.2, 3.0);
    this.fill(this.debris, worldSeed, chunkIndex, 'debris', 0.5, 1.4);
    this.fill(this.scrap, worldSeed, chunkIndex, 'scrap', 0.7, 1.8);
    this.fill(this.scrub, worldSeed, chunkIndex, 'scrub', 0.55, 1.35);
    this.fill(this.nearField, worldSeed, chunkIndex, 'near', 0.35, 1.1, undefined, true);

    for (const { kind, mesh } of this.wrecks) {
      const spec = WRECK_KINDS[kind];
      this.fill(mesh, worldSeed, chunkIndex, `wreck-${kind}`, spec.minScale, spec.maxScale, spec);
    }
  }

  private fill(
    mesh: THREE.InstancedMesh,
    worldSeed: string,
    chunkIndex: number,
    aspect: string,
    minScale: number,
    maxScale: number,
    wreck?: { sink: number; tilt: number },
    nearBand = false,
  ): void {
    const rng = new Rng(chunkAspectSeed(worldSeed, chunkIndex, aspect));
    const clusterCount = Math.max(2, Math.min(7, Math.ceil(mesh.count / 3)));
    const clusters: { x: number; z: number; archetype: number }[] = [];
    for (let c = 0; c < clusterCount; c++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const x =
        side *
        (nearBand
          ? rng.range(NEAR_BAND_MIN_X, NEAR_BAND_MAX_X)
          : rng.range(MACHINE_CLEARANCE_X + 3, CHUNK_SIZE_X / 2 - 5));
      const z = rng.range(-CHUNK_SIZE_Z / 2, CHUNK_SIZE_Z / 2);
      clusters.push({ x, z, archetype: rng.int(0, 2) });
    }

    for (let i = 0; i < mesh.count; i++) {
      // Pick from a small set of deterministic cluster archetypes rather than
      // drawing an independent uniform point for every instance. This makes
      // scrub washes, rock groups and industrial trails read as authored
      // arrangements while remaining a pure function of seed and chunk.
      const cluster = clusters[i % clusters.length]!;
      const archetype = cluster.archetype;
      const spread = nearBand ? 3.5 : archetype === 0 ? 5.5 : archetype === 1 ? 9 : 3;
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * spread;
      const side = cluster.x < 0 ? -1 : 1;
      const rawX = cluster.x + Math.cos(angle) * radius;
      const x = side * Math.max(MACHINE_CLEARANCE_X + (nearBand ? 0 : 1.5), Math.abs(rawX));
      const localZ = cluster.z + Math.sin(angle) * radius;
      // The prop's permanent place in the world, not where its chunk happens
      // to be drawn right now. The dune field is a function of the former, so
      // sampling the latter would seat every prop against a surface that is no
      // longer under it by the time it is seen.
      const worldZ = chunkIndex * CHUNK_SIZE_Z + localZ;

      const scale = rng.range(minScale, maxScale);
      // Model props are normalised to stand on y = 0 with a one-metre
      // footprint, so their burial is a fraction of their own size and varies
      // per instance: a field where everything is sunk to the same line reads
      // as a waterline, not as sand.
      const sink = wreck ? scale * wreck.sink * rng.range(0.55, 1.45) : PROP_SINK * scale;
      const y = duneHeightAt(x, worldZ) - sink;
      const tilt = wreck?.tilt ?? 0.25;

      this.posVec.set(x, y, localZ);
      this.euler.set(rng.signed(tilt), rng.range(0, Math.PI * 2), rng.signed(tilt));
      this.quat.setFromEuler(this.euler);
      // Non-uniform scale so instances of one mesh do not read as clones.
      this.scaleVec.set(
        scale,
        scale * rng.range(wreck ? 0.85 : 0.6, wreck ? 1.15 : 1.05),
        scale * rng.range(0.8, 1.2),
      );

      this.matrix.compose(this.posVec, this.quat, this.scaleVec);
      mesh.setMatrixAt(i, this.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    // Instance transforms change on every recycle. Rebuilding the bounds is
    // what makes frustum culling safe without carrying a chunk-wide sphere.
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  setZ(z: number): void {
    this.group.position.z = z;
  }

  dispose(): void {
    this.rocks.dispose();
    this.slabs.dispose();
    this.debris.dispose();
    this.scrap.dispose();
    this.scrub.dispose();
    this.nearField.dispose();
    for (const { mesh } of this.wrecks) mesh.dispose();
  }
}
