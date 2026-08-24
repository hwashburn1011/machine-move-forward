import { describe, it, expect } from 'vitest';
import {
  BuildGrid,
  canonicalEdge,
  cellCenter,
  cellKey,
  cellsOfEdge,
  edgeBetween,
  edgeKey,
  inEnvelope,
  type Cell,
} from '@/building/BuildGrid';
import { DECK_HEIGHT, GRID_TILE, LEVEL_HEIGHT } from '@/game/constants';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

describe('keys', () => {
  it('cellKey is stable and distinct', () => {
    expect(cellKey(c(1, 2, 3))).toBe(cellKey(c(1, 2, 3)));
    expect(cellKey(c(1, 2, 3))).not.toBe(cellKey(c(3, 2, 1)));
    expect(cellKey(c(-1, 0, 0))).not.toBe(cellKey(c(1, 0, 0)));
  });

  it('edgeKey distinguishes axis', () => {
    expect(edgeKey({ x: 0, y: 0, z: 0, axis: 'x' })).not.toBe(
      edgeKey({ x: 0, y: 0, z: 0, axis: 'z' }),
    );
  });
});

describe('canonicalEdge', () => {
  it('collapses both X approaches to a single key', () => {
    const fromLeft = canonicalEdge(c(2, 0, 1), 'east');
    const fromRight = canonicalEdge(c(3, 0, 1), 'west');
    expect(edgeKey(fromLeft)).toBe(edgeKey(fromRight));
    expect(fromLeft).toEqual({ x: 2, y: 0, z: 1, axis: 'x' });
  });

  it('collapses both Z approaches to a single key', () => {
    const fromSouth = canonicalEdge(c(0, 0, 1), 'south');
    const fromNorth = canonicalEdge(c(0, 0, 2), 'north');
    expect(edgeKey(fromSouth)).toBe(edgeKey(fromNorth));
    expect(fromSouth).toEqual({ x: 0, y: 0, z: 1, axis: 'z' });
  });

  it('always addresses from the -X or -Z side', () => {
    expect(canonicalEdge(c(0, 0, 0), 'west').x).toBe(-1);
    expect(canonicalEdge(c(0, 0, 0), 'east').x).toBe(0);
    expect(canonicalEdge(c(0, 0, 0), 'north').z).toBe(-1);
    expect(canonicalEdge(c(0, 0, 0), 'south').z).toBe(0);
  });

  it('preserves the level', () => {
    expect(canonicalEdge(c(1, 2, 1), 'east').y).toBe(2);
  });
});

describe('edgeBetween', () => {
  it('is order independent', () => {
    const a = edgeBetween(c(1, 0, 0), c(2, 0, 0));
    const b = edgeBetween(c(2, 0, 0), c(1, 0, 0));
    expect(a).not.toBeNull();
    expect(edgeKey(a!)).toBe(edgeKey(b!));
  });

  it('handles both axes', () => {
    expect(edgeBetween(c(0, 0, 0), c(0, 0, 1))?.axis).toBe('z');
    expect(edgeBetween(c(0, 0, 0), c(1, 0, 0))?.axis).toBe('x');
  });

  it('returns null for diagonal, distant, cross-level, and identical cells', () => {
    expect(edgeBetween(c(0, 0, 0), c(1, 0, 1))).toBeNull();
    expect(edgeBetween(c(0, 0, 0), c(3, 0, 0))).toBeNull();
    expect(edgeBetween(c(0, 0, 0), c(0, 1, 0))).toBeNull();
    expect(edgeBetween(c(0, 0, 0), c(0, 0, 0))).toBeNull();
  });
});

describe('cellsOfEdge', () => {
  it('round-trips through edgeBetween for both axes', () => {
    for (const axis of ['x', 'z'] as const) {
      const edge = { x: 1, y: 0, z: 2, axis };
      const [a, b] = cellsOfEdge(edge);
      const back = edgeBetween(a, b);
      expect(back).not.toBeNull();
      expect(edgeKey(back!)).toBe(edgeKey(edge));
    }
  });

  it('returns cells one apart along the edge axis', () => {
    const [a, b] = cellsOfEdge({ x: 1, y: 0, z: 2, axis: 'x' });
    expect(b.x - a.x).toBe(1);
    expect(a.z).toBe(b.z);
  });
});

describe('inEnvelope', () => {
  it('accepts the extreme corners', () => {
    expect(inEnvelope(c(-4, 0, -6))).toBe(true);
    expect(inEnvelope(c(4, 2, 5))).toBe(true);
  });

  it('rejects one step outside in every direction', () => {
    expect(inEnvelope(c(-5, 0, 0))).toBe(false);
    expect(inEnvelope(c(5, 0, 0))).toBe(false);
    expect(inEnvelope(c(0, 0, -7))).toBe(false);
    expect(inEnvelope(c(0, 0, 6))).toBe(false);
    // -1 is the engine room, a real level. -2 is the first one below it.
    expect(inEnvelope(c(0, -2, 0))).toBe(false);
    expect(inEnvelope(c(0, 3, 0))).toBe(false);
  });

  it('accepts the engine room level', () => {
    expect(inEnvelope(c(0, -1, 0))).toBe(true);
  });

  it('rejects non-integer cells', () => {
    expect(inEnvelope(c(0.5, 0, 0))).toBe(false);
  });
});

