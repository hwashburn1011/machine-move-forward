import * as THREE from 'three';
import {
  cellCenter,
  cellKey,
  neighbour,
  parseCellKey,
  SIDES,
  worldToCell,
  type Cell,
} from '@/building/BuildGrid';
import { findPath, levelOf, type NavGraph } from '@/enemies/NavGraph';
import type { BuildSystem } from '@/building/BuildSystem';
import type { Machine } from '@/machine/Machine';

type MachineFrame = Pick<Machine, 'group'>;
type NavigationBuild = Pick<BuildSystem, 'navGraph' | 'stationsNear'>;
const LOCAL_ORIGIN = new THREE.Vector3();

const finitePoint = (point: THREE.Vector3): boolean =>
  [point.x, point.y, point.z].every(Number.isFinite);

/** Converts BuildSystem's machine-local graph to posed world-space feet routes. */
export class CaretakerNavigation {
  private readonly localFrom = new THREE.Vector3();
  private readonly localTarget = new THREE.Vector3();
  private cachedGraph: NavGraph | null = null;
  private filteredGraph: NavGraph | null = null;
  private occupied = new Set<string>();
  private cachedRouteGraph: NavGraph | null = null;
  private readonly pathCache = new Map<string, readonly Cell[] | null>();

  constructor(
    private readonly machine: MachineFrame,
    private readonly build: NavigationBuild,
    private readonly isClear: (worldFeet: THREE.Vector3) => boolean = () => true,
  ) {}

  routeFor(fromWorld: THREE.Vector3, targetWorld: THREE.Vector3): THREE.Vector3[] | null {
    if (!finitePoint(fromWorld) || !finitePoint(targetWorld)) return null;
    const from = this.toLocal(fromWorld, this.localFrom);
    const target = this.toLocal(targetWorld, this.localTarget);
    const start = worldToCell(from.x, from.z, levelOf(from.y));
    const goal = worldToCell(target.x, target.z, levelOf(target.y));
    // The machine's fixed graph links describe its stairs, but the small
    // caretaker capsule cannot yet enter their physical landing clearance
    // reliably. Refuse cross-deck work instead of returning a route that wedges
    // the actor or permits a resource commit it never physically reached.
    if (start.y !== goal.y) return null;
    const sourceGraph = this.build.navGraph;
    const graph = this.walkableGraph(sourceGraph);
    if (!graph.links.has(cellKey(goal))) return null;
    if (cellKey(start) === cellKey(goal))
      return graph.links.has(cellKey(start)) ? [targetWorld.clone()] : null;

    const cells = this.routeFrom(sourceGraph, graph, start, goal);
    if (!cells) return null;
    const route: THREE.Vector3[] = [];
    for (const cell of cells) {
      const point = this.clearPointInCell(cell);
      if (!point) return null;
      route.push(point);
    }
    if (!this.isClear(targetWorld)) return null;
    route[route.length - 1]!.copy(targetWorld);
    return route;
  }

  /** Select a reachable walkable cell beside, never inside, a blocked station cell. */
  approach(worldStationPosition: THREE.Vector3, fromWorld?: THREE.Vector3): THREE.Vector3 | null {
    if (!finitePoint(worldStationPosition) || (fromWorld && !finitePoint(fromWorld))) return null;
    const station = this.toLocal(worldStationPosition, this.localTarget);
    const stationCell = worldToCell(station.x, station.z, levelOf(station.y));
    const sourceGraph = this.build.navGraph;
    const graph = this.walkableGraph(sourceGraph);
    const start = fromWorld
      ? (() => {
          const local = this.toLocal(fromWorld, this.localFrom);
          return worldToCell(local.x, local.z, levelOf(local.y));
        })()
      : null;

    const candidates = SIDES.map((side) => neighbour(stationCell, side))
      .filter((cell) => graph.links.has(cellKey(cell)))
      .filter((cell) =>
        (sourceGraph.links.get(cellKey(cell)) ?? []).some(
          (linked) => cellKey(linked) === cellKey(stationCell),
        ),
      )
      .map((cell) => ({
        cell,
        point: this.clearApproachPoint(cell, stationCell),
        path: start && start.y === cell.y ? this.routeFrom(sourceGraph, graph, start, cell) : null,
      }))
      .filter((candidate) => candidate.point && (!start || candidate.path !== null))
      .sort((a, b) => {
        const routeDelta = (a.path?.length ?? 0) - (b.path?.length ?? 0);
        if (routeDelta !== 0) return routeDelta;
        return cellKey(a.cell).localeCompare(cellKey(b.cell));
      });
    return candidates[0]?.point ?? null;
  }

