import { describe, it, expect } from 'vitest';
import { BuildGrid, canonicalEdge, type Cell } from '@/building/BuildGrid';
import {
  GRID_LEVELS,
  GRID_MAX_X,
  GRID_MAX_Z,
  GRID_MIN_LEVEL,
  GRID_MIN_X,
  GRID_MIN_Z,
} from '@/game/constants';
import {
  stairsCells,
  stairsExit,
  validatePlacement,
  type CanAfford,
  type Placement,
} from '@/building/BuildValidation';
import type { PieceId } from '@/data/build-pieces';
import type { ItemCost, ItemId } from '@/data/items';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

const RICH: CanAfford = () => true;
const POOR: CanAfford = () => false;

/** A purse holding exactly these items, for the affordability cases. */
const purse =
  (have: ItemCost): CanAfford =>
  (cost) =>
    (Object.entries(cost) as [ItemId, number][]).every(([id, n]) => (have[id] ?? 0) >= n);

const grid = () => new BuildGrid<PieceId>();

const place = (piece: PieceId, cell: Cell, rotation = 0): Placement => ({
  piece,
  cell,
  rotation,
});

const edgePlace = (
  piece: PieceId,
  cell: Cell,
  side: 'north' | 'south' | 'east' | 'west',
): Placement => ({ piece, cell, edge: canonicalEdge(cell, side), rotation: 0 });

describe('bounds and occupancy', () => {
  it('rejects cells outside the envelope in every direction', () => {
    const g = grid();
    for (const cell of [
      c(GRID_MIN_X - 1, 0, 0),
      c(GRID_MAX_X + 1, 0, 0),
      c(0, 0, GRID_MIN_Z - 1),
      c(0, 0, GRID_MAX_Z + 1),
      // -1 is the engine room and is in bounds; -2 is the first level below.
      c(0, GRID_MIN_LEVEL - 1, 0),
      c(0, GRID_LEVELS, 0),
    ]) {
      expect(validatePlacement(g, place('floor', cell), RICH).reason).toBe('out-of-bounds');
    }
  });

  it('rejects a cell that already holds a piece', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, place('floor', c(0, 0, 0)), RICH).reason).toBe('occupied');
  });

  it('rejects an edge that already holds a piece', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    expect(validatePlacement(g, edgePlace('wall', c(0, 0, 0), 'east'), RICH).reason).toBe(
      'occupied',
    );
  });

  it('rejects a blocked equipment cell', () => {
    const g = grid();
    g.blockCell(c(1, 0, 1));
    expect(validatePlacement(g, place('floor', c(1, 0, 1)), RICH).reason).toBe('blocked');
  });
});

describe('affordability', () => {
  it('rejects when the predicate refuses', () => {
    const g = grid();
    expect(validatePlacement(g, place('floor', c(0, 0, 0)), POOR).reason).toBe('cannot-afford');
  });

  it('rejects when scrap is one short of the cost', () => {
    const g = grid();
    expect(validatePlacement(g, place('floor', c(0, 0, 0)), purse({ scrap: 7 })).reason).toBe(
      'cannot-afford',
    );
  });

  it('accepts at exactly the cost', () => {
    const g = grid();
    expect(validatePlacement(g, place('floor', c(0, 0, 0)), purse({ scrap: 8 })).ok).toBe(true);
  });

  it('rejects a multi-item cost when only one component is short', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    // Plenty of scrap, no components: the crate must still be refused.
    expect(validatePlacement(g, place('crate', c(0, 0, 0)), purse({ scrap: 999 })).reason).toBe(
      'cannot-afford',
    );
    expect(
      validatePlacement(g, place('crate', c(0, 0, 0)), purse({ scrap: 15, components: 2 })).ok,
    ).toBe(true);
  });

  it('reports the structural reason ahead of affordability', () => {
    const g = grid();
    // Broke AND out of bounds: the player should learn the spot is illegal,
    // not that they are poor.
    expect(validatePlacement(g, place('floor', c(99, 0, 0)), POOR).reason).toBe('out-of-bounds');
  });
});

