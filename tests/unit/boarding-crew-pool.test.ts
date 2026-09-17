import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Materials } from '@/art/Materials';
import { disposeSkiffCrewModel } from '@/art/DefenseModels';
import { BoardingCrewVisualPool } from '@/vehicles/BoardingCrewVisualPool';

describe('BoardingCrewVisualPool', () => {
  it('reuses a released visual without aliasing simultaneous crew', () => {
    const materials = new Materials();
    const pool = new BoardingCrewVisualPool(materials);
    const first = pool.acquire('bastion');
    const second = pool.acquire('bastion');
    expect(second).not.toBe(first);
    expect(second.model).not.toBe(first.model);
    pool.release(first);
    const reused = pool.acquire('bastion');
    expect(reused).toBe(first);
    expect(reused.model.visible).toBe(true);
    pool.release(second);
    pool.release(reused);
    pool.dispose();
    materials.dispose();
  });

  it('keeps repeated normal pairs bounded and stages all mech types for warmup', () => {
    const materials = new Materials();
    const pool = new BoardingCrewVisualPool(materials);
    for (let i = 0; i < 100; i += 1) {
      const left = pool.acquire('warden');
      const right = pool.acquire('sovereign');
      expect(left).not.toBe(right);
      pool.release(left);
      pool.release(right);
    }
    const staged = pool.prepareForWarmup();
    expect(staged).toHaveLength(10);
    expect(new Set(staged).size).toBe(10);
    pool.finishWarmup(staged);
    pool.dispose();
    materials.dispose();
  });

  it('rejects acquisition after disposal without touching shared materials', () => {
    const materials = new Materials();
    const pool = new BoardingCrewVisualPool(materials);
    pool.dispose();
    expect(() => pool.acquire('bastion')).toThrow(/disposed/);
    materials.dispose();
  });

  it('shares trolley geometry across rigs and disposes it once, only at pool shutdown', () => {
    const materials = new Materials();
    const pool = new BoardingCrewVisualPool(materials);
    const a = pool.acquire('bastion'),
      b = pool.acquire('warden');
    const roller = (slot: typeof a) =>
      (slot.model.getObjectByName('BoardingGrip')!.children[0] as THREE.Mesh).geometry;
    expect(roller(a)).toBe(roller(b));
    const dispose = vi.spyOn(roller(a), 'dispose');
    const materialDispose = vi.spyOn(materials.bareSteel, 'dispose');
    pool.release(a);
    pool.release(b);
    expect(dispose).not.toHaveBeenCalled();
    pool.dispose();
    pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    materials.dispose();
  });

  it('owns fallback crew geometry while authored crew keeps its borrowed geometry', () => {
    const materials = new Materials();
    const pool = new BoardingCrewVisualPool(materials);
    const crew = pool.acquire(null);
    const geometry = (crew.model.children[0] as THREE.Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    pool.release(crew);
    expect(dispose).not.toHaveBeenCalled();
    pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    const authored = new THREE.Group();
    authored.userData.authored = true;
    const borrowed = new THREE.BoxGeometry();
    const disposeBorrowed = vi.spyOn(borrowed, 'dispose');
    authored.add(new THREE.Mesh(borrowed, materials.bareSteel));
    disposeSkiffCrewModel(authored);
    expect(disposeBorrowed).not.toHaveBeenCalled();
    borrowed.dispose();
    materials.dispose();
  });

  it('disposes each cloned skeleton once while preserving the source skeleton', () => {
    const source = new THREE.Group();
    const bone = new THREE.Bone();
    source.add(bone);
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const skeleton = new THREE.Skeleton([bone]);
    skeleton.computeBoneTexture();
    mesh.bind(skeleton);
    source.add(mesh);
    const clone = cloneSkinned(source) as THREE.Group;
    const clonedMesh = clone.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    clonedMesh.skeleton.computeBoneTexture();
    expect(clonedMesh.skeleton).not.toBe(skeleton);
    expect(clonedMesh.skeleton.boneTexture).not.toBe(skeleton.boneTexture);
    clone.userData.authored = true;
    const dispose = vi.spyOn(clonedMesh.skeleton, 'dispose');
    disposeSkiffCrewModel(clone);
    disposeSkiffCrewModel(clone);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(skeleton.boneTexture?.image).toBeTruthy();
    skeleton.dispose();
    geometry.dispose();
    material.dispose();
  });
});
