import { hashSeed, Rng } from '@/core/math/Random';
import { MAX_ACTIVE_ENEMIES } from '@/data/enemies';

/**
 * Encounter pacing (handoff sections 3.2, 28, and milestone 10).
 *
 * `EnemySpawner` was a metronome: one scavenger every 250m, forever, with no
 * shape to it. Its own header said as much and refused to fake an escalation
 * curve. This is that curve, and it is the thing the handoff's hard rule is
 * about:
 *
 *   > Do not chain attacks so aggressively that players cannot build or
 *   > recover.
 *
 * So quiet is not what is left over between waves — it is scheduled first, and
 * the fighting fits around it. `CALM_MIN` and `RECOVERY_M` are floors the
 * director cannot spend, whatever the budget says.
 *
 * PURE. Plain numbers in, a decision out; no Three.js, no Rapier, no clock of
 * its own. `EnemySpawner` keeps the job of deciding WHERE a body lands; this
 * decides WHETHER, WHEN, and HOW MANY.
 *
 * Everything is measured in METRES TRAVELLED, not seconds, for the same reason
 * everything else in this project is: it is already the clock the world, the
 * save file and the debug skip derive from, so pacing off it needs no state of
 * its own — and standing still stays genuinely safe.
 */

export type ThreatPhase = 'calm' | 'buildup' | 'contact' | 'engagement' | 'recovery';

/**
 * Guaranteed quiet after a wave is finished, before the next calm even starts
 * counting.
 *
 * This is the loot-and-repair window. Thirty-odd seconds at cruise: long
 * enough to walk the deck, pick a fight's worth of scrap out of the inventory
 * and put a wall back, and deliberately not long enough to be boring.
 */
export const RECOVERY_M = 250;

/**
 * The shortest calm the director will ever schedule, and how much longer it
 * may roll.
 *
 * 400m is about 53 seconds at cruise, and with `RECOVERY_M` in front of it the
 * floor between one wave ending and the next being telegraphed is 650m —
 * nearly a minute and a half. That is the hard rule above, expressed as a
 * number rather than as an intention.
 */
export const CALM_MIN = 400;
export const CALM_SPREAD = 700;

/**
 * How far ahead of the wave the player is warned (handoff section 29).
 *
 * A hundred and forty metres is about nineteen seconds at cruise. Long enough
 * to stop crafting, close a doorway and get to a firing position; short enough
 * that it reads as an approach rather than an intermission. The whole point of
 * the phase is that the encounter is VISIBLE before it is dangerous.
 */
export const BUILDUP_M = 140;

/**
 * Metres between one arrival of a wave and the next.
 *
 * Staggered rather than simultaneous: four bodies appearing on the same frame
 * reads as a spawn, and four arriving over ten seconds reads as a boarding.
 */
export const CONTACT_STAGGER_M = 25;

/** Quiet distance after a docked destination releases the machine. */
export const SANCTUARY_RELEASE_M = 300;

/**
 * Health fraction below which a wave is one body lighter.
 *
 * The handoff asks for encounters that are occasionally, obviously beyond the
 * player — but it asks that of ENCOUNTER DESIGN, not of a director kicking
 * someone who is already down. A player at a third health has just lost a
 * fight; the next one should not be the same size.
 */
export const MERCY_HEALTH_FRACTION = 0.35;

/** Waves survived before the director stops growing them. */
const RAMP_EVERY = 2;

/**
 * Waves survived before raiders start appearing.
 *
 * Third onwards, which with the pacing above is somewhere past the first
 * couple of kilometres -- long enough to have fought scavengers, worked out
 * that walking backwards beats them, and built something worth defending.
 */
const RAIDERS_FROM = 2;

/** What a wave is made of. Indexes `ENEMIES`. */
export interface WaveMember {
  defId: string;
}

/** A request for an encounter owned by another runtime controller. */
export interface VehicleEncounterRequest {
  type: 'skiff' | 'gunboat';
}