describe('floor support', () => {
  it('allows a level 0 floor anywhere in the envelope', () => {
    const g = grid();
    expect(validatePlacement(g, place('floor', c(-4, 0, -6)), RICH).ok).toBe(true);
    expect(validatePlacement(g, place('floor', c(4, 0, 5)), RICH).ok).toBe(true);
  });

  it('rejects a level 1 floor with nothing below', () => {
    const g = grid();
    expect(validatePlacement(g, place('floor', c(0, 1, 0)), RICH).reason).toBe('needs-support');
  });

  it('allows a level 1 floor over a wall on the level below', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    expect(validatePlacement(g, place('floor', c(0, 1, 0)), RICH).ok).toBe(true);
  });

  it('allows a level 1 floor over a doorway on the level below', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'north'), 'doorway');
    expect(validatePlacement(g, place('floor', c(0, 1, 0)), RICH).ok).toBe(true);
  });

  it('does not accept a railing below as support', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'railing');
    expect(validatePlacement(g, place('floor', c(0, 1, 0)), RICH).reason).toBe('needs-support');
  });

  it('allows a level 1 floor beside an existing level 1 floor', () => {
    const g = grid();
    g.setCell(c(0, 1, 0), 'floor');
    expect(validatePlacement(g, place('floor', c(1, 1, 0)), RICH).ok).toBe(true);
  });

  it('rejects a level 1 floor only diagonally adjacent to another', () => {
    const g = grid();
    g.setCell(c(0, 1, 0), 'floor');
    // Diagonals must not count, or structures grow in unsupported checkerboards.
    expect(validatePlacement(g, place('floor', c(1, 1, 1)), RICH).reason).toBe('needs-support');
  });
});

describe('edge pieces', () => {
  it('accepts a wall with a floor on one side', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, edgePlace('wall', c(0, 0, 0), 'east'), RICH).ok).toBe(true);
  });

  it('accepts a wall with a floor on the other side', () => {
    const g = grid();
    g.setCell(c(1, 0, 0), 'floor');
    expect(validatePlacement(g, edgePlace('wall', c(0, 0, 0), 'east'), RICH).ok).toBe(true);
  });

  it('rejects a wall with a floor on neither side', () => {
    const g = grid();
    expect(validatePlacement(g, edgePlace('wall', c(0, 0, 0), 'east'), RICH).reason).toBe(
      'needs-floor',
    );
  });

  it('applies the same rule to doorways and railings', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, edgePlace('doorway', c(0, 0, 0), 'north'), RICH).ok).toBe(true);
    expect(validatePlacement(g, edgePlace('railing', c(0, 0, 0), 'south'), RICH).ok).toBe(true);
  });

  it('allows walling the outer perimeter of the envelope', () => {
    const g = grid();
    g.setCell(c(4, 0, 0), 'floor');
    // The outer cell of this edge is outside the envelope, which must not
    // prevent fencing the boundary.
    expect(validatePlacement(g, edgePlace('wall', c(4, 0, 0), 'east'), RICH).ok).toBe(true);
  });
});

describe('roof', () => {
  it('accepts a roof over a floor', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, place('roof', c(0, 0, 0)), RICH).ok).toBe(true);
  });

  it('rejects a second roof on the same cell', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setRoof(c(0, 0, 0), 'roof');
    expect(validatePlacement(g, place('roof', c(0, 0, 0)), RICH).reason).toBe('occupied');
  });

  it('allows a roof on the top level', () => {
    const g = grid();
    g.setCell(c(0, 2, 0), 'floor');
    // Roofs live in their own layer, so the top level is not a special case.
    expect(validatePlacement(g, place('roof', c(0, 2, 0)), RICH).ok).toBe(true);
  });

  it('rejects a roof with no floor beneath', () => {
    const g = grid();
    expect(validatePlacement(g, place('roof', c(0, 0, 0)), RICH).reason).toBe('needs-floor');
  });
});

