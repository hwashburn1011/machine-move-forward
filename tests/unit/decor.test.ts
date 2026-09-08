import { describe, expect, it } from 'vitest';
import { BuildGrid, canonicalEdge, type Cell } from '@/building/BuildGrid';
import { validatePlacement, type CanAfford, type Placement } from '@/building/BuildValidation';
import { pieceColliders } from '@/building/BuildPieceGeometry';
import { detectRooms, countEnclosed } from '@/building/RoomDetector';
import {
  BUILD_PIECES,
  BUILD_PIECE_ORDER,
  DECOR_PIECES,
  PIECE_CATEGORIES,
  blocksNavigation,
  buildsColliders,
  isDecor,
  isFixture,
  isStation,
  piecesInCategory,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });
const RICH: CanAfford = () => true;
const grid = () => new BuildGrid<PieceId>();
const place = (piece: PieceId, cell: Cell): Placement => ({ piece, cell, rotation: 0 });

/** A floored cell to put things on. */
function floored(at: Cell = c(0, 0, 0)): BuildGrid<PieceId> {
  const g = grid();
  g.setCell(at, 'floor');
  return g;
}

describe('the four decoration pieces', () => {
  it('is exactly chair, table, rug and shelf', () => {
    expect([...DECOR_PIECES].sort()).toEqual(['chair', 'rug', 'shelf', 'table']);
  });

  it('calls every one of them decor and nothing else', () => {
    for (const id of Object.keys(BUILD_PIECES) as PieceId[]) {
      expect(isDecor(id), id).toBe(DECOR_PIECES.includes(id));
      // Three grid layers, three answers. A piece in two of them would be
      // occupied in one and vacated from the other.
      if (isDecor(id)) {
        expect(isStation(id), id).toBe(false);
        expect(isFixture(id), id).toBe(false);
      }
    }
  });

  it('weighs almost nothing, so decorating never slows the machine', () => {
    // The point of the category. A player should be able to furnish the whole
    // deck without paying for it in speed.
    for (const id of DECOR_PIECES) {
      expect(BUILD_PIECES[id].weight, id).toBeGreaterThan(0);
      expect(BUILD_PIECES[id].weight, id).toBeLessThan(BUILD_PIECES.railing.weight);
    }
  });

  it('bounds no room and blocks no navigation', () => {
    for (const id of DECOR_PIECES) {
      expect(BUILD_PIECES[id].boundsRoom, id).toBe(false);
      expect(BUILD_PIECES[id].blocksNavigation, id).toBe(false);
      expect(blocksNavigation(id), id).toBe(false);
    }
  });

  it('is cheap enough to be a whim', () => {
    for (const id of DECOR_PIECES) {
      expect(BUILD_PIECES[id].cost.scrap ?? 0, id).toBeGreaterThan(0);
      expect(BUILD_PIECES[id].cost.scrap ?? 0, id).toBeLessThanOrEqual(
        BUILD_PIECES.floor.cost.scrap ?? 0,
      );
      expect(BUILD_PIECES[id].cost.components ?? 0, id).toBe(0);
    }
  });
});

describe('decor builds no colliders, which is what makes models safe', () => {
  it('declares itself collider-free', () => {
    // The standing constraint says collider-bearing pieces stay procedural
    // because their colliders derive from their geometry. A piece with no
    // collider is exempt, and this is the flag `BuildSystem` reads to skip
    // the collider builder entirely.
    for (const id of DECOR_PIECES) expect(buildsColliders(id), id).toBe(false);
  });

  it('produces an empty collider list for every decor piece', () => {
    for (const id of DECOR_PIECES) expect(pieceColliders(id), id).toEqual([]);
  });

  it('leaves every structural piece solid', () => {
    for (const id of ['floor', 'wall', 'doorway', 'railing', 'roof', 'stairs'] as PieceId[]) {
      expect(buildsColliders(id), id).toBe(true);
      expect(pieceColliders(id).length, id).toBeGreaterThan(0);
    }
  });
});

describe('placing decor', () => {
  it('needs a floor under it', () => {
    const g = grid();
    expect(validatePlacement(g, place('chair', c(0, 0, 0)), RICH).reason).toBe('needs-floor');
    expect(validatePlacement(floored(), place('chair', c(0, 0, 0)), RICH).ok).toBe(true);
  });

  it('refuses a second piece in the same cell', () => {
    const g = floored();
    g.setDecor(c(0, 0, 0), 'chair');
    expect(validatePlacement(g, place('table', c(0, 0, 0)), RICH).reason).toBe('occupied');
  });

  it('sits happily in a cell that already holds a station', () => {
    // A rug under the workbench. Its own grid layer is what allows it, and
    // sharing the station layer would have made placing one silently
    // overwrite the other's owner entry.
    const g = floored();
    g.setStation(c(0, 0, 0), 'workbench');
    expect(validatePlacement(g, place('rug', c(0, 0, 0)), RICH).ok).toBe(true);
  });

  it('refuses a cell blocked by the machine own equipment', () => {
    const g = floored();
    g.blockCell(c(0, 0, 0));
    expect(validatePlacement(g, place('shelf', c(0, 0, 0)), RICH).reason).toBe('blocked');
  });

  it('refuses a cell outside the envelope', () => {
    expect(validatePlacement(grid(), place('chair', c(999, 0, 0)), RICH).reason).toBe(
      'out-of-bounds',
    );
  });
});

describe('decor has no gameplay weight at all', () => {
  it('does not turn an open deck into a room, or an enclosed one into two', () => {
    const g = grid();
    g.setCell(c(0, 0, 0), 'floor');
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      g.setEdge(canonicalEdge(c(0, 0, 0), side), 'wall');
    }
    g.setRoof(c(0, 0, 0), 'roof');

    const before = detectRooms(g);
    expect(countEnclosed(before)).toBe(1);

    g.setDecor(c(0, 0, 0), 'table');
    const after = detectRooms(g);
    expect(after.rooms).toHaveLength(before.rooms.length);
    expect(countEnclosed(after)).toBe(1);
  });
});

describe('the build categories', () => {
  it('gives every piece exactly one category', () => {
    for (const id of Object.keys(BUILD_PIECES) as PieceId[]) {
      expect(PIECE_CATEGORIES, id).toContain(BUILD_PIECES[id].category);
    }
  });

  it('partitions the whole selection order, with nothing lost or doubled', () => {
    const grouped = PIECE_CATEGORIES.flatMap((category) => piecesInCategory(category));
    expect([...grouped].sort()).toEqual([...BUILD_PIECE_ORDER].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('keeps every category inside the number-key budget', () => {
    // `InputManager` binds slot1..slot9 and no more. A category that outgrew
    // that would leave its last pieces unselectable, which reads as the piece
    // never having been implemented.
    for (const category of PIECE_CATEGORIES) {
      expect(piecesInCategory(category).length, category).toBeGreaterThan(0);
      expect(piecesInCategory(category).length, category).toBeLessThanOrEqual(9);
    }
  });

  it('agrees with the station and decor predicates', () => {
    for (const id of Object.keys(BUILD_PIECES) as PieceId[]) {
      const category: PieceCategory = BUILD_PIECES[id].category;
      expect(isStation(id), id).toBe(category === 'station');
      expect(isDecor(id), id).toBe(category === 'decor');
    }
  });
});