export interface ThreatDecision {
  /** A body to put on the deck this tick, or null. */
  spawn: WaveMember | null;
  /** The phase just entered, or null if it did not change. */
  entered: ThreatPhase | null;
  /** A single external encounter to start this tick, or null. */
  vehicle: VehicleEncounterRequest | null;
}

/** Everything needed to put a director back exactly where it was. */
export interface ThreatDirectorSave {
  phase: ThreatPhase;
  phaseEndsAt: number;
  wavesSurvived: number;
  pending: string[];
  nextReleaseAt: number;
  draws: number;
  /** Infantry waves completed since the last skiff. Optional for old saves. */
  wavesSinceVehicle?: number;
  /** A skiff has been telegraphed and is due at the end of buildup. */
  vehicleQueued?: boolean;
  queuedVehicle?: 'skiff' | 'gunboat' | null;
  /** True only when a saved game was inside an externally owned encounter. */
  externalEncounterActive?: boolean;
  /** Destination sanctuary state; absent in saves written before expeditions. */
  sanctuaryActive?: boolean;
  /** Distance at which the post-destination quiet window can end. */
  sanctuaryReleaseAt?: number;
}

export class ThreatDirector {
  private rng: Rng;
  private phase: ThreatPhase = 'calm';
  /**
   * Distance at which the current phase is done, for the phases that end on
   * distance. `engagement` ignores it — it ends when the deck is clear.
   */
  private phaseEndsAt: number;
  private wavesSurvived = 0;
  private pending: string[] = [];
  private nextReleaseAt = 0;
  /** Two infantry waves create room for one recurring skiff encounter. */
  private wavesSinceVehicle = 0;
  /** Keeps the skiff's normal warning distance visible before its request. */
  private queuedVehicle: 'skiff' | 'gunboat' | null = null;
  /** The runtime controller owns the active encounter, so the director freezes. */
  private externalEncounterActive = false;
  /** Destination sanctuary blocks new schedules without touching live enemies. */
  private sanctuaryActive = false;
  private sanctuaryReleaseAt = Number.POSITIVE_INFINITY;
  /**
   * Draws taken from `rng` since construction.
   *
   * A seeded RNG's position is state, and a save that restores the phase but
   * not the position gives a loaded game a different future to the one it was
   * saved from. Counted rather than serialised because `Rng` is a value, not a
   * stream: replaying N draws on load is exact and costs nothing at the scale
   * this thing draws at (one per calm).
   */
  private draws = 0;

  constructor(
    private readonly seed: string,
    startDistance = 0,
  ) {
    this.rng = new Rng(hashSeed(seed, 'threat-director'));
    this.phaseEndsAt = startDistance + this.rollCalm();
  }

  get currentPhase(): ThreatPhase {
    return this.phase;
  }

  /** How many waves have been fought off. Drives wave size. */
  get waves(): number {
    return this.wavesSurvived;
  }

  /** Bodies of the current wave not yet on the deck. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Where the next phase change is due, in metres. `Infinity` during
   * engagement, which ends on a body count rather than on a distance.
   */
  get phaseEnds(): number {
    return this.phase === 'engagement' ? Infinity : this.phaseEndsAt;
  }

  /** Whether the vehicle controller currently owns an encounter. */
  get hasActiveExternalEncounter(): boolean {
    return this.externalEncounterActive;
  }

  reset(startDistance = 0): void {
    this.rng = new Rng(hashSeed(this.seed, 'threat-director'));
    this.phase = 'calm';
    this.wavesSurvived = 0;
    this.pending = [];
    this.nextReleaseAt = 0;
    this.wavesSinceVehicle = 0;
    this.queuedVehicle = null;
    this.externalEncounterActive = false;
    this.sanctuaryActive = false;
    this.sanctuaryReleaseAt = Number.POSITIVE_INFINITY;
    this.draws = 0;
    this.phaseEndsAt = startDistance + this.rollCalm();
  }

