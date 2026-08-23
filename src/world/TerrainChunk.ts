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
import type { QualitySettings } from '@/core/renderer/QualitySettings';

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

  constructor(quality: QualitySettings, sharedGeometry: THREE.BufferGeometry) {
    this.uniforms = {
      uChunkOffset: { value: 0 },
      uTime: { value: 0 },
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
   * Move this chunk to a new world Z. The geometry is never rebuilt — only the
   * offset uniform changes, which is what makes recycling free.
   */
  setZ(z: number): void {
    this.mesh.position.z = z;
    this.uniforms.uChunkOffset!.value = z;
  }

  setSunDirection(dir: THREE.Vector3): void {
    (this.uniforms.uSunDir!.value as THREE.Vector3).copy(dir).normalize();
  }

  update(elapsed: number): void {
    this.uniforms.uTime!.value = elapsed;
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
