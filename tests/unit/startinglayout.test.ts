import { describe, expect, it } from 'vitest';
import { BuildGrid, cellKey, type Cell } from '@/building/BuildGrid';
import { validatePlacement } from '@/building/BuildValidation';
import { BUILD_PIECES, STARTING_STRUCTURES, isStation, type PieceId } from '@/data/build-pieces';
import { buildMachine } from '@/machine/MachineGeometry';
import { projectEquipmentCells } from '@/machine/Machine';

/**
 * What a fresh machine is already carrying when the player first stands up.
 *
 * Handoff section 49 puts a small generator in the starting equipment, and
 * Phase 3 gates the refinery on power — so a new game that started without one
 * would have no components, and the refinery is the only source of them. This
 * is the bootstrap, checked rather than assumed.
 *
 * `buildMachine` is given no materials for the reason `equipmentcells.test.ts`
 * gives: nothing here touches one, and a real `Materials` needs a renderer.
 */
const machine = buildMachine({} as never);
const blocked = projectEquipmentCells(machine.colliders);

const cellOf = (piece: PieceId): Cell | undefined =>
  STARTING_STRUCTURES.find((p) => p.piece === piece)?.cell;

const indexOf = (piece: PieceId): number =>
  STARTING_STRUCTURES.findIndex((p) => p.piece === piece);

describe('the starting structures', () => {
  it('includes a generator', () => {
    expect(STARTING_STRUCTURES.map((p) => p.piece)).toContain('generator');
  });

  it('places every one of them legally, in order, on a fresh machine', () => {
    // Replayed through the real validator, in the real order, against a grid
    // carrying the machine's real equipment cells — the same path
    // `BuildSystem` takes replaying a save. A layout that passes here cannot
    // be rejected at boot.
    const grid = new BuildGrid<PieceId>();
    for (const cell of blocked) grid.blockCell(cell);

    for (const placement of STARTING_STRUCTURES) {
      const result = validatePlacement(grid, placement, () => true);
      expect(result, `${placement.piece} at ${cellKey(placement.cell)}`).toEqual({ ok: true });
      // Mirror what a successful placement does, so the next piece in the list
      // sees the world the previous one left behind.
      if (isStation(placement.piece)) grid.setStation(placement.cell, placement.piece);
      else grid.setCell(placement.cell, placement.piece);
    }
  });

  it('stands the generator clear of the machine own equipment', () => {
    const blockedKeys = new Set(blocked.map(cellKey));
    const generator = cellOf('generator');
    expect(generator).toBeDefined();
    if (generator) expect(blockedKeys.has(cellKey(generator))).toBe(false);
  });

  it('gives the generator a deck plate to stand on, laid first', () => {
    // A station needs a floor in its own cell, and the bare hull deck is not
    // one — the same rule the player meets building their first refinery.
    expect(cellOf('floor')).toEqual(cellOf('generator'));
    expect(indexOf('floor')).toBeGreaterThanOrEqual(0);
    expect(indexOf('floor')).toBeLessThan(indexOf('generator'));
  });

  it('uses only real, buildable definitions', () => {
    // Placed free at boot, but each has to be a piece the player could also
    // demolish for a refund and rebuild from scratch.
    for (const placement of STARTING_STRUCTURES) {
      expect(BUILD_PIECES[placement.piece]).toBeDefined();
    }
  });
});
