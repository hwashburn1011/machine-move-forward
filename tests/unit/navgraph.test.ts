import { describe, it, expect } from 'vitest';
import { blocksNavigation } from '@/data/build-pieces';
import { BuildGrid, cellKey, canonicalEdge, type Cell } from '@/building/BuildGrid';
import { buildNavGraph, deckCells, findPath, levelOf } from '@/enemies/NavGraph';
import type { PieceId } from '@/data/build-pieces';
import { DECK_HEIGHT, LEVEL_HEIGHT } from '@/game/constants';

describe('blocksNavigation', () => {
  it('blocks on a wall', () => {
    expect(blocksNavigation('wall')).toBe(true);
  });

  it('does not block on a doorway — the opening has no collider', () => {
    expect(blocksNavigation('doorway')).toBe(false);
  });

  it('blocks on a railing, which boundsRoom does not', () => {
    expect(blocksNavigation('railing')).toBe(true);
  });

  it('does not block on an empty edge', () => {
    expect(blocksNavigation(undefined)).toBe(false);
  });
});

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

/** Neighbour keys of a cell, sorted, for order-independent comparison. */
function linksOf(graph: { links: Map<string, Cell[]> }, cell: Cell): string[] {
  return (graph.links.get(cellKey(cell)) ?? []).map(cellKey).sort();
}

function floorRect(g: BuildGrid<PieceId>, x0: number, z0: number, x1: number, z1: number, level = 0): void {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) g.setCell(c(x, level, z), 'floor');
  }
}

describe('deckCells', () => {
  it('takes every cell whose centre lies within the deck bounds', () => {
    // The starting deck: 10m x 16m centred on the origin.
    const cells = deckCells({ minX: -5, maxX: 5, minZ: -8, maxZ: 8 });
    const xs = [...new Set(cells.map((n) => n.x))].sort((a, b) => a - b);
    const zs = [...new Set(cells.map((n) => n.z))].sort((a, b) => a - b);
    expect(xs).toEqual([-2, -1, 0, 1, 2]);
    expect(zs).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(cells.every((n) => n.y === 0)).toBe(true);
  });
});

describe('buildNavGraph nodes', () => {
  it('links two adjacent floor cells', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([cellKey(c(1, 0, 0))]);
  });

  it('treats bare deck at level 0 as walkable', () => {
    const g = new BuildGrid<PieceId>();
    const graph = buildNavGraph(g, [c(0, 0, 0), c(1, 0, 0)]);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([cellKey(c(1, 0, 0))]);
  });

  it('excludes cells blocked by machine equipment', () => {
    const g = new BuildGrid<PieceId>();
    g.blockCell(c(1, 0, 0));
    const graph = buildNavGraph(g, [c(0, 0, 0), c(1, 0, 0)]);
    expect(graph.links.has(cellKey(c(1, 0, 0)))).toBe(false);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([]);
  });

  it('does not make bare deck walkable above level 0', () => {
    const g = new BuildGrid<PieceId>();
    const graph = buildNavGraph(g, [c(0, 0, 0)]);
    expect(graph.links.has(cellKey(c(0, 1, 0)))).toBe(false);
  });
});

describe('buildNavGraph lateral links', () => {
  it('a wall between two cells removes the link both ways', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([]);
    expect(linksOf(graph, c(1, 0, 0))).toEqual([]);
  });

  it('a doorway keeps the link', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'doorway');
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([cellKey(c(1, 0, 0))]);
  });

  it('a railing removes the link — this is where boundsRoom would be wrong', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'railing');
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([]);
  });

  it('a cell fenced by railings on all four sides is isolated', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, -1, -1, 1, 1);
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      g.setEdge(canonicalEdge(c(0, 0, 0), side), 'railing');
    }
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([]);
  });

  it('is deterministic — neighbours come back in a stable order', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, -1, -1, 1, 1);
    const a = buildNavGraph(g, []).links.get(cellKey(c(0, 0, 0))) ?? [];
    const b = buildNavGraph(g, []).links.get(cellKey(c(0, 0, 0))) ?? [];
    expect(a.map(cellKey)).toEqual(b.map(cellKey));
  });
});

