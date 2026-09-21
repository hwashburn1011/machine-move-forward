import {
  WRECK_ONE,
  QUIET_ARRAY,
  GLASS_ORCHARD,
  STORY_EXPEDITIONS,
  REQUIRED_JOURNALS_PROVEN_BY_UNIQUE,
  storyExpedition,
  type ExpeditionDefinition,
  type ExpeditionId,
  type StoryUniqueId,
  type StoryObjectiveId,
} from '@/data/story';
import { routeDefinition, type RouteId } from '@/data/routes';
import type { EndingSave } from '@/story/EndingDirector';

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
  phase: Exclude<StoryPhase, 'locked' | 'complete'>;
  arrivalDistance: number | null;
  journalsRead: string[];
  scriptedEncounter: 'not-due' | 'queued' | 'resolved';
  signalStartedAt?: number;
  objectivesCompleted?: StoryObjectiveId[];
}
export interface CampaignSave {
  format: 2;
  completed: ExpeditionId[];
  recoveredUniques: StoryUniqueId[];
  active: ActiveExpeditionSave | null;
  radioTraceEligible?: boolean;
  chapterComplete?: boolean;
  journalArchive?: string[];
  /** Composed by Game; StoryDirector deliberately never reads or owns it. */
  ending?: EndingSave;
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
  /** Opening scanner has reached its safe, one-shot contact boundary. */
  scannerContactReady?: boolean;
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
  | { type: 'scripted-vehicle-due'; vehicle: 'gunboat' | 'skiff'; routeId: RouteId }
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
  radioTraceOffer: boolean;
  radioTraceReady: boolean;
  chapterComplete: boolean;
  completedExpeditions: readonly ExpeditionId[];
  completedObjectives: readonly StoryObjectiveId[];
  journalArchive: readonly string[];
  nextExpedition: { id: ExpeditionId; title: string; summary: string } | null;
}
export type WreckStartRefusal =
  | 'not-offered'
  | 'encounter-active'
  | 'off-machine'
  | 'unstable'
  | 'invalid-distance'
  | 'already-active';
