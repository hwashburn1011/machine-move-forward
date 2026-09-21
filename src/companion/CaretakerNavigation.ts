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
import { findPath, levelOf, type FixedLink, type NavGraph } from '@/enemies/NavGraph';
import type { BuildSystem } from '@/building/BuildSystem';
import type { Machine } from '@/machine/Machine';
import {
  caretakerPortalFor,
  cloneCaretakerWaypoint,
  type CaretakerPortal,
  type CaretakerWaypoint,
} from '@/companion/CaretakerPortals';
import { DECK_SURFACE_Y, LEVEL_HEIGHT, NOMAD_STAIR_RUN } from '@/game/constants';

type MachineFrame = Pick<Machine, 'group'> & { fixedLinks?: readonly FixedLink[] };
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
  private readonly clearLocalPoints = new Map<string, THREE.Vector3>();
  private readonly edgeLocalPaths = new Map<string, readonly THREE.Vector3[]>();
  private cachedRouteGraph: NavGraph | null = null;
  private readonly pathCache = new Map<string, readonly Cell[] | null>();

  constructor(
    private readonly machine: MachineFrame,
    private readonly build: NavigationBuild,
    private readonly isClear: (worldFeet: THREE.Vector3) => boolean = () => true,
  ) {}

  routeFor(fromWorld: THREE.Vector3, targetWorld: THREE.Vector3): CaretakerWaypoint[] | null {
    if (!finitePoint(fromWorld) || !finitePoint(targetWorld)) return null;
    const from = this.toLocal(fromWorld, this.localFrom);
    const target = this.toLocal(targetWorld, this.localTarget);
    const start = worldToCell(from.x, from.z, levelOf(from.y));
    const goal = worldToCell(target.x, target.z, levelOf(target.y));
    const sourceGraph = this.build.navGraph;
    const graph = this.walkableGraph(sourceGraph);
    if (!graph.links.has(cellKey(goal)) || !this.isClear(targetWorld)) return null;

    // A ramp can sit above a perfectly valid floor cell on the bottom deck.
    // Select it by its measured surface height, not the cell's floor label.
    const link = (this.machine.fixedLinks ?? []).find((pair) => {
      const lower = Math.min(pair[0].y, pair[1].y);
      const halfRun = NOMAD_STAIR_RUN / 2;
      const z = Math.max(-halfRun, Math.min(halfRun, from.z));
      const rampY =
        DECK_SURFACE_Y + lower * LEVEL_HEIGHT + ((z + halfRun) / NOMAD_STAIR_RUN) * LEVEL_HEIGHT;
      return (
        Math.abs(from.x + 2) < 0.5 &&
        Math.abs(from.z) < 3.1 &&
        Math.abs(from.y - rampY) < 0.4 &&
        this.portalFor(pair[0], pair[1]) !== null
      );
    });
    if (link) return this.routeFromRamp(link, fromWorld, targetWorld, goal, sourceGraph, graph);
    if (cellKey(start) === cellKey(goal))
      return graph.links.has(cellKey(start)) ? this.finishRoute([], targetWorld, fromWorld) : null;
    const cells = this.routeFrom(sourceGraph, graph, start, goal);
    if (!cells) return null;
    const route = this.expandCells(start, cells, graph);
    if (!route) return null;
    // The actor may stand anywhere inside its cell. Validate its connection
    // to the sampled graph too, not just the edges between grid centres.
    if (graph.links.has(cellKey(start)) && route[0] && !route[0].portalId) {
      const entry = this.connector(fromWorld, route[0]);
      if (!entry) return null;
      route.unshift(...entry.slice(1, -1).map(preciseWaypoint));
    }
    return this.finishRoute(route, targetWorld, fromWorld);
  }

  /** Select a reachable service point beside, never inside, a station. */
  approach(worldStationPosition: THREE.Vector3, fromWorld?: THREE.Vector3): THREE.Vector3 | null {
    if (!finitePoint(worldStationPosition) || (fromWorld && !finitePoint(fromWorld))) return null;
    const station = this.toLocal(worldStationPosition, this.localTarget);
    const stationCell = worldToCell(station.x, station.z, levelOf(station.y));
    const sourceGraph = this.build.navGraph;
    const graph = this.walkableGraph(sourceGraph);
    const candidates = SIDES.map((side) => neighbour(stationCell, side))
      .filter((cell) => graph.links.has(cellKey(cell)))
      .filter((cell) =>
        (sourceGraph.links.get(cellKey(cell)) ?? []).some(
          (linked) => cellKey(linked) === cellKey(stationCell),
        ),
      )
      .map((cell) => {
        const point = this.clearApproachPoint(cell, stationCell);
        const route = point && fromWorld ? this.routeFor(fromWorld, point) : null;
        return { cell, point, route };
      })
      .filter((candidate) => candidate.point && (!fromWorld || candidate.route !== null))
      .sort(
        (a, b) =>
          (a.route?.length ?? 0) - (b.route?.length ?? 0) ||
          cellKey(a.cell).localeCompare(cellKey(b.cell)),
      );
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
    const cached = this.clearLocalPoints.get(cellKey(cell));
    if (cached) return this.machine.group.localToWorld(cached.clone());
    for (const link of this.machine.fixedLinks ?? []) {
      const other = cellKey(link[0]) === cellKey(cell) ? link[1] : link[0];
      const landing = this.portalFor(cell, other)?.samples[0];
      if (landing && this.isClear(landing)) return landing.clone();
    }
    return this.firstClearPoint(cell, [
      [0, 0],
      [0, 0.45],
      [0, -0.45],
      [0.45, 0],
      [-0.45, 0],
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

  private portalFor(from: Cell, to: Cell): CaretakerPortal | null {
    for (const link of this.machine.fixedLinks ?? []) {
      const portal = caretakerPortalFor(link, from, to, (point) =>
        this.machine.group.localToWorld(point),
      );
      if (portal) return portal;
    }
    return null;
  }

  private portalOpen(portal: CaretakerPortal, graph: NavGraph): boolean {
    return (
      graph.links.has(cellKey(portal.to)) &&
      (graph.links.get(cellKey(portal.from)) ?? []).some(
        (to) => cellKey(to) === cellKey(portal.to),
      ) &&
      portal.samples.every((point) => finitePoint(point) && this.isClear(point))
    );
  }

  private expandCells(
    start: Cell,
    cells: readonly Cell[],
    graph: NavGraph,
  ): CaretakerWaypoint[] | null {
    const route: CaretakerWaypoint[] = [];
    let previous = start;
    for (const cell of cells) {
      if (cell.y !== previous.y) {
        const portal = this.portalFor(previous, cell);
        if (!portal || !this.portalOpen(portal, graph)) return null;
        route.push(...portal.samples.map(cloneCaretakerWaypoint));
      } else {
        const edge = this.edgeLocalPaths.get(`${cellKey(previous)}>${cellKey(cell)}`);
        if (!edge) {
          // A station may have just been moved onto the actor's cell. Permit
          // the first exit only; the physical capsule still resolves contact.
          if (previous !== start || !this.occupied.has(cellKey(start))) return null;
          const exit = this.clearPointInCell(cell);
          if (!exit) return null;
          route.push(exit);
        } else {
          route.push(
            ...edge.map((point) => {
              const world: CaretakerWaypoint = this.machine.group.localToWorld(point.clone());
              world.precise = true;
              return world;
            }),
          );
        }
      }
      previous = cell;
    }
    return route;
  }

  private finishRoute(
    route: CaretakerWaypoint[],
    target: THREE.Vector3,
    from: THREE.Vector3,
  ): CaretakerWaypoint[] | null {
    // Keep the measured portal exit, even if the target shares its grid cell.
    // Overwriting it could turn the last ramp segment toward an adjacent wall.
    const tail = this.connector(route.at(-1) ?? from, target);
    if (!tail) return null;
    route.push(...tail.slice(1, -1).map(preciseWaypoint), target.clone());
    return route;
  }

  private routeFromRamp(
    link: FixedLink,
    from: THREE.Vector3,
    target: THREE.Vector3,
    goal: Cell,
    source: NavGraph,
    graph: NavGraph,
  ): CaretakerWaypoint[] | null {
    const localZ = this.toLocal(from, new THREE.Vector3()).z;
    let best: CaretakerWaypoint[] | null = null;
    let bestDistance = Infinity;
    for (const [entry, exit] of [link, [link[1], link[0]] as FixedLink]) {
      const portal = this.portalFor(entry, exit);
      if (!portal || !this.portalOpen(portal, graph)) continue;
      const cells = this.routeFrom(source, graph, exit, goal);
      if (!cells) continue;
      const tail = this.expandCells(exit, cells, graph);
      if (!tail) continue;
      const ascending = exit.y > entry.y;
      const remainder = portal.samples
        .filter((point) => {
          const z = this.toLocal(point, new THREE.Vector3()).z;
          return ascending ? z > localZ - 0.04 : z < localZ + 0.04;
        })
        .map(cloneCaretakerWaypoint);
      if (!remainder.length) continue;
      const route = this.finishRoute([...remainder, ...tail], target, from);
      if (!route) continue;
      let distance = 0;
      let previous = from;
      for (const point of route) {
        distance += previous.distanceTo(point);
        previous = point;
      }
      if (distance < bestDistance) {
        best = route;
        bestDistance = distance;
      }
    }
    return best;
  }

  private isFixedLink(from: Cell, to: Cell): boolean {
    return this.portalFor(from, to) !== null;
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
    this.clearLocalPoints.clear();
    this.edgeLocalPaths.clear();
    for (const key of source.links.keys()) {
      if (this.occupied.has(key)) continue;
      const cell = parseCellKey(key);
      const point = this.clearPointInCell(cell);
      if (point) this.clearLocalPoints.set(key, this.machine.group.worldToLocal(point));
      else this.occupied.add(key);
    }
    const links = new Map<string, Cell[]>();
    for (const [key, neighbours] of source.links) {
      if (this.occupied.has(key)) continue;
      const from = parseCellKey(key);
      const fromPoint = this.clearPointInCell(from)!;
      links.set(
        key,
        neighbours.filter((cell) => {
          if (this.occupied.has(cellKey(cell))) return false;
          if (cell.y !== from.y) return this.isFixedLink(from, cell);
          const toPoint = this.clearPointInCell(cell);
          const path = toPoint ? this.connector(fromPoint, toPoint) : null;
          if (!path) return false;
          this.edgeLocalPaths.set(
            `${key}>${cellKey(cell)}`,
            path.map((point) => this.machine.group.worldToLocal(point)),
          );
          return true;
        }),
      );
    }
    this.filteredGraph = { links };
    return this.filteredGraph;
  }

  /** Short side steps let a clear grid edge pass a pipe between its centres. */
  private connector(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] | null {
    if (this.clearSegment(a, b)) return [a.clone(), b.clone()];
    const direction = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    for (const offset of [0.45, -0.45, 0.75, -0.75]) {
      const path = [
        a.clone(),
        a.clone().addScaledVector(side, offset),
        b.clone().addScaledVector(side, offset),
        b.clone(),
      ];
      if (
        path.every((p) => this.isClear(p)) &&
        path.slice(1).every((p, i) => this.clearSegment(path[i]!, p))
      )
        return path;
    }
    return null;
  }

  /** Reject links that cross machinery even when both grid centres are clear. */
  private clearSegment(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.35));
    const point = new THREE.Vector3();
    for (let index = 1; index < steps; index++) {
      point.lerpVectors(a, b, index / steps);
      if (!this.isClear(point)) return false;
    }
    return true;
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

function preciseWaypoint(point: THREE.Vector3): CaretakerWaypoint {
  const waypoint: CaretakerWaypoint = point.clone();
  waypoint.precise = true;
  return waypoint;
}

function completePath(graph: NavGraph, start: Cell, goal: Cell): Cell[] | null {
  if (!graph.links.has(cellKey(start)) || !graph.links.has(cellKey(goal))) return null;
  if (cellKey(start) === cellKey(goal)) return [];
  const path = findPath(graph, start, goal);
  return path.at(-1) && cellKey(path.at(-1)!) === cellKey(goal) ? path : null;
}
