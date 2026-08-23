import * as THREE from 'three';
import { Rng } from '@/core/math/Random';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '@/game/constants';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import type { Materials } from '@/art/Materials';
import { chunkAspectSeed } from './WorldSeed';
import { duneHeightAt, PROP_SINK } from './DuneField';

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

/** Props are kept out of this half-width corridor so none spawn inside the machine. */
const MACHINE_CLEARANCE_X = 11;

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

export class PropSpawner {
  readonly group = new THREE.Group();

  private readonly rocks: THREE.InstancedMesh;
  private readonly slabs: THREE.InstancedMesh;
  private readonly debris: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVec = new THREE.Vector3();
  private readonly posVec = new THREE.Vector3();

  constructor(
    quality: QualitySettings,
    geometries: PropGeometries,
    materials: Materials,
  ) {
    const n = quality.propsPerChunk;
    const rockCount = Math.max(1, Math.round(n * 0.55));
    const slabCount = Math.max(1, Math.round(n * 0.25));
    const debrisCount = Math.max(1, Math.round(n * 0.2));

    this.rocks = this.makeInstanced(geometries.rock, materials.rustedSteel, rockCount);
    this.slabs = this.makeInstanced(geometries.slab, materials.hullDark, slabCount);
    this.debris = this.makeInstanced(geometries.debris, materials.bareSteel, debrisCount);

    this.group.add(this.rocks, this.slabs, this.debris);
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
  populate(worldSeed: string, chunkIndex: number, chunkZ: number): void {
    this.fill(this.rocks, worldSeed, chunkIndex, chunkZ, 'rock', 0.8, 3.4);
    this.fill(this.slabs, worldSeed, chunkIndex, chunkZ, 'slab', 1.2, 3.0);
    this.fill(this.debris, worldSeed, chunkIndex, chunkZ, 'debris', 0.5, 1.4);
  }

  private fill(
    mesh: THREE.InstancedMesh,
    worldSeed: string,
    chunkIndex: number,
    chunkZ: number,
    aspect: string,
    minScale: number,
    maxScale: number,
  ): void {
    const rng = new Rng(chunkAspectSeed(worldSeed, chunkIndex, aspect));

    for (let i = 0; i < mesh.count; i++) {
      // Bias toward the machine rather than spreading uniformly over the full
      // 360m width — props far out to the sides are never seen, and spending
      // the instance budget there just makes the near field look empty.
      const side = rng.next() < 0.5 ? -1 : 1;
      const t = rng.next() ** 2.2;
      const x = side * (MACHINE_CLEARANCE_X + t * (CHUNK_SIZE_X / 2 - MACHINE_CLEARANCE_X));
      const localZ = rng.range(-CHUNK_SIZE_Z / 2, CHUNK_SIZE_Z / 2);
      const worldZ = chunkZ + localZ;

      const scale = rng.range(minScale, maxScale);
      const y = duneHeightAt(x, worldZ) - PROP_SINK * scale;

      this.posVec.set(x, y, localZ);
      this.euler.set(rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25));
      this.quat.setFromEuler(this.euler);
      // Non-uniform scale so instances of one mesh do not read as clones.
      this.scaleVec.set(scale, scale * rng.range(0.6, 1.05), scale * rng.range(0.8, 1.2));

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
  }
}
