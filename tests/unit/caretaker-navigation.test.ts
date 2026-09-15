import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BuildGrid,
  canonicalEdge,
  cellCenter,
  cellKey,
  worldToCell,
  type Cell,
} from '@/building/BuildGrid';
import type { PieceId } from '@/data/build-pieces';
import { buildNavGraph } from '@/enemies/NavGraph';
import { CaretakerNavigation } from '@/companion/CaretakerNavigation';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });
const floor = (grid: BuildGrid<PieceId>, cells: readonly Cell[]) => {
  for (const cell of cells) grid.setCell(cell, 'floor');
};
const world = (group: THREE.Group, cell: Cell): THREE.Vector3 => {
  const point = cellCenter(cell);
  return group.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
};
const buildView = (grid: BuildGrid<PieceId>, navGraph = buildNavGraph(grid, [])) => ({
  navGraph,
  stationsNear: () =>
    grid.stationEntries().map((entry) => {
      const point = cellCenter(entry.cell);
      return {
        instanceId: String(entry.value),
        piece: entry.value,
        position: new THREE.Vector3(point.x, point.y, point.z),
      };
    }),
});

describe('CaretakerNavigation', () => {
  it('rejects a same-cell target behind an obstacle with clear endpoints', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(0, 0, 0)]);
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation(
      { group },
      buildView(grid) as never,
      (point) => Math.abs(point.x) > 0.1,
    );
    const from = world(group, c(0, 0, 0)).add(new THREE.Vector3(-0.7, 0, 0));
    const target = from.clone().add(new THREE.Vector3(1.4, 0, 0));
    expect(nav.routeFor(from, target)).toBeNull();
  });

  it('validates the last connector from a grid node to the actual service target', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(-1, 0, 0), c(0, 0, 0)]);
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation(
      { group },
      buildView(grid) as never,
      (point) => Math.abs(point.x - 0.3) > 0.11,
    );
    const target = world(group, c(0, 0, 0)).add(new THREE.Vector3(0.7, 0, 0));
    expect(nav.routeFor(world(group, c(-1, 0, 0)), target)).toBeNull();
  });

  it('converts a detour around a real wall between machine-local cells into world space', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(0, 0, 0), c(0, 0, 1), c(1, 0, 1), c(1, 0, 0)]);
    grid.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    const group = new THREE.Group();
    group.position.set(3, 0.1, -4);
    group.rotation.set(0.02, 0.3, -0.01);
    group.updateMatrixWorld(true);
    const graph = buildNavGraph(grid, []);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);
    const start = world(group, c(0, 0, 0));
    const target = world(group, c(1, 0, 0));
    const route = nav.routeFor(start, target);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThanOrEqual(3);
    expect(route?.at(-1)?.distanceTo(target)).toBeLessThan(1e-7);
    const localRoute = route!.map((point) => group.worldToLocal(point.clone()));
    expect(localRoute.some((point) => Math.abs(point.z - 2) < 1e-6)).toBe(true);
    expect(localRoute.some((point) => Math.abs(point.x - 2) < 1e-6)).toBe(true);
  });

  it('chooses a reachable adjacent approach instead of a station collider cell', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(-1, 0, 0), c(0, 0, 0), c(1, 0, 0), c(2, 0, 0)]);
    grid.setStation(c(1, 0, 0), 'workbench');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const graph = buildNavGraph(grid, []);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);
    const station = world(group, c(1, 0, 0));
    const approach = nav.approach(station, world(group, c(-1, 0, 0)));
    expect(approach).not.toBeNull();
    expect(approach!.distanceTo(station)).toBeCloseTo(2);
    expect(approach!.distanceTo(world(group, c(0, 0, 0)))).toBeLessThan(1e-7);
  });

  it('does not choose an approach separated from the station by a wall', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(-1, 0, 0), c(0, 0, 0), c(1, 0, 0), c(2, 0, 0)]);
    grid.setStation(c(1, 0, 0), 'workbench');
    grid.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid) as never);
    const station = world(group, c(1, 0, 0));
    const approach = nav.approach(station, world(group, c(-1, 0, 0)));
    expect(approach).toBeNull();
  });

  it('refuses cross-deck fixed links until the caretaker has physical stair clearance', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(0, 0, 0), c(0, 1, -2), c(3, 1, -2)]);
    const stairs: readonly [Cell, Cell] = [c(0, 0, 0), c(0, 1, -2)];
    const graph = buildNavGraph(grid, [], [stairs]);
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);
    const route = nav.routeFor(world(group, stairs[0]), world(group, stairs[1]));
    expect(route).toBeNull();
    expect(nav.routeFor(world(group, stairs[0]), world(group, c(3, 1, -2)))).toBeNull();
    // The shared graph remains intact for enemies/player-facing systems; this
    // fallback belongs only to the caretaker projection.
    expect(graph.links.get(cellKey(stairs[0]))?.map(cellKey)).toContain(cellKey(stairs[1]));
  });

  it('commits an authored fixed-link portal with ramp samples across decks', () => {
    const grid = new BuildGrid<PieceId>();
    const upper = c(-1, 0, 2);
    const lower = c(-1, -1, -2);
    floor(grid, [upper, lower]);
    const graph = buildNavGraph(grid, [], [[upper, lower]]);
    const group = new THREE.Group();
    group.position.set(4, 0, -3);
    group.rotation.y = 0.35;
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation(
      { group, fixedLinks: [[upper, lower]] } as never,
      buildView(grid, graph) as never,
    );
    const route = nav.routeFor(world(group, upper), world(group, lower));
    expect(route).not.toBeNull();
    const portal = route!.filter((point) => point.portalId);
    expect(portal.length).toBeGreaterThanOrEqual(6);
    expect(new Set(portal.map((point) => point.portalId)).size).toBe(1);
    expect(portal.filter((point) => point.portalExit)).toHaveLength(1);
    expect(route?.[0]?.distanceTo(world(group, upper))).toBeLessThan(0.7);
    expect(route?.at(-1)?.distanceTo(world(group, lower))).toBeLessThan(1e-7);
    const local = route!.map((point) => group.worldToLocal(point.clone()));
    expect(local[2]!.y).toBeGreaterThan(local[3]!.y);
    expect(local[2]!.x).toBeCloseTo(-2);
    expect(local[3]!.x).toBeCloseTo(-2);
    const downFromRamp = nav.routeFor(route![2]!, world(group, lower));
    expect(downFromRamp?.at(-1)?.distanceTo(world(group, lower))).toBeLessThan(1e-7);
    const reverse = nav.routeFor(world(group, lower), world(group, upper));
    expect(reverse).not.toBeNull();
    const upFromRamp = nav.routeFor(reverse![2]!, world(group, upper));
    expect(upFromRamp?.at(-1)?.distanceTo(world(group, upper))).toBeLessThan(1e-7);
  });

  it('refuses malformed fixed links and a portal with an occupied landing', () => {
    const grid = new BuildGrid<PieceId>();
    const upper = c(-1, 0, 2);
    const lower = c(-1, -1, -2);
    floor(grid, [upper, lower]);
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const malformed = new CaretakerNavigation(
      { group, fixedLinks: [[c(0, 0, 0), c(0, 2, 2)]] } as never,
      buildView(grid, buildNavGraph(grid, [])) as never,
    );
    expect(malformed.routeFor(world(group, upper), world(group, lower))).toBeNull();
    const graph = buildNavGraph(grid, [], [[upper, lower]]);
    const blocked = new CaretakerNavigation(
      { group, fixedLinks: [[upper, lower]] } as never,
      buildView(grid, graph) as never,
      (point) => Math.abs(point.x + 2) > 0.1 || point.z < 3,
    );
    expect(blocked.routeFor(world(group, upper), world(group, lower))).toBeNull();
  });

  it('does not mistake the continuous floor below a ramp for ramp traversal', () => {
    const grid = new BuildGrid<PieceId>();
    const upper = c(-1, -1, 2);
    const lower = c(-1, -2, -2);
    floor(grid, [upper, lower]);
    const graph = buildNavGraph(grid, [], [[upper, lower]]);
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation(
      { group, fixedLinks: [[upper, lower]] } as never,
      buildView(grid, graph) as never,
    );
    const belowRamp = new THREE.Vector3(-2, 14.74 + -2 * 3 - 0.25, 0);
    expect(nav.routeFor(belowRamp, world(group, upper))).toBeNull();
  });

  it('cannot leave and re-enter a level to connect same-level rooms', () => {
    const grid = new BuildGrid<PieceId>();
    const lowerA = c(0, 0, 0);
    const lowerB = c(2, 0, 0);
    const upperA = c(0, 1, 0);
    const upperMid = c(1, 1, 0);
    const upperB = c(2, 1, 0);
    floor(grid, [lowerA, lowerB, upperA, upperMid, upperB]);
    const graph = buildNavGraph(
      grid,
      [],
      [
        [lowerA, upperA],
        [lowerB, upperB],
      ],
    );
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);

    expect(graph.links.get(cellKey(lowerA))?.map(cellKey)).toContain(cellKey(upperA));
    expect(nav.routeFor(world(group, lowerA), world(group, lowerB))).toBeNull();
  });

  it('does not approach or route through an adjacent station cluster', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [
      c(-2, 0, 0),
      c(-1, 0, 0),
      c(0, 0, 0),
      c(1, 0, 0),
      c(2, 0, 0),
      c(-1, 0, 1),
      c(0, 0, 1),
      c(1, 0, 1),
      c(2, 0, 1),
    ]);
    grid.setStation(c(0, 0, 0), 'crate');
    grid.setStation(c(1, 0, 0), 'seed-garden');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const graph = buildNavGraph(grid, []);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);

    const approach = nav.approach(world(group, c(0, 0, 0)), world(group, c(-2, 0, 0)));
    expect(approach?.distanceTo(world(group, c(-1, 0, 0)))).toBeLessThan(1e-7);
    const route = nav.routeFor(world(group, c(-1, 0, 0)), world(group, c(2, 0, 0)));
    expect(route).not.toBeNull();
    expect(
      route!.some((point) => {
        const local = group.worldToLocal(point.clone());
        return worldToCell(local.x, local.z, 0).x === 1 && worldToCell(local.x, local.z, 0).z === 0;
      }),
    ).toBe(false);
  });

  it('can route out of a cell newly occupied by a station without treating it as transit', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(0, 0, 0), c(1, 0, 0), c(2, 0, 0)]);
    grid.setStation(c(0, 0, 0), 'crate');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const graph = buildNavGraph(grid, []);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid, graph) as never);
    const route = nav.routeFor(world(group, c(0, 0, 0)), world(group, c(2, 0, 0)));
    const routeCells = route?.map((point) => worldToCell(point.x, point.z, 0).x) ?? [];
    expect(routeCells[0]).toBe(1);
    expect(routeCells.at(-1)).toBe(2);
    expect(routeCells.every((x) => x === 1 || x === 2)).toBe(true);
  });

  it('selects a clear in-cell service offset when the adjacent cell centre is occupied', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(-2, 0, 0), c(-1, 0, 0), c(0, 0, 0)]);
    grid.setStation(c(0, 0, 0), 'seed-garden');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const blockedCenter = world(group, c(-1, 0, 0));
    const nav = new CaretakerNavigation(
      { group } as never,
      buildView(grid) as never,
      (point) => point.distanceTo(blockedCenter) > 0.1,
    );
    const approach = nav.approach(world(group, c(0, 0, 0)), world(group, c(-2, 0, 0)));
    expect(approach).not.toBeNull();
    expect(approach!.distanceTo(blockedCenter)).toBeCloseTo(0.45);
    expect(worldToCell(approach!.x, approach!.z, 0)).toEqual(c(-1, 0, 0));
    expect(approach!.distanceTo(world(group, c(0, 0, 0)))).toBeLessThan(2.3);
  });

  it('rejects every blocked in-cell sample rather than crossing a closed station edge', () => {
    const grid = new BuildGrid<PieceId>();
    floor(grid, [c(-1, 0, 0), c(0, 0, 0)]);
    grid.setStation(c(0, 0, 0), 'workbench');
    grid.setEdge(canonicalEdge(c(-1, 0, 0), 'east'), 'wall');
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const nav = new CaretakerNavigation({ group } as never, buildView(grid) as never, () => false);
    expect(nav.approach(world(group, c(0, 0, 0)), world(group, c(-1, 0, 0)))).toBeNull();
  });
});
