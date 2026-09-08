import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { DECK_HEIGHT, DECK_PLATE_HALF } from '@/game/constants';
import { buildMachine } from '@/machine/MachineGeometry';

function stubMaterials(): Materials {
  const m = new THREE.MeshStandardMaterial();
  return {
    hull: m,
    hullDark: m,
    bareSteel: m,
    rustedSteel: m,
    rubber: m,
    accent: m,
    hazard: m,
  } as unknown as Materials;
}

describe('machine lower-room framing', () => {
  it('keeps visual cross-members against the ceiling, outside the walkable floor', () => {
    const build = buildMachine(stubMaterials());
    const frame = build.group.getObjectByName('lower-room-ceiling-frame') as THREE.Mesh | null;
    expect(frame).toBeTruthy();
    frame?.geometry.computeBoundingBox();
    expect(frame?.geometry.boundingBox?.min.y).toBeGreaterThan(DECK_HEIGHT - DECK_PLATE_HALF - 0.5);
    expect(frame?.userData.machineDetailFallback).toBe(true);

    const frameGeometries = new Set<THREE.BufferGeometry>();
    build.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) frameGeometries.add((object as THREE.Mesh).geometry);
    });
    for (const geometry of frameGeometries) geometry.dispose();
  });

  it('leaves visual headroom over the stair opening', () => {
    const build = buildMachine(stubMaterials());
    const frame = build.group.getObjectByName('lower-room-ceiling-frame') as THREE.Mesh | null;
    const position = frame?.geometry.getAttribute('position');
    expect(position).toBeTruthy();
    for (let i = 0; position && i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      expect(x < -2.88 || x > -1.12 || z < -2.17 || z > 2.17).toBe(true);
    }

    const geometries = new Set<THREE.BufferGeometry>();
    build.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry);
    });
    for (const geometry of geometries) geometry.dispose();
  });

  it('labels broad fallback skins for exact v3 replacement', () => {
    const build = buildMachine(stubMaterials());
    const expected = new Map([
      ['engine', 'engine'],
      ['engine-exhaust-visual', 'engine'],
      ['prow-block-visual', 'prow'],
      ['plough-visual', 'prow'],
      ['static-deck-rails', 'deck'],
      ['stairwell-coaming', 'deck'],
    ]);
    for (const [name, skin] of expected) {
      const mesh = build.group.getObjectByName(name) as THREE.Mesh | null;
      expect(mesh?.userData.machineVisualSkin, name).toBe(skin);
      expect(mesh?.userData.machineDetailFallback, name).toBe(true);
    }

    for (const retained of [
      'sponson-port',
      'sponson-starboard',
      'prow-hazard-stripe',
    ]) {
      const mesh = build.group.getObjectByName(retained) as THREE.Mesh | null;
      expect(mesh?.userData.machineDetailFallback, retained).toBeUndefined();
    }

    const geometries = new Set<THREE.BufferGeometry>();
    build.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry);
    });
    for (const geometry of geometries) geometry.dispose();
  });
});