describe('buildNavGraph stairs', () => {
  /** A staircase from (0,0,0) running to (0,0,1), landing on (0,1,1). */
  function withStairs(g: BuildGrid<PieceId>): void {
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(0, 0, 1), 'stairs');
    g.setCell(c(0, 1, 1), 'floor');
  }

  it('links the run cell to the landing above it', () => {
    const g = new BuildGrid<PieceId>();
    withStairs(g);
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 1))).toContain(cellKey(c(0, 1, 1)));
  });

  it('links the landing back down to the run', () => {
    const g = new BuildGrid<PieceId>();
    withStairs(g);
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 1, 1))).toContain(cellKey(c(0, 0, 1)));
  });

  it('reaches the run from the base by the ordinary lateral link', () => {
    const g = new BuildGrid<PieceId>();
    withStairs(g);
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toContain(cellKey(c(0, 0, 1)));
  });

  it('leaves an upper floor unreachable with no stairs to it', () => {
    const g = new BuildGrid<PieceId>();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(0, 1, 0), 'floor');
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 0))).toEqual([]);
    expect(linksOf(graph, c(0, 1, 0))).toEqual([]);
  });

  it('does not link a run to a landing that was never floored', () => {
    const g = new BuildGrid<PieceId>();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(0, 0, 1), 'stairs');
    const graph = buildNavGraph(g, []);
    expect(linksOf(graph, c(0, 0, 1))).toEqual([cellKey(c(0, 0, 0))]);
  });
});

describe('levelOf', () => {
  it('puts feet on the deck at level 0', () => {
    expect(levelOf(DECK_HEIGHT + 0.1)).toBe(0);
  });

  it('puts feet on the first storey floor at level 1', () => {
    expect(levelOf(DECK_HEIGHT + LEVEL_HEIGHT)).toBe(1);
  });

  it('clamps below the deck and above the top storey', () => {
    expect(levelOf(DECK_HEIGHT - 10)).toBe(0);
    expect(levelOf(DECK_HEIGHT + LEVEL_HEIGHT * 99)).toBe(2);
  });
});

