import { GUNBOAT } from '@/data/vehicles';

export type GunboatPhase =
  'approach' | 'telegraph' | 'broadside' | 'retreat' | 'destroyed' | 'ended';
export interface GunboatState {
  phase: GunboatPhase;
  side: 'port' | 'starboard';
  lateral: number;
  forward: number;
  hullHealth: number;
  weaponHealth: number;
  engineHealth: number;
  phaseElapsed: number;
  nextVolleyAt: number;
  volleySerial: number;
  outcome: 'hull' | 'weapon-and-engine' | 'escaped' | null;
}

const DEF = GUNBOAT;
const MAX_STEP_SECONDS = 1;
const finite = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;
const nonNegative = (n: unknown, fallback: number): number => Math.max(0, finite(n, fallback));
const sideOf = (value: unknown): 'port' | 'starboard' =>
  value === 'starboard' ? 'starboard' : 'port';
const phaseOf = (value: unknown): GunboatPhase =>
  value === 'approach' ||
  value === 'telegraph' ||
  value === 'broadside' ||
  value === 'retreat' ||
  value === 'destroyed' ||
  value === 'ended'
    ? value
    : 'ended';

export function createGunboatEncounter(side: 'port' | 'starboard' = 'port'): GunboatState {
  return {
    phase: 'approach',
    side,
    lateral: side === 'port' ? -DEF.lane : DEF.lane,
    forward: 60,
    hullHealth: DEF.hull.maxHealth,
    weaponHealth: DEF.weaponSubsystem.maxHealth,
    engineHealth: DEF.engineSubsystem.maxHealth,
    phaseElapsed: 0,
    nextVolleyAt: DEF.shell.volleyPeriod,
    volleySerial: 0,
    outcome: null,
  };
}

export function stepGunboatEncounter(input: GunboatState, dt: number): GunboatState {
  const state = { ...input };
  // Encounter stepping is fixed-step in the game. Clamp hostile callers so a
  // paused tab or malformed replay cannot manufacture thousands of volleys.
  let remaining = Math.min(MAX_STEP_SECONDS, Math.max(0, finite(dt, 0)));
  if (state.phase === 'ended' || state.phase === 'destroyed') return state;
  if (state.hullHealth <= 0)
    return { ...state, hullHealth: 0, phase: 'destroyed', phaseElapsed: 0, outcome: 'hull' };

  if (state.phase === 'approach') {
    const toLane = Math.max(0, state.forward - DEF.lane);
    const travel = Math.min(toLane, remaining * 8);
    state.forward -= travel;
    remaining -= travel / 8;
    if (state.forward <= DEF.lane + 1e-6) {
      state.phase = 'telegraph';
      state.phaseElapsed = 0;
    }
  }
  if (state.phase === 'telegraph') {
    const need = Math.max(0, DEF.telegraphSeconds - state.phaseElapsed);
    const used = Math.min(need, remaining);
    state.phaseElapsed += used;
    remaining -= used;
    if (state.phaseElapsed >= DEF.telegraphSeconds - 1e-9) {
      state.phase = 'broadside';
      state.phaseElapsed = 0;
      state.nextVolleyAt = DEF.shell.volleyPeriod;
    }
  }
  if (state.phase === 'broadside') {
    state.phaseElapsed += remaining;
    remaining = 0;
    if (state.weaponHealth > 0) {
      while (state.phaseElapsed + 1e-9 >= state.nextVolleyAt) {
        state.volleySerial++;
        state.nextVolleyAt += DEF.shell.volleyPeriod;
      }
    } else {
      state.nextVolleyAt = DEF.shell.volleyPeriod;
      if (state.engineHealth > 0 && state.phaseElapsed >= DEF.retreatSeconds) {
        state.phase = 'retreat';
        state.phaseElapsed = 0;
      } else if (state.engineHealth <= 0 && state.phaseElapsed >= DEF.disabledSeconds) {
        state.phase = 'ended';
        state.phaseElapsed = 0;
        state.outcome = 'weapon-and-engine';
      }
    }
  }
  if (state.phase === 'retreat') {
    state.phaseElapsed += remaining;
    state.forward += remaining * 8;
    if (state.phaseElapsed >= DEF.retreatSeconds) {
      state.phase = 'ended';
      state.phaseElapsed = 0;
      state.outcome = 'escaped';
    }
  }
  return state;
}