  /**
   * One decision per call.
   *
   * At most one spawn however far the distance jumped, matching the spawner it
   * replaces: a 500m debug skip or a save loaded at 10km must not discharge a
   * whole wave onto the deck in a single frame.
   *
   * At most one PHASE too, and that falls out of a rule worth stating plainly:
   * every phase's deadline is measured from the distance at which the phase was
   * ENTERED, not from where the one before it was due to end. So a jump that
   * crosses a whole calm arrives in buildup and is then given the entire
   * warning distance from there. A player who skips 500m does not skip the
   * telegraph, and one who loads a save mid-recovery still gets the recovery.
   * Time the world travelled through is not time the director spends.
   */
  update(
    distance: number,
    activeCount: number,
    healthFraction: number,
    externalEncounterActive = false,
  ): ThreatDecision {
    // Preserve an externally owned live encounter even while destination
    // sanctuary suppresses future scheduling.
    if (externalEncounterActive) this.externalEncounterActive = true;
    if (this.sanctuaryActive) {
      if (distance < this.sanctuaryReleaseAt) {
        return { spawn: null, entered: null, vehicle: null };
      }
      this.sanctuaryActive = false;
      this.sanctuaryReleaseAt = Number.POSITIVE_INFINITY;
      this.phase = 'calm';
      this.phaseEndsAt = distance + CALM_MIN;
      return { spawn: null, entered: 'calm', vehicle: null };
    }

    // The optional argument lets Game make the exclusivity contract explicit.
    // The internal flag remains authoritative after a request, which prevents
    // a caller that has not yet threaded the fourth argument from accidentally
    // starting infantry on top of a live skiff.
    if (this.externalEncounterActive) {
      return { spawn: null, entered: null, vehicle: null };
    }

    const requestedVehicle = this.queuedVehicle;
    const entered = this.advance(distance, activeCount, healthFraction);
    // `advance` enters external engagement only after the vehicle's buildup
    // warning. Turning that edge into a request keeps the decision one-shot.
    if (entered === 'engagement' && this.externalEncounterActive) {
      return { spawn: null, entered, vehicle: { type: requestedVehicle ?? 'skiff' } };
    }
    return { spawn: this.release(distance, activeCount), entered, vehicle: null };
  }

  /**
   * End a tutorial or scheduled external encounter and begin the same hard
   * recovery window used by an infantry engagement.
   *
   * This is intentionally public: the skiff controller owns its own terminal
   * state and must tell the distance based director when landed boarders and
   * the vehicle are both gone. Calling it repeatedly is harmless and extends
   * recovery from the latest observed distance, which is the safest behavior
   * for a late terminal callback.
   */
  finishExternalEncounter(distance: number): void {
    this.externalEncounterActive = false;
    this.pending = [];
    this.nextReleaseAt = 0;
    this.queuedVehicle = null;
    this.phase = 'recovery';
    this.phaseEndsAt = distance + RECOVERY_M;
  }

  /**
   * Lock encounter scheduling around a destination. Starting sanctuary leaves
   * active enemies untouched; the owning enemy manager decides when those
   * bodies are gone. Releasing starts a fresh recovery window and then a calm
   * stretch, so a dock cannot be followed immediately by a telegraphed wave.
   */
  setSanctuary(active: boolean, distance: number): void {
    if (active) {
      this.sanctuaryActive = true;
      this.sanctuaryReleaseAt = Number.POSITIVE_INFINITY;
      return;
    }
    if (!this.sanctuaryActive) return;
    this.sanctuaryReleaseAt = distance + SANCTUARY_RELEASE_M;
    this.phase = 'recovery';
    this.phaseEndsAt = this.sanctuaryReleaseAt;
    // A not-yet-released body is a schedule, not a live enemy. Cancel it so
    // the destination cannot leak a pre-dock contact after its quiet window.
    this.pending = [];
    this.nextReleaseAt = 0;
  }

  /** A scripted request is retained while another encounter owns the deck. */
  queueExternal(type: 'skiff' | 'gunboat'): boolean {
    if (this.queuedVehicle === type) return true;
    if (this.queuedVehicle !== null) return false;
    this.queuedVehicle = type;
    return true;
  }

