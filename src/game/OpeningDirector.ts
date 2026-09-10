import nomad from '@/data/iron-nomad.json';
import type { Vec3Like } from '@/core/events/GameEvents';
import { DECK_SURFACE_Y, GRID_TILE, MACHINE_TILES_Z } from '@/game/constants';

/**
 * Where the opening has got to.
 *
 * `title`   — the menu is up over a live machine walking the dunes.
 * `rooftop` — the chase: the player is on the building, the machine idles.
 * `landed`  — they made the jump; the machine is winding up, the card is up.
 * `done`    — normal play. Every game that is not a fresh New Game starts here.
 */
export type OpeningPhase = 'title' | 'rooftop' | 'landed' | 'done';

/**
 * How the opening was entered.
 *
 * `skipped` is `?nomenu=1`: it exists so every harness and e2e boot string
 * reproduces the pre-Phase-2 boot exactly, and it is deliberately the same
 * terminal state a `continue` reaches rather than a second code path.
 */
export type OpeningMode = 'new-game' | 'continue' | 'skipped';

/**
 * One-shot instructions for whoever owns the world.
 *
 * The director itself touches nothing — no Three, no Rapier, no DOM — so the
 * whole of the opening's logic is testable at 60Hz in node. Each effect fires
 * at most once per run, which is what lets `Game` handle them as plain
 * commands rather than having to remember whether it has already obeyed one.
 */
export type OpeningEffect =
  'spawn-rooftop' | 'grant-weapons' | 'throttle-up' | 'show-title-card' | 'teardown-rooftop';

export interface OpeningInput {
  playerGrounded: boolean;
  playerPos: Vec3Like;
  /** The skip key is down this step. A full second of it ends the opening. */
  skipHeld: boolean;
  dt: number;
}

export interface OpeningSave {
  phase: OpeningPhase;
}

/**
 * Seconds the game's name stays up over the machine's first strides.
 *
 * Long enough to read, short enough that a player who has just made a leap of
 * faith is not left holding it.
 */
export const TITLE_CARD_DELAY_S = 2;

/** Seconds the skip must be held. A hold, not a tap: Esc is also 'cancel'. */
export const SKIP_HOLD_S = 1;

/**
 * Half-extents of the box a landing counts inside.
 *
 * The deck's own footprint, derived from the same tile counts `Machine`
 * derives `deckBounds` from rather than restated, so a machine that changes
 * size cannot leave the landing test measuring the old one.
 */
export const LANDING_HALF_X = nomad.deckHalfWidth;
export const LANDING_HALF_Z = (MACHINE_TILES_Z * GRID_TILE) / 2;

/**
 * Metres either side of the deck surface a landing is allowed to be at.
 *
 * Generous on purpose. The capsule's centre sits about a metre above its feet
 * and the deck heaves under a walking machine, so demanding the exact surface
 * would make "did they land" depend on which part of the stride it was.
 */
export const LANDING_Y_TOLERANCE = 1;

/**
 * Is this position a landing on the machine's deck?
 *
 * One place, so the harness, the director and anything later that needs to ask
 * "are they aboard" cannot drift apart on the answer.
 */
export function isDeckLanding(p: Vec3Like): boolean {
  return (
    Math.abs(p.x) <= LANDING_HALF_X &&
    Math.abs(p.z) <= LANDING_HALF_Z &&
    Math.abs(p.y - DECK_SURFACE_Y) <= LANDING_Y_TOLERANCE
  );
}

/**
 * The opening scene, as a pure state machine.
 *
 * Phase 15 replaces the placeholder chase with an authored one behind exactly
 * these four phases, and Phase 9 hangs the premise off `done`; both are
 * cheaper if the sequencing never learns anything about the scene it sequences.
 */
export class OpeningDirector {
  private current: OpeningPhase = 'title';
  private readonly fired = new Set<OpeningEffect>();
  /** Seconds the skip has been held without interruption. */
  private skipFor = 0;
  /** Seconds since the landing, for the title card's exit. */
  private landedFor = 0;

  get phase(): OpeningPhase {
    return this.current;
  }

  /** 0..1, for the hold-to-skip meter. Zero whenever the key is not down. */
  get skipProgress(): number {
    return Math.min(1, this.skipFor / SKIP_HOLD_S);
  }

  begin(mode: OpeningMode): OpeningEffect[] {
    if (mode === 'new-game') {
      this.current = 'rooftop';
      return this.emit('spawn-rooftop');
    }
    // Continue and skipped both mean "there is no opening", and a game that
    // has already been played must never be handed one.
    this.current = 'done';
    this.markAllFired();
    return [];
  }

  update(input: OpeningInput): OpeningEffect[] {
    if (this.current === 'rooftop') return this.updateRooftop(input);
    if (this.current === 'landed') return this.updateLanded(input);
    return [];
  }

  private updateRooftop(input: OpeningInput): OpeningEffect[] {
    // The skip is a hold, so letting go has to genuinely undo it rather than
    // pausing a bar that resumes on the next tap.
    this.skipFor = input.skipHeld ? this.skipFor + input.dt : 0;
    if (this.skipFor >= SKIP_HOLD_S) {
      this.current = 'done';
      // A skip has to leave the world exactly where a landing would: armed,
      // walking, and with the building on its way out. `Game` teleports
      // anyone still on the roof when it obeys the teardown.
      return this.emit('grant-weapons', 'throttle-up', 'teardown-rooftop');
    }

    if (!input.playerGrounded) return [];
    if (!isDeckLanding(input.playerPos)) return [];

    this.current = 'landed';
    this.landedFor = 0;
    return this.emit('grant-weapons', 'throttle-up', 'show-title-card');
  }

  private updateLanded(input: OpeningInput): OpeningEffect[] {
    this.landedFor += input.dt;
    if (this.landedFor < TITLE_CARD_DELAY_S) return [];
    this.current = 'done';
    return this.emit('teardown-rooftop');
  }

  /** Effects, minus any already obeyed. */
  private emit(...effects: OpeningEffect[]): OpeningEffect[] {
    const fresh = effects.filter((e) => !this.fired.has(e));
    for (const e of fresh) this.fired.add(e);
    return fresh;
  }

  private markAllFired(): void {
    for (const e of [
      'spawn-rooftop',
      'grant-weapons',
      'throttle-up',
      'show-title-card',
      'teardown-rooftop',
    ] as const) {
      this.fired.add(e);
    }
  }

  toSave(): OpeningSave {
    return { phase: this.current };
  }

  restore(save: OpeningSave): void {
    this.current = save.phase;
    this.skipFor = 0;
    this.landedFor = 0;
    this.fired.clear();
    // Anything the restored phase is already past must not fire again. A save
    // taken mid-opening is not a case the game can produce today (saving is a
    // debug key and the opening lasts seconds), so the conservative reading —
    // everything before this phase has happened — is the right one.
    if (save.phase === 'done') this.markAllFired();
    else if (save.phase === 'landed') {
      this.fired.add('spawn-rooftop');
      this.fired.add('grant-weapons');
      this.fired.add('throttle-up');
      this.fired.add('show-title-card');
    } else if (save.phase === 'rooftop') this.fired.add('spawn-rooftop');
  }
}
