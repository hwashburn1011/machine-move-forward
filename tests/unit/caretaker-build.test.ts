import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildSystem } from '@/building/BuildSystem';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Machine } from '@/machine/Machine';

const materials = () => {
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
const fixture = () => {
  const bus = new EventBus();
  const inventory = new Container(8);
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
const pieces = [
  {
    instanceId: 'bp-1',
    definitionId: 'floor' as const,
    cell: { x: 0, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-5',
    definitionId: 'floor' as const,
    cell: { x: 1, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-6',
    definitionId: 'floor' as const,
    cell: { x: 2, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-7',
    definitionId: 'floor' as const,
    cell: { x: 3, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-8',
    definitionId: 'floor' as const,
    cell: { x: 4, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-10',
    definitionId: 'floor' as const,
    cell: { x: 5, y: 0, z: 0 },
    rotation: 0,
    health: 120,
  },
  {
    instanceId: 'bp-2',
    definitionId: 'crate' as const,
    cell: { x: 1, y: 0, z: 0 },
    rotation: 0,
    health: 100,
    state: { slots: [{ itemId: 'water', count: 1 }, null, null, null, null, null] },
  },
  {
    instanceId: 'bp-3',
    definitionId: 'planter' as const,
    cell: { x: 2, y: 0, z: 0 },
    rotation: 0,
    health: 100,
    state: { progress: 0, stored: 1 },
  },
  {
    instanceId: 'bp-4',
    definitionId: 'seed-garden' as const,
    cell: { x: 3, y: 0, z: 0 },
    rotation: 0,
    health: 110,
    state: { format: 1 as const, water: 0, greens: 1, progressS: 0 },
  },
  {
    instanceId: 'bp-9',
    definitionId: 'collector-auto' as const,
    cell: { x: 4, y: 0, z: 0 },
    rotation: 0,
    health: 100,
    state: { slots: [{ itemId: 'scrap', count: 3 }, null, null, null] },
  },
];

describe('BuildSystem caretaker bridge', () => {
  it('describes live sources and atomically transfers one output or water', () => {
    const { build } = fixture();
    build.restore(pieces, true);
    const snapshot = build.caretakerWorkSnapshot();
    expect(snapshot.crates[0]?.items).toContainEqual({ itemId: 'water', count: 1 });
    expect(snapshot.producers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'bp-3', output: { itemId: 'greens', count: 1 } }),
      ]),
    );
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-3',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(true);
    expect(build.crateContainer('bp-2')?.count('greens')).toBe(1);
    expect(
      build.commitCaretakerJob({
        kind: 'water-garden',
        sourceId: 'bp-2',
        targetId: 'bp-4',
        itemId: 'water',
        count: 1,
      }),
    ).toBe(true);
    expect(build.crateContainer('bp-2')?.count('water')).toBe(0);
    expect(build.gardenSnapshot('bp-4')?.water).toBe(1);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-4',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(true);
    expect(build.gardenSnapshot('bp-4')?.greens).toBe(0);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-9',
        targetId: 'bp-2',
        itemId: 'scrap',
        count: 1,
      }),
    ).toBe(true);
    expect(build.collectorContainer('bp-9')?.count('scrap')).toBe(2);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-9',
        targetId: 'bp-2',
        itemId: 'scrap',
        count: 1,
      }),
    ).toBe(true);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-9',
        targetId: 'bp-2',
        itemId: 'scrap',
        count: 1,
      }),
    ).toBe(true);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-9',
        targetId: 'bp-2',
        itemId: 'scrap',
        count: 1,
      }),
    ).toBe(false);
    const afterDepletion = build.serialise();
    for (let cycle = 0; cycle < 100; cycle++)
      expect(
        build.commitCaretakerJob({
          kind: 'store-output',
          sourceId: 'bp-9',
          targetId: 'bp-2',
          itemId: 'scrap',
          count: 1,
        }),
      ).toBe(false);
    expect(build.serialise()).toEqual(afterDepletion);
  });

  it('rejects invalid or busy jobs without changing either side', () => {
    const { build } = fixture();
    build.restore(pieces, true);
    const before = build.serialise();
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'missing',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(false);
    expect(
      build.commitCaretakerJob({
        kind: 'water-garden',
        sourceId: 'bp-2',
        targetId: 'bp-4',
        itemId: 'scrap',
        count: 1,
      }),
    ).toBe(false);
    expect(build.serialise()).toEqual(before);
  });

  it('keeps a full crate unchanged and rejects removed endpoints', () => {
    const { build } = fixture();
    build.restore(pieces, true);
    const crate = build.crateContainer('bp-2')!;
    crate.restore(
      [
        'water',
        'scrap',
        'components',
        'fuel',
        'rations',
        'repair-kit',
        'water',
        'scrap',
        'components',
        'fuel',
        'rations',
        'repair-kit',
      ].map((itemId) => ({
        itemId,
        count: 1,
      })) as never,
    );
    const before = crate.serialise();
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-3',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(false);
    expect(crate.serialise()).toEqual(before);
    build.demolish('bp-3');
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'bp-3',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(false);
    expect(
      build.commitCaretakerJob({
        kind: 'store-output',
        sourceId: 'gone',
        targetId: 'bp-2',
        itemId: 'greens',
        count: 1,
      }),
    ).toBe(false);
  });

  it('preserves a garden controller across relocation and invalidates stale endpoints after removal', () => {
    const { build } = fixture();
    build.restore(pieces, true);
    const before = build.gardenSnapshot('bp-4');
    const mesh = build.visual('bp-4');
    const moved = build.relocate('bp-4', {
      piece: 'seed-garden',
      cell: { x: 5, y: 0, z: 0 },
      rotation: Math.PI / 2,
    });
    expect(moved.ok).toBe(true);
    expect(build.visual('bp-4')).toBe(mesh);
    expect(build.gardenSnapshot('bp-4')).toEqual(before);
    expect(
      build.commitCaretakerJob({
        kind: 'water-garden',
        sourceId: 'bp-2',
        targetId: 'bp-4',
        itemId: 'water',
        count: 1,
      }),
    ).toBe(true);
    build.demolish('bp-4');
    expect(build.gardenSnapshot('bp-4')).toBeNull();
    expect(
      build.commitCaretakerJob({
        kind: 'water-garden',
        sourceId: 'bp-2',
        targetId: 'bp-4',
        itemId: 'water',
        count: 1,
      }),
    ).toBe(false);
  });

  it('keeps mixed caretaker transfers conserved through 100 restore and removal cycles', () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      const { build } = fixture();
      build.restore(pieces, true);
      const before = {
        crateWater: build.crateContainer('bp-2')?.count('water') ?? 0,
        crateGreens: build.crateContainer('bp-2')?.count('greens') ?? 0,
        crateScrap: build.crateContainer('bp-2')?.count('scrap') ?? 0,
        planterGreens:
          build.caretakerWorkSnapshot().producers.find((source) => source.id === 'bp-3')?.output
            .count ?? 0,
        gardenGreens: build.gardenSnapshot('bp-4')?.greens ?? 0,
        gardenWater: build.gardenSnapshot('bp-4')?.water ?? 0,
        collectorScrap: build.collectorContainer('bp-9')?.count('scrap') ?? 0,
      };
      expect(
        build.relocate('bp-4', {
          piece: 'seed-garden',
          cell: { x: 0, y: 0, z: 0 },
          rotation: cycle % 4,
        }).ok,
      ).toBe(true);
      expect(
        build.commitCaretakerJob({
          kind: 'water-garden',
          sourceId: 'bp-2',
          targetId: 'bp-4',
          itemId: 'water',
          count: 1,
        }),
      ).toBe(true);
      expect(
        build.commitCaretakerJob({
          kind: 'store-output',
          sourceId: 'bp-3',
          targetId: 'bp-2',
          itemId: 'greens',
          count: 1,
        }),
      ).toBe(true);
      expect(
        build.commitCaretakerJob({
          kind: 'store-output',
          sourceId: 'bp-9',
          targetId: 'bp-2',
          itemId: 'scrap',
          count: 1,
        }),
      ).toBe(true);
      const after = {
        crateWater: build.crateContainer('bp-2')?.count('water') ?? 0,
        crateGreens: build.crateContainer('bp-2')?.count('greens') ?? 0,
        crateScrap: build.crateContainer('bp-2')?.count('scrap') ?? 0,
        planterGreens:
          build.caretakerWorkSnapshot().producers.find((source) => source.id === 'bp-3')?.output
            .count ?? 0,
        gardenGreens: build.gardenSnapshot('bp-4')?.greens ?? 0,
        gardenWater: build.gardenSnapshot('bp-4')?.water ?? 0,
        collectorScrap: build.collectorContainer('bp-9')?.count('scrap') ?? 0,
      };
      expect(before.crateWater + before.gardenWater).toBe(after.crateWater + after.gardenWater);
      expect(before.crateGreens + before.planterGreens + before.gardenGreens).toBe(
        after.crateGreens + after.planterGreens + after.gardenGreens,
      );
      expect(before.crateScrap + before.collectorScrap).toBe(
        after.crateScrap + after.collectorScrap,
      );
      const saved = build.serialise();
      const restored = fixture().build;
      restored.restore(saved, true);
      expect(restored.crateContainer('bp-2')?.serialise()).toEqual(
        build.crateContainer('bp-2')?.serialise(),
      );
      expect(restored.collectorContainer('bp-9')?.serialise()).toEqual(
        build.collectorContainer('bp-9')?.serialise(),
      );
      expect(
        restored.caretakerWorkSnapshot().producers.find((source) => source.id === 'bp-3'),
      ).toEqual(build.caretakerWorkSnapshot().producers.find((source) => source.id === 'bp-3'));
      expect(restored.gardenSnapshot('bp-4')).toEqual(build.gardenSnapshot('bp-4'));
      expect(restored.demolish('bp-4')).toBeGreaterThan(0);
      expect(restored.gardenSnapshot('bp-4')).toBeNull();
      expect(
        restored.commitCaretakerJob({
          kind: 'store-output',
          sourceId: 'bp-4',
          targetId: 'bp-2',
          itemId: 'greens',
          count: 1,
        }),
      ).toBe(false);
    }
  });
});