  /** Claim a queued route encounter without canceling pending infantry. */
  tryBeginExternal(type: 'skiff' | 'gunboat', distance: number, activeCount: number): boolean {
    if (
      this.queuedVehicle !== type ||
      this.externalEncounterActive ||
      activeCount > 0 ||
      this.pending.length > 0 ||
      this.phase === 'contact' ||
      this.phase === 'engagement' ||
      this.sanctuaryActive ||
      (this.phase === 'recovery' && distance < this.phaseEndsAt)
    )
      return false;
    this.queuedVehicle = null;
    this.externalEncounterActive = true;
    this.phase = 'engagement';
    this.phaseEndsAt = Infinity;
    this.nextReleaseAt = 0;
    return true;
  }

  /** Loading never restores external scenes. Clear orphan ownership without a reward. */
  abortOrphanExternal(distance: number): boolean {
    if (!this.externalEncounterActive) return false;
    this.externalEncounterActive = false;
    this.queuedVehicle = null;
    this.pending = [];
    this.nextReleaseAt = 0;
    this.phase = 'calm';
    this.phaseEndsAt = Math.max(0, distance) + CALM_MIN;
    return true;
  }

  /** The phase transition due at this distance, or null. */
  private advance(
    distance: number,
    activeCount: number,
    healthFraction: number,
  ): ThreatPhase | null {
    switch (this.phase) {
      case 'calm':
        if (distance < this.phaseEndsAt) return null;
        if (activeCount === 0 && this.wavesSurvived >= 2 && this.wavesSinceVehicle >= 2) {
          this.queuedVehicle ??= 'skiff';
        }
        this.phase = 'buildup';
        this.phaseEndsAt = distance + BUILDUP_M;
        return 'buildup';

      case 'buildup': {
        if (distance < this.phaseEndsAt) return null;
        if (this.queuedVehicle) {
          if (activeCount > 0) return null;
          // The request and the ownership flag are committed on the same
          // update. Future calls are frozen until finishExternalEncounter.
          this.queuedVehicle = null;
          this.externalEncounterActive = true;
          this.phase = 'engagement';
          this.phaseEndsAt = Infinity;
          this.pending = [];
          this.nextReleaseAt = 0;
          this.wavesSinceVehicle = 0;
          return 'engagement';
        }
        this.phase = 'contact';
        this.pending = this.composeWave(healthFraction);
        this.nextReleaseAt = distance;
        // Contact has no deadline of its own: it is over when the last body of
        // the wave has been put down, which `release` decides.
        this.phaseEndsAt = Infinity;
        return 'contact';
      }

      case 'contact':
        if (this.pending.length > 0) return null;
        this.phase = 'engagement';
        this.phaseEndsAt = Infinity;
        return 'engagement';

      case 'engagement':
        // The deck is clear. Not "the wave is dead" — a scavenger that walks
        // off the side counts, and so it should: the threat is gone either way
        // and the player has earned the quiet.
        if (activeCount > 0) return null;
        this.wavesSurvived += 1;
        this.wavesSinceVehicle += 1;
        this.phase = 'recovery';
        this.phaseEndsAt = distance + RECOVERY_M;
        return 'recovery';

      case 'recovery':
        if (distance < this.phaseEndsAt) return null;
        this.phase = 'calm';
        this.phaseEndsAt = distance + this.rollCalm();
        return 'calm';
    }
  }

  /** The next body of the wave, if one is due and there is room for it. */
  private release(distance: number, activeCount: number): WaveMember | null {
    if (this.phase !== 'contact') return null;
    if (this.pending.length === 0) return null;
    if (distance < this.nextReleaseAt) return null;

    // Refused, not forgotten — the same rule the metronome had. The stagger
    // does not advance either, so the held body lands the moment a slot frees
    // rather than waiting out another interval on top of it.
    if (activeCount >= MAX_ACTIVE_ENEMIES) return null;

    const defId = this.pending.shift() as string;
    this.nextReleaseAt = distance + CONTACT_STAGGER_M;
    return { defId };
  }

