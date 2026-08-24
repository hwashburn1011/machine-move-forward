import type { Rng } from '@/core/math/Random';
import type { ItemId } from '@/data/items';

/**
 * What a dead scavenger is worth.
 *
 * Pure and fed a seeded RNG, so the same seed yields the same loot. The
 * harnesses replay fixed seeds, and drops that varied between two runs of one
 * seed would make them flaky in a way that is miserable to chase down.
 */

export interface DropEntry {
  id: ItemId;
  /** Inclusive bounds on the stack size. */
  min: number;
  max: number;
  /** Probability of dropping at all. Absent means always. */
  chance?: number;
}

export interface Drop {
  id: ItemId;
  count: number;
}

/**
 * Roll a table into concrete stacks.
 *
 * Entries that roll to nothing are dropped rather than returned as a stack of
 * zero: an inventory holding "0 components" is a lie the UI would have to
 * special-case forever.
 */
export function rollDrops(table: readonly DropEntry[], rng: Rng): Drop[] {
  const out: Drop[] = [];

  for (const entry of table) {
    if (entry.chance !== undefined && rng.next() >= entry.chance) continue;

    const low = Math.min(entry.min, entry.max);
    const high = Math.max(entry.min, entry.max);
    const count = rng.int(Math.floor(low), Math.floor(high));
    if (count > 0) out.push({ id: entry.id, count });
  }

  return out;
}