describe('stairs', () => {
  it('returns the correct run and landing for all four rotations', () => {
    const expected = [
      { run: c(0, 0, -1), landing: c(0, 1, -1) },
      { run: c(1, 0, 0), landing: c(1, 1, 0) },
      { run: c(0, 0, 1), landing: c(0, 1, 1) },
      { run: c(-1, 0, 0), landing: c(-1, 1, 0) },
    ];
    expected.forEach((want, rotation) => {
      const got = stairsCells(c(0, 0, 0), rotation);
      expect(got.run).toEqual(want.run);
      expect(got.landing).toEqual(want.landing);
      expect(got.base).toEqual(c(0, 0, 0));
    });
  });

  it('puts the walkable upper exit one cell beyond the clearance landing', () => {
    expect(stairsExit(c(0, 0, 0), 0)).toEqual(c(0, 1, -2));
    expect(stairsExit(c(0, 0, 0), 1)).toEqual(c(2, 1, 0));
    expect(stairsExit(c(0, 0, 0), 2)).toEqual(c(0, 1, 2));
    expect(stairsExit(c(0, 0, 0), 3)).toEqual(c(-2, 1, 0));
  });

  it('accepts stairs from a floored base with a clear run and landing', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).ok).toBe(true);
  });

  it('rejects stairs with no floor in the base', () => {
    const g = grid();
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).reason).toBe('needs-floor');
  });

  it('accepts stairs whose run crosses a floor', () => {
    // The flight is over a metre above this plate by the time it reaches the
    // run cell. Refusing it meant the only legal run was one hanging over open
    // sand, which is exactly how the piece was having to be built.
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(1, 0, 0), 'floor');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).ok).toBe(true);
  });

  it('rejects a floor added later above an existing stair run', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setStairs(c(1, 0, 0), 'stairs');
    expect(validatePlacement(g, place('floor', c(1, 1, 0)), RICH).reason).toBe('needs-clearance');
  });

  it('still refuses a floored landing, which is a lid on the stairwell', () => {
    // The landing sits directly over the run cell, so its plate spans the
    // whole footprint the top of the flight climbs through. Allowing this
    // buys a staircase you cannot climb: a stride and a half up and you meet
    // the underside of the deck you were climbing to.
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(1, 1, 0), 'floor');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).reason).toBe(
      'needs-clearance',
    );
  });

  it('accepts a fully floored deck with an upper storey left open at the landing', () => {
    // The realistic case, and the one that had no legal placement anywhere:
    // floor the whole deck, then go looking for somewhere to put the stairs.
    // Every candidate run cell is floored. Only the stairwell needs leaving.
    const g = grid();
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        g.setCell(c(x, 0, z), 'floor');
        if (!(x === 1 && z === 0)) g.setCell(c(x, 1, z), 'floor');
      }
    }
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).ok).toBe(true);
  });

  it('rejects a second flight climbing through the same run cell', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setStairs(c(1, 0, 0), 'stairs');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).reason).toBe('occupied');
  });

  it('rejects a flight into a roof, which caps the cell where the top tread arrives', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(1, 0, 0), 'floor');
    g.setRoof(c(1, 0, 0), 'roof');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).reason).toBe(
      'needs-clearance',
    );
  });

  it('rejects a flight through a workstation, which is tall enough to meet the treads', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setCell(c(1, 0, 0), 'floor');
    g.setStation(c(1, 0, 0), 'refinery');
    expect(validatePlacement(g, place('stairs', c(0, 0, 0), 1), RICH).reason).toBe(
      'needs-clearance',
    );
  });

  it('rejects stairs whose landing would leave the envelope', () => {
    const g = grid();
    g.setCell(c(0, 2, 0), 'floor');
    // Landing would be level 3, which does not exist.
    expect(validatePlacement(g, place('stairs', c(0, 2, 0), 1), RICH).reason).toBe('out-of-bounds');
  });
});

