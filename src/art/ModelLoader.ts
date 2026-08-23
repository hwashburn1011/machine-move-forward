import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

/**
 * Load a glTF. Never rejects.
 *
 * Null when the file is absent, undecodable, or was never requested. The
 * caller has a working procedural path for exactly that case, and a 404 should
 * cost a nicer-looking scavenger rather than a boot.
 */
export async function loadModel(url: string): Promise<LoadedModel | null> {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    return { scene: gltf.scene, clips: gltf.animations };
  } catch {
    return null;
  }
}
