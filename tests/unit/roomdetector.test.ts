import { describe, it, expect } from 'vitest';
import { BuildGrid, canonicalEdge, cellKey, type Cell } from '@/building/BuildGrid';
import { countEnclosed, detectRooms } from '@/building/RoomDetector';
import type { PieceId } from '@/data/build-pieces';
import { GRID_TILE, LEVEL_HEIGHT } from '@/game/constants';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

function grid() {
  return new BuildGrid<PieceId>();
}

/** Floor a rectangle at one level. */
function floorRect(
  g: BuildGrid<PieceId>,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  level = 0,
): Cell[] {
  const cells: Cell[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const cell = c(x, level, z);
      g.setCell(cell, 'floor');
      cells.push(cell);
    }
  }
  return cells;
}

/** Roof every cell in a list. */
function roofAll(g: BuildGrid<PieceId>, cells: Cell[]): void {
  for (const cell of cells) g.setRoof(cell, 'roof');
}

/** Wall every outward-facing edge of a rectangle. */
function wallPerimeter(
  g: BuildGrid<PieceId>,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  level = 0,
  piece: PieceId = 'wall',
): void {
  for (let x = x0; x <= x1; x++) {
    g.setEdge(canonicalEdge(c(x, level, z0), 'north'), piece);
    g.setEdge(canonicalEdge(c(x, level, z1), 'south'), piece);
  }
  for (let z = z0; z <= z1; z++) {
    g.setEdge(canonicalEdge(c(x0, level, z), 'west'), piece);
    g.setEdge(canonicalEdge(c(x1, level, z), 'east'), piece);
  }
}

describe('detectRooms', () => {
  it('finds nothing in an empty grid', () => {
    expect(detectRooms(grid()).rooms).toHaveLength(0);
  });

  it('treats a bare floor tile as one unenclosed room', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(1);
    expect(graph.rooms[0]!.enclosed).toBe(false);
  });

  it('ignores non-floor cells', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'stairs');
    expect(detectRooms(g).rooms).toHaveLength(0);
  });
});

describe('enclosure', () => {
  it('reports a fully walled and roofed 2x2 as enclosed', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);

    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(1);
    expect(graph.rooms[0]!.enclosed).toBe(true);
    expect(graph.rooms[0]!.cells).toHaveLength(4);
  });

  it('computes interior volume in cubic metres', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);
    expect(detectRooms(g).rooms[0]!.interiorVolume).toBeCloseTo(
      4 * GRID_TILE * GRID_TILE * LEVEL_HEIGHT,
      6,
    );
  });

  it('is not enclosed with one wall missing', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);
    g.clearEdge(canonicalEdge(c(0, 0, 0), 'north'));

    expect(detectRooms(g).rooms[0]!.enclosed).toBe(false);
  });

  it('is not enclosed with one roof tile missing', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);
    g.clearRoof(c(1, 0, 1));

    expect(detectRooms(g).rooms[0]!.enclosed).toBe(false);
  });

  it('accepts the floor of the storey above as a ceiling', () => {
    const g = grid();
    floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    // No roof pieces at all — a second storey covers it instead.
    floorRect(g, 0, 0, 1, 1, 1);

    const graph = detectRooms(g);
    const ground = graph.rooms.find((r) => r.level === 0);
    expect(ground?.enclosed).toBe(true);
  });

  it('does not count a railing as enclosure', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1, 0, 'railing');
    roofAll(g, cells);
    // Fenced and covered, but not enclosed.
    expect(detectRooms(g).rooms[0]!.enclosed).toBe(false);
  });

  it('counts a doorway as enclosure', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);
    g.setEdge(canonicalEdge(c(0, 0, 0), 'north'), 'doorway');

    expect(detectRooms(g).rooms[0]!.enclosed).toBe(true);
  });
});

