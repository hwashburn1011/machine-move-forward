import type { PieceId } from './build-pieces';

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

/** Runtime modifiers supplied by the active power upgrade. */
export interface PowerModifiers {
  generationBonus: number;
  /** Multiplier on fuel burned per simulated second. */
  fuelBurnMultiplier: number;
}

export const DEFAULT_POWER_MODIFIERS: PowerModifiers = {
  generationBonus: 0,
  fuelBurnMultiplier: 1,
};

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
  // Below the refinery on purpose. The condenser is meant to run in the
  // background of a normal deck, so a machine that can refine can also drink.
  condenser: 4,
  turret: 3,
  collector: 4,
  automaticTurret: 6,
} as const;

/**
 * What a build piece is to the power grid, if anything.
 *
 * The single table that turns a `build:placed` event into a registration, so
 * `Game` holds a switch it cannot get out of step with. A later device — the
 * Phase 4 condenser, the Phase 5 turrets — adds a line here and needs no
 * change at the call site at all.
 *
 * `null` is the answer for almost everything, and deliberately the default: a
 * wall that registered as a consumer would draw the machine flat.
 */
export type PowerRole =
  | { kind: 'producer'; capacity: number }
  | { kind: 'consumer'; draw: number; priority: PowerPriority }
  | null;

export function powerRoleOf(piece: PieceId): PowerRole {
  switch (piece) {
    case 'generator':
      return { kind: 'producer', capacity: GENERATOR_CAPACITY };
    case 'lamp':
      return { kind: 'consumer', draw: DRAWS.lamp, priority: 'light' };
    case 'refinery':
      return { kind: 'consumer', draw: DRAWS.refinery, priority: 'station' };
    // Phase 4's device, and the proof the extension point works: a new
    // consumer is this line and nothing else. `Game.wirePower` never learned
    // the condenser exists.
    case 'condenser':
      return { kind: 'consumer', draw: DRAWS.condenser, priority: 'station' };
    case 'turret-manual':
      return { kind: 'consumer', draw: DRAWS.turret, priority: 'defense' };
    case 'collector-auto':
      return { kind: 'consumer', draw: DRAWS.collector, priority: 'station' };
    case 'turret-auto':
      return { kind: 'consumer', draw: DRAWS.automaticTurret, priority: 'defense' };
    default:
      return null;
  }
}
