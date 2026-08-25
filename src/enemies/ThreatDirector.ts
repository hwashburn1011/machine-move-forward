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

/** What a wave is made of. Indexes `ENEMIES`. */
export interface WaveMember {
  defId: string;
}

export interface ThreatDecision {
  /** A body to put on the deck this tick, or null. */
  spawn: WaveMember | null;
  /** The phase just entered, or null if it did not change. */
  entered: ThreatPhase | null;
}

/** Everything needed to put a director back exactly where it was. */
export interface ThreatDirectorSave {
  phase: ThreatPhase;
  phaseEndsAt: number;
  wavesSurvived: number;
  pending: string[];
  nextReleaseAt: number;
  draws: number;
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
  update(distance: number, activeCount: number, healthFraction: number): ThreatDecision {
    const entered = this.advance(distance, activeCount, healthFraction);
    return { spawn: this.release(distance, activeCount), entered };
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
        this.phase = 'buildup';
        this.phaseEndsAt = distance + BUILDUP_M;
        return 'buildup';

      case 'buildup': {
        if (distance < this.phaseEndsAt) return null;
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
   * One body, then two, then three, capped at what the deck holds. Deliberately
   * arithmetic rather than a threat-point economy: with one enemy type a budget
   * is a multiplication dressed up as a system, and the moment there is a
   * second type this is the one function that has to change.
   */
  private composeWave(healthFraction: number): string[] {
    let size = 1 + Math.floor(this.wavesSurvived / RAMP_EVERY);
    if (healthFraction < MERCY_HEALTH_FRACTION) size -= 1;
    size = Math.max(1, Math.min(size, MAX_ACTIVE_ENEMIES));

    return Array.from({ length: size }, () => 'scavenger');
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
    this.phase = save.phase;
    this.wavesSurvived = save.wavesSurvived;
    this.pending = [...save.pending];
    this.nextReleaseAt = save.nextReleaseAt;
    this.phaseEndsAt =
      this.phase === 'contact' || this.phase === 'engagement'
        ? Infinity
        : (save.phaseEndsAt ?? 0);

    // Replay the sequence rather than storing it. See `draws`.
    this.rng = new Rng(hashSeed(this.seed, 'threat-director'));
    for (let i = 0; i < save.draws; i++) this.rng.next();
    this.draws = save.draws;
  }
}
