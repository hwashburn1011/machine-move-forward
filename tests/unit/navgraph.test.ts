import { describe, it, expect } from 'vitest';
import { blocksNavigation } from '@/data/build-pieces';
import { BuildGrid, cellKey, canonicalEdge, type Cell } from '@/building/BuildGrid';
import { buildNavGraph, deckCells, levelOf } from '@/enemies/NavGraph';
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