  /**
   * What the next wave is made of.
   *
   * The size is still arithmetic -- one body, then two, then three, capped at
   * what the deck holds -- and still deliberately not a threat-point economy:
   * a budget over two types is a multiplication dressed up as a system.
   *
   * The COMPOSITION is where the second type earns its place. Raiders are held
   * back until `RAIDERS_FROM`, so a player meets the slow, tough thing first
   * and learns that backing away and shooting works. The raider is the answer
   * to that: 60% faster than a walk, so it closes while you retreat, and the
   * lesson has to be unlearnt. Introducing both at once would teach neither.
   *
   * From then on a wave is mixed rather than swapped -- half raiders, rounded
   * down, so there is always at least one scavenger anchoring it. A pure
   * raider wave is a rush with no shape to it.
   */
  private composeWave(healthFraction: number): string[] {
    let size = 1 + Math.floor(this.wavesSurvived / RAMP_EVERY);
    if (healthFraction < MERCY_HEALTH_FRACTION) size -= 1;
    size = Math.max(1, Math.min(size, MAX_ACTIVE_ENEMIES));

    const raiders = this.wavesSurvived >= RAIDERS_FROM ? Math.floor(size / 2) : 0;
    return Array.from({ length: size }, (_, i) => (i < raiders ? 'raider' : 'scavenger'));
  }

  private rollCalm(): number {
    this.draws += 1;
    return CALM_MIN + this.rng.next() * CALM_SPREAD;
  }

  toSave(): ThreatDirectorSave {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      wavesSurvived: this.wavesSurvived,
      pending: [...this.pending],
      nextReleaseAt: this.nextReleaseAt,
      draws: this.draws,
      wavesSinceVehicle: this.wavesSinceVehicle,
      queuedVehicle: this.queuedVehicle,
      externalEncounterActive: this.externalEncounterActive,
      sanctuaryActive: this.sanctuaryActive,
      sanctuaryReleaseAt: this.sanctuaryReleaseAt,
    };
  }

  /**
   * Put a director back exactly where it was.
   *
   * `Infinity` does not survive JSON — it comes back as null — so the two
   * phases that use it as "no deadline" restore it explicitly rather than
   * trusting the number that was written.
   */
  restore(save: ThreatDirectorSave): void {
    const count = (value: unknown, fallback = 0) =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(100000, Math.max(0, Math.floor(value)))
        : fallback;
    const distance = (value: unknown, fallback = 0) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
    this.phase = ['calm', 'buildup', 'contact', 'engagement', 'recovery'].includes(save.phase)
      ? save.phase
      : 'calm';
    this.wavesSurvived = count(save.wavesSurvived);
    this.pending = Array.isArray(save.pending)
      ? save.pending
          .filter((id) => id === 'scavenger' || id === 'raider')
          .slice(0, MAX_ACTIVE_ENEMIES)
      : [];
    this.nextReleaseAt = distance(save.nextReleaseAt);
    this.wavesSinceVehicle = count(save.wavesSinceVehicle, Math.min(this.wavesSurvived, 2));
    this.queuedVehicle =
      save.queuedVehicle === 'gunboat' || save.queuedVehicle === 'skiff'
        ? save.queuedVehicle
        : save.vehicleQueued === true
          ? 'skiff'
          : null;
    this.externalEncounterActive = save.externalEncounterActive === true;
    this.sanctuaryActive = save.sanctuaryActive === true;
    this.sanctuaryReleaseAt = distance(save.sanctuaryReleaseAt, Number.POSITIVE_INFINITY);
    this.phaseEndsAt =
      this.phase === 'contact' || this.phase === 'engagement'
        ? Infinity
        : distance(save.phaseEndsAt);

    // Replay the sequence rather than storing it. See `draws`.
    this.rng = new Rng(hashSeed(this.seed, 'threat-director'));
    this.draws = count(save.draws);
    for (let i = 0; i < this.draws; i++) this.rng.next();
  }
}