export function damageGunboatEncounter(
  input: GunboatState,
  part: 'hull' | 'weapon' | 'engine',
  amount: number,
): GunboatState {
  if (input.phase === 'ended' || input.phase === 'destroyed') return input;
  const damage = Math.max(0, finite(amount, 0));
  const state = { ...input };
  if (part === 'hull') state.hullHealth = Math.max(0, state.hullHealth - damage);
  if (part === 'weapon') state.weaponHealth = Math.max(0, state.weaponHealth - damage);
  if (part === 'engine') state.engineHealth = Math.max(0, state.engineHealth - damage);
  if (state.hullHealth <= 0)
    return { ...state, phase: 'destroyed', phaseElapsed: 0, outcome: 'hull' };
  const weaponDisabled = state.weaponHealth <= 0;
  const engineDisabled = state.engineHealth <= 0;
  if (weaponDisabled && !engineDisabled && input.weaponHealth > 0) {
    // Weapon damage can force the retreat from any pre-broadside phase.
    state.phase = 'retreat';
    state.phaseElapsed = 0;
  } else if (engineDisabled && input.engineHealth > 0 && input.phase === 'retreat') {
    // An engine-disabled gunboat cannot complete its retreat. It holds the
    // broadside lane and resumes fire if its weapon remains live.
    state.phase = 'broadside';
    state.phaseElapsed = 0;
    state.nextVolleyAt = DEF.shell.volleyPeriod;
  } else if (
    weaponDisabled &&
    engineDisabled &&
    (input.weaponHealth > 0 || input.engineHealth > 0)
  ) {
    state.phase = 'broadside';
    state.phaseElapsed = 0;
    state.nextVolleyAt = DEF.shell.volleyPeriod;
  } else if (
    engineDisabled &&
    input.engineHealth > 0 &&
    (input.phase === 'approach' || input.phase === 'telegraph')
  ) {
    // A dead engine reaches the vulnerable lane immediately and cannot keep
    // moving through approach or into a normal retreat.
    state.phase = 'broadside';
    state.phaseElapsed = 0;
    state.nextVolleyAt = DEF.shell.volleyPeriod;
  }
  return state;
}

export interface GunboatEncounterSave extends GunboatState {
  format: 1;
}
export function serialiseGunboatEncounter(state: GunboatState): GunboatEncounterSave {
  return { format: 1, ...state };
}
export function restoreGunboatEncounter(value: unknown): GunboatState {
  const ended = (): GunboatState => ({
    ...createGunboatEncounter(),
    phase: 'ended',
    outcome: null,
  });
  if (typeof value !== 'object' || value === null) return ended();
  const raw = value as Partial<GunboatState>;
  const phase = phaseOf(raw.phase);
  const numbers = [
    raw.lateral,
    raw.forward,
    raw.hullHealth,
    raw.weaponHealth,
    raw.engineHealth,
    raw.phaseElapsed,
    raw.nextVolleyAt,
    raw.volleySerial,
  ];
  const rawOutcome =
    raw.outcome === 'hull' || raw.outcome === 'weapon-and-engine' || raw.outcome === 'escaped'
      ? raw.outcome
      : null;
  if (numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return ended();
  if (phase === 'ended' && rawOutcome === null) return ended();
  const state: GunboatState = {
    phase,
    side: sideOf(raw.side),
    lateral: finite(raw.lateral, 0),
    forward: finite(raw.forward, 0),
    hullHealth: Math.min(DEF.hull.maxHealth, nonNegative(raw.hullHealth, 0)),
    weaponHealth: Math.min(DEF.weaponSubsystem.maxHealth, nonNegative(raw.weaponHealth, 0)),
    engineHealth: Math.min(DEF.engineSubsystem.maxHealth, nonNegative(raw.engineHealth, 0)),
    phaseElapsed: Math.min(60, nonNegative(raw.phaseElapsed, 0)),
    nextVolleyAt: Math.min(60, nonNegative(raw.nextVolleyAt, DEF.shell.volleyPeriod)),
    volleySerial: Math.floor(nonNegative(raw.volleySerial, 0)),
    outcome: rawOutcome,
  };
  if (state.phase === 'destroyed' && state.hullHealth > 0) return ended();
  if (state.phase !== 'destroyed' && state.hullHealth <= 0) return ended();
  return state;
}

export const GUNBOAT_REWARDS = DEF.rewards;
