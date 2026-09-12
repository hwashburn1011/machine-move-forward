import * as THREE from 'three';
import { applyHeightFog } from '@/art/Fog';
import { disposeLoadedModel, loadModel, type LoadedModel } from '@/art/ModelLoader';
import {
  DESERT_ARCHETYPES,
  type DesertKind,
  type DesertLibrary,
  type DesertModel,
} from './DesertScenery';

/** Both LODs use the close mesh's transform and bounds. Independent
 * normalization would visibly resize/shift buildings when their LOD changes.
 */
export function createDesertLibrary(source: LoadedModel): DesertLibrary | null {
  const models = {} as Record<DesertKind, DesertModel>;
  const owned: THREE.BufferGeometry[] = [];
  let material: THREE.MeshStandardMaterial | null = null;
  source.scene.updateWorldMatrix(true, true);
  for (const kind of DESERT_ARCHETYPES) {
    const near = source.scene.getObjectByName(kind) as THREE.Mesh | undefined;
    const far = source.scene.getObjectByName(`${kind}__lod`) as THREE.Mesh | undefined;
    if (
      !near?.isMesh ||
      !far?.isMesh ||
      !near.geometry.index ||
      !far.geometry.index ||
      Array.isArray(near.material) ||
      !(near.material as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
      !['position', 'normal', 'uv'].every(
        (name) => near.geometry.hasAttribute(name) && far.geometry.hasAttribute(name),
      )
    ) {
      for (const geometry of owned) geometry.dispose();
      material?.dispose();
      return null;
    }
    if (!material) {
      material = (near.material as THREE.MeshStandardMaterial).clone();
      material.name = 'Desert district atlas';
      material.side = THREE.DoubleSide;
      material.vertexColors = false;
      material.aoMapIntensity = 0.65;
      applyHeightFog(material, 'desert-atlas');
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
      ]) {
        if (texture) texture.anisotropy = 4;
      }
    }
    const geometry = near.geometry.clone().applyMatrix4(near.matrixWorld);
    const distant = far.geometry.clone().applyMatrix4(far.matrixWorld);
    owned.push(geometry, distant);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.001);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const y = box.min.y;
    for (const mesh of [geometry, distant]) {
      mesh.translate(-cx, -y, -cz).scale(1 / width, 1 / width, 1 / width);
      mesh.clearGroups();
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    models[kind] = { geometry, distant };
  }
  let disposed = false;
  return {
    models,
    material: material!,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const geometry of owned) geometry.dispose();
      material!.dispose();
      disposeLoadedModel(source);
    },
  };
}

export async function loadDesertLibrary(): Promise<DesertLibrary | null> {
  const source = await loadModel('models/props/ruins/desert-ruins.glb');
  if (!source) return null;
  const library = createDesertLibrary(source);
  if (!library) disposeLoadedModel(source);
  return library;
}