describe('stations', () => {
  const STATIONS: PieceId[] = ['crate', 'workbench', 'refinery', 'generator'];

  it('needs a floor in its own cell', () => {
    for (const piece of STATIONS) {
      const g = grid();
      expect(validatePlacement(g, place(piece, c(0, 0, 0)), RICH).reason).toBe('needs-floor');
    }
  });

  it('stands on a floor rather than replacing it', () => {
    for (const piece of STATIONS) {
      const g = grid();
      g.setCell(c(0, 0, 0), 'floor');
      expect(validatePlacement(g, place(piece, c(0, 0, 0)), RICH).ok).toBe(true);
      // The floor is still there afterwards: stations live in their own layer.
      expect(g.getCell(c(0, 0, 0))).toBe('floor');
    }
  });

  it('rejects a second station in the same cell', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setStation(c(0, 0, 0), 'crate');
    expect(validatePlacement(g, place('workbench', c(0, 0, 0)), RICH).reason).toBe('occupied');
  });

  it('coexists with a roof over the same cell', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setRoof(c(0, 0, 0), 'roof');
    expect(validatePlacement(g, place('crate', c(0, 0, 0)), RICH).ok).toBe(true);
  });

  it('rejects a blocked equipment cell even with a floor', () => {
    const g = grid();
    g.setCell(c(1, 0, 1), 'floor');
    g.blockCell(c(1, 0, 1));
    expect(validatePlacement(g, place('refinery', c(1, 0, 1)), RICH).reason).toBe('blocked');
  });

  it('rejects a station outside the envelope', () => {
    const g = grid();
    expect(validatePlacement(g, place('crate', c(99, 0, 0)), RICH).reason).toBe('out-of-bounds');
  });
});

describe('wall fixtures', () => {
  it('hangs a lamp on a wall', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'east'), RICH).ok).toBe(true);
  });

  it('hangs a lamp on a doorway too', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'north'), 'doorway');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'north'), RICH).ok).toBe(true);
  });

  it('refuses a lamp on an empty edge — it needs something to hang on', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'east'), RICH).reason).toBe(
      'needs-wall',
    );
  });

  it('refuses a lamp on a railing, which is a handrail and not a wall', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'railing');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'east'), RICH).reason).toBe(
      'needs-wall',
    );
  });

  it('does not count as occupying the edge its wall is on', () => {
    // Fixtures live in their own layer, exactly as stations do over floors.
    // Sharing the edge map would mean hanging a lamp DELETED the wall.
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    g.setFixture(canonicalEdge(c(0, 0, 0), 'east'), 'lamp');
    expect(g.getEdge(canonicalEdge(c(0, 0, 0), 'east'))).toBe('wall');
    expect(g.getFixture(canonicalEdge(c(0, 0, 0), 'east'))).toBe('lamp');
  });

  it('rejects a second lamp on the same wall', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    g.setEdge(canonicalEdge(c(0, 0, 0), 'east'), 'wall');
    g.setFixture(canonicalEdge(c(0, 0, 0), 'east'), 'lamp');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'east'), RICH).reason).toBe(
      'occupied',
    );
  });

  it('rejects a lamp entirely outside the envelope', () => {
    const g = grid();
    expect(validatePlacement(g, edgePlace('lamp', c(99, 0, 99), 'east'), RICH).reason).toBe(
      'out-of-bounds',
    );
  });

  it('reports the structural reason ahead of affordability', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    expect(validatePlacement(g, edgePlace('lamp', c(0, 0, 0), 'east'), POOR).reason).toBe(
      'needs-wall',
    );
  });
});

describe('purity', () => {
  it('never mutates the grid', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    const cellsBefore = g.cellCount;
    const edgesBefore = g.edgeCount;

    validatePlacement(g, place('floor', c(1, 0, 0)), RICH);
    validatePlacement(g, place('floor', c(99, 0, 0)), RICH);
    validatePlacement(g, edgePlace('wall', c(0, 0, 0), 'east'), RICH);
    validatePlacement(g, place('stairs', c(0, 0, 0), 1), POOR);

    expect(g.cellCount).toBe(cellsBefore);
    expect(g.edgeCount).toBe(edgesBefore);
  });
});
