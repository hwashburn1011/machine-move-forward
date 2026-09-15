import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loaderControl = vi.hoisted(() => {
  type Gltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
  type Pending = {
    resolve: (value: Gltf | null) => void;
    reject: (reason?: unknown) => void;
  };
  const loads = new Map<string, Pending>();
  const parses: Array<{ bytes: ArrayBuffer; base: string; pending: Pending }> = [];
  const deferred = (): [Promise<Gltf | null>, Pending] => {
    let resolve!: Pending['resolve'];
    let reject!: Pending['reject'];
    const promise = new Promise<Gltf | null>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return [promise, { resolve, reject }];
  };
  return {
    loads,
    parses,
    deferred,
    loadCalls: [] as string[],
    parseCalls: 0,
    managers: [] as Array<{ abort: () => void }>,
  };
});

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    constructor(manager: { abort: () => void }) {
      loaderControl.managers.push(manager);
    }
    setMeshoptDecoder(): void {}
    loadAsync(url: string): Promise<unknown> {
      loaderControl.loadCalls.push(url);
      const [promise, pending] = loaderControl.deferred();
      loaderControl.loads.set(url, pending);
      return promise;
    }
    parseAsync(bytes: ArrayBuffer, base: string): Promise<unknown> {
      loaderControl.parseCalls += 1;
      const [promise, pending] = loaderControl.deferred();
      loaderControl.parses.push({ bytes, base, pending });
      return promise;
    }
  },
}));

vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

import {
  clearModelPrefetch,
  loadModel,
  observeAssetLoads,
  prefetchModel,
  type AssetLoadNotice,
} from '@/art/ModelLoader';

function gltf(scene = new THREE.Group()) {
  return { scene, animations: [new THREE.AnimationClip('idle', 1, [])] };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('bounded model loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loaderControl.loads.clear();
    loaderControl.parses.length = 0;
    loaderControl.loadCalls.length = 0;
    loaderControl.parseCalls = 0;
    loaderControl.managers.length = 0;
    vi.stubGlobal('location', { href: 'https://example.test/game/' });
  });

  afterEach(() => {
    clearModelPrefetch();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('announces and settles a normal load exactly once', async () => {
    const notices: AssetLoadNotice[] = [];
    const off = observeAssetLoads((notice) => notices.push(notice));
    const result = loadModel('normal.glb', 100);
    const expected = gltf();
    loaderControl.loads.get('normal.glb')!.resolve(expected);

    await expect(result).resolves.toEqual({ scene: expected.scene, clips: expected.animations });
    await vi.advanceTimersByTimeAsync(200);
    expect(notices).toEqual([
      { url: 'normal.glb', status: 'loading' },
      { url: 'normal.glb', status: 'loaded', reason: undefined },
    ]);
    off();
  });

  it('returns the procedural fallback after transport or decode failure', async () => {
    const notices: AssetLoadNotice[] = [];
    const off = observeAssetLoads((notice) => notices.push(notice));
    const missing = loadModel('missing.glb', 100);
    loaderControl.loads.get('missing.glb')!.reject({ response: { status: 404 } });
    await expect(missing).resolves.toBeNull();

    const corrupt = loadModel('corrupt.glb', 100);
    loaderControl.loads.get('corrupt.glb')!.reject(new Error('invalid glTF'));
    await expect(corrupt).resolves.toBeNull();
    expect(notices.filter((notice) => notice.status === 'fallback')).toEqual([
      { url: 'missing.glb', status: 'fallback', reason: 'missing' },
      { url: 'corrupt.glb', status: 'fallback', reason: 'decode' },
    ]);
    off();
  });

  it('aborts a stalled manager and returns null at the caller deadline', async () => {
    const notices: AssetLoadNotice[] = [];
    const off = observeAssetLoads((notice) => notices.push(notice));
    const result = loadModel('stalled.glb', 25);
    const abort = vi.spyOn(loaderControl.managers[0]!, 'abort');

    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toBeNull();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(notices.at(-1)).toEqual({
      url: 'stalled.glb',
      status: 'fallback',
      reason: 'timeout',
    });
    off();
  });

  it('disposes a decoder result that arrives after timeout exactly once', async () => {
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const result = loadModel('late.glb', 10);

    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBeNull();
    loaderControl.loads.get('late.glb')!.resolve(gltf(scene));
    await flush();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('prefetches bytes without parsing and parses them only when requested', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const arrayBuffer = vi.fn(async () => bytes);
    const fetch = vi.fn(async () => ({ ok: true, arrayBuffer }));
    vi.stubGlobal('fetch', fetch);

    prefetchModel('models/late.glb');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loaderControl.parseCalls).toBe(0);

    const result = loadModel('models/late.glb', 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(loaderControl.loadCalls).toEqual([]);
    expect(loaderControl.parseCalls).toBe(1);
    expect(loaderControl.parses[0]!.bytes).toBe(bytes);
    expect(loaderControl.parses[0]!.base).toBe('https://example.test/game/models/');
    const expected = gltf();
    loaderControl.parses[0]!.pending.resolve(expected);
    await expect(result).resolves.toEqual({ scene: expected.scene, clips: expected.animations });
  });

  it('aborts and forgets outstanding byte prefetches when the cache is cleared', async () => {
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetch);

    prefetchModel('models/abandoned.glb');
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(false);

    clearModelPrefetch();
    expect(signal?.aborted).toBe(true);

    const result = loadModel('models/abandoned.glb', 100);
    expect(loaderControl.loadCalls).toEqual(['models/abandoned.glb']);
    loaderControl.loads.get('models/abandoned.glb')!.resolve(gltf());
    await expect(result).resolves.not.toBeNull();
  });

  it('stops notifying an observer after unsubscribe', async () => {
    const notices: AssetLoadNotice[] = [];
    const off = observeAssetLoads((notice) => notices.push(notice));
    off();
    const result = loadModel('unobserved.glb', 100);
    loaderControl.loads.get('unobserved.glb')!.resolve(gltf());
    await expect(result).resolves.not.toBeNull();
    expect(notices).toEqual([]);
  });

  it('isolates a throwing observer from loader settlement', async () => {
    const off = observeAssetLoads(() => {
      throw new Error('broken loading UI');
    });
    try {
      const result = loadModel('observer-error.glb', 100);
      loaderControl.loads.get('observer-error.glb')!.resolve(gltf());
      await expect(result).resolves.not.toBeNull();
    } finally {
      off();
    }
  });
});