describe('cellCenter', () => {
  it('places level 0 on the deck plane', () => {
    expect(cellCenter(c(0, 0, 0)).y).toBeCloseTo(DECK_HEIGHT, 6);
  });

  it('steps by LEVEL_HEIGHT per level', () => {
    expect(cellCenter(c(0, 1, 0)).y - cellCenter(c(0, 0, 0)).y).toBeCloseTo(LEVEL_HEIGHT, 6);
  });

  it('steps by GRID_TILE per cell', () => {
    expect(cellCenter(c(1, 0, 0)).x - cellCenter(c(0, 0, 0)).x).toBeCloseTo(GRID_TILE, 6);
    expect(cellCenter(c(0, 0, 1)).z - cellCenter(c(0, 0, 0)).z).toBeCloseTo(GRID_TILE, 6);
  });

  it('centres cell (0,0,0) on the machine centreline', () => {
    const center = cellCenter(c(0, 0, 0));
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.z).toBeCloseTo(0, 6);
  });
});

describe('BuildGrid', () => {
  it('stores and retrieves cell payloads', () => {
    const g = new BuildGrid();
    expect(g.getCell(c(1, 0, 1))).toBeUndefined();
    g.setCell(c(1, 0, 1), 'floor-1');
    expect(g.getCell(c(1, 0, 1))).toBe('floor-1');
  });

  it('stores and retrieves edge payloads', () => {
    const g = new BuildGrid();
    const e = { x: 0, y: 0, z: 0, axis: 'x' as const };
    g.setEdge(e, 'wall-1');
    expect(g.getEdge(e)).toBe('wall-1');
  });

  it('resolves the same edge from either approach direction', () => {
    const g = new BuildGrid();
    g.setEdge(canonicalEdge(c(2, 0, 1), 'east'), 'wall-1');
    expect(g.getEdge(canonicalEdge(c(3, 0, 1), 'west'))).toBe('wall-1');
  });

  it('clearing a cell leaves neighbours untouched', () => {
    const g = new BuildGrid();
    g.setCell(c(0, 0, 0), 'a');
    g.setCell(c(1, 0, 0), 'b');
    g.clearCell(c(0, 0, 0));
    expect(g.getCell(c(0, 0, 0))).toBeUndefined();
    expect(g.getCell(c(1, 0, 0))).toBe('b');
  });

  it('clearing an edge leaves neighbours untouched', () => {
    const g = new BuildGrid();
    const a = { x: 0, y: 0, z: 0, axis: 'x' as const };
    const b = { x: 1, y: 0, z: 0, axis: 'x' as const };
    g.setEdge(a, 'a');
    g.setEdge(b, 'b');
    g.clearEdge(a);
    expect(g.getEdge(a)).toBeUndefined();
    expect(g.getEdge(b)).toBe('b');
  });

  it('keeps roofs in a layer separate from cells', () => {
    const g = new BuildGrid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setRoof(c(0, 0, 0), 'roof');
    // A roof caps the floor in the same cell; they must coexist.
    expect(g.getCell(c(0, 0, 0))).toBe('floor');
    expect(g.getRoof(c(0, 0, 0))).toBe('roof');
    g.clearRoof(c(0, 0, 0));
    expect(g.hasRoof(c(0, 0, 0))).toBe(false);
    expect(g.getCell(c(0, 0, 0))).toBe('floor');
  });

  it('tracks blocked cells independently of occupancy', () => {
    const g = new BuildGrid();
    g.blockCell(c(0, 0, 0));
    expect(g.isBlocked(c(0, 0, 0))).toBe(true);
    expect(g.getCell(c(0, 0, 0))).toBeUndefined();
    expect(g.isBlocked(c(1, 0, 0))).toBe(false);
  });

  it('clear() empties occupancy but keeps blocked cells', () => {
    const g = new BuildGrid();
    g.blockCell(c(0, 0, 0));
    g.setCell(c(1, 0, 0), 'a');
    g.setEdge({ x: 0, y: 0, z: 0, axis: 'x' }, 'w');
    g.setRoof(c(1, 0, 0), 'r');
    g.clear();
    expect(g.getCell(c(1, 0, 0))).toBeUndefined();
    expect(g.edgeEntries()).toHaveLength(0);
    expect(g.roofEntries()).toHaveLength(0);
    // Blocked cells come from the machine, not the player, so a rebuild must
    // not forget them.
    expect(g.isBlocked(c(0, 0, 0))).toBe(true);
  });

  it('enumerates exactly what is set', () => {
    const g = new BuildGrid();
    g.setCell(c(0, 0, 0), 'a');
    g.setCell(c(1, 0, 0), 'b');
    g.clearCell(c(0, 0, 0));
    const cells = g.cellEntries();
    expect(cells).toHaveLength(1);
    expect(cells[0]!.value).toBe('b');
    expect(cells[0]!.cell).toEqual(c(1, 0, 0));
  });

  it('edgeEntries returns decoded edges', () => {
    const g = new BuildGrid();
    g.setEdge({ x: -1, y: 2, z: 3, axis: 'z' }, 'w');
    const entries = g.edgeEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.edge).toEqual({ x: -1, y: 2, z: 3, axis: 'z' });
  });
});
