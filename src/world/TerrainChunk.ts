import * as THREE from 'three';
import { PALETTE } from '@/art/Palette';
import { applyHeightFog } from '@/art/Fog';
import {
  TERRAIN_FRAGMENT_MAIN,
  TERRAIN_FRAGMENT_PARS,
  TERRAIN_NOISE,
  TERRAIN_VERTEX_MAIN,
  TERRAIN_VERTEX_PARS,
} from '@/art/shaders/terrainShader';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '@/game/constants';
import { DUNE_PARAMS } from './DuneField';
import { hashSeed } from '@/core/math/Random';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import type { TextureSet } from '@/art/TextureLoader';

/**
 * One recycled slab of dune terrain.
 *
 * Purely visual: no collider, no CPU height sampling. Nothing in the game can
 * reach the ground (handoff section 27 keeps MVP terrain mechanically flat),
 * so paying for collision here would buy nothing.
 */
export class TerrainChunk {
  readonly mesh: THREE.Mesh;

  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(
    quality: QualitySettings,
    sharedGeometry: THREE.BufferGeometry,
    worldSeed = 'default-world',
  ) {
    const terrainSeed = (hashSeed(worldSeed, 'terrain-macro') % 100000) / 100000;
    const rippleOrientation = (hashSeed(worldSeed, 'terrain-ripple') % 100000) / 100000;
    this.uniforms = {
      uChunkOffset: { value: 0 },
      // The chunk's permanent world origin, as distinct from where it is
      // currently drawn. The dune field is a function of this one.
      uChunkWorldZ: { value: 0 },
      // Structural sand detail is frozen in world space. Motion belongs to
      // airborne dust and heat shimmer, never to the ground normal.
      uTerrainSeed: { value: terrainSeed },
      uMacroStrength: { value: 0.08 },
      uRippleOrientation: { value: rippleOrientation * Math.PI * 2 },
      // Shared with the CPU height function in DuneField, so props sit on the
      // same surface the GPU draws.
      uDuneScale: { value: DUNE_PARAMS.scale },
      uDuneHeight: { value: DUNE_PARAMS.height },
      uRidgeHeight: { value: DUNE_PARAMS.ridgeHeight },
      uCorridorInner: { value: DUNE_PARAMS.corridorInner },
      uCorridorOuter: { value: DUNE_PARAMS.corridorOuter },
      uRippleStrength: { value: 0.42 },
      uSandLit: { value: PALETTE.sandLit.clone() },
      uSandShadow: { value: PALETTE.sandShadow.clone() },
      uSandDeep: { value: PALETTE.sandDeep.clone() },
      uSandCrest: { value: PALETTE.sandCrest.clone() },
      uSunDir: { value: new THREE.Vector3(0.78, 0.5, 0.37).normalize() },
      // Sand scan. Null until the textures land, and the shader does not read
      // them until the define below says they are there.
      uSandMap: { value: null },
      uSandNormalMap: { value: null },
      uSandArmMap: { value: null },
      // How much of the scan reaches the surface. Blotching is the big one:
      // it is what stops a distant dune reading as flat colour.
      uSandBlotch: { value: 0.34 },
      uSandGrain: { value: 0.9 },
      uSandNormalStrength: { value: 0.55 },
    };

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
    });

    material.onBeforeCompile = (shader) => {
      for (const [k, v] of Object.entries(this.uniforms)) shader.uniforms[k] = v;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_NOISE}\n${TERRAIN_VERTEX_PARS}`)
        // Displacement must land after begin_vertex (which declares
        // `transformed`) and after beginnormal_vertex (which declares
        // `objectNormal`), since it overwrites both.
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TERRAIN_VERTEX_MAIN}`);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${TERRAIN_NOISE}\n${TERRAIN_FRAGMENT_PARS}`,
        )
        // After normal_fragment_maps so `normal` exists and can be perturbed,
        // and before the lighting chunks so the perturbation actually shades.
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>\n${TERRAIN_FRAGMENT_MAIN}`,
        );
    };

    // Distinct tag: without it this material shares a compiled program with
    // any other map-less MeshStandardMaterial that also has height fog (the
    // tread rubber, for one) and loses its dune shader entirely.
    applyHeightFog(material, 'terrain-dunes');

    this.mesh = new THREE.Mesh(sharedGeometry, material);
    this.mesh.receiveShadow = true;
    // Terrain casting shadows onto itself is expensive and, at this sun angle
    // and dune scale, essentially invisible.
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    void quality;
  }

  /**
   * Move this chunk, and tell it which piece of world it is now showing.
   *
   * Two numbers, and keeping them apart is the whole point. `renderZ` is where
   * the slab is drawn and slides toward -Z as the machine travels; `worldZ` is
   * the permanent origin of the ground it represents and does not move at all.
   * The dune field is evaluated against the second, so a dune keeps its shape
   * while the mesh carrying it slides past. Evaluated against the first — which
   * is what this did — the field is pinned to the machine and the landscape
   * never moves, however fast the mesh slides through it.
   *
   * The geometry is still never rebuilt; only these two uniforms change, which
   * is what makes recycling free.
   */
  setZ(renderZ: number, worldZ: number): void {
    this.mesh.position.z = renderZ;
    this.uniforms.uChunkOffset!.value = renderZ;
    this.uniforms.uChunkWorldZ!.value = worldZ;
  }

  /**
   * Give the dunes their photographed surface.
   *
   * Late rather than in the constructor, because the world is built
   * synchronously at boot and the textures are fetched. Same bargain as
   * everywhere else in `ASSETS.md`: until this arrives — or if it never does,
   * or with `?notex=1` — the dunes are exactly what they always were, which is
   * a complete procedural surface rather than a placeholder.
   */
  applySand(set: TextureSet): void {
    this.uniforms.uSandMap!.value = set.map;
    this.uniforms.uSandNormalMap!.value = set.normalMap;
    this.uniforms.uSandArmMap!.value = set.armMap;

    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.defines = { ...material.defines, TERRAIN_SAND_TEXTURE: '' };
    // A define is a compile-time thing, so this is the recompile. Once per
    // chunk material at boot, and Three caches by program key, so the nine
    // chunks share one compile between them.
    material.needsUpdate = true;
  }

  setSunDirection(dir: THREE.Vector3): void {
    (this.uniforms.uSunDir!.value as THREE.Vector3).copy(dir).normalize();
  }

  update(elapsed: number): void {
    // Kept as a stable world-update seam for WorldManager. Terrain normals and
    // ripples intentionally do not animate; moving sand is handled by SandFX.
    void elapsed;
  }

  dispose(): void {
    (this.mesh.material as THREE.Material).dispose();
  }

  /**
   * One geometry shared by every chunk. Built with the plane already rotated
   * into XZ so the shader can treat `position.xz` as world-space directly.
   */
  static createGeometry(quality: QualitySettings): THREE.BufferGeometry {
    const segZ = quality.terrainSegments;
    // The chunk is 5.6x wider than it is deep, but detail matters far more
    // along the travel axis than out to the sides, so lateral density is cut
    // hard. At 0.35 this was 64k tris per chunk; at 0.20 it is ~21k with no
    // visible difference.
    const segX = Math.round(segZ * (CHUNK_SIZE_X / CHUNK_SIZE_Z) * 0.2);
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE_X, CHUNK_SIZE_Z, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
}
