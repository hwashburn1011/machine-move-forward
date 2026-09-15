import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BuildSystem, type BuildPieceInstance } from '@/building/BuildSystem';
import { EventBus } from '@/core/events/EventBus';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import type { Materials } from '@/art/Materials';
import type { Machine } from '@/machine/Machine';
import { ITEMS } from '@/data/items';

const fixture = (capacity = 16) => {
  const inventory = new Container(capacity);
  const bus = new EventBus();
  const resources = new ResourceAccess(
    inventory,
    () => [],
    () => ({ x: 0, y: 0, z: 0 }),
    bus,
  );
  const material = new THREE.MeshBasicMaterial();
  const build = new BuildSystem(
    new THREE.Scene(),
    {
      addFixedBox: () => ({}),
      addFixedBoxRotated: () => ({}),
      removeCollider: () => undefined,
    } as unknown as PhysicsWorld,
    bus,
    {
      hull: material,
      hullDark: material,
      rustedSteel: material,
      deckPlate: material,
      buildPlate: material,
      stationMetal: material,
      bareSteel: material,
      accent: material,
      hazard: material,
      rubber: material,
      treadMap: new THREE.DataTexture(),
      glass: material,
      emissiveWarn: material,
    } as unknown as Materials,
    {
      equipmentCells: [],
      deckCells: [{ x: 0, y: 0, z: 0 }],
      fixedLinks: [],
      movement: { totalWeight: 0 },
    } as unknown as Machine,
    resources,
  );
  return { build, inventory, bus };
};

const piece = (
  definitionId: 'seed-garden' | 'collector-auto',
  state?: BuildPieceInstance['state'],
): BuildPieceInstance => ({
  instanceId: 'bp-2',
  definitionId,
  cell: { x: 0, y: 0, z: 0 },
  rotation: 0,
  health: definitionId === 'seed-garden' ? 110 : 125,
  state,
});
const floor: BuildPieceInstance = {
  instanceId: 'bp-1',
  definitionId: 'floor',
  cell: { x: 0, y: 0, z: 0 },
  rotation: 0,
  health: 180,
};

describe('garden and destructive removal transactions', () => {
  it('secures garden contents before demolition while allowing its refund to overflow', () => {
    const { build, inventory } = fixture(2);
    build.restore([floor, piece('seed-garden', { format: 1, water: 2, greens: 3, progressS: 0 })]);

    build.demolish('bp-2');

    expect(build.instance('bp-2')).toBeNull();
    expect(inventory.count('water')).toBe(2);
    expect(inventory.count('greens')).toBe(3);
    expect(inventory.count('scrap')).toBe(0);
    expect(inventory.count('components')).toBe(0);
  });

  it('does not refund a combat-destroyed garden', () => {
    const { build, inventory, bus } = fixture();
    build.restore([floor, piece('seed-garden')]);
    bus.on('build:damaged', () => build.demolish('bp-2'));

    build.damagePiece('bp-2', 999);

    expect(build.instance('bp-2')).toBeNull();
    expect(inventory.count('scrap')).toBe(0);
    expect(inventory.count('components')).toBe(0);
  });

  it('removes a destroyed full collector even when no destination has room', () => {
    const { build, inventory } = fixture(1);
    inventory.add('scrap', ITEMS.scrap.stackSize);
    build.restore([floor, piece('collector-auto', { slots: [{ itemId: 'scrap', count: 50 }] })]);
    expect(build.collectorContainer('bp-2')?.count('scrap')).toBe(50);

    build.damagePiece('bp-2', 999);

    expect(build.instance('bp-2')).toBeNull();
    expect(inventory.count('scrap')).toBe(ITEMS.scrap.stackSize);
  });

  it('prevents inventory notifications from re-entering watering and harvesting', () => {
    const { build, inventory, bus } = fixture();
    inventory.add('water', 2);
    build.restore([floor, piece('seed-garden')]);
    const attempted = vi.fn(() => {
      build.demolish('bp-2');
      build.clear();
    });
    const off = bus.on('inventory:changed', attempted);

    expect(build.waterGarden('bp-2')).toBe(2);
    expect(build.instance('bp-2')).not.toBeNull();
    expect(build.tickGardens(360)).toEqual([{ instanceId: 'bp-2', itemId: 'greens', count: 6 }]);
    expect(build.harvestGarden('bp-2')).toBe(6);
    expect(build.instance('bp-2')).not.toBeNull();
    expect(inventory.count('greens')).toBe(6);
    expect(build.gardenSnapshot('bp-2')?.greens).toBe(0);
    expect(attempted).toHaveBeenCalled();
    off();
  });
});
