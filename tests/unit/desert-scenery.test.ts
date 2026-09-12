import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DESERT_ARCHETYPES,
  DesertScenery,
  desertLayout,
  type DesertLibrary,
} from '@/world/DesertScenery';
import { createDesertLibrary } from '@/world/DesertModels';
import { ChunkManager } from '@/world/ChunkManager';
import { applyHeightFog } from '@/art/Fog';

function fixture(): DesertLibrary {
  const scene = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (const name of DESERT_ARCHETYPES) {
    for (const suffix of ['', '__lod']) {
      const geo = new THREE.BoxGeometry(suffix ? 9 : 10, 20, 6);
      geo.translate(3, 10, -2);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = name + suffix;
      scene.add(mesh);
    }
  }
  return createDesertLibrary({ scene, clips: [] })!;
}

describe('desert scenery', () => {
  it('keeps the machine route and starboard docking strip clear at every quality', () => {
    const seen = new Set<string>();
    for (let chunk = -120; chunk < 20; chunk++) {
      const high = desertLayout('reproducible-city', chunk, 28);
      expect(desertLayout('reproducible-city', chunk, 6)).toEqual(high.slice(0, 5));
      expect(desertLayout('reproducible-city', chunk, 20)).toEqual(high.slice(0, 11));
      for (const prop of high) {
        seen.add(prop.kind);
        expect(Math.abs(prop.x) - prop.width * 0.75).toBeGreaterThanOrEqual(prop.x > 0 ? 48 : 14);
        expect(Math.abs(prop.z)).toBeLessThan(32);
        expect(prop.width).toBeGreaterThan(0);
      }
    }
    expect([...seen].sort()).toEqual([...DESERT_ARCHETYPES].sort());
  });

  it('retains the close mesh pivot and scale when a reduced mesh loses edge debris', () => {
    const library = fixture();
    const near = library.models['ruin-house'].geometry.boundingBox!;
    const far = library.models['ruin-house'].distant.boundingBox!;
    expect(near.min.y).toBe(0);
    expect(near.max.y).toBe(2);
    expect(far.max.y).toBe(near.max.y);
    expect(far.max.x - far.min.x).toBeCloseTo(0.9);
    library.dispose();
  });

  it('recycles and rebases without recreating geometry buffers or accumulating instances', () => {
    const library = fixture();
    const chunks = new ChunkManager(6, 2, 64, 1);
    const scenery = new DesertScenery(library, 9);
    const buffer = scenery.batch.geometry.getAttribute('position').array;
    for (const distance of [0, 63.99, 64.01, 540, 20000, 1000000, 0]) {
      chunks.reset(distance);
      scenery.setDistance(distance, -0.02);
      scenery.syncSlots(chunks.slots, 'rebase', 20, true);
      expect(scenery.batch.instanceCount).toBe(99);
      expect(scenery.batch.geometry.getAttribute('position').array).toBe(buffer);
      const matrix = new THREE.Matrix4();
      const actual: number[] = [];
      // IDs are reused by BatchedMesh; only their world-space positions matter.
      for (let id = 0; id < 99; id++) {
        scenery.batch.getMatrixAt(id, matrix);
        actual.push(matrix.elements[14]! + scenery.group.position.z);
      }
      const expected = chunks.slots.flatMap((slot) =>
        desertLayout('rebase', slot.chunkIndex, 20).map((p) => p.z + slot.z - 0.02),
      );
      actual.sort((a, b) => a - b);
      expected.sort((a, b) => a - b);
      for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 3);
    }
    scenery.syncSlots(chunks.slots, 'rebase', 6, true);
    expect(scenery.batch.instanceCount).toBe(45);
    scenery.syncSlots(chunks.slots, 'rebase', 28, true);
    expect(scenery.batch.instanceCount).toBe(126);
    const dispose = vi.spyOn(library.material, 'dispose');
    scenery.dispose();
    expect(dispose).not.toHaveBeenCalled();
    library.dispose();
    library.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('ships all original archetypes and aligned LODs with a valid base-color image', () => {
    const bytes = readFileSync('public/models/props/ruins/desert-ruins.glb');
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    expect(bytes.byteLength).toBeLessThan(10_000_000);
    expect(gltf.materials).toHaveLength(1);
    const names = new Set(gltf.nodes.map((node: { name: string }) => node.name));
    for (const name of DESERT_ARCHETYPES) {
      expect(names.has(name)).toBe(true);
      expect(names.has(name + '__lod')).toBe(true);
    }
    expect(gltf.images).toHaveLength(3);
    const material = gltf.materials[0];
    const baseTexture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    expect(gltf.images[baseTexture.extensions.EXT_texture_webp.source].name).toContain('BaseColor');
    for (const mesh of gltf.meshes) {
      expect(mesh.primitives).toHaveLength(1);
      const primitive = mesh.primitives[0];
      expect(primitive.attributes.TEXCOORD_0).toBeDefined();
      expect(primitive.attributes.NORMAL).toBeDefined();
      expect(primitive.indices).toBeDefined();
    }
  });

  it('evaluates height fog in the same transformed space as batched and instanced objects', () => {
    const material = new THREE.MeshStandardMaterial();
    applyHeightFog(material);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <tonemapping_fragment>',
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain('heightFogPosition = batchingMatrix * heightFogPosition');
    expect(shader.vertexShader).toContain('heightFogPosition = instanceMatrix * heightFogPosition');
    expect(shader.vertexShader).toContain('(modelMatrix * heightFogPosition).xyz');
    material.dispose();
  });
});
