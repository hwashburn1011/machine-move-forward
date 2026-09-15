import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildSystem } from '@/building/BuildSystem';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Machine } from '@/machine/Machine';

const materials = (): Materials => {
  const m = new THREE.MeshBasicMaterial();
  return {
    hull: m,
    hullDark: m,
    rustedSteel: m,
    deckPlate: m,
    buildPlate: m,
    stationMetal: m,
    bareSteel: m,
    accent: m,
    hazard: m,
    rubber: m,
    treadMap: new THREE.DataTexture(),
    glass: m,
    emissiveWarn: m,
  } as unknown as Materials;
};
const buildFixture = (inventory = new Container(16)) => {
  const bus = new EventBus();
  const resources = new ResourceAccess(
    inventory,
    () => [],
    () => ({ x: 0, y: 0, z: 0 }),
    bus,
  );
  const machine = {
    equipmentCells: [],
    deckCells: [{ x: 0, y: 0, z: 0 }],
    fixedLinks: [],
    movement: { totalWeight: 0 },
  } as unknown as Machine;
  const build = new BuildSystem(
    new THREE.Scene(),
    {
      addFixedBox: () => ({}),
      addFixedBoxRotated: () => ({}),
      removeCollider: () => undefined,
    } as unknown as PhysicsWorld,
    bus,
    materials(),
    machine,
    resources,
  );
  return { build, inventory };
};
const gardenPiece = (state = { format: 1 as const, water: 0, greens: 0, progressS: 0 }) => ({
  instanceId: 'bp-2',
  definitionId: 'seed-garden' as const,
  cell: { x: 0, y: 0, z: 0 },
  rotation: 0,
  health: 110,
  state,
});

describe('Seed Garden BuildSystem integration', () => {
  it('waters, grows, snapshots and restores a garden mid-batch', () => {
    const { build, inventory } = buildFixture();
    inventory.add('water', 2);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    expect(build.waterGarden('bp-2')).toBe(2);
    expect(build.tickGardens(180)).toEqual([{ instanceId: 'bp-2', itemId: 'greens', count: 3 }]);
    expect(build.gardenSnapshot('bp-2')).toMatchObject({ water: 1, greens: 3, progressS: 0 });
    const saved = build.serialise();
    const copy = buildFixture();
    copy.build.restore(saved, true);
    expect(copy.build.gardenSnapshot('bp-2')).toEqual(build.gardenSnapshot('bp-2'));
  });
  it('does not lose greens when inventory is full and transfers only available room', () => {
    const { build, inventory } = buildFixture(new Container(1));
    inventory.add('water', 1);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    build.waterGarden('bp-2');
    build.tickGardens(180);
    inventory.add('scrap', 1);
    expect(build.harvestGarden('bp-2')).toBe(0);
    expect(build.gardenSnapshot('bp-2')?.greens).toBe(3);
    inventory.remove('scrap', 1);
    expect(build.harvestGarden('bp-2')).toBe(3);
    expect(build.gardenSnapshot('bp-2')?.greens).toBe(0);
  });

  it('keeps stored garden contents visible until voluntary demolition', () => {
    const { build, inventory } = buildFixture();
    inventory.add('water', 1);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    build.waterGarden('bp-2');
    build.tickGardens(180);
    expect(build.gardenSnapshot('bp-2')?.greens).toBe(3);
    expect(build.demolitionPreview('bp-2').ids).toContain('bp-2');
    expect(build.demolish('bp-2')).toBeGreaterThan(0);
    expect(build.gardenSnapshot('bp-2')).toBeNull();
  });

  it('relocates a garden repeatedly without changing its identity or controller state', () => {
    const { build, inventory } = buildFixture();
    inventory.add('water', 1);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    build.waterGarden('bp-2');
    build.tickGardens(75);
    const mesh = build.visual('bp-2');
    for (let i = 0; i < 100; i++) {
      const result = build.relocate('bp-2', {
        piece: 'seed-garden',
        cell: { x: 0, y: 0, z: 0 },
        rotation: i % 2 ? Math.PI : 0,
      });
      expect(result.ok).toBe(true);
      expect(build.visual('bp-2')).toBe(mesh);
      expect(build.gardenSnapshot('bp-2')).toMatchObject({ water: 1, greens: 0, progressS: 75 });
    }
  });

  it('round-trips mid-growth and finishes after the exact remaining duration', () => {
    const { build, inventory } = buildFixture();
    inventory.add('water', 1);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    build.waterGarden('bp-2');
    build.tickGardens(80);
    const copy = buildFixture();
    copy.build.restore(build.serialise(), true);
    expect(copy.build.gardenSnapshot('bp-2')).toEqual(build.gardenSnapshot('bp-2'));
    expect(copy.build.tickGardens(99)).toEqual([]);
    expect(copy.build.tickGardens(1)).toEqual([{ instanceId: 'bp-2', itemId: 'greens', count: 3 }]);
  });

  it('removing the supporting floor removes the garden atomically', () => {
    const { build, inventory } = buildFixture();
    inventory.add('water', 1);
    build.restore(
      [
        {
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 120,
        },
        gardenPiece(),
      ],
      true,
    );
    build.waterGarden('bp-2');
    build.tickGardens(180);
    const preview = build.demolitionPreview('bp-1');
    expect(preview.ids).toEqual(expect.arrayContaining(['bp-1', 'bp-2']));
    build.demolish('bp-1');
    expect(build.instance('bp-2')).toBeNull();
    expect(build.gardenSnapshot('bp-2')).toBeNull();
  });
});
