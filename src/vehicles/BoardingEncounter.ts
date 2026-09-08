import type { BoardingSide } from './BoardingPlan';
import { crossingSchedule } from './BoardingPlan';

export type BoardingPhase =
  | 'approach'
  | 'firing-pass'
  | 'alongside'
  | 'hook-flight'
  | 'attached'
  | 'boarding'
  | 'retreat'
  | 'destroyed';

export interface BoardingEncounterState {
  phase: BoardingPhase;
  side: BoardingSide;
  lateral: number;
  forward: number;
  hullHealth: number;
  crewHealth: number[];
  hookHealth: number;
  hookMaxHealth: number;
  elapsed: number;
  phaseElapsed: number;
  nextCrossing: number;
  crossed: number;
  crossingAt: number[];
  crewStatus: ('seated' | 'crossing' | 'landed' | 'dead')[];
  ended: boolean;
  landedBoardersAlive: number;
}

export type BoardingEncounterSave = BoardingEncounterState;

export interface BoardingEncounterInput {
  dt: number;
  hookRange: number;
  destroyHull?: boolean;
  cutHook?: boolean;
  hookAttached?: boolean;
  crossingSeconds?: number;
  telegraphSeconds?: number;
  landedBoardersAlive?: number;
}

export function createBoardingEncounter(
  side: BoardingSide = 'port',
  crewCount = 2,
  hullHealth = 260,
  hookMaxHealth = 60,
): BoardingEncounterState {
  return {
    phase: 'approach',
    side,
    lateral: side === 'port' ? -30 : 30,
    forward: 55,
    hullHealth,
    crewHealth: Array.from({ length: crewCount }, () => 55),
    hookHealth: hookMaxHealth,
    hookMaxHealth,
    elapsed: 0,
    phaseElapsed: 0,
    nextCrossing: 0,
    crossed: 0,
    crossingAt: crossingSchedule(crewCount).map((entry) => entry.at),
    crewStatus: Array.from({ length: crewCount }, () => 'seated'),
    ended: false,
    landedBoardersAlive: 0,
  };
}

/**
 * Complete one bounded skiff boarding choreography. The caller owns actual
 * enemy spawning and raycasts; this module owns every transition and the
 * durable counters so an active encounter is never silently reset on save.
 */
