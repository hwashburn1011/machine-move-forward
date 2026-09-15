import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const textureControl = vi.hoisted(() => ({
  requests: [] as Array<{
    url: string;
    texture: { dispose: () => void };
    success: (texture: unknown) => void;
    failure: (error: unknown) => void;
  }>,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    TextureLoader: class {
      load(
        url: string,
        success: (texture: import('three').Texture) => void,
        _progress: unknown,
        failure: (error: unknown) => void,
      ): import('three').Texture {
        const texture = new actual.Texture();
        textureControl.requests.push({
          url,
          texture,
          success: success as (texture: unknown) => void,
          failure,
        });
        return texture;
      }
    },
  };
});

import * as THREE from 'three';
import { loadTextureSets } from '@/art/TextureLoader';

function request(url: string) {
  const found = textureControl.requests.find((entry) => entry.url === url);
  if (!found) throw new Error(`missing controlled request ${url}`);
  return found;
}

function succeed(slot: string): void {
  for (const file of ['diffuse.jpg', 'normal.jpg', 'arm.jpg']) {
    const pending = request(`textures/${slot}/${file}`);
    pending.success(pending.texture);
  }
}

describe('bounded optional texture loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    textureControl.requests.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('publishes and configures a complete slot without disposing it', async () => {
    const result = loadTextureSets(['hull'], 100);
    const disposals = textureControl.requests.map((entry) => vi.spyOn(entry.texture, 'dispose'));
    succeed('hull');

    const sets = await result;
    expect(sets.hull).toBeDefined();
    expect(sets.hull!.map.wrapS).toBe(THREE.RepeatWrapping);
    expect(sets.hull!.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(sets.hull!.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(sets.hull!.armMap.anisotropy).toBe(4);
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes successful siblings when one map in the slot fails', async () => {
    const result = loadTextureSets(['rusted-steel'], 100);
    const disposals = textureControl.requests.map((entry) => vi.spyOn(entry.texture, 'dispose'));
    const diffuse = request('textures/rusted-steel/diffuse.jpg');
    diffuse.success(diffuse.texture);
    request('textures/rusted-steel/normal.jpg').failure(new Error('404'));

    await expect(result).resolves.toEqual({});
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    const arm = request('textures/rusted-steel/arm.jpg');
    arm.success(arm.texture);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled slot and disposes a late callback exactly once', async () => {
    const result = loadTextureSets(['deck-plate'], 20);
    const disposals = textureControl.requests.map((entry) => vi.spyOn(entry.texture, 'dispose'));
    await vi.advanceTimersByTimeAsync(20);

    await expect(result).resolves.toEqual({});
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    const late = request('textures/deck-plate/diffuse.jpg');
    late.success(late.texture);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps successful slots when another slot fails', async () => {
    const result = loadTextureSets(['hull', 'sand'], 100);
    const sand = textureControl.requests.filter((entry) => entry.url.includes('/sand/'));
    const sandDisposals = sand.map((entry) => vi.spyOn(entry.texture, 'dispose'));
    succeed('hull');
    request('textures/sand/arm.jpg').failure(new Error('decode'));

    const sets = await result;
    expect(Object.keys(sets)).toEqual(['hull']);
    for (const dispose of sandDisposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('loads a repeated slot once so no successful set is overwritten and leaked', async () => {
    const result = loadTextureSets(['hull', 'hull'], 100);
    expect(textureControl.requests).toHaveLength(3);
    succeed('hull');
    await expect(result).resolves.toHaveProperty('hull');
  });

  it('uses the default finite deadline for a nonfinite timeout', async () => {
    const result = loadTextureSets(['build-plate'], Number.NaN);
    await vi.advanceTimersByTimeAsync(44_999);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({});
  });
});
