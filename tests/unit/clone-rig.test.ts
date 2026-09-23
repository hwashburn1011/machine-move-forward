import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { cloneRig, disposeRigSkeletons } from '@/art/CloneRig';

function rig(): THREE.Group {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'joint';
  root.add(bone);
  const skeleton = new THREE.Skeleton([bone]);
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BoxGeometry();
    const count = geometry.attributes.position!.count;
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    const weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) weights[v * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = `part${i}`;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4().makeTranslation(i * 0.1, 0, 0));
  }
  return root;
}
const skins = (root: THREE.Object3D): THREE.SkinnedMesh[] => {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) meshes.push(o);
  });
  return meshes;
};

describe('cloned rig palettes', () => {
  it('releases a shared GPU palette once and never disposes the source asset', () => {
    const source = rig();
    const clone = cloneRig(source);
    const palette = skins(clone)[0]!.skeleton;
    palette.computeBoneTexture();
    const disposeTexture = vi.spyOn(palette.boneTexture!, 'dispose');
    const sourceDispose = vi.spyOn(skins(source)[0]!.skeleton, 'dispose');
    disposeRigSkeletons(clone);
    disposeRigSkeletons(clone);
    disposeRigSkeletons(source);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();
  });
  it('shares only within a character and exactly matches animated vertex positions', () => {
    const source = rig(),
      original = cloneSkinned(source),
      optimized = cloneRig(source),
      other = cloneRig(source);
    const old = skins(original),
      next = skins(optimized);
    expect(new Set(old.map((m) => m.skeleton)).size).toBe(3);
    expect(new Set(next.map((m) => m.skeleton)).size).toBe(1);
    expect(next[0]!.skeleton).not.toBe(skins(other)[0]!.skeleton);
    expect(next[0]!.skeleton.bones[0]).not.toBe(skins(other)[0]!.skeleton.bones[0]);
    for (let frame = 0; frame < 60; frame++) {
      for (const root of [original, optimized]) {
        root.getObjectByName('joint')!.rotation.set(frame * 0.03, frame * 0.02, 0.1);
        root.getObjectByName('joint')!.position.y = Math.sin(frame * 0.1);
        root.updateMatrixWorld(true);
      }
      for (const skeleton of new Set([...old, ...next].map((m) => m.skeleton))) skeleton.update();
      for (let part = 0; part < old.length; part++) {
        const a = old[part]!,
          b = next[part]!;
        expect(a.bindMatrix.equals(b.bindMatrix)).toBe(true);
        expect(a.bindMatrixInverse.equals(b.bindMatrixInverse)).toBe(true);
        expect([...a.skeleton.boneMatrices!]).toEqual([...b.skeleton.boneMatrices!]);
        for (let i = 0; i < a.geometry.attributes.position!.count; i++) {
          const position = new THREE.Vector3().fromBufferAttribute(
            a.geometry.attributes.position!,
            i,
          );
          expect(
            a.applyBoneTransform(i, position.clone()).distanceTo(b.applyBoneTransform(i, position)),
          ).toBe(0);
        }
      }
    }
    expect(other.getObjectByName('joint')!.position.y).toBe(0);
  });

  it('keeps different inverse bind poses and different bone identities separate', () => {
    const source = rig();
    const meshes = skins(source);
    const bone = new THREE.Bone();
    bone.name = 'separate';
    source.add(bone);
    meshes[2]!.skeleton = new THREE.Skeleton([bone]);
    meshes[1]!.skeleton = new THREE.Skeleton(meshes[0]!.skeleton.bones, [
      new THREE.Matrix4().makeTranslation(1, 0, 0),
    ]);
    expect(new Set(skins(cloneRig(source)).map((m) => m.skeleton)).size).toBe(3);
  });
});
