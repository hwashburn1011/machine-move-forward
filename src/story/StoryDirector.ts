import {
  RELAY_FOUNDRY,
  WRECK_ONE,
  storyExpedition,
  type ExpeditionDefinition,
  type ExpeditionId,
  type StoryUniqueId,
} from '@/data/story';
import { routeDefinition, type RouteId } from '@/data/routes';

export type StoryPhase =
  | 'locked'
  | 'signal'
  | 'crossfire'
  | 'raids'
  | 'route-selection'
  | 'approach'
  | 'braking'
  | 'docked'
  | 'departing'
  | 'complete';
export interface LegacyWreckOneStorySave {
  chapterId: 'wreck-one';
  phase: StoryPhase;
  arrivalDistance: number | null;
  journalsRead: string[];
  uniqueCollected: boolean;
  nextSignal: boolean;
}
export interface ActiveExpeditionSave {
  expeditionId: ExpeditionId;
  routeId: RouteId | null;
  phase: Exclude<StoryPhase, 'locked' | 'route-selection' | 'complete'>;
  arrivalDistance: number | null;
  journalsRead: string[];
  scriptedEncounter: 'not-due' | 'queued' | 'resolved';
  signalStartedAt?: number;
}
export interface CampaignSave {
  format: 2;
  completed: ExpeditionId[];
  recoveredUniques: StoryUniqueId[];
  active: ActiveExpeditionSave | null;
}
/** Compile-time bridge for legacy callers; campaign writes never include these fields. */
export type StorySave = CampaignSave;
export interface StoryInput {
  distance: number;
  radioFound: boolean;
  firstRunComplete: boolean;
  stable: boolean;
  speed: number;
  playerOnMachine: boolean;
  maxSpeed?: number;
  encounterActive?: boolean;
  /** New-game radio path. Existing expeditions continue on their committed route. */
  signalBattleMode?: boolean;
}
export type StoryEffect =
  | { type: 'begin-signal' }
  | { type: 'begin-signal-battle' }
  | { type: 'begin-approach'; arrivalDistance: number }
  | { type: 'request-sanctuary'; active: boolean }
  | { type: 'request-speed-limit'; mps: number | null }
  | { type: 'deploy-gangway' }
  | { type: 'retract-gangway' }
  | { type: 'chapter-complete' }
  | { type: 'next-signal' }
  | { type: 'route-available'; routes: readonly RouteId[] }
  | { type: 'route-committed'; routeId: RouteId; arrivalDistance: number }
  | { type: 'scripted-vehicle-due'; vehicle: 'gunboat'; routeId: RouteId }
  | { type: 'hold-destination'; remainingM: number }
  | { type: 'expedition-complete'; expeditionId: ExpeditionId };
export interface StorySnapshot {
  phase: StoryPhase;
  signalStrength: number;
  remainingM: number | null;
  objective: string;
  expeditionId: ExpeditionId;
  routeId: RouteId | null;
  recoveredUniques: readonly StoryUniqueId[];
}
export interface RouteSelectionContext {
  poweredHelm: boolean;
  playerOnMachine: boolean;
  stable: boolean;
  encounterActive: boolean;
  currentDistance: number;
}
export type RouteRefusal =
  | 'missing-gyro'
  | 'helm-unpowered'
  | 'off-machine'
  | 'unstable'
  | 'encounter-active'
  | 'already-committed'
  | 'invalid-route';
export type RouteSelectionResult =
  { ok: true; effects: StoryEffect[] } | { ok: false; reason: RouteRefusal };

