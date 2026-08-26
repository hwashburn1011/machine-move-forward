import { describe, expect, it } from 'vitest';
import { BUILD_PIECES, REFUND_FRACTION, type PieceId } from '@/data/build-pieces';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import { structureRepairCost, subsystemRepairCost } from '@/building/RepairPricing';

const PIECES = Object.keys(BUILD_PIECES) as PieceId[];
const SUBS = Object.keys(SUBSYSTEMS) as SubsystemId[];

describe('what a repair costs', () => {
  /**
   * THE property this module exists for, asserted over the whole table rather
   * than a hand-picked example.
   *
   * Demolition refunds 60%, so replacing a wrecked piece nets 40% of its build
   * cost. If a full repair ever costs 40% or more, the optimal play is
   * demolish-and-rebuild and the repair verb is dead on arrival.
   */
  it('is always strictly cheaper than demolishing and rebuilding', () => {
    const replace = 1 - REFUND_FRACTION;
    for (const id of PIECES) {
      const build = BUILD_PIECES[id].cost.scrap ?? 0;
      if (build === 0) continue;
      const repair = structureRepairCost(id, 1).scrap ?? 0;
      expect(repair, `${id}: repair ${repair} vs replace ${build * replace}`).toBeLessThan(
        build * replace,
      );
    }
  });

  it('charges nothing to repair something already whole', () => {
    for (const id of PIECES) expect(structureRepairCost(id, 0).scrap ?? 0).toBe(0);
    for (const id of SUBS) expect(subsystemRepairCost(id, 0).scrap ?? 0).toBe(0);
  });

  it('charges pro rata, so patching early is not punished', () => {
    const full = structureRepairCost('wall', 1).scrap ?? 0;
    const half = structureRepairCost('wall', 0.5).scrap ?? 0;
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });

  it('never charges for more than a full repair, whatever it is handed', () => {
    const full = structureRepairCost('wall', 1).scrap ?? 0;
    expect(structureRepairCost('wall', 4).scrap ?? 0).toBe(full);
    expect(structureRepairCost('wall', -2).scrap ?? 0).toBe(0);
  });

  it('always charges at least a unit for real damage, so nothing is free', () => {
    // Rounding a 1% repair to zero would let a player mend a wall between
    // every shot for nothing.
    for (const id of PIECES) {
      if ((BUILD_PIECES[id].cost.scrap ?? 0) === 0) continue;
      expect(structureRepairCost(id, 0.01).scrap ?? 0, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('prices every subsystem from its own table', () => {
    for (const id of SUBS) {
      expect(subsystemRepairCost(id, 1).scrap, id).toBe(SUBSYSTEMS[id].repairScrap);
    }
  });
});
