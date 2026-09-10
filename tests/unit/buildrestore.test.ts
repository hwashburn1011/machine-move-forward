import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildSystem } from '@/building/BuildSystem';
import { Container } from '@/items/Container';
import { EventBus } from '@/core/events/EventBus';
import { ResourceAccess } from '@/items/ResourceAccess';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Machine } from '@/machine/Machine';

function stubMaterials(): Materials {
  const material = new THREE.MeshBasicMaterial();
  return {
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
  } as unknown as Materials;
}

function stubPhysics(): PhysicsWorld {
  return {
    addFixedBox: () => ({}),
    addFixedBoxRotated: () => ({}),
    removeCollider: () => undefined,
  } as unknown as PhysicsWorld;
}

function buildForRestore(inventory = new Container(16)): BuildSystem {
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
  return new BuildSystem(
    new THREE.Scene(),
    stubPhysics(),
    bus,
    stubMaterials(),
    machine,
    resources,
  );
}

describe('build save identity', () => {
  it('relocates a blocked legacy station with its id, health and contents', () => {
    const build = buildForRestore();
    build.gridView.blockCell({ x: 2, y: 0, z: 2 });
    build.restore(
      [
        {
          instanceId: 'bp-20',
          definitionId: 'crate',
          cell: { x: 2, y: 0, z: 2 },
          rotation: 0,
          health: 41,
          state: { slots: [{ itemId: 'components', count: 3 }] },
        },
      ],
      true,
    );
    const crate = build.serialise().find((p) => p.instanceId === 'bp-20');
    expect(crate?.cell).toEqual({ x: 0, y: 0, z: 0 });
    expect(crate?.health).toBe(41);
    expect((crate?.state?.slots as unknown[])?.[0]).toEqual({ itemId: 'components', count: 3 });
    expect(build.recoveryPieces).toHaveLength(0);
    build.clear();
  });

  it('retains an unplaceable legacy piece for the next save instead of discarding it', () => {
    const build = buildForRestore();
    build.gridView.blockCell({ x: 0, y: 0, z: 0 });
    const piece = {
      instanceId: 'bp-21',
      definitionId: 'crate' as const,
      cell: { x: 0, y: 0, z: 0 },
      rotation: 0,
      health: 41,
      state: { slots: [{ itemId: 'components', count: 3 }] },
    };
    build.restore([piece], true);
    expect(build.recoveryPieces).toEqual([piece]);
    expect(build.serialise()).toHaveLength(0);
    build.clear();
  });

  it('sanitizes malformed collector buffer slots during restore', () => {
    const build = buildForRestore();
    build.restore([
      {
        instanceId: 'bp-1',
        definitionId: 'floor' as const,
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 120,
      },
      {
        instanceId: 'bp-2',
        definitionId: 'collector-auto' as const,
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 120,
        state: {
          slots: [
            { itemId: 'scrap', count: 99999 },
            { itemId: 'not-an-item', count: 4 },
            { itemId: 'fuel', count: -2 },
            { itemId: 'components', count: 2.5 },
          ],
        },
      },
    ]);
    expect(build.collectorContainer('bp-2')?.serialise()).toEqual([
      { itemId: 'scrap', count: 100 },
      null,
      null,
      null,
      null,
      null,
    ]);
    build.clear();
  });

  it('refuses collector demolition when its buffer cannot fit, preserving every item', () => {
    const inventory = new Container(1);
    inventory.add('scrap', 100);
    const build = buildForRestore(inventory);
    build.restore([
      {
        instanceId: 'bp-1',
        definitionId: 'floor' as const,
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 120,
      },
      {
        instanceId: 'bp-2',
        definitionId: 'collector-auto' as const,
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 120,
        state: { slots: [{ itemId: 'components', count: 3 }] },
      },
    ]);
    expect(build.damagePiece('bp-2', 99999)).toBeGreaterThan(0);
    expect(build.collectorContainer('bp-2')?.count('components')).toBe(3);
    expect(build.serialise().some((piece) => piece.instanceId === 'bp-2')).toBe(true);
    expect(inventory.count('scrap')).toBe(100);
    build.clear();
  });

  it('retains authored storage templates through new-game clearing and save restore', () => {
    const build = buildForRestore();
    const scene = new THREE.Group();
    const storage = new THREE.Group();
    storage.name = 'MMF_StorageDetail';
    storage.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    scene.add(storage);
    build.applyAuthoredStationKit({ scene, clips: [] });
    const saved = [
      {
        instanceId: 'bp-20',
        definitionId: 'floor' as const,
        cell: { x: -2, y: 0, z: -2 },
        rotation: 0,
        health: 120,
      },
      {
        instanceId: 'bp-21',
        definitionId: 'crate' as const,
        cell: { x: -2, y: 0, z: -2 },
        rotation: 0,
        health: 100,
      },
    ];
    for (let i = 0; i < 2; i++) {
      build.restore(saved);
      expect(
        build.group.getObjectByName('bp-21')?.getObjectByName('MMF_StorageDetail'),
      ).toBeTruthy();
      expect(build.serialise().map((piece) => piece.instanceId)).toEqual(['bp-20', 'bp-21']);
    }
    build.clear();
  });
  it('preserves structure ids so turret aim state can be restored by instance id', () => {
    const build = buildForRestore();
    const saved = [
      {
        instanceId: 'bp-7',
        definitionId: 'floor' as const,
        cell: { x: -2, y: 0, z: -2 },
        rotation: 0,
        health: 120,
      },
      {
        instanceId: 'bp-8',
        definitionId: 'turret-manual' as const,
        cell: { x: -2, y: 0, z: -2 },
        rotation: 0,
        health: 180,
      },
    ];

    build.restore(saved);
    expect(build.serialise().map((piece) => piece.instanceId)).toEqual(['bp-7', 'bp-8']);

    const placed = build.place({ piece: 'floor', cell: { x: -2, y: 0, z: 0 }, rotation: 0 }, true);
    expect(placed?.instanceId).toBe('bp-9');

    const roundTrip = build.serialise();
    build.restore(roundTrip);
    expect(
      build
        .serialise()
        .map((piece) => piece.instanceId)
        .sort(),
    ).toEqual(['bp-7', 'bp-8', 'bp-9']);
  });
});
