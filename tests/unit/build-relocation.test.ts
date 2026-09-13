import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BuildSystem } from '@/building/BuildSystem';
import { EventBus } from '@/core/events/EventBus';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import type { Materials } from '@/art/Materials';
import type { Machine } from '@/machine/Machine';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { BUILD_PIECES, REFUND_FRACTION } from '@/data/build-pieces';

function materials(): Materials {
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

function fixture() {
  let failNextCollider = false;
  const removed: object[] = [];
  const physics = {
    addFixedBox: () => {
      if (failNextCollider) {
        failNextCollider = false;
        throw new Error('injected collider failure');
      }
      return {};
    },
    addFixedBoxRotated: () => ({}),
    removeCollider: (collider: object) => removed.push(collider),
  } as unknown as PhysicsWorld;
  const bus = new EventBus();
  const inventory = new Container(1);
  inventory.add('scrap', 100);
  const resources = new ResourceAccess(
    inventory,
    () => [],
    () => ({ x: 0, y: 0, z: 0 }),
    bus,
  );
  const machine = {
    equipmentCells: [],
    deckCells: [],
    fixedLinks: [],
    movement: { totalWeight: 0 },
  } as unknown as Machine;
  const build = new BuildSystem(new THREE.Scene(), physics, bus, materials(), machine, resources);
  return {
    build,
    bus,
    inventory,
    machine,
    failCollider: () => {
      failNextCollider = true;
    },
    removed,
  };
}

describe('BuildSystem relocation', () => {
  it('preserves the live crate, contents, health, resources and mass and emits once', () => {
    const { build, bus, inventory, machine } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    const container = build.crateContainer(crate.instanceId)!;
    const visual = build.visual(crate.instanceId);
    container.add('components', 7);
    build.damagePiece(crate.instanceId, 9);
    const health = build.pieceHealth(crate.instanceId);
    const mass = machine.movement.totalWeight;
    const events: unknown[] = [];
    bus.on('build:relocated', (event) => events.push(event));

    const result = build.relocate(crate.instanceId, {
      piece: 'crate',
      cell: { x: 1, y: 0, z: 0 },
      rotation: 0,
    });

    expect(result.ok).toBe(true);
    expect(build.crateContainer(crate.instanceId)).toBe(container);
    expect(build.visual(crate.instanceId)).toBe(visual);
    expect(container.count('components')).toBe(7);
    expect(build.pieceHealth(crate.instanceId)).toBe(health);
    expect(machine.movement.totalWeight).toBe(mass);
    expect(inventory.count('scrap')).toBe(100);
    expect(events).toHaveLength(1);
    expect(build.serialise().find((piece) => piece.instanceId === crate.instanceId)?.cell).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
  });

  it('preserves producer progress and mesh identity through relocation', () => {
    const { build } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const producer = build.place(
      { piece: 'condenser', cell: { x: 0, y: 0, z: 0 }, rotation: 0 },
      true,
    )!;
    build.tickProducers(17.25, () => true);
    const before = build
      .serialise()
      .find((piece) => piece.instanceId === producer.instanceId)?.state;
    const visual = build.visual(producer.instanceId);
    expect(
      build.relocate(producer.instanceId, {
        piece: 'condenser',
        cell: { x: 1, y: 0, z: 0 },
        rotation: 0,
      }).ok,
    ).toBe(true);
    expect(build.visual(producer.instanceId)).toBe(visual);
    expect(
      build.serialise().find((piece) => piece.instanceId === producer.instanceId)?.state,
    ).toEqual(before);
  });

  it('preserves turret, collector and lamp live visual state objects', () => {
    for (const piece of ['turret-auto', 'collector-auto'] as const) {
      const { build } = fixture();
      build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
      build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
      const placed = build.place({ piece, cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
      const mesh = build.visual(placed.instanceId);
      const controller =
        piece === 'turret-auto'
          ? build.turretVisual(placed.instanceId)
          : build.collectorVisual(placed.instanceId);
      const container =
        piece === 'collector-auto' ? build.collectorContainer(placed.instanceId) : undefined;
      expect(
        build.relocate(placed.instanceId, { piece, cell: { x: 1, y: 0, z: 0 }, rotation: 2 }).ok,
      ).toBe(true);
      expect(build.visual(placed.instanceId)).toBe(mesh);
      expect(
        piece === 'turret-auto'
          ? build.turretVisual(placed.instanceId)
          : build.collectorVisual(placed.instanceId),
      ).toBe(controller);
      if (container) expect(build.collectorContainer(placed.instanceId)).toBe(container);
    }
    const { build } = fixture();
    const a = { x: 0, y: 0, z: 0, axis: 'x' as const },
      b = { x: 1, y: 0, z: 0, axis: 'x' as const };
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'wall', cell: { x: 0, y: 0, z: 0 }, edge: a, rotation: 0 }, true);
    build.place({ piece: 'wall', cell: { x: 1, y: 0, z: 0 }, edge: b, rotation: 0 }, true);
    const lamp = build.place(
      { piece: 'lamp', cell: { x: 0, y: 0, z: 0 }, edge: a, rotation: 0 },
      true,
    )!;
    build.setLampLit(lamp.instanceId, true);
    const mesh = build.visual(lamp.instanceId) as THREE.Mesh;
    const glow = (mesh.material as THREE.Material[])[1] as THREE.MeshStandardMaterial;
    expect(
      build.relocate(lamp.instanceId, {
        piece: 'lamp',
        cell: { x: 1, y: 0, z: 0 },
        edge: b,
        rotation: 0,
      }).ok,
    ).toBe(true);
    expect(build.visual(lamp.instanceId)).toBe(mesh);
    expect((mesh.material as THREE.Material[])[1] as THREE.MeshStandardMaterial).toBe(glow);
    expect(glow.emissiveIntensity).toBeGreaterThan(0);
  });

  it('survives 100 moves without changing resources, mass, mesh or container counts', () => {
    const { build, inventory, machine } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    const mesh = build.visual(crate.instanceId),
      container = build.crateContainer(crate.instanceId),
      mass = machine.movement.totalWeight;
    for (let i = 0; i < 100; i++)
      expect(
        build.relocate(crate.instanceId, {
          piece: 'crate',
          cell: { x: i % 2 ? 0 : 1, y: 0, z: 0 },
          rotation: i % 4,
        }).ok,
      ).toBe(true);
    expect(build.visual(crate.instanceId)).toBe(mesh);
    expect(build.crateContainer(crate.instanceId)).toBe(container);
    expect(build.pieceCount).toBe(3);
    expect(machine.movement.totalWeight).toBe(mass);
    expect(inventory.count('scrap')).toBe(100);
  });

  it('uses the real refund fraction and mirrors a blocked collector demolition', () => {
    const { build } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    expect(build.demolitionPreview(crate.instanceId).refund.scrap).toBe(
      Math.floor((BUILD_PIECES.crate.cost.scrap ?? 0) * REFUND_FRACTION),
    );
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const collector = build.place(
      { piece: 'collector-auto', cell: { x: 1, y: 0, z: 0 }, rotation: 0 },
      true,
    )!;
    build.collectorContainer(collector.instanceId)!.add('components', 2);
    expect(build.demolitionPreview(collector.instanceId)).toEqual({ ids: [], refund: {} });
  });

  it('rejects busy, actor-overlap and runtime-reserved destinations', () => {
    const { build } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    const destination = { piece: 'crate' as const, cell: { x: 1, y: 0, z: 0 }, rotation: 0 };
    expect(build.canRelocate(crate.instanceId, destination, { isBusy: () => true })).toEqual({
      ok: false,
      reason: 'busy',
    });
    expect(build.canRelocate(crate.instanceId, destination, { overlapsActor: () => true })).toEqual(
      { ok: false, reason: 'actor-overlap' },
    );
    build.setBuildBlocker((placement) =>
      placement.cell.x === 1 ? { ok: false, reason: 'blocked' } : null,
    );
    expect(build.canRelocate(crate.instanceId, destination)).toEqual({
      ok: false,
      reason: 'blocked',
    });
    expect(build.serialise().find((piece) => piece.instanceId === crate.instanceId)?.cell.x).toBe(
      0,
    );
    const floor = build.serialise().find((piece) => piece.definitionId === 'floor')!;
    expect(
      build.canRelocate(floor.instanceId, {
        piece: 'floor',
        cell: { x: 2, y: 0, z: 0 },
        rotation: 0,
      }),
    ).toEqual({ ok: false, reason: 'structural' });
  });

  it('relocates a fixture between real supporting walls', () => {
    const { build } = fixture();
    const a = { x: 0, y: 0, z: 0, axis: 'x' as const };
    const b = { x: 1, y: 0, z: 0, axis: 'x' as const };
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'wall', cell: { x: 0, y: 0, z: 0 }, edge: a, rotation: 0 }, true);
    build.place({ piece: 'wall', cell: { x: 1, y: 0, z: 0 }, edge: b, rotation: 0 }, true);
    const lamp = build.place(
      { piece: 'lamp', cell: { x: 0, y: 0, z: 0 }, edge: a, rotation: 0 },
      true,
    )!;
    const result = build.relocate(lamp.instanceId, {
      piece: 'lamp',
      cell: { x: 1, y: 0, z: 0 },
      edge: b,
      rotation: 0,
    });
    expect(result.ok).toBe(true);
    expect(build.serialise().find((piece) => piece.instanceId === lamp.instanceId)?.edge).toEqual(
      b,
    );
  });

  it('restores the original placement and navigation after collider creation fails', () => {
    const { build, bus, failCollider } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    const beforeNav = [...build.navGraph.links].map(([key, cells]) => [
      key,
      cells.map((cell) => ({ ...cell })),
    ]);
    const relocated = vi.fn();
    bus.on('build:relocated', relocated);
    failCollider();

    expect(
      build.relocate(crate.instanceId, { piece: 'crate', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(build.serialise().find((piece) => piece.instanceId === crate.instanceId)?.cell).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    expect(
      [...build.navGraph.links].map(([key, cells]) => [key, cells.map((cell) => ({ ...cell }))]),
    ).toEqual(beforeNav);
    expect(relocated).not.toHaveBeenCalled();
  });

  it('does not roll back a committed move when an optional callback throws', () => {
    const { build } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    const result = build.relocate(
      crate.instanceId,
      { piece: 'crate', cell: { x: 1, y: 0, z: 0 }, rotation: 0 },
      {
        onRelocated: () => {
          throw new Error('listener');
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(build.serialise().find((piece) => piece.instanceId === crate.instanceId)?.cell.x).toBe(
      1,
    );
  });

  it('does not roll back when a bus listener throws', () => {
    const { build, bus } = fixture();
    build.place({ piece: 'floor', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true);
    build.place({ piece: 'floor', cell: { x: 1, y: 0, z: 0 }, rotation: 0 }, true);
    const crate = build.place({ piece: 'crate', cell: { x: 0, y: 0, z: 0 }, rotation: 0 }, true)!;
    bus.on('build:relocated', () => {
      throw new Error('listener');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      build.relocate(crate.instanceId, { piece: 'crate', cell: { x: 1, y: 0, z: 0 }, rotation: 0 })
        .ok,
    ).toBe(true);
    expect(build.instance(crate.instanceId)?.cell.x).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
