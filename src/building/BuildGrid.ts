import {
  DECK_HEIGHT,
  GRID_LEVELS,
  GRID_MIN_LEVEL,
  GRID_MAX_X,
  GRID_MAX_Z,
  GRID_MIN_X,
  GRID_MIN_Z,
  GRID_TILE,
  LEVEL_HEIGHT,
} from '@/game/constants';

/**
 * Spatial index for the build grid.
 *
 * Deliberately knows nothing about pieces, meshes, or physics — it stores
 * opaque payloads at cells and edges. All the logic that can actually be wrong
 * (addressing, canonicalisation, bounds) lives here where it is testable in
 * node without a browser.
 */

export type Axis = 'x' | 'z';
export type Side = 'north' | 'south' | 'east' | 'west';

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/**
 * The boundary between two cells.
 *
 * Always addressed from the cell on the -X or -Z side of the boundary, so a
 * wall has exactly one address regardless of which cell you place it from.
 * Without this rule two walls can occupy the same physical space, and room
 * detection sees a boundary that is present from one side and absent from the
 * other.
 */
export interface Edge {
  x: number;
  y: number;
  z: number;
  axis: Axis;
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y},${c.z}`;
}

export function edgeKey(e: Edge): string {
  return `${e.x},${e.y},${e.z},${e.axis}`;
}

export function parseCellKey(key: string): Cell {
  const [x, y, z] = key.split(',').map(Number);
  return { x: x as number, y: y as number, z: z as number };
}

export function parseEdgeKey(key: string): Edge {
  const parts = key.split(',');
  return {
    x: Number(parts[0]),
    y: Number(parts[1]),
    z: Number(parts[2]),
    axis: parts[3] as Axis,
  };
}

/** The canonical edge on one side of a cell. */
export function canonicalEdge(cell: Cell, side: Side): Edge {
  switch (side) {
    case 'east':
      return { x: cell.x, y: cell.y, z: cell.z, axis: 'x' };
    case 'west':
      return { x: cell.x - 1, y: cell.y, z: cell.z, axis: 'x' };
    case 'south':
      return { x: cell.x, y: cell.y, z: cell.z, axis: 'z' };
    case 'north':
      return { x: cell.x, y: cell.y, z: cell.z - 1, axis: 'z' };
  }
}

export const SIDES: readonly Side[] = ['north', 'east', 'south', 'west'];

/** Neighbouring cell across one side. */
export function neighbour(cell: Cell, side: Side): Cell {
  switch (side) {
    case 'east':
      return { x: cell.x + 1, y: cell.y, z: cell.z };
    case 'west':
      return { x: cell.x - 1, y: cell.y, z: cell.z };
    case 'south':
      return { x: cell.x, y: cell.y, z: cell.z + 1 };
    case 'north':
      return { x: cell.x, y: cell.y, z: cell.z - 1 };
  }
}

/** The shared edge, or null if the cells are not orthogonally adjacent. */
export function edgeBetween(a: Cell, b: Cell): Edge | null {
  if (a.y !== b.y) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;

  if (dz === 0 && Math.abs(dx) === 1) {
    return { x: Math.min(a.x, b.x), y: a.y, z: a.z, axis: 'x' };
  }
  if (dx === 0 && Math.abs(dz) === 1) {
    return { x: a.x, y: a.y, z: Math.min(a.z, b.z), axis: 'z' };
  }
  return null;
}

/** The two cells an edge separates, in -X/-Z then +X/+Z order. */
export function cellsOfEdge(e: Edge): [Cell, Cell] {
  if (e.axis === 'x') {
    return [
      { x: e.x, y: e.y, z: e.z },
      { x: e.x + 1, y: e.y, z: e.z },
    ];
  }
  return [
    { x: e.x, y: e.y, z: e.z },
    { x: e.x, y: e.y, z: e.z + 1 },
  ];
}

export function inEnvelope(c: Cell): boolean {
  if (!Number.isInteger(c.x) || !Number.isInteger(c.y) || !Number.isInteger(c.z)) return false;
  return (
    c.x >= GRID_MIN_X &&
    c.x <= GRID_MAX_X &&
    c.z >= GRID_MIN_Z &&
    c.z <= GRID_MAX_Z &&
    c.y >= GRID_MIN_LEVEL &&
    c.y < GRID_LEVELS
  );
}

/**
 * World position of a cell's centre. Y is the FLOOR plane of that level, so
 * level 0 sits exactly on the existing deck surface.
 */
export function cellCenter(c: Cell): { x: number; y: number; z: number } {
  return {
    x: c.x * GRID_TILE,
    y: DECK_HEIGHT + c.y * LEVEL_HEIGHT,
    z: c.z * GRID_TILE,
  };
}

/** World position of an edge's centre, at the floor plane of its level. */
export function edgeCenter(e: Edge): { x: number; y: number; z: number } {
  const [a, b] = cellsOfEdge(e);
  const ca = cellCenter(a);
  const cb = cellCenter(b);
  return { x: (ca.x + cb.x) / 2, y: ca.y, z: (ca.z + cb.z) / 2 };
}

/** Convert a world XZ position to the cell containing it, at a given level. */
export function worldToCell(x: number, z: number, level: number): Cell {
  return {
    x: Math.round(x / GRID_TILE),
    y: level,
    z: Math.round(z / GRID_TILE),
  };
}

export interface CellEntry<T> {
  cell: Cell;
  value: T;
}

export interface EdgeEntry<T> {
  edge: Edge;
  value: T;
}

export class BuildGrid<T = string> {
  private readonly cells = new Map<string, T>();
  private readonly edges = new Map<string, T>();
  /**
   * Roofs live in their own layer rather than in `cells`.
   *
   * A roof covers a floored cell, so it cannot share the cell map with that
   * floor. Storing it one level up instead would make roofs impossible on the
   * top level — exactly where they are most needed. A separate layer removes
   * both edge cases.
   */
  private readonly roofs = new Map<string, T>();
  /**
   * Stations stand ON a floor, so like roofs they cannot share the cell map
   * with the floor they sit on.
   */
  private readonly stations = new Map<string, T>();
  /**
   * Stairs get the same treatment, and for a reason that took a while to see.
   *
   * A flight is stored against the cell its top half passes over, and that
   * cell is very often floored — the run crosses the deck the player is
   * standing on. Sharing the cell map meant placing stairs silently
   * OVERWROTE that floor's entry and its owner, so demolishing the stairs
   * afterwards deleted a floor that was still standing there in the scene.
   * The rule that hid the corruption was the one that made the piece
   * unusable: the validator refused any run cell that already held anything,
   * which is why a staircase could only ever be built hanging off the edge of
   * the hull.
   */
  private readonly stairs = new Map<string, T>();
  private readonly blocked = new Set<string>();

  getCell(c: Cell): T | undefined {
    return this.cells.get(cellKey(c));
  }

  setCell(c: Cell, value: T): void {
    this.cells.set(cellKey(c), value);
  }

  clearCell(c: Cell): void {
    this.cells.delete(cellKey(c));
  }

  hasCell(c: Cell): boolean {
    return this.cells.has(cellKey(c));
  }

  getEdge(e: Edge): T | undefined {
    return this.edges.get(edgeKey(e));
  }

  setEdge(e: Edge, value: T): void {
    this.edges.set(edgeKey(e), value);
  }

  clearEdge(e: Edge): void {
    this.edges.delete(edgeKey(e));
  }

  hasEdge(e: Edge): boolean {
    return this.edges.has(edgeKey(e));
  }

  getRoof(c: Cell): T | undefined {
    return this.roofs.get(cellKey(c));
  }

  setRoof(c: Cell, value: T): void {
    this.roofs.set(cellKey(c), value);
  }

  clearRoof(c: Cell): void {
    this.roofs.delete(cellKey(c));
  }

  hasRoof(c: Cell): boolean {
    return this.roofs.has(cellKey(c));
  }

  roofEntries(): CellEntry<T>[] {
    return [...this.roofs.entries()].map(([key, value]) => ({
      cell: parseCellKey(key),
      value,
    }));
  }

  getStation(c: Cell): T | undefined {
    return this.stations.get(cellKey(c));
  }

  setStation(c: Cell, value: T): void {
    this.stations.set(cellKey(c), value);
  }

  clearStation(c: Cell): void {
    this.stations.delete(cellKey(c));
  }

  hasStation(c: Cell): boolean {
    return this.stations.has(cellKey(c));
  }

  stationEntries(): CellEntry<T>[] {
    return [...this.stations.entries()].map(([key, value]) => ({
      cell: parseCellKey(key),
      value,
    }));
  }

  getStairs(c: Cell): T | undefined {
    return this.stairs.get(cellKey(c));
  }

  setStairs(c: Cell, value: T): void {
    this.stairs.set(cellKey(c), value);
  }

  clearStairs(c: Cell): void {
    this.stairs.delete(cellKey(c));
  }

  hasStairs(c: Cell): boolean {
    return this.stairs.has(cellKey(c));
  }

  stairsEntries(): CellEntry<T>[] {
    return [...this.stairs.entries()].map(([key, value]) => ({
      cell: parseCellKey(key),
      value,
    }));
  }

  /** Mark a cell permanently unbuildable — the starting equipment sits there. */
  blockCell(c: Cell): void {
    this.blocked.add(cellKey(c));
  }

  isBlocked(c: Cell): boolean {
    return this.blocked.has(cellKey(c));
  }

  cellEntries(): CellEntry<T>[] {
    return [...this.cells.entries()].map(([key, value]) => ({
      cell: parseCellKey(key),
      value,
    }));
  }

  edgeEntries(): EdgeEntry<T>[] {
    return [...this.edges.entries()].map(([key, value]) => ({
      edge: parseEdgeKey(key),
      value,
    }));
  }

  get cellCount(): number {
    return this.cells.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  get roofCount(): number {
    return this.roofs.size;
  }

  get stationCount(): number {
    return this.stations.size;
  }

  get stairsCount(): number {
    return this.stairs.size;
  }

  /**
   * Drop all player-placed occupancy. Blocked cells survive: they describe the
   * machine, not the player's build, and a rebuild must not forget them.
   */
  clear(): void {
    this.cells.clear();
    this.edges.clear();
    this.roofs.clear();
    this.stations.clear();
    this.stairs.clear();
  }
}
