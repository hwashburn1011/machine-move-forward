import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Materials } from '@/art/Materials';
import { EventBus } from '@/core/events/EventBus';
import { getQualitySettings } from '@/core/renderer/QualitySettings';
import { WorldManager } from '@/world/WorldManager';

type PrivateWorld = {
  terrain: { uniforms: Record<string, { value: unknown }> }[];
  props: {
    rocks: { instanceMatrix: { array: ArrayLike<number> } };
    slabs: { instanceMatrix: { array: ArrayLike<number> } };
  }[][];
};

const privateWorld = (world: WorldManager) => world as unknown as PrivateWorld;

function fingerprint(world: WorldManager): number[] {
  const value = privateWorld(world);
  const out: number[] = [];
  for (const chunk of value.terrain) {
    out.push(
      Number(chunk.uniforms.uTerrainSeed?.value),
      Number(chunk.uniforms.uRippleOrientation?.value),
    );
  }
  for (const bands of value.props)
    for (const prop of bands)
      for (const mesh of [prop.rocks, prop.slabs])
        out.push(...Array.from(mesh.instanceMatrix.array));
  return out;
}

function make(seed: string): WorldManager {
  return new WorldManager(
    new THREE.Scene(),
    getQualitySettings('low'),
    new EventBus(),
    new Materials(),
    seed,
  );
}

describe('world seed reseeding', () => {
  it('makes a continued world match a fresh control at the same distance', () => {
    const continued = make('seed-b');
    const control = make('seed-a');
    continued.reseed('seed-a', 321);
    control.reset(321);
    expect(fingerprint(continued)).toEqual(fingerprint(control));
    continued.dispose();
    control.dispose();
  });

  it('is idempotent and keeps the existing terrain geometry allocation', () => {
    const world = make('seed-b');
    const value = privateWorld(world);
    const geometry = (value.terrain[0] as unknown as { mesh: THREE.Mesh }).mesh.geometry;
    world.reseed('seed-a', 80);
    const first = fingerprint(world);
    world.reseed('seed-a', 80);
    expect(fingerprint(world)).toEqual(first);
    expect((value.terrain[0] as unknown as { mesh: THREE.Mesh }).mesh.geometry).toBe(geometry);
    world.dispose();
  });
});
