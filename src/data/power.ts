/**
 * The power economy's numbers (handoff section 13).
 *
 * Data only, like `subsystems.ts` and `build-pieces.ts`. Every later device —
 * the Phase 4 condenser, the Phase 5 turrets — adds a line to `DRAWS` rather
 * than a system, which is the whole reason this file is separate from the
 * model that reads it.
 */

/**
 * What a device is willing to lose power for.
 *
 * `defense` exists before any turret does, deliberately: Phase 5 registers
 * turrets through the existing model rather than reshaping it, and a shedding
 * order invented later would have had to renumber everything already saved.
 */
export type PowerPriority = 'light' | 'station' | 'defense';

/**
 * Shed order, LOWEST FIRST.
 *
 * The array is the source of truth, not the union above: `MachinePower` walks
 * it, so a class missing from here would never shed at all.
 */
export const PRIORITY_ORDER: readonly PowerPriority[] = ['light', 'station', 'defense'];

/** Units a running generator takes from the tank each simulated second. */
export const FUEL_BURN_PER_S = 0.06;

/** How much the machine's tank holds. Deposits above this are refused. */
export const FUEL_TANK_CAP = 100;

/** What a new game starts with in the tank — see the pre-placed generator. */
export const STARTING_FUEL = 60;

/**
 * One generator's output at full health.
 *
 * Sized so the starting machine can run the refinery and still light a couple
 * of rooms: the refinery is the only source of components, so a generator that
 * could not carry it would brick a fresh start.
 */
export const GENERATOR_CAPACITY = 16;

/** What each powered device draws while it is on. */
export const DRAWS = {
  lamp: 1,
  refinery: 10,
} as const;
