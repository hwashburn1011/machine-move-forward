import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modelControl = vi.hoisted(() => {
  type Loaded = { scene: THREE.Group; clips: THREE.AnimationClip[] };
  type Pending = { resolve: (value: Loaded | null) => void };
  const pending = new Map<string, Pending[]>();
  const calls: string[] = [];
  const disposed: Loaded[] = [];
  return { pending, calls, disposed };
});

vi.mock('@/art/ModelLoader', () => ({
  loadModel: vi.fn((url: string) => {
    modelControl.calls.push(url);
    return new Promise((resolve) => {
      const queue = modelControl.pending.get(url) ?? [];
      queue.push({ resolve });
      modelControl.pending.set(url, queue);
    });
  }),
  prefetchModel: vi.fn(),
  clearModelPrefetch: vi.fn(),
  disposeLoadedModel: vi.fn((model: { scene: THREE.Group; clips: THREE.AnimationClip[] } | null) => {
    if (model) modelControl.disposed.push(model);
  }),
}));

import {
  authoredModel,
  authoredModelsSettled,
  disposeDefenseModels,
  ensureAuthoredModels,
} from '@/art/DefenseModels';

function model(material?: THREE.Material) {
  const scene = new THREE.Group();
  if (material) scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return { scene, clips: [] as THREE.AnimationClip[] };
}

function resolveNext(url: string, value: ReturnType<typeof model> | null): void {
  const next = modelControl.pending.get(url)?.shift();
  if (!next) throw new Error(`no pending model request for ${url}`);
  next.resolve(value);
}