  private toLocal(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return this.machine.group.worldToLocal(out.copy(world));
  }

  private cellWorld(cell: Cell): THREE.Vector3 {
    const point = cellCenter(cell);
    return this.machine.group.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
  }

  private clearApproachPoint(cell: Cell, station: Cell): THREE.Vector3 | null {
    const dx = Math.sign(station.x - cell.x);
    const dz = Math.sign(station.z - cell.z);
    const sideX = dz;
    const sideZ = -dx;
    return this.firstClearPoint(cell, [
      [0, 0],
      [dx * 0.45, dz * 0.45],
      [sideX * 0.45, sideZ * 0.45],
      [-sideX * 0.45, -sideZ * 0.45],
      [dx * 0.45 + sideX * 0.4, dz * 0.45 + sideZ * 0.4],
      [dx * 0.45 - sideX * 0.4, dz * 0.45 - sideZ * 0.4],
    ]);
  }

  private clearPointInCell(cell: Cell): THREE.Vector3 | null {
    return this.firstClearPoint(cell, [
      [0, 0],
      [0.45, 0],
      [-0.45, 0],
      [0, 0.45],
      [0, -0.45],
    ]);
  }

  private firstClearPoint(
    cell: Cell,
    offsets: readonly (readonly [number, number])[],
  ): THREE.Vector3 | null {
    const center = this.cellWorld(cell);
    for (const [x, z] of offsets) {
      const candidate = center.clone();
      const localOffset = new THREE.Vector3(x, 0, z).applyQuaternion(
        this.machine.group.getWorldQuaternion(new THREE.Quaternion()),
      );
      candidate.add(localOffset);
      if (this.isClear(candidate)) return candidate;
    }
    return null;
  }

  private routeCells(graph: NavGraph, start: Cell, goal: Cell): readonly Cell[] | null {
    if (graph !== this.cachedRouteGraph) {
      this.cachedRouteGraph = graph;
      this.pathCache.clear();
    }
    const key = `${cellKey(start)}>${cellKey(goal)}`;
    if (this.pathCache.has(key)) return this.pathCache.get(key) ?? null;
    const path = completePath(graph, start, goal);
    if (this.pathCache.size >= 32)
      this.pathCache.delete(this.pathCache.keys().next().value as string);
    this.pathCache.set(key, path ? path.map((cell) => ({ ...cell })) : null);
    return this.pathCache.get(key) ?? null;
  }

  /** A* graph with live station centres removed as both nodes and edges. */
  private walkableGraph(source: NavGraph): NavGraph {
    if (source === this.cachedGraph && this.filteredGraph) return this.filteredGraph;
    this.cachedGraph = source;
    this.cachedRouteGraph = null;
    this.pathCache.clear();
    this.occupied = new Set(
      this.build
        .stationsNear(LOCAL_ORIGIN, Infinity)
        .map((station) =>
          cellKey(worldToCell(station.position.x, station.position.z, levelOf(station.position.y))),
        ),
    );
    const links = new Map<string, Cell[]>();
    for (const [key, neighbours] of source.links) {
      if (this.occupied.has(key)) continue;
      const nodeLevel = parseCellKey(key).y;
      links.set(
        key,
        neighbours.filter((cell) => !this.occupied.has(cellKey(cell)) && cell.y === nodeLevel),
      );
    }
    this.filteredGraph = { links };
    return this.filteredGraph;
  }

  /** Permit escape from a cell that became occupied, but never claim it is a walkable node. */
  private routeFrom(
    source: NavGraph,
    filtered: NavGraph,
    start: Cell,
    goal: Cell,
  ): readonly Cell[] | null {
    if (filtered.links.has(cellKey(start))) return this.routeCells(filtered, start, goal);
    if (!this.occupied.has(cellKey(start))) return null;
    const exits = (source.links.get(cellKey(start)) ?? [])
      .filter((cell) => filtered.links.has(cellKey(cell)))
      .sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
    let best: Cell[] | null = null;
    for (const exit of exits) {
      const tail = completePath(filtered, exit, goal);
      if (!tail) continue;
      const candidate = [exit, ...tail];
      if (!best || candidate.length < best.length) best = candidate;
    }
    return best;
  }
}

function completePath(graph: NavGraph, start: Cell, goal: Cell): Cell[] | null {
  if (!graph.links.has(cellKey(start)) || !graph.links.has(cellKey(goal))) return null;
  if (cellKey(start) === cellKey(goal)) return [];
  const path = findPath(graph, start, goal);
  return path.at(-1) && cellKey(path.at(-1)!) === cellKey(goal) ? path : null;
}