export interface WreckStartContext {
  currentDistance: number;
  playerOnMachine: boolean;
  stable: boolean;
  encounterActive: boolean;
}
export type WreckStartResult =
  { ok: true; effects: StoryEffect[] } | { ok: false; reason: WreckStartRefusal };
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
  private readonly archive = new Set<string>();
  private readonly uniques = new Set<StoryUniqueId>();
  private readonly completed = new Set<ExpeditionId>();
  private readonly objectives = new Set<StoryObjectiveId>();
  private signalStartedAt: number | null = null;
  private sanctuaryRequested = false;
  private radioTraceEligible = false;
  private chapterComplete = false;
  get chapter(): ExpeditionDefinition {
    return this.expedition;
  }
  get currentPhase(): StoryPhase {
    return this.phase;
  }
  // Raids remain available while the raid phase is active, and after a
  // genuinely completed Foundry chapter. A loose save bit must not unlock
  // raids while an expedition is malformed or still in progress.
  get permitsRadioRaids(): boolean {
    return this.phase === 'raids' || (this.phase === 'complete' && this.chapterComplete);
  }
  get completedExpeditions(): readonly ExpeditionId[] {
    return [...this.completed];
  }
  get journalArchive(): readonly string[] {
    return [...this.archive];
  }
  beginNextExpedition(context: WreckStartContext): WreckStartResult {
    if (
      this.phase !== 'complete' ||
      !this.completed.has('relay-foundry') ||
      this.completed.has('last-garden-meridian')
    )
      return { ok: false, reason: 'already-active' };
    if (context.encounterActive) return { ok: false, reason: 'encounter-active' };
    if (!context.playerOnMachine) return { ok: false, reason: 'off-machine' };
    if (!context.stable) return { ok: false, reason: 'unstable' };
    if (!Number.isFinite(context.currentDistance)) return { ok: false, reason: 'invalid-distance' };
    const next = this.completed.has('glass-orchard')
      ? storyExpedition('last-garden-meridian')!
      : this.completed.has('quiet-array')
        ? GLASS_ORCHARD
        : QUIET_ARRAY;
    this.expedition = next;
    this.routeId = null;
    this.arrivalDistance =
      next.id === 'quiet-array' ? context.currentDistance + next.approachDistanceM : null;
    this.phase =
      next.id === 'glass-orchard' || next.id === 'last-garden-meridian'
        ? 'route-selection'
        : 'approach';
    this.scripted = 'not-due';
    this.sanctuaryRequested = false;
    this.journals.clear();
    this.objectives.clear();
    return {
      ok: true,
      effects:
        next.id === 'glass-orchard' || next.id === 'last-garden-meridian'
          ? [
              {
                type: 'route-available',
                routes:
                  next.id === 'glass-orchard'
                    ? ['orchard-caretaker', 'orchard-cold-vault']
                    : ['meridian-quiet-line', 'meridian-cordon-gap'],
              },
            ]
          : [
              { type: 'begin-approach', arrivalDistance: this.arrivalDistance! },
              { type: 'request-sanctuary', active: true },
            ],
    };
  }
  recordRadioRaidVictory(count = 1): boolean {
    if (
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      this.phase !== 'raids' ||
      this.radioTraceEligible
    )
      return false;
    this.radioTraceEligible = true;
    return true;
  }
  beginWreckExpedition(context: WreckStartContext): WreckStartResult {
    if (!this.radioTraceEligible) return { ok: false, reason: 'not-offered' };
    if (this.phase !== 'raids') return { ok: false, reason: 'already-active' };
    if (context.encounterActive) return { ok: false, reason: 'encounter-active' };
    if (!context.playerOnMachine) return { ok: false, reason: 'off-machine' };
    if (!context.stable) return { ok: false, reason: 'unstable' };
    if (!Number.isFinite(context.currentDistance)) return { ok: false, reason: 'invalid-distance' };
    this.arrivalDistance = context.currentDistance + WRECK_ONE.approachDistanceM;
    this.expedition = WRECK_ONE;
    this.routeId = null;
    this.phase = 'approach';
    this.sanctuaryRequested = false;
    this.objectives.clear();
    return {
      ok: true,
      effects: [
        { type: 'begin-approach', arrivalDistance: this.arrivalDistance },
        { type: 'request-sanctuary', active: true },
      ],
    };
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
        if (!input.stable) return effects;
        if (input.scannerContactReady) {
          const reveal = this.consumeScannerContact({
            ready: true,
            stable: input.stable,
            playerOnMachine: input.playerOnMachine,
            encounterActive: input.encounterActive === true,
          });
          if (reveal.length > 0) return reveal;
        }
        // A supplied scanner state is authoritative for the modern opening;
        // do not silently fall back to the distance-driven legacy approach.
        if (input.scannerContactReady !== undefined) return effects;
        if (!input.firstRunComplete) return effects;
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
    const activeRoute = this.routeId ? routeDefinition(this.routeId) : undefined;
    if (
      this.phase === 'approach' &&
      activeRoute?.scriptedVehicle &&
      activeRoute.scriptedVehicleRemainingM !== null &&
      this.scripted === 'not-due' &&
      this.remaining(distance) !== null &&
      (this.remaining(distance) as number) <= activeRoute.scriptedVehicleRemainingM
    ) {
      this.scripted = 'queued';
      effects.push({
        type: 'scripted-vehicle-due',
        vehicle: activeRoute.scriptedVehicle,
        routeId: activeRoute.id,
      });
    }
    if (this.phase === 'approach' || this.phase === 'braking') {
      const remaining = this.remaining(distance);
      if (remaining === null) return effects;
      if (
        this.phase === 'approach' &&
        remaining > this.expedition.brakingDistanceM &&
        !(
          ((['relay-foundry', 'glass-orchard', 'last-garden-meridian'].includes(
            this.expedition.id,
          ) &&
            input.encounterActive === true) ||
            (activeRoute?.scriptedVehicle && this.scripted === 'queued')) &&
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
      if (this.expedition.id === 'relay-foundry') this.chapterComplete = true;
      effects.push({ type: 'expedition-complete', expeditionId: this.expedition.id });
      if (this.expedition.id === 'relay-foundry') effects.push({ type: 'chapter-complete' });
      effects.push({ type: 'next-signal' });
    }
    return effects;
  }

  /** Both the final shot and Skip converge here; the reveal can only end once. */
  finishSignalBattle(): boolean {
    if (this.phase !== 'crossfire') return false;
    this.phase = 'raids';
    return true;
  }

  /** Consume the scanner's one-shot contact only after presentation is ready. */
  consumeScannerContact(context: {
    ready: boolean;
    stable: boolean;
    playerOnMachine: boolean;
    encounterActive: boolean;
  }): StoryEffect[] {
    if (
      !context.ready ||
      !context.stable ||
      !context.playerOnMachine ||
      context.encounterActive ||
      this.phase !== 'signal' ||
      this.expedition.id !== 'wreck-one'
    )
      return [];
    this.phase = 'crossfire';
    return [{ type: 'begin-signal-battle' }];
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
      ((['relay-foundry', 'glass-orchard', 'last-garden-meridian'].includes(this.expedition.id) &&
        encounterActive) ||
        (this.routeId !== null &&
          routeDefinition(this.routeId)?.scriptedVehicle &&
          this.scripted === 'queued')) &&
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
  canReadJournal(id: string): boolean {
    if (this.phase !== 'docked' || !this.expedition.journals.some((journal) => journal.id === id))
      return false;
    if (this.expedition.id !== 'glass-orchard' && this.expedition.id !== 'last-garden-meridian')
      return true;
    if (id === 'orchard-memory-record' || id === 'meridian-common-record') return true;
    if (this.expedition.id === 'last-garden-meridian')
      return (
        (this.routeId === 'meridian-quiet-line' && id === 'meridian-civilian-record') ||
        (this.routeId === 'meridian-cordon-gap' && id === 'meridian-defense-record')
      );
    return (
      (this.routeId === 'orchard-caretaker' && id === 'orchard-caretaker-record') ||
      (this.routeId === 'orchard-cold-vault' && id === 'orchard-evacuation-record')
    );
  }
  readJournal(id: string): boolean {
    if (!this.canReadJournal(id) || this.journals.has(id)) return false;
    this.journals.add(id);
    this.archive.add(id);
    return true;
  }
  collectUnique(id: StoryUniqueId = 'course-gyro'): boolean {
    if (
      this.phase !== 'docked' ||
      !this.expedition.requiredUniques.includes(id) ||
      this.uniques.has(id)
    )
      return false;
    if (this.unmetRequirement(id) !== null) return false;
    this.uniques.add(id);
    return true;
  }
  unmetRequirement(id: StoryUniqueId): string | null {
    if (this.phase !== 'docked' || !this.expedition.requiredUniques.includes(id)) return null;
    if (this.expedition.id === 'glass-orchard') {
      if (id === 'human-seed-bank' && !this.objectives.has('orchard-port-isolator'))
        return 'Restore the port isolator first.';
      if (id === 'orchard-memory-core' && !this.objectives.has('orchard-starboard-isolator'))
        return 'Restore the starboard isolator first.';
      if (id === 'vector-governor') {
        const missingObjective = this.expedition.requiredObjectives?.find(
          (entry) => !this.objectives.has(entry),
        );
        if (missingObjective)
          return `Restore the ${missingObjective === 'orchard-port-isolator' ? 'port' : 'starboard'} isolator first.`;
        const routeJournal =
          this.routeId === 'orchard-caretaker'
            ? 'orchard-caretaker-record'
            : 'orchard-evacuation-record';
        if (!this.journals.has(routeJournal))
          return `Read ${this.expedition.journals.find((item) => item.id === routeJournal)?.title ?? routeJournal} first.`;
        if (!this.journals.has('orchard-memory-record')) return 'Read Common memory first.';
      }
    }
    if (this.expedition.id === 'last-garden-meridian' && id === 'meridian-solution') {
      const missingObjective = this.expedition.requiredObjectives?.find(
        (entry) => !this.objectives.has(entry),
      );
      if (missingObjective)
        return missingObjective === 'meridian-transmitter-online'
          ? 'Bring the Meridian transmitter online first.'
          : 'Install the Orchard archive core first.';
      const routeJournal =
        this.routeId === 'meridian-quiet-line'
          ? 'meridian-civilian-record'
          : 'meridian-defense-record';
      if (!this.journals.has(routeJournal))
        return `Read ${this.expedition.journals.find((item) => item.id === routeJournal)?.title ?? routeJournal} first.`;
      if (!this.journals.has('meridian-common-record'))
        return 'Read the Meridian common record first.';
    }
    const journal =
      id === 'course-actuator'
        ? this.expedition.requiredJournals?.find((entry) => !this.journals.has(entry))
        : undefined;
    return journal
      ? `Read ${this.expedition.journals.find((item) => item.id === journal)?.title ?? journal} first.`
      : null;
  }
  completeObjective(id: StoryObjectiveId): boolean {
    if (
      this.phase !== 'docked' ||
      !this.expedition.requiredObjectives?.includes(id) ||
      this.objectives.has(id) ||
      (this.expedition.id === 'last-garden-meridian' && !this.uniques.has('orchard-memory-core'))
    )
      return false;
    this.objectives.add(id);
    return true;
  }
  private routeRecordsComplete(): boolean {
    if (this.expedition.id === 'last-garden-meridian') {
      const selected =
        this.routeId === 'meridian-quiet-line'
          ? 'meridian-civilian-record'
          : this.routeId === 'meridian-cordon-gap'
            ? 'meridian-defense-record'
            : null;
      return (
        selected !== null &&
        this.journals.has(selected) &&
        this.journals.has('meridian-common-record')
      );
    }
    if (this.expedition.id !== 'glass-orchard') return true;
    const selected =
      this.routeId === 'orchard-caretaker'
        ? 'orchard-caretaker-record'
        : this.routeId === 'orchard-cold-vault'
          ? 'orchard-evacuation-record'
          : null;
    return (
      selected !== null && this.journals.has(selected) && this.journals.has('orchard-memory-record')
    );
  }
  resolveScriptedEncounter(): StoryEffect[] {
    if (this.scripted !== 'queued') return [];
    this.scripted = 'resolved';
    return [];
  }
  canDepart(input: { playerOnMachine: boolean } | boolean): boolean {
    const on = typeof input === 'boolean' ? input : input.playerOnMachine;
    return !(
      this.phase !== 'docked' ||
      !on ||
      this.scripted === 'queued' ||
      !(this.expedition.requiredObjectives?.every((id) => this.objectives.has(id)) ?? true) ||
      !this.routeRecordsComplete() ||
      !this.expedition.requiredUniques.every((id) => this.uniques.has(id))
    );
  }
  requestDepart(input: { playerOnMachine: boolean } | boolean): StoryEffect[] {
    if (!this.canDepart(input)) return [];
    this.phase = 'departing';
    return [
      { type: 'retract-gangway' },
      { type: 'request-sanctuary', active: false },
      { type: 'request-speed-limit', mps: null },
    ];
  }
  selectRoute(id: RouteId, context: RouteSelectionContext): RouteSelectionResult {
    if (
      this.phase !== 'route-selection' ||
      !['wreck-one', 'glass-orchard', 'last-garden-meridian'].includes(this.expedition.id)
    )
      return { ok: false, reason: 'already-committed' };
    if (this.expedition.id === 'wreck-one' && !this.uniques.has('course-gyro'))
      return { ok: false, reason: 'missing-gyro' };
    if (!context.poweredHelm) return { ok: false, reason: 'helm-unpowered' };
    if (!context.playerOnMachine) return { ok: false, reason: 'off-machine' };
    if (!context.stable) return { ok: false, reason: 'unstable' };
    if (context.encounterActive) return { ok: false, reason: 'encounter-active' };
    const route = routeDefinition(id);
    const expectedDestination =
      this.expedition.id === 'wreck-one'
        ? 'relay-foundry'
        : this.expedition.id === 'glass-orchard'
          ? 'glass-orchard'
          : 'last-garden-meridian';
    if (!route || route.destinationId !== expectedDestination)
      return { ok: false, reason: 'invalid-route' };
    const origin = context.currentDistance;
    if (!Number.isFinite(origin)) return { ok: false, reason: 'invalid-route' };
    this.expedition = storyExpedition(route.destinationId)!;
    this.routeId = id;
    this.arrivalDistance = origin + route.distanceM;
    this.phase = 'approach';
    this.scripted = 'not-due';
    this.sanctuaryRequested = false;
    this.journals.clear();
    this.objectives.clear();
    if (id === 'orchard-caretaker') this.objectives.add('orchard-port-isolator');
    if (id === 'orchard-cold-vault') this.objectives.add('orchard-starboard-isolator');
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
      radioTraceOffer: this.radioTraceEligible && this.phase === 'raids',
      radioTraceReady: this.radioTraceEligible && this.phase === 'raids',
      chapterComplete: this.chapterComplete,
      completedExpeditions: [...this.completed],
      completedObjectives: [...this.objectives],
      journalArchive: [...this.archive],
      nextExpedition:
        this.phase === 'complete' &&
        this.completed.has('relay-foundry') &&
        !this.completed.has('quiet-array')
          ? { id: 'quiet-array', title: QUIET_ARRAY.title, summary: QUIET_ARRAY.objective }
          : this.phase === 'complete' &&
              this.completed.has('quiet-array') &&
              !this.completed.has('glass-orchard')
            ? { id: 'glass-orchard', title: GLASS_ORCHARD.title, summary: GLASS_ORCHARD.objective }
            : this.phase === 'complete' &&
                this.completed.has('glass-orchard') &&
                !this.completed.has('last-garden-meridian')
              ? (() => {
                  const meridian = storyExpedition('last-garden-meridian')!;
                  return { id: meridian.id, title: meridian.title, summary: meridian.objective };
                })()
              : null,
    };
  }
  private objective(): string {
    if (this.phase === 'locked') return 'Reel in a salvage chest to find the radio.';
    if (this.phase === 'crossfire') return 'Signal locked — crossfire off the starboard bow.';
    if (this.phase === 'raids')
      return this.radioTraceEligible
        ? 'New trace available at the radio. Keep moving and watch for boarding ships.'
        : 'Keep moving. Watch for boarding ships; cut their grapples or defeat the mechs.';
    if (this.phase === 'signal')
      return this.expedition.id === 'wreck-one'
        ? 'Listen for the source of the signal.'
        : 'Choose a route to the Relay Foundry.';
    if (this.phase === 'route-selection')
      return this.expedition.id === 'glass-orchard'
        ? 'Choose an approach to the Glass Orchard.'
        : this.expedition.id === 'last-garden-meridian'
          ? 'Choose a route to the Last Garden at Meridian.'
          : 'Choose a route to the Relay Foundry.';
    if (this.phase === 'approach') return `Follow the signal toward the ${this.expedition.title}.`;
    if (this.phase === 'braking')
      return `Bring the machine alongside the ${this.expedition.title}.`;
    if (this.phase === 'docked')
      return this.expedition.requiredUniques.every((id) => this.uniques.has(id)) &&
        (this.expedition.requiredObjectives?.every((id) => this.objectives.has(id)) ?? true) &&
        this.routeRecordsComplete()
        ? 'Return to the machine and depart.'
        : this.expedition.objective;
    if (this.phase === 'departing') return 'Clear the expedition and resume the route.';
    if (this.phase === 'complete')
      return this.completed.has('last-garden-meridian')
        ? 'The Meridian bearing is secure. Return to the helm when you are ready to commit.'
        : this.completed.has('quiet-array')
          ? this.completed.has('glass-orchard')
            ? 'The Orchard is preserved. Keep the Nomad supplied while the Meridian bearing waits.'
            : 'Course control online. Plot nearby discoveries at the helm, preserve records, and keep the Nomad supplied.'
          : 'Relay Foundry complete. Trace the next transmission at the radio when ready.';
    return 'A faint signal waits somewhere beyond the route.';
  }

  toSave(): StorySave {
    const safeActive =
      ['signal', 'crossfire', 'raids'].includes(this.phase) ||
      (this.phase === 'route-selection' &&
        ['glass-orchard', 'last-garden-meridian'].includes(this.expedition.id)) ||
      (['approach', 'braking', 'docked', 'departing'].includes(this.phase) &&
        this.arrivalDistance !== null);
    return {
      format: 2,
      completed: [...this.completed],
      recoveredUniques: [...this.uniques],
      journalArchive: [...this.archive],
      active: safeActive
        ? {
            expeditionId: this.expedition.id,
            routeId: this.routeId,
            phase: this.phase as ActiveExpeditionSave['phase'],
            arrivalDistance: this.arrivalDistance,
            journalsRead: [...this.journals],
            scriptedEncounter: this.scripted,
            ...(this.objectives.size > 0 ? { objectivesCompleted: [...this.objectives] } : {}),
            ...(this.signalStartedAt !== null ? { signalStartedAt: this.signalStartedAt } : {}),
          }
        : null,
      ...(this.radioTraceEligible ? { radioTraceEligible: true } : {}),
      ...(this.chapterComplete ? { chapterComplete: true } : {}),
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
    this.archive.clear();
    this.uniques.clear();
    this.completed.clear();
    this.objectives.clear();
    this.sanctuaryRequested = false;
    this.signalStartedAt = null;
    this.radioTraceEligible = false;
    this.chapterComplete = false;
    if (!save || typeof save !== 'object') return;
    const raw = save as Record<string, unknown>;
    if (raw.format === 2) {
      this.radioTraceEligible = raw.radioTraceEligible === true;
      // Recompute completion from the durable expedition marker below. Older
      // or hand-edited saves may contain the optional bit without the route.
      this.chapterComplete = false;
      for (const item of Array.isArray(raw.completed) ? raw.completed : [])
        if (storyExpedition(String(item))) this.completed.add(item as ExpeditionId);
      const active = raw.active as Record<string, unknown> | null;
      // A valid in-progress Meridian route could only have been accepted after
      // Orchard completion. Preserve that durable prerequisite for early saves
      // that predate the completed-chain normalization.
      if (active?.expeditionId === 'last-garden-meridian') this.completed.add('glass-orchard');
      const knownUniques = new Set(STORY_EXPEDITIONS.flatMap((entry) => entry.requiredUniques));
      for (const item of Array.isArray(raw.recoveredUniques) ? raw.recoveredUniques : [])
        if (knownUniques.has(item as StoryUniqueId)) this.uniques.add(item as StoryUniqueId);
      if (this.completed.has('last-garden-meridian')) {
        this.completed.add('glass-orchard');
        this.uniques.add('meridian-solution');
      }
      if (this.completed.has('glass-orchard')) {
        this.completed.add('quiet-array');
        this.uniques.add('human-seed-bank');
        this.uniques.add('vector-governor');
        this.uniques.add('orchard-memory-core');
      }
      if (this.completed.has('quiet-array')) {
        this.completed.add('relay-foundry');
        this.uniques.add('course-actuator');
        this.uniques.add('annika-archive-shard');
      }
      if (this.completed.has('relay-foundry')) {
        this.completed.add('wreck-one');
        this.uniques.add('course-gyro');
        this.uniques.add('salvage-controller');
        this.uniques.add('tracking-servo');
      }
      if (this.completed.has('wreck-one')) this.uniques.add('course-gyro');
      const knownJournals = new Set(
        STORY_EXPEDITIONS.flatMap((entry) => entry.journals.map((j) => j.id)),
      );
      for (const item of Array.isArray(raw.journalArchive) ? raw.journalArchive : [])
        if (typeof item === 'string' && knownJournals.has(item)) this.archive.add(item);
      for (const unique of this.uniques)
        for (const journal of REQUIRED_JOURNALS_PROVEN_BY_UNIQUE[unique] ?? [])
          if (knownJournals.has(journal)) this.archive.add(journal);
      if (this.completed.has('relay-foundry')) this.chapterComplete = true;
      if (
        this.completed.has('relay-foundry') &&
        (!active ||
          !['quiet-array', 'glass-orchard', 'last-garden-meridian'].includes(
            String(active.expeditionId),
          ))
      ) {
        this.completed.add('wreck-one');
        this.uniques.add('course-gyro');
        this.chapterComplete = true;
        this.phase = 'complete';
        return;
      }
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
          'route-selection',
        ];
        const phaseValid =
          validPhases.includes(phase) && expedition.id === 'wreck-one'
            ? ['signal', 'crossfire', 'raids'].includes(phase)
              ? arrival === null
              : arrival !== null
            : ['glass-orchard', 'last-garden-meridian'].includes(expedition.id) &&
                phase === 'route-selection'
              ? arrival === null
              : expedition.id !== 'wreck-one' &&
                ['approach', 'braking', 'docked', 'departing'].includes(phase) &&
                arrival !== null;
        const routeValid =
          expedition.id === 'wreck-one' || expedition.id === 'quiet-array'
            ? active.routeId === null || active.routeId === undefined
            : phase === 'route-selection' &&
                ['glass-orchard', 'last-garden-meridian'].includes(expedition.id)
              ? active.routeId === null || active.routeId === undefined
              : route?.destinationId === expedition.id;
        if (this.completed.has(expedition.id)) {
          this.expedition = expedition;
          this.phase = expedition.id === 'wreck-one' ? 'route-selection' : 'complete';
          return;
        }
        if (
          !phaseValid ||
          !routeValid ||
          ((expedition.id === 'relay-foundry' ||
            (['glass-orchard', 'last-garden-meridian'].includes(expedition.id) &&
              phase !== 'route-selection')) &&
            !route)
        ) {
          if (['glass-orchard', 'last-garden-meridian'].includes(expedition.id))
            this.expedition = expedition;
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
        if (route?.id === 'orchard-caretaker') this.objectives.add('orchard-port-isolator');
        if (route?.id === 'orchard-cold-vault') this.objectives.add('orchard-starboard-isolator');
        for (const item of Array.isArray(active.objectivesCompleted)
          ? active.objectivesCompleted
          : [])
          if (expedition.requiredObjectives?.includes(item as StoryObjectiveId))
            this.objectives.add(item as StoryObjectiveId);
        for (const item of Array.isArray(active.journalsRead) ? active.journalsRead : [])
          if (
            expedition.journals.some((journal) => journal.id === item) &&
            (expedition.id === 'glass-orchard'
              ? item === 'orchard-memory-record' ||
                (route?.id === 'orchard-caretaker' && item === 'orchard-caretaker-record') ||
                (route?.id === 'orchard-cold-vault' && item === 'orchard-evacuation-record')
              : expedition.id === 'last-garden-meridian'
                ? item === 'meridian-common-record' ||
                  (route?.id === 'meridian-quiet-line' && item === 'meridian-civilian-record') ||
                  (route?.id === 'meridian-cordon-gap' && item === 'meridian-defense-record')
                : true)
          )
            this.journals.add(item as string);
        for (const journal of this.journals) this.archive.add(journal);
      } else if (this.completed.has('relay-foundry')) {
        this.phase = 'complete';
        this.chapterComplete = true;
      } else if (this.completed.has('wreck-one')) this.phase = 'route-selection';
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
    for (const journal of this.journals) this.archive.add(journal);
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
