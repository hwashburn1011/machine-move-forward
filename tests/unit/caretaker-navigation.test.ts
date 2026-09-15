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
    expect(route).toHaveLength(3);
    expect(route?.at(-1)?.distanceTo(target)).toBeLessThan(1e-7);
    const localRoute = route!.map((point) => group.worldToLocal(point.clone()));
    expect(localRoute[0]!.z).toBeCloseTo(2);
    expect(localRoute[1]!.x).toBeCloseTo(2);
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
    expect(route?.map((point) => worldToCell(point.x, point.z, 0).x)).toEqual([1, 2]);
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
