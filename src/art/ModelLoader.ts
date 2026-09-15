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

export type AssetLoadStatus = 'loading' | 'loaded' | 'fallback';
export interface AssetLoadNotice {
  url: string;
  status: AssetLoadStatus;
  reason?: 'missing' | 'decode' | 'timeout';
}
const observers = new Set<(notice: AssetLoadNotice) => void>();
const prefetched = new Map<
  string,
  { bytes: Promise<ArrayBuffer | null>; controller: AbortController }
>();
export const ASSET_DEADLINE_MS = 45_000;

export function observeAssetLoads(observer: (notice: AssetLoadNotice) => void): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

function announce(notice: AssetLoadNotice): void {
  for (const observer of observers) {
    try {
      observer(notice);
    } catch {
      /* A progress view cannot interrupt asset ownership. */
    }
  }
}

/** Network only: decoding and GPU preparation stay at a safe menu boundary. */
export function prefetchModel(url: string): void {
  if (prefetched.has(url)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSET_DEADLINE_MS);
  const request = fetch(url, { signal: controller.signal })
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  prefetched.set(url, { bytes: request, controller });
}

export function clearModelPrefetch(): void {
  for (const entry of prefetched.values()) entry.controller.abort();
  prefetched.clear();
}

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
export async function loadModel(
  url: string,
  deadlineMs = ASSET_DEADLINE_MS,
): Promise<LoadedModel | null> {
  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);
  // Authored graphics-v2 exports may use EXT_meshopt_compression. The decoder
  // is bundled with Three, so this keeps the fallback path dependency-free and
  // does not change loading semantics for ordinary GLBs.
  loader.setMeshoptDecoder(MeshoptDecoder);
  announce({ url, status: 'loading' });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (model: LoadedModel | null, reason?: AssetLoadNotice['reason']) => {
      if (settled) {
        // A decoder can finish after transport cancellation. It still owns
        // these unpublished resources; no cache/palette has borrowed them.
        disposeLoadedModel(model);
        return;
      }
      settled = true;
      clearTimeout(timer);
      announce({ url, status: model ? 'loaded' : 'fallback', reason });
      resolve(model);
    };
    const timer = setTimeout(
      () => {
        finish(null, 'timeout');
        manager.abort();
      },
      Math.max(1, Number.isFinite(deadlineMs) ? deadlineMs : ASSET_DEADLINE_MS),
    );
    const bytes = prefetched.get(url)?.bytes;
    prefetched.delete(url);
    const request = bytes
      ? bytes.then((data) => {
          if (settled || !data) return null;
          const absolute = new URL(url, globalThis.location?.href ?? 'http://localhost/');
          return loader.parseAsync(data, new URL('.', absolute).href);
        })
      : loader.loadAsync(url);
    void request.then(
      (gltf) =>
        finish(
          gltf ? { scene: gltf.scene, clips: gltf.animations } : null,
          gltf ? undefined : 'missing',
        ),
      (error: unknown) =>
        finish(
          null,
          error && typeof error === 'object' && 'response' in error ? 'missing' : 'decode',
        ),
    );
  });
}