const STOP_SPEED = 0.15;
const TOL = 0.75;
const MAX_SPEED = 7.5;
const DEPARTURE_CLEAR = 12;
const HOLD = 220;
const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export class StoryDirector {
  private phase: StoryPhase = 'locked';
  private arrivalDistance: number | null = null;
  private expedition: ExpeditionDefinition = WRECK_ONE;
  private routeId: RouteId | null = null;
  private scripted: 'not-due' | 'queued' | 'resolved' = 'not-due';
  private readonly journals = new Set<string>();
  private readonly uniques = new Set<StoryUniqueId>();
  private readonly completed = new Set<ExpeditionId>();
  private signalStartedAt: number | null = null;
  private sanctuaryRequested = false;
  get chapter(): ExpeditionDefinition {
    return this.expedition;
  }
  get currentPhase(): StoryPhase {
    return this.phase;
  }

  update(input: StoryInput): StoryEffect[] {
    const effects: StoryEffect[] = [];
    const distance = finite(input.distance, 0);
    const speed = Math.max(0, finite(input.speed, 0));
    if (this.phase === 'locked') {
      if (input.radioFound) {
        this.phase = 'signal';
        this.signalStartedAt = distance;
        effects.push({ type: 'begin-signal' });
      }
      return effects;
    }
    if (this.phase === 'signal') {
      // Old saves did not store the signal origin. Establish it once, not on
      // every snapshot (which would leave those saves permanently at 8%).
      this.signalStartedAt ??= distance;
      if (this.expedition.id === 'wreck-one') {
        if (!input.firstRunComplete || !input.stable) return effects;
        if (input.signalBattleMode) {
          if (
            this.snapshot(distance).signalStrength < 1 ||
            input.encounterActive ||
            !input.playerOnMachine
          )
            return effects;
          this.phase = 'crossfire';
          effects.push({ type: 'begin-signal-battle' });
          return effects;
        }
        this.arrivalDistance = distance + WRECK_ONE.approachDistanceM;
        this.phase = 'approach';
        effects.push(
          { type: 'begin-approach', arrivalDistance: this.arrivalDistance },
          { type: 'request-sanctuary', active: true },
        );
        return effects;
      }
      this.phase = 'route-selection';
      effects.push({ type: 'route-available', routes: ['foundry-direct', 'foundry-detour'] });
      return effects;
    }
    if (
      this.phase === 'approach' &&
      this.expedition.id === 'relay-foundry' &&
      this.routeId === 'foundry-direct' &&
      this.scripted === 'not-due' &&
      this.remaining(distance) !== null &&
      (this.remaining(distance) as number) <= 500
    ) {
      this.scripted = 'queued';
      effects.push({ type: 'scripted-vehicle-due', vehicle: 'gunboat', routeId: this.routeId });
    }
    if (this.phase === 'approach' || this.phase === 'braking') {
      const remaining = this.remaining(distance);
      if (remaining === null) return effects;
      if (
        this.phase === 'approach' &&
        remaining > this.expedition.brakingDistanceM &&
        !(
          this.expedition.id === 'relay-foundry' &&
          (input.encounterActive === true ||
            (this.routeId === 'foundry-direct' && this.scripted === 'queued')) &&
          remaining <= HOLD
        )
      )
        return effects;
      if (this.phase === 'approach') this.phase = 'braking';
      this.advanceBraking(
        distance,
        speed,
        finite(input.maxSpeed, MAX_SPEED),
        input.encounterActive === true,
        effects,
      );
      return effects;
    }
    if (
      this.phase === 'departing' &&
      this.arrivalDistance !== null &&
      distance >= this.arrivalDistance + DEPARTURE_CLEAR &&
      speed > STOP_SPEED
    ) {
      this.completed.add(this.expedition.id);
      this.phase = this.expedition.id === 'wreck-one' ? 'route-selection' : 'complete';
      effects.push(
        { type: 'expedition-complete', expeditionId: this.expedition.id },
        { type: 'chapter-complete' },
        { type: 'next-signal' },
      );
    }
    return effects;
  }

  /** Both the final shot and Skip converge here; the reveal can only end once. */
  finishSignalBattle(): boolean {
    if (this.phase !== 'crossfire') return false;
    this.phase = 'raids';
    return true;
  }

  private advanceBraking(
    distance: number,
    speed: number,
    maxSpeed: number,
    encounterActive: boolean,
    effects: StoryEffect[],
  ): void {
    const remaining = this.remaining(distance);
    if (remaining === null) return;
    if (
      this.expedition.id === 'relay-foundry' &&
      (encounterActive || (this.routeId === 'foundry-direct' && this.scripted === 'queued')) &&
      remaining <= HOLD
    ) {
      this.arrivalDistance = distance + HOLD;
      effects.push(
        { type: 'hold-destination', remainingM: HOLD },
        { type: 'request-speed-limit', mps: 2 },
      );
      return;
    }
    if (remaining < -TOL) {
      effects.push({ type: 'request-speed-limit', mps: 0 });
      return;
    }
    if (
      remaining <= this.expedition.sanctuaryDistanceM &&
      !encounterActive &&
      !this.sanctuaryRequested
    ) {
      this.sanctuaryRequested = true;
      effects.push({ type: 'request-sanctuary', active: true });
    }
    if (this.scripted === 'queued') return;
    if (speed <= STOP_SPEED && Math.abs(remaining) <= TOL) {
      this.phase = 'docked';
      effects.push({ type: 'request-speed-limit', mps: 0 }, { type: 'deploy-gangway' });
      return;
    }
    effects.push({
      type: 'request-speed-limit',
      mps: remaining <= TOL ? 0 : Math.max(0.12, Math.min(Math.max(0, maxSpeed), remaining * 0.16)),
    });
  }
  private remaining(distance: number): number | null {
    return this.arrivalDistance === null ? null : this.arrivalDistance - distance;
  }
  readJournal(id: string): boolean {
    if (
      this.phase !== 'docked' ||
      !this.expedition.journals.some((journal) => journal.id === id) ||
      this.journals.has(id)
    )
      return false;
    this.journals.add(id);
    return true;
  }
  collectUnique(id: StoryUniqueId = 'course-gyro'): boolean {
    if (
      this.phase !== 'docked' ||
      !this.expedition.requiredUniques.includes(id) ||
      this.uniques.has(id)
    )
      return false;
    this.uniques.add(id);
    return true;
  }
  resolveScriptedEncounter(): StoryEffect[] {
    if (this.scripted !== 'queued') return [];
    this.scripted = 'resolved';
    return [];
  }
  requestDepart(input: { playerOnMachine: boolean } | boolean): StoryEffect[] {
    const on = typeof input === 'boolean' ? input : input.playerOnMachine;
    if (
      this.phase !== 'docked' ||
      !on ||
      this.scripted === 'queued' ||
      !this.expedition.requiredUniques.every((id) => this.uniques.has(id))
    )
      return [];
    this.phase = 'departing';
    return [
      { type: 'retract-gangway' },
      { type: 'request-sanctuary', active: false },
      { type: 'request-speed-limit', mps: null },
    ];
  }
  selectRoute(id: RouteId, context: RouteSelectionContext): RouteSelectionResult {
    if (this.phase !== 'route-selection' || this.expedition.id !== 'wreck-one')
      return { ok: false, reason: 'already-committed' };
    if (!this.uniques.has('course-gyro')) return { ok: false, reason: 'missing-gyro' };
    if (!context.poweredHelm) return { ok: false, reason: 'helm-unpowered' };
    if (!context.playerOnMachine) return { ok: false, reason: 'off-machine' };
    if (!context.stable) return { ok: false, reason: 'unstable' };
    if (context.encounterActive) return { ok: false, reason: 'encounter-active' };
    const route = routeDefinition(id);
    if (!route) return { ok: false, reason: 'invalid-route' };
    const origin = context.currentDistance;
    if (!Number.isFinite(origin)) return { ok: false, reason: 'invalid-route' };
    this.expedition = RELAY_FOUNDRY;
    this.routeId = id;
    this.arrivalDistance = origin + route.distanceM;
    this.phase = 'approach';
    this.scripted = 'not-due';
    this.sanctuaryRequested = false;
    this.journals.clear();
    return {
      ok: true,
      effects: [
        { type: 'route-committed', routeId: id, arrivalDistance: this.arrivalDistance },
        { type: 'begin-approach', arrivalDistance: this.arrivalDistance },
      ],
    };
  }
  snapshot(distance: number): StorySnapshot {
    const remaining = ['locked', 'signal', 'route-selection', 'complete'].includes(this.phase)
      ? null
      : this.remaining(finite(distance, 0));
    let signalStrength = 0;
    if (this.phase === 'signal')
      signalStrength = Math.max(
        0.08,
        Math.min(
          1,
          (finite(distance, 0) - (this.signalStartedAt ?? distance)) /
            this.expedition.signalStartDistanceM,
        ),
      );
    else if (
      ['crossfire', 'raids', 'approach', 'braking', 'docked', 'departing'].includes(this.phase)
    )
      signalStrength = 1;
    return {
      phase: this.phase,
      signalStrength,
      remainingM: remaining,
      objective: this.objective(),
      expeditionId: this.expedition.id,
      routeId: this.routeId,
      recoveredUniques: [...this.uniques],
    };
  }
  private objective(): string {
    if (this.phase === 'locked') return 'Reel in a salvage chest to find the radio.';
    if (this.phase === 'crossfire') return 'Signal locked — crossfire off the starboard bow.';
    if (this.phase === 'raids')
      return 'Keep moving. Watch for boarding ships; cut their grapples or defeat the mechs.';
    if (this.phase === 'signal')
      return this.expedition.id === 'wreck-one'
        ? 'Listen for the source of the signal.'
        : 'Choose a route to the Relay Foundry.';
    if (this.phase === 'route-selection') return 'Choose a route to the Relay Foundry.';
    if (this.phase === 'approach') return `Follow the signal toward the ${this.expedition.title}.`;
    if (this.phase === 'braking')
      return `Bring the machine alongside the ${this.expedition.title}.`;
    if (this.phase === 'docked')
      return this.expedition.requiredUniques.every((id) => this.uniques.has(id))
        ? 'Return to the machine and depart.'
        : this.expedition.objective;
    if (this.phase === 'departing') return 'Clear the expedition and resume the route.';
    return 'A faint signal waits somewhere beyond the route.';
  }

  toSave(): StorySave {
    const safeActive =
      ['signal', 'crossfire', 'raids'].includes(this.phase) ||
      (['approach', 'braking', 'docked', 'departing'].includes(this.phase) &&
        this.arrivalDistance !== null);
    return {
      format: 2,
      completed: [...this.completed],
      recoveredUniques: [...this.uniques],
      active: safeActive
        ? {
            expeditionId: this.expedition.id,
            routeId: this.routeId,
            phase: this.phase as ActiveExpeditionSave['phase'],
            arrivalDistance: this.arrivalDistance,
            journalsRead: [...this.journals],
            scriptedEncounter: this.scripted,
            ...(this.signalStartedAt !== null ? { signalStartedAt: this.signalStartedAt } : {}),
          }
        : null,
    };
  }

  /** Compatibility projection for pre-campaign composition callers. */
  legacyProjection(): LegacyWreckOneStorySave {
    return {
      chapterId: 'wreck-one',
      phase: this.phase,
      arrivalDistance: this.arrivalDistance,
      journalsRead: [...this.journals],
      uniqueCollected: this.uniques.has('course-gyro'),
      nextSignal: this.phase === 'complete' || this.completed.has('wreck-one'),
    };
  }
  restore(
    save?:
      | Partial<StorySave>
      | Partial<LegacyWreckOneStorySave>
      | { chapter?: string; state?: string; journalsRead?: unknown[] }
      | null,
  ): void {
    this.phase = 'locked';
    this.arrivalDistance = null;
    this.expedition = WRECK_ONE;
    this.routeId = null;
    this.scripted = 'not-due';
    this.journals.clear();
    this.uniques.clear();
    this.completed.clear();
    this.sanctuaryRequested = false;
    this.signalStartedAt = null;
    if (!save || typeof save !== 'object') return;
    const raw = save as Record<string, unknown>;
    if (raw.format === 2) {
      for (const item of Array.isArray(raw.completed) ? raw.completed : [])
        if (storyExpedition(String(item))) this.completed.add(item as ExpeditionId);
      for (const item of Array.isArray(raw.recoveredUniques) ? raw.recoveredUniques : [])
        if (['course-gyro', 'salvage-controller', 'tracking-servo'].includes(String(item)))
          this.uniques.add(item as StoryUniqueId);
      if (this.completed.has('wreck-one')) this.uniques.add('course-gyro');
      if (this.completed.has('relay-foundry')) {
        this.completed.add('wreck-one');
        this.uniques.add('course-gyro');
      }
      const active = raw.active as Record<string, unknown> | null;
      if (active && storyExpedition(String(active.expeditionId))) {
        const expedition = storyExpedition(String(active.expeditionId))!;
        const route =
          typeof active.routeId === 'string' ? routeDefinition(active.routeId) : undefined;
        const phase = String(active.phase);
        const arrival =
          typeof active.arrivalDistance === 'number' &&
          Number.isFinite(active.arrivalDistance) &&
          active.arrivalDistance >= 0
            ? active.arrivalDistance
            : null;
        const validPhases = [
          'signal',
          'crossfire',
          'raids',
          'approach',
          'braking',
          'docked',
          'departing',
        ];
        const phaseValid =
          validPhases.includes(phase) && expedition.id === 'wreck-one'
            ? ['signal', 'crossfire', 'raids'].includes(phase)
              ? arrival === null
              : arrival !== null
            : expedition.id === 'relay-foundry' &&
              ['approach', 'braking', 'docked', 'departing'].includes(phase) &&
              arrival !== null;
        const routeValid =
          expedition.id === 'wreck-one'
            ? active.routeId === null || active.routeId === undefined
            : route?.destinationId === 'relay-foundry';
        if (this.completed.has(expedition.id)) {
          this.phase = expedition.id === 'relay-foundry' ? 'complete' : 'route-selection';
          return;
        }
        if (!phaseValid || !routeValid || (expedition.id === 'relay-foundry' && !route)) {
          this.phase = 'route-selection';
          return;
        }
        this.expedition = expedition;
        this.routeId = route?.id ?? null;
        this.phase = phase as StoryPhase;
        this.signalStartedAt =
          typeof active.signalStartedAt === 'number' && Number.isFinite(active.signalStartedAt)
            ? Math.max(0, active.signalStartedAt)
            : null;
        this.arrivalDistance = arrival;
        this.scripted =
          active.scriptedEncounter === 'queued' || active.scriptedEncounter === 'resolved'
            ? active.scriptedEncounter
            : 'not-due';
        for (const item of Array.isArray(active.journalsRead) ? active.journalsRead : [])
          if (expedition.journals.some((journal) => journal.id === item))
            this.journals.add(item as string);
      } else if (this.completed.has('relay-foundry')) this.phase = 'complete';
      else if (this.completed.has('wreck-one')) this.phase = 'route-selection';
      return;
    }
    if (raw.chapterId !== undefined && raw.chapterId !== 'wreck-one') return;
    const candidate =
      typeof raw.phase === 'string'
        ? raw.phase
        : raw.state === 'approaching'
          ? 'approach'
          : raw.state;
    const phases: StoryPhase[] = [
      'locked',
      'signal',
      'approach',
      'braking',
      'docked',
      'departing',
      'complete',
    ];
    this.phase = phases.includes(candidate as StoryPhase) ? (candidate as StoryPhase) : 'locked';
    this.arrivalDistance =
      typeof raw.arrivalDistance === 'number' && Number.isFinite(raw.arrivalDistance)
        ? raw.arrivalDistance
        : null;
    for (const item of Array.isArray(raw.journalsRead) ? raw.journalsRead : [])
      if (WRECK_ONE.journals.some((journal) => journal.id === item))
        this.journals.add(item as string);
    if (raw.uniqueCollected === true) this.uniques.add('course-gyro');
    if (this.phase === 'complete') {
      this.completed.add('wreck-one');
      this.uniques.add('course-gyro');
      this.phase = 'route-selection';
    }
    if (
      ['approach', 'braking', 'docked', 'departing'].includes(this.phase) &&
      this.arrivalDistance === null
    )
      this.phase = 'signal';
  }
}
export { storyExpedition };