describe('authored model cache', () => {
  beforeEach(() => {
    disposeDefenseModels();
    modelControl.pending.clear();
    modelControl.calls.length = 0;
    modelControl.disposed.length = 0;
  });

  afterEach(() => disposeDefenseModels());

  it('coalesces concurrent requests and publishes one stable source', async () => {
    const first = ensureAuthoredModels(['quiet-array']);
    const second = ensureAuthoredModels(['quiet-array']);
    expect(modelControl.calls).toEqual(['models/authored/quiet-array.glb']);
    const loaded = model();
    resolveNext('models/authored/quiet-array.glb', loaded);
    await Promise.all([first, second]);

    expect(authoredModel('quiet-array')).toBe(loaded);
    expect(authoredModelsSettled(['quiet-array'])).toBe(true);
    await ensureAuthoredModels(['quiet-array']);
    expect(modelControl.calls).toHaveLength(1);
  });

  it('settles a fallback and does not request it repeatedly', async () => {
    const pending = ensureAuthoredModels(['route-water-cache']);
    resolveNext('models/authored/route-water-cache.glb', null);
    await pending;

    expect(authoredModelsSettled(['route-water-cache'])).toBe(true);
    expect(authoredModel('route-water-cache')).toBeNull();
    await ensureAuthoredModels(['route-water-cache']);
    expect(modelControl.calls).toHaveLength(1);
  });

  it('disposes an unpublished old-generation result without preparing or publishing it', async () => {
    const pending = ensureAuthoredModels(['glass-orchard']);
    const stale = model(new THREE.MeshStandardMaterial({ name: 'Array_Stale' }));
    const staleMesh = stale.scene.children[0] as THREE.Mesh;
    disposeDefenseModels();
    // Ignore the cache-owner's aggregate disposal call; this assertion is
    // specifically about the result that returns after its generation died.
    modelControl.disposed.length = 0;
    resolveNext('models/authored/glass-orchard.glb', stale);
    await pending;

    expect(modelControl.disposed).toEqual([stale]);
    expect(staleMesh.castShadow).toBe(false);
    expect((staleMesh.material as THREE.Material).userData.mmfPrepared).toBeUndefined();
    expect(authoredModel('glass-orchard')).toBeNull();
  });

  it('allows a fresh generation while an invalidated request is still finishing', async () => {
    const oldRequest = ensureAuthoredModels(['quiet-array']);
    disposeDefenseModels();
    const newRequest = ensureAuthoredModels(['quiet-array']);
    expect(modelControl.calls).toHaveLength(2);
    const oldModel = model();
    const current = model();
    resolveNext('models/authored/quiet-array.glb', oldModel);
    resolveNext('models/authored/quiet-array.glb', current);
    await Promise.all([oldRequest, newRequest]);

    expect(modelControl.disposed).toContain(oldModel);
    expect(authoredModel('quiet-array')).toBe(current);
  });

  it('keeps the first shared Array material live across a late publication', async () => {
    const firstTexture = new THREE.Texture();
    const firstMaterial = new THREE.MeshStandardMaterial({ map: firstTexture });
    firstMaterial.name = 'Array_Campaign';
    const first = model(firstMaterial);
    const firstLoad = ensureAuthoredModels(['quiet-array']);
    resolveNext('models/authored/quiet-array.glb', first);
    await firstLoad;

    const lateTexture = new THREE.Texture();
    const lateMaterial = new THREE.MeshStandardMaterial({ map: lateTexture });
    lateMaterial.name = 'Array_Campaign';
    const disposeFirstMaterial = vi.spyOn(firstMaterial, 'dispose');
    const disposeFirstTexture = vi.spyOn(firstTexture, 'dispose');
    const disposeLateMaterial = vi.spyOn(lateMaterial, 'dispose');
    const disposeLateTexture = vi.spyOn(lateTexture, 'dispose');
    const late = model(lateMaterial);
    const lateLoad = ensureAuthoredModels(['glass-orchard']);
    resolveNext('models/authored/glass-orchard.glb', late);
    await lateLoad;

    const lateMesh = late.scene.children[0] as THREE.Mesh;
    expect(lateMesh.material).toBe(firstMaterial);
    expect(disposeLateMaterial).toHaveBeenCalledTimes(1);
    expect(disposeLateTexture).toHaveBeenCalledTimes(1);
    expect(disposeFirstMaterial).not.toHaveBeenCalled();
    expect(disposeFirstTexture).not.toHaveBeenCalled();
    expect(authoredModel('quiet-array')).toBe(first);
  });

  it('settles preparation failure as fallback without disposing shared wear maps', async () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    material.name = 'Paint_Broken';
    Object.defineProperty(material, 'normalScale', {
      configurable: true,
      value: { set: () => { throw new Error('malformed normal scale'); } },
    });
    const broken = model(material);
    const mesh = broken.scene.children[0] as THREE.Mesh;
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const pending = ensureAuthoredModels(['glass-orchard']);
    resolveNext('models/authored/glass-orchard.glb', broken);

    await expect(pending).resolves.toBeUndefined();
    expect(authoredModelsSettled(['glass-orchard'])).toBe(true);
    expect(authoredModel('glass-orchard')).toBeNull();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('does not retain palette additions from a partially traversed failed candidate', async () => {
    const material = new THREE.MeshStandardMaterial();
    material.name = 'Array_Partial';
    material.userData.mmfPrepared = true;
    const broken = model(material);
    const originalTraverse = broken.scene.traverse.bind(broken.scene);
    let traversal = 0;
    broken.scene.traverse = ((callback: (object: THREE.Object3D) => void) => {
      traversal += 1;
      if (traversal < 3) return originalTraverse(callback);
      callback(broken.scene);
      callback(broken.scene.children[0]!);
      throw new Error('malformed hierarchy');
    }) as THREE.Object3D['traverse'];
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const pending = ensureAuthoredModels(['quiet-array']);
    resolveNext('models/authored/quiet-array.glb', broken);

    await expect(pending).resolves.toBeUndefined();
    expect(authoredModel('quiet-array')).toBeNull();
    expect(authoredModelsSettled(['quiet-array'])).toBe(true);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);

    const replacementMaterial = new THREE.MeshStandardMaterial();
    replacementMaterial.name = 'Array_Partial';
    const replacement = model(replacementMaterial);
    const load = ensureAuthoredModels(['glass-orchard']);
    resolveNext('models/authored/glass-orchard.glb', replacement);
    await load;
    expect((replacement.scene.children[0] as THREE.Mesh).material).toBe(replacementMaterial);
  });
});