export function stepBoardingEncounter(
  state: BoardingEncounterState,
  input: BoardingEncounterInput,
): BoardingEncounterState {
  if (state.phase === 'destroyed' || state.ended) return state;
  const dt = Math.max(0, input.dt);
  const elapsed = state.elapsed + dt;
  const liveCrew = state.crewHealth.filter((health) => health > 0).length;
  const transition = (
    phase: BoardingPhase,
    extra: Partial<BoardingEncounterState> = {},
  ): BoardingEncounterState => ({ ...state, ...extra, phase, phaseElapsed: 0, elapsed });
  if (input.destroyHull || state.hullHealth <= 0) return transition('destroyed', { hullHealth: 0 });
  if (state.phase === 'retreat') {
    const landedBoardersAlive = input.landedBoardersAlive ?? state.landedBoardersAlive;
    if (state.phaseElapsed + dt >= 3 && landedBoardersAlive <= 0)
      return {
        ...state,
        landedBoardersAlive,
        lateral: state.lateral + (state.side === 'port' ? -1 : 1) * dt * 8,
        forward: state.forward + dt * 8,
        elapsed,
        phaseElapsed: state.phaseElapsed + dt,
        ended: true,
      };
    return {
      ...state,
      landedBoardersAlive,
      lateral: state.lateral + (state.side === 'port' ? -1 : 1) * dt * 8,
      forward: state.forward + dt * 8,
      elapsed,
      phaseElapsed: state.phaseElapsed + dt,
    };
  }
  if (liveCrew === 0) return transition('retreat');
  if (state.hookHealth <= 0 || input.cutHook)
    return transition('retreat', {
      hookHealth: 0,
      crewStatus: state.crewStatus.map((status) => (status === 'crossing' ? 'dead' : status)),
    });
  if (state.phase === 'approach') {
    const wanted = state.side === 'port' ? -13 : 13;
    const lateral = state.lateral + (wanted - state.lateral) * Math.min(1, dt * 2.5);
    const forward = state.forward + (0 - state.forward) * Math.min(1, dt * 1.8);
    const next = { ...state, lateral, forward, elapsed, phaseElapsed: state.phaseElapsed + dt };
    return Math.abs(lateral - wanted) < 0.5 && Math.abs(forward) < 1.5
      ? { ...next, phase: 'firing-pass', phaseElapsed: 0 }
      : next;
  }
  if (state.phase === 'firing-pass')
    return state.phaseElapsed + dt >= Math.max(1, input.telegraphSeconds ?? 2)
      ? transition('alongside')
      : { ...state, elapsed, phaseElapsed: state.phaseElapsed + dt };
  if (state.phase === 'alongside')
    return state.phaseElapsed + dt >= 1.5
      ? transition('hook-flight')
      : { ...state, elapsed, phaseElapsed: state.phaseElapsed + dt };
  if (state.phase === 'hook-flight') {
    if (input.cutHook || state.hookHealth <= 0) return transition('retreat', { hookHealth: 0 });
    if (input.hookAttached || state.phaseElapsed >= 0.75) return transition('attached');
    return { ...state, elapsed, phaseElapsed: state.phaseElapsed + dt };
  }
  if (state.phase === 'attached') {
    if (input.cutHook || state.hookHealth <= 0) return transition('retreat', { hookHealth: 0 });
    return state.phaseElapsed + dt >= 0.4
      ? transition('boarding')
      : { ...state, elapsed, phaseElapsed: state.phaseElapsed + dt };
  }
  if (state.phase === 'boarding') {
    if (input.cutHook || state.hookHealth <= 0)
      return transition('retreat', {
        hookHealth: 0,
        crewStatus: state.crewStatus.map((status) => (status === 'crossing' ? 'dead' : status)),
      });
    const crossSeconds = Math.max(0.1, input.crossingSeconds ?? 2);
    const crewStatus = [...state.crewStatus];
    for (let i = 0; i < crewStatus.length; i++) {
      if (crewStatus[i] === 'seated' && state.phaseElapsed >= state.crossingAt[i]!)
        crewStatus[i] = 'crossing';
      if (crewStatus[i] === 'crossing' && state.phaseElapsed >= state.crossingAt[i]! + crossSeconds)
        crewStatus[i] = 'landed';
    }
    const crossed = crewStatus.filter((status) => status === 'landed').length;
    const next = {
      ...state,
      crewStatus,
      crossed,
      landedBoardersAlive: input.landedBoardersAlive ?? state.landedBoardersAlive,
      elapsed,
      phaseElapsed: state.phaseElapsed + dt,
    };
    return crewStatus.every((status) => status === 'landed' || status === 'dead')
      ? transition('retreat', next)
      : next;
  }
  return { ...state, elapsed };
}

export function damageBoardingCrew(
  state: BoardingEncounterState,
  index: number,
  amount: number,
): BoardingEncounterState {
  if (index < 0 || index >= state.crewHealth.length) return state;
  const crewHealth = [...state.crewHealth];
  crewHealth[index] = Math.max(0, crewHealth[index]! - Math.max(0, amount));
  const crewStatus = [...state.crewStatus];
  if (crewHealth[index] === 0) crewStatus[index] = 'dead';
  return { ...state, crewHealth, crewStatus };
}

export function damageBoardingHull(
  state: BoardingEncounterState,
  amount: number,
): BoardingEncounterState {
  return { ...state, hullHealth: Math.max(0, state.hullHealth - Math.max(0, amount)) };
}

export function damageBoardingHook(
  state: BoardingEncounterState,
  amount: number,
): BoardingEncounterState {
  return { ...state, hookHealth: Math.max(0, state.hookHealth - Math.max(0, amount)) };
}

export function boardingEncounterToSave(state: BoardingEncounterState): BoardingEncounterSave {
  return {
    ...state,
    crewHealth: [...state.crewHealth],
    crossingAt: [...state.crossingAt],
    crewStatus: [...state.crewStatus],
  };
}

export function restoreBoardingEncounter(save: BoardingEncounterSave): BoardingEncounterState {
  return {
    ...save,
    crewHealth: [...save.crewHealth],
    crossingAt: [...save.crossingAt],
    crewStatus: [...save.crewStatus],
  };
}
