import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const ownedPalettes = new WeakSet<THREE.Skeleton>();
const disposedPalettes = new WeakSet<THREE.Skeleton>();

/** Keep characters independent, but share identical skin palettes within each cloned character. */
export function cloneRig<T extends THREE.Object3D>(source: T): T {
  const root = cloneSkinned(source) as T;
  const palettes = new Map<string, THREE.Skeleton[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const skeleton = object.skeleton;
    // SkeletonUtils clones one Skeleton per mesh primitive, even when the
    // primitives all use the same bones. Three updates/uploads each of those
    // palettes once per frame. Coalesce only exact bone/inverse-bind matches.
    const key = skeleton.bones.map((bone) => bone.uuid).join(',');
    const candidates = palettes.get(key) ?? [];
    const shared = candidates.find(
      (candidate) =>
        candidate.boneInverses.length === skeleton.boneInverses.length &&
        candidate.boneInverses.every((matrix, i) => matrix.equals(skeleton.boneInverses[i]!)),
    );
    if (shared && shared !== skeleton) {
      object.skeleton = shared;
      skeleton.dispose();
    } else if (!shared) {
      candidates.push(skeleton);
      ownedPalettes.add(skeleton);
      palettes.set(key, candidates);
    }
  });
  return root;
}

/** Release clone-owned GPU bone textures without touching loader-owned meshes or textures. */
export function disposeRigSkeletons(root: THREE.Object3D | null): void {
  root?.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const skeleton = object.skeleton;
    if (!ownedPalettes.has(skeleton) || disposedPalettes.has(skeleton)) return;
    disposedPalettes.add(skeleton);
    skeleton.dispose();
  });
}
