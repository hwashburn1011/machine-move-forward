import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '@/core/events/EventBus';
import { Materials } from '@/art/Materials';
import { getQualitySettings } from '@/core/renderer/QualitySettings';
import { WorldManager } from '@/world/WorldManager';
import { TERRAIN_VERTEX_MAIN } from '@/art/shaders/terrainShader';

describe('lateral world projection', () => {
  it('updates the persistent world offset without moving terrain mesh origins', () => {
    const world = new WorldManager(
      new THREE.Scene(),
      getQualitySettings('low'),
      new EventBus(),
      new Materials(),
      'lateral-test',
    );
    world.setLateralOffset(37.5);
    expect(world.lateralWorldOffset).toBe(37.5);
    const chunks = (world as unknown as { terrain: { mesh: THREE.Mesh }[] }).terrain;
    expect(chunks.every((chunk) => chunk.mesh.position.x === 0)).toBe(true);
    world.setLateralOffset(Number.NaN);
    expect(world.lateralWorldOffset).toBe(0);
    world.dispose();
  });

  it('keeps three adjacent permanent bands populated across large offsets', () => {
    const world = new WorldManager(
      new THREE.Scene(),
      getQualitySettings('low'),
      new EventBus(),
      new Materials(),
      'band-test',
    );
    expect(world.lateralBandIds).toEqual([-1, 0, 1]);
    world.setLateralOffset(1024);
    expect(world.lateralBandIds).toEqual([3, 4, 5]);
    world.setLateralOffset(-1024);
    expect(world.lateralBandIds).toEqual([-5, -4, -3]);
    world.dispose();
  });

  it('evaluates dune height in global X while retaining rendered offset coordinates', () => {
    expect(TERRAIN_VERTEX_MAIN).toContain('position.x + uLateralOffset');
    expect(TERRAIN_VERTEX_MAIN).toContain('vTerrainRender = vec3(position.x,');
  });
});
