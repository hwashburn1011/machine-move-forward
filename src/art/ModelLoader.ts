import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * One loaded glTF: its scene graph and its animation clips.
 *
 * Mirrors `TextureLoader`. The project generates its visuals in code and still
 * does — a model is an enhancement layered on top, never a dependency.
 */
export interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

const disposedScenes = new WeakSet<THREE.Group>();

/** Dispose one caller-owned model and its unique GPU resources exactly once. */
export function disposeLoadedModel(model: LoadedModel | null): void {
  if (!model || disposedScenes.has(model.scene)) return;
  disposedScenes.add(model.scene);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of slots) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        const candidate = value as { isTexture?: boolean } | null;
        if (candidate?.isTexture) textures.add(value as THREE.Texture);
      }
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

/**
 * Load a glTF. Never rejects.
 *
 * Null when the file is absent, undecodable, or was never requested. The
 * caller has a working procedural path for exactly that case, and a 404 should
 * cost a nicer-looking scavenger rather than a boot.
 */
export async function loadModel(url: string): Promise<LoadedModel | null> {
  const loader = new GLTFLoader();
  // Authored graphics-v2 exports may use EXT_meshopt_compression. The decoder
  // is bundled with Three, so this keeps the fallback path dependency-free and
  // does not change loading semantics for ordinary GLBs.
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(url);
    return { scene: gltf.scene, clips: gltf.animations };
  } catch {
    return null;
  }
}
