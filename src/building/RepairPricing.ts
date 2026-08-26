import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { ItemCost } from '@/data/items';

/**
 * What a full repair costs, as a fraction of what the thing cost to build.
 *
 * Pinned BELOW the 40% that demolishing and rebuilding nets — demolition
 * refunds 60% — and `repairpricing.test.ts` asserts that over the whole piece
 * table rather than trusting this comment. Raise it and repair stops being the
 * right move, silently.
 *
 * 0.2 rather than the 0.3 the headroom suggests, and the CHEAPEST piece is
 * what sets it. A railing costs 5 scrap, so replacing one nets 2, and the
 * charge is rounded UP to a whole unit — at 0.3 the repair is `ceil(1.5) = 2`,
 * exactly the price of replacing it, and the verb is dead for the one piece a
 * player loses most often. At 0.2 it is 1. Every dearer piece has room to
 * spare; this constant is bounded by the railing alone.
 */
export const REPAIR_COST_FRACTION = 0.2;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Round up, but only once there is something to pay for.
 *
 * Rounding a 1% repair down to zero would let a player mend a wall between
 * every incoming shot for nothing at all.
 */
function charge(full: number, missing: number): number {
  const fraction = clamp01(missing);
  if (fraction === 0) return 0;
  return Math.max(1, Math.ceil(full * fraction));
}

export function structureRepairCost(pieceId: PieceId, missingFraction: number): ItemCost {
  const build = BUILD_PIECES[pieceId].cost.scrap ?? 0;
  if (build === 0) return {};
  return { scrap: charge(build * REPAIR_COST_FRACTION, missingFraction) };
}

export function subsystemRepairCost(id: SubsystemId, missingFraction: number): ItemCost {
  return { scrap: charge(SUBSYSTEMS[id].repairScrap, missingFraction) };
}
