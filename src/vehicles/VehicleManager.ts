import {
  combatProfile,
  VEHICLES,
  type VehicleCombatProfile,
  type VehicleId,
} from '@/data/vehicles';
import {
  createBoardingEncounter,
  damageBoardingCrew,
  damageBoardingHook,
  damageBoardingHull,
  restoreBoardingEncounter,
  stepBoardingEncounter,
  boardingEncounterToSave,
  type BoardingEncounterSave,
  type BoardingEncounterState,
} from './BoardingEncounter';

export interface VehicleRuntimeCallbacks {
  onSpawn(vehicleId: VehicleId, state: BoardingEncounterState, profile: VehicleCombatProfile): void;
  onState(state: BoardingEncounterState): void;
  onCrewLand(index: number): void;
  onDestroyed(): void;
  onRetreat(state: BoardingEncounterState): void;
  onEnded?(): void;
  onHookAttached?(state: BoardingEncounterState): void;
  onBoarderLost?(index: number): void;
  onVolley(state: BoardingEncounterState): void;
}

/**
 * Single-skiff encounter owner. The scene layer receives state snapshots and
 * supplies the Astra-authored model/FX; Game never needs to know choreography
 * or crossing counters.
 */
export class VehicleManager {
  private state: BoardingEncounterState | null = null;
  private volleyClock = 0;
  private previousPhase: BoardingEncounterState['phase'] | null = null;
  private endedNotified = false;
  private landedBoardersAlive = 0;
  private profile: VehicleCombatProfile = combatProfile(VEHICLES.skiff);

  constructor(private readonly callbacks: VehicleRuntimeCallbacks) {}

  spawn(
    vehicleId: VehicleId = 'skiff',
    side: 'port' | 'starboard' = 'port',
    tutorial = false,
  ): boolean {
    if (this.state) return false;
    if (vehicleId !== 'skiff') return false;
    const def = VEHICLES.skiff;
    this.profile = combatProfile(def, tutorial);
    this.state = createBoardingEncounter(
      side,
      def.crewCount,
      this.profile.maxHealth,
      this.profile.hookHealth,
    );
    this.previousPhase = this.state.phase;
    this.endedNotified = false;
    this.landedBoardersAlive = 0;
    this.callbacks.onSpawn(vehicleId, this.state, this.profile);
    return true;
  }

  get active(): boolean {
    return this.state !== null && this.state.phase !== 'destroyed';
  }
  get snapshot(): BoardingEncounterState | null {
    return this.state
      ? {
          ...this.state,
          crewHealth: [...this.state.crewHealth],
          crossingAt: [...this.state.crossingAt],
          crewStatus: [...this.state.crewStatus],
        }
      : null;
  }

  /** Dispose the logical encounter after its terminal callback is observed. */
  clear(): void {
    this.state = null;
    this.previousPhase = null;
    this.volleyClock = 0;
  }

  damageHull(amount: number): void {
    if (this.state) this.state = damageBoardingHull(this.state, amount);
  }
  damageCrew(index: number, amount: number): void {
    if (this.state) this.state = damageBoardingCrew(this.state, index, amount);
  }
  damageHook(amount: number): void {
    if (this.state) this.state = damageBoardingHook(this.state, amount);
  }
  setLandedBoardersAlive(count: number): void {
    this.landedBoardersAlive = Math.max(0, Math.floor(count));
  }

  fixedUpdate(dt: number, hookAttached = false, cutHook = false): void {
    if (!this.state) return;
    const previous = this.state;
    this.volleyClock += Math.max(0, dt);
    this.state = stepBoardingEncounter(this.state, {
      dt,
      hookRange: 10,
      hookAttached,
      cutHook,
      crossingSeconds: this.profile.crewStaggerSeconds,
      telegraphSeconds: this.profile.telegraphSeconds,
      landedBoardersAlive: this.landedBoardersAlive,
    });
    if (
      this.state.phase === 'firing-pass' &&
      (previous.phase !== 'firing-pass' || this.volleyClock >= VEHICLES.skiff.weapon.volleyPeriod)
    ) {
      this.volleyClock = 0;
      this.callbacks.onVolley(this.state);
    }
    // `crossed` is an aggregate. A dead first crew member can leave it at
    // zero while the second one lands, so dispatch from the per-crew status
    // transition instead of treating the count as an array index.
    for (let i = 0; i < previous.crewStatus.length; i++) {
      if (previous.crewStatus[i] !== 'landed' && this.state.crewStatus[i] === 'landed') {
        this.callbacks.onCrewLand(i);
      }
    }
    if (previous.phase !== 'attached' && this.state.phase === 'attached')
      this.callbacks.onHookAttached?.(this.state);
    for (let i = 0; i < previous.crewStatus.length; i++) {
      if (previous.crewStatus[i] === 'crossing' && this.state.crewStatus[i] === 'dead')
        this.callbacks.onBoarderLost?.(i);
    }
    if (this.state.phase !== this.previousPhase) {
      if (this.state.phase === 'retreat') this.callbacks.onRetreat(this.state);
      if (this.state.phase === 'destroyed') this.callbacks.onDestroyed();
      this.previousPhase = this.state.phase;
    }
    // Publish the state before the terminal callback. Game may clear the
    // scene from `onEnded`; no callback after that point may dereference the
    // manager's now-null state.
    const current = this.state;
    this.callbacks.onState(current);
    if (current.ended && !this.endedNotified) {
      this.endedNotified = true;
      this.callbacks.onEnded?.();
    }
  }

  toSave(): BoardingEncounterSave | null {
    return this.state ? boardingEncounterToSave(this.state) : null;
  }
  restore(save: BoardingEncounterSave | null): void {
    this.state = save ? restoreBoardingEncounter(save) : null;
    this.previousPhase = this.state?.phase ?? null;
    this.endedNotified = this.state?.ended ?? false;
    this.landedBoardersAlive = this.state?.landedBoardersAlive ?? 0;
  }
}
