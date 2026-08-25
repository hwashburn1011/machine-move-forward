import * as THREE from 'three';
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
  dispose(): void;
}

export function createPropGeometries(): PropGeometries {
  // Irregular low-poly boulder. Detail 0 keeps it chunky, matching the
  // art direction's preference for strong silhouettes over smooth surfaces.
  const rock = new THREE.IcosahedronGeometry(1, 0);
  jitterVertices(rock, 0.28, 991);

  const slab = new THREE.BoxGeometry(1, 0.34, 1.6);
  jitterVertices(slab, 0.11, 313);

  const debris = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  jitterVertices(debris, 0.2, 577);

  return {
    rock,
    slab,
    debris,
    dispose() {
      rock.dispose();
      slab.dispose();
      debris.dispose();
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
    flatShading: true,
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

  private readonly rocks: THREE.InstancedMesh;
  private readonly slabs: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  /** Small scatter held close to the machine, for the flow it makes. */
  private readonly nearField: THREE.InstancedMesh;
  /** Model props, when the packs loaded. Empty is a complete, valid state. */
  private readonly wrecks: { kind: WreckKind; mesh: THREE.InstancedMesh }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVec = new THREE.Vector3();
  private readonly posVec = new THREE.Vector3();
  private readonly quality: QualitySettings;

  constructor(
    quality: QualitySettings,
    geometries: PropGeometries,
    materials: Materials,
    models?: PropModelGeometries,
  ) {
    this.quality = quality;
    const n = quality.propsPerChunk;
    const rockCount = Math.max(1, Math.round(n * 0.55));
    const slabCount = Math.max(1, Math.round(n * 0.25));
    const debrisCount = Math.max(1, Math.round(n * 0.2));

    this.rocks = this.makeInstanced(geometries.rock, materials.rustedSteel, rockCount);
    this.slabs = this.makeInstanced(geometries.slab, materials.hullDark, slabCount);
    this.debris = this.makeInstanced(geometries.debris, materials.bareSteel, debrisCount);
    // Deliberately generous. These are small, they are cheap, and they are the
    // only things in the scene close enough to read as speed.
    this.nearField = this.makeInstanced(
      geometries.debris,
      materials.rustedSteel,
      Math.max(6, Math.round(n * 1.1)),
    );

    this.group.add(this.rocks, this.slabs, this.debris, this.nearField);

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
    const budget = Math.max(2, Math.round(this.quality.propsPerChunk * 0.45));

    for (const kind of Object.keys(WRECK_KINDS) as WreckKind[]) {
      const geometry = models[kind];
      if (!geometry) continue;
      const count = Math.max(1, Math.round(budget * WRECK_KINDS[kind].share));
      const mesh = this.makeInstanced(geometry, wreckMaterial(), count);
      this.wrecks.push({ kind, mesh });
      this.group.add(mesh);
    }
  }

  private makeInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances span the whole wide chunk; culling by the mesh's own tiny
    // bounds would pop them out of view constantly.
    mesh.frustumCulled = false;
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

    for (let i = 0; i < mesh.count; i++) {
      // Bias toward the machine rather than spreading uniformly over the full
      // 360m width — props far out to the sides are never seen, and spending
      // the instance budget there just makes the near field look empty.
      const side = rng.next() < 0.5 ? -1 : 1;
      // The near band is spread evenly across a narrow strip; the wide scatter
      // is biased hard toward the machine because props far out to the sides
      // are never looked at and spend the instance budget for nothing.
      const t = nearBand ? rng.next() : rng.next() ** 2.2;
      const x = nearBand
        ? side * (NEAR_BAND_MIN_X + t * (NEAR_BAND_MAX_X - NEAR_BAND_MIN_X))
        : side * (MACHINE_CLEARANCE_X + t * (CHUNK_SIZE_X / 2 - MACHINE_CLEARANCE_X));
      const localZ = rng.range(-CHUNK_SIZE_Z / 2, CHUNK_SIZE_Z / 2);
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
  }

  setZ(z: number): void {
    this.group.position.z = z;
  }

  dispose(): void {
    this.rocks.dispose();
    this.slabs.dispose();
    this.debris.dispose();
    this.nearField.dispose();
    for (const { mesh } of this.wrecks) mesh.dispose();
  }
}
