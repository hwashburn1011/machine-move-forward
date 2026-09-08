import * as THREE from 'three';
import { loadModel } from './ModelLoader';
import { applyHeightFog } from './Fog';

const models = new Map<string, THREE.Group>();

/** Shared visual assets; loading never changes the reel or chest reward state. */
export async function loadSalvageModels(enabled: boolean): Promise<void> {
  models.clear();
  if (!enabled) return;
  await Promise.all(['salvage-chest', 'forged-hook'].map(async (name) => {
    const model = await loadModel(`models/authored/${name}.glb`);
    if (!model) return;
    const prepared = new Set<THREE.Material>();
    model.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!prepared.has(material)) { applyHeightFog(material); prepared.add(material); }
      }
    });
    models.set(name, model.scene);
  }));
}

export function salvageModel(name: string): THREE.Group | null {
  const model = models.get(name);
  if (!model) return null;
  const root = model.clone(true);
  root.userData.authored = true;
  return root;
}