describe('findPath', () => {
  it('walks a straight line across open floor', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 3, 0);
    const path = findPath(buildNavGraph(g, []), c(0, 0, 0), c(3, 0, 0));
    expect(path.map(cellKey)).toEqual([
      cellKey(c(1, 0, 0)),
      cellKey(c(2, 0, 0)),
      cellKey(c(3, 0, 0)),
    ]);
  });

  it('excludes the start cell from the waypoints', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    const path = findPath(buildNavGraph(g, []), c(0, 0, 0), c(1, 0, 0));
    expect(path.map(cellKey)).not.toContain(cellKey(c(0, 0, 0)));
  });

  it('goes around a wall rather than through it', () => {
    // A 3x3 floor with a wall across the middle of the direct route.
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 2, 2);
    g.setEdge(canonicalEdge(c(0, 0, 1), 'east'), 'wall');
    const path = findPath(buildNavGraph(g, []), c(0, 0, 1), c(2, 0, 1));
    expect(path.at(-1)).toEqual(c(2, 0, 1));
    // It had to leave the middle row to get round.
    expect(path.some((n) => n.z !== 1)).toBe(true);
  });

  it('takes the short route once that wall becomes a doorway', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 2, 2);
    g.setEdge(canonicalEdge(c(0, 0, 1), 'east'), 'doorway');
    const path = findPath(buildNavGraph(g, []), c(0, 0, 1), c(2, 0, 1));
    expect(path.map(cellKey)).toEqual([cellKey(c(1, 0, 1)), cellKey(c(2, 0, 1))]);
  });

  it('funnels through the single doorway of a sealed room', () => {
    // 3x3 floor. The centre is walled off except for a doorway on its west side.
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 2, 2);
    for (const side of ['north', 'south', 'east'] as const) {
      g.setEdge(canonicalEdge(c(1, 0, 1), side), 'wall');
    }
    g.setEdge(canonicalEdge(c(1, 0, 1), 'west'), 'doorway');
    const path = findPath(buildNavGraph(g, []), c(1, 0, 0), c(1, 0, 1));
    expect(path.at(-1)).toEqual(c(1, 0, 1));
    expect(path.map(cellKey)).toContain(cellKey(c(0, 0, 1)));
  });

  it('paths to the nearest reachable cell when the goal is sealed off', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 2, 2);
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      g.setEdge(canonicalEdge(c(1, 0, 1), side), 'wall');
    }
    const path = findPath(buildNavGraph(g, []), c(0, 0, 0), c(1, 0, 1));
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).not.toEqual(c(1, 0, 1));
    // It gets as close as it can: orthogonally adjacent to the sealed cell.
    const end = path.at(-1) as Cell;
    expect(Math.abs(end.x - 1) + Math.abs(end.z - 1)).toBe(1);
  });

  it('climbs to an upper storey by the stairs', () => {
    const g = new BuildGrid<PieceId>();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(0, 0, 1), 'stairs');
    g.setCell(c(0, 1, 1), 'floor');
    const path = findPath(buildNavGraph(g, []), c(0, 0, 0), c(0, 1, 1));
    expect(path.map(cellKey)).toEqual([cellKey(c(0, 0, 1)), cellKey(c(0, 1, 1))]);
  });

  it('returns nothing when the start is not on the graph at all', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, 0, 0, 1, 0);
    const path = findPath(buildNavGraph(g, []), c(7, 0, 7), c(1, 0, 0));
    expect(path).toEqual([]);
  });

  it('is deterministic for the same grid', () => {
    const g = new BuildGrid<PieceId>();
    floorRect(g, -2, -2, 2, 2);
    const graph = buildNavGraph(g, []);
    const a = findPath(graph, c(-2, 0, -2), c(2, 0, 2)).map(cellKey);
    const b = findPath(graph, c(-2, 0, -2), c(2, 0, 2)).map(cellKey);
    expect(a).toEqual(b);
  });

  it('breaks a genuine tie by picking the lowest cell key, not search order', () => {
    // A grid with two equal-cost routes from start to goal (12 edges each: a
    // left-hand loop up and across, and a right-hand jog up and across). Both
    // are optimal, so which one comes back is decided entirely by the open-set
    // tie-break. Found by brute-force search over random grids, then trimmed
    // to the smallest floor plan that still ties — there is no simpler
    // geometric description of the shape.
    const g = new BuildGrid<PieceId>();
    const cells: Array<[number, number]> = [
      [-1, -3], [-1, 1], [-2, -1], [-2, -2], [-2, -3], [-2, 0], [-2, 1],
      [0, -1], [0, -3], [0, 0], [0, 1], [1, -1], [1, -2], [1, -3], [1, 1],
      [2, 1], [2, 2], [2, 3], [3, 3],
    ];
    for (const [x, z] of cells) g.setCell(c(x, 0, z), 'floor');

    const path = findPath(buildNavGraph(g, []), c(-1, 0, -3), c(3, 0, 3));

    // With the key tie-break, the search takes the route through x = -2 (the
    // lexicographically lowest cell key at every tied choice). Without the
    // tie-break — verified by temporarily deleting the `key < currentKey` arm
    // — this same grid returns a different, equally-optimal route through
    // x = 1 instead, which is exactly the non-determinism this test guards.
    expect(path.map(cellKey)).toEqual([
      cellKey(c(-2, 0, -3)),
      cellKey(c(-2, 0, -2)),
      cellKey(c(-2, 0, -1)),
      cellKey(c(-2, 0, 0)),
      cellKey(c(-2, 0, 1)),
      cellKey(c(-1, 0, 1)),
      cellKey(c(0, 0, 1)),
      cellKey(c(1, 0, 1)),
      cellKey(c(2, 0, 1)),
      cellKey(c(2, 0, 2)),
      cellKey(c(2, 0, 3)),
      cellKey(c(3, 0, 3)),
    ]);
  });

  it('prefers a longer flat route over a shorter stairs shortcut once LEVEL_COST outweighs it', () => {
    // The only level-0 route from start to goal is this 7-edge staple: there
    // is no direct row between them, only this detour.
    //
    //   z=2  (0,0,2)-(1,0,2)-(2,0,2)-(3,0,2)
    //          |                        |
    //   z=1  (0,0,1)                 (3,0,1)
    //          |                        |
    //   z=0  (0,0,0)=stairs      (3,0,0)=stairs   <- start / goal
    //
    // A stairs shortcut also exists: up at the start, three steps across
    // level 1, down at the goal — only 5 edges, fewer than the flat route's
    // 7. But each vertical edge costs 1 + LEVEL_COST, so with LEVEL_COST = 3
    // the shortcut costs 3*1 + 2*4 = 11 against the flat route's 7, and the
    // flat route should win despite being the longer one by edge count.
    const g = new BuildGrid<PieceId>();
    g.setCell(c(0, 0, 0), 'stairs'); // start is also this staircase's run cell
    g.setCell(c(0, 0, 1), 'floor');
    g.setCell(c(0, 0, 2), 'floor');
    g.setCell(c(1, 0, 2), 'floor');
    g.setCell(c(2, 0, 2), 'floor');
    g.setCell(c(3, 0, 2), 'floor');
    g.setCell(c(3, 0, 1), 'floor');
    g.setCell(c(3, 0, 0), 'stairs'); // goal is also this staircase's run cell
    g.setCell(c(0, 1, 0), 'floor'); // landing above the start
    g.setCell(c(1, 1, 0), 'floor');
    g.setCell(c(2, 1, 0), 'floor');
    g.setCell(c(3, 1, 0), 'floor'); // landing above the goal

    const path = findPath(buildNavGraph(g, []), c(0, 0, 0), c(3, 0, 0));

    expect(path.at(-1)).toEqual(c(3, 0, 0));
    // Confirmed by temporarily setting LEVEL_COST = 0: with no level cost the
    // 5-edge stairs shortcut is cheaper and this assertion fails, because the
    // path then leaves level 0 instead of staying flat.
    expect(path.every((cell) => cell.y === 0)).toBe(true);
    expect(path.length).toBe(7);
  });
});