describe('multiple rooms', () => {
  it('splits a 4x2 floor into two rooms with a dividing wall', () => {
    const g = grid();
    floorRect(g, 0, 0, 3, 1);
    for (let z = 0; z <= 1; z++) {
      g.setEdge(canonicalEdge(c(1, 0, z), 'east'), 'wall');
    }

    expect(detectRooms(g).rooms).toHaveLength(2);
  });

  it('splits on a doorway too, and records the link', () => {
    const g = grid();
    floorRect(g, 0, 0, 3, 1);
    g.setEdge(canonicalEdge(c(1, 0, 0), 'east'), 'doorway');
    g.setEdge(canonicalEdge(c(1, 0, 1), 'east'), 'wall');

    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(2);
    expect(graph.links).toHaveLength(1);
    const [a, b] = graph.links[0]!.rooms;
    expect(a).not.toBe(b);
    expect(new Set([a, b])).toEqual(new Set([0, 1]));
  });

  it('reports both halves enclosed when each is sealed and roofed', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 3, 1);
    wallPerimeter(g, 0, 0, 3, 1);
    roofAll(g, cells);
    g.setEdge(canonicalEdge(c(1, 0, 0), 'east'), 'doorway');
    g.setEdge(canonicalEdge(c(1, 0, 1), 'east'), 'wall');

    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(2);
    expect(countEnclosed(graph)).toBe(2);
    expect(graph.links).toHaveLength(1);
  });

  it('does not link a doorway that opens onto empty air', () => {
    const g = grid();
    floorRect(g, 0, 0, 1, 1);
    g.setEdge(canonicalEdge(c(0, 0, 0), 'north'), 'doorway');

    expect(detectRooms(g).links).toHaveLength(0);
  });

  it('keeps two separate structures as distinct rooms', () => {
    const g = grid();
    floorRect(g, 0, 0, 1, 1);
    floorRect(g, 3, 0, 4, 1);

    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(2);
    expect(graph.rooms[0]!.id).not.toBe(graph.rooms[1]!.id);
  });

  it('never merges rooms across levels, even directly stacked', () => {
    const g = grid();
    floorRect(g, 0, 0, 1, 1, 0);
    floorRect(g, 0, 0, 1, 1, 1);

    const graph = detectRooms(g);
    expect(graph.rooms).toHaveLength(2);
    expect(new Set(graph.rooms.map((r) => r.level))).toEqual(new Set([0, 1]));
  });
});

describe('breach', () => {
  it('an enclosed room stops being enclosed once a wall is removed', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);
    expect(detectRooms(g).rooms[0]!.enclosed).toBe(true);

    // This is the Milestone 9 breach case: destroying a wall must open the room.
    g.clearEdge(canonicalEdge(c(1, 0, 1), 'east'));
    expect(detectRooms(g).rooms[0]!.enclosed).toBe(false);
  });
});

describe('byCell and determinism', () => {
  it('maps every floored cell and nothing else', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    g.setCell(c(5, 0, 5), 'stairs');

    const graph = detectRooms(g);
    expect(graph.byCell.size).toBe(cells.length);
    for (const cell of cells) expect(graph.byCell.has(cellKey(cell))).toBe(true);
    expect(graph.byCell.has(cellKey(c(5, 0, 5)))).toBe(false);
  });

  it('assigns identical ids across repeated runs', () => {
    const g = grid();
    floorRect(g, 0, 0, 1, 1);
    floorRect(g, 3, 0, 4, 1);

    const a = detectRooms(g);
    const b = detectRooms(g);
    const shape = (graph: ReturnType<typeof detectRooms>) =>
      graph.rooms.map((r) => `${r.id}:${r.cells.map(cellKey).sort().join('|')}`).join(';');
    expect(shape(a)).toBe(shape(b));
  });

  it('does not mutate the grid', () => {
    const g = grid();
    const cells = floorRect(g, 0, 0, 1, 1);
    wallPerimeter(g, 0, 0, 1, 1);
    roofAll(g, cells);

    const before = { c: g.cellCount, e: g.edgeCount, r: g.roofCount };
    detectRooms(g);
    expect({ c: g.cellCount, e: g.edgeCount, r: g.roofCount }).toEqual(before);
  });
});
