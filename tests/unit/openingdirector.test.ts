import { describe, expect, it } from 'vitest';
import {
  isDeckLanding,
  OpeningDirector,
  SKIP_HOLD_S,
  TITLE_CARD_DELAY_S,
  type OpeningInput,
} from '@/game/OpeningDirector';
import { DECK_SURFACE_Y } from '@/game/constants';

const STEP = 1 / 60;

const onDeck: OpeningInput = {
  playerGrounded: true,
  playerPos: { x: 0, y: DECK_SURFACE_Y, z: 0 },
  skipHeld: false,
  dt: STEP,
};

/** Standing on the roof it jumped from. Grounded, but not on the machine. */
const onRoof: OpeningInput = { ...onDeck, playerPos: { x: 11, y: 6.6, z: 0 } };

/** Mid-air over the deck: the right place, but not landed yet. */
const overDeck: OpeningInput = { ...onDeck, playerGrounded: false };

/** Advance `seconds` of simulated time, collecting everything emitted. */
function run(d: OpeningDirector, seconds: number, input: OpeningInput = onDeck): string[] {
  const seen: string[] = [];
  for (let t = 0; t < seconds; t += STEP) seen.push(...d.update(input));
  return seen;
}

describe('OpeningDirector', () => {
  it('starts in the title phase and emits nothing until it is begun', () => {
    const d = new OpeningDirector();
    expect(d.phase).toBe('title');
    expect(d.update(onDeck)).toEqual([]);
    expect(d.phase).toBe('title');
  });

  it('sends a continued game straight to done, with no opening at all', () => {
    const d = new OpeningDirector();
    expect(d.begin('continue')).toEqual([]);
    expect(d.phase).toBe('done');
    expect(run(d, 5)).toEqual([]);
  });

  it('sends a skipped boot straight to done, which is exactly today"s boot', () => {
    const d = new OpeningDirector();
    expect(d.begin('skipped')).toEqual([]);
    expect(d.phase).toBe('done');
    expect(run(d, 5)).toEqual([]);
  });

  it('puts a new game on the rooftop and asks for the set to be built', () => {
    const d = new OpeningDirector();
    expect(d.begin('new-game')).toEqual(['spawn-rooftop']);
    expect(d.phase).toBe('rooftop');
  });

  it('lands only on the deck, not on the roof it jumped from', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    expect(d.update(onRoof)).toEqual([]);
    expect(d.phase).toBe('rooftop');

    const effects = d.update(onDeck);
    expect(effects).toContain('throttle-up');
    expect(effects).toContain('grant-weapons');
    expect(d.phase).toBe('landed');
    expect(d.update(onDeck)).not.toContain('throttle-up'); // one-shot
  });

  it('does not land a player who is merely falling past the deck', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    expect(d.update(overDeck)).toEqual([]);
    expect(d.phase).toBe('rooftop');
  });

  it('does not land a player standing on the sand under the deck', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    expect(d.update({ ...onDeck, playerPos: { x: 0, y: -0.35, z: 0 } })).toEqual([]);
    expect(d.phase).toBe('rooftop');
  });

  it('shows the title card on landing and finishes after it has had its moment', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    expect(d.update(onDeck)).toContain('show-title-card');

    // Not yet: the card is still up.
    expect(run(d, TITLE_CARD_DELAY_S * 0.5)).toEqual([]);
    expect(d.phase).toBe('landed');

    expect(run(d, TITLE_CARD_DELAY_S)).toEqual(['teardown-rooftop']);
    expect(d.phase).toBe('done');
  });

  it('never repeats an effect, however long it runs', () => {
    const d = new OpeningDirector();
    const all = [...d.begin('new-game'), ...run(d, 10)];
    expect(all).toEqual([
      'spawn-rooftop',
      'grant-weapons',
      'throttle-up',
      'show-title-card',
      'teardown-rooftop',
    ]);
  });

  it('completes the opening when the skip is held for a full second', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    const held: OpeningInput = { ...onRoof, skipHeld: true };

    expect(run(d, SKIP_HOLD_S * 0.5, held)).toEqual([]);
    expect(d.phase).toBe('rooftop');

    const rest = run(d, SKIP_HOLD_S, held);
    expect(d.phase).toBe('done');
    // A skip must still leave the world in the state a landing would: armed,
    // walking, and with the building on its way out.
    expect(rest).toEqual(['grant-weapons', 'throttle-up', 'teardown-rooftop']);
  });

  it('forgets a skip that was let go of before it completed', () => {
    const d = new OpeningDirector();
    d.begin('new-game');
    const held: OpeningInput = { ...onRoof, skipHeld: true };

    run(d, SKIP_HOLD_S * 0.9, held);
    expect(d.skipProgress).toBeGreaterThan(0.5);
    d.update(onRoof);
    expect(d.skipProgress).toBe(0);
    expect(run(d, SKIP_HOLD_S * 0.9, held)).toEqual([]);
    expect(d.phase).toBe('rooftop');
  });

  it('round-trips a finished opening, so a reloaded game never replays it', () => {
    const a = new OpeningDirector();
    a.begin('new-game');
    a.update(onDeck);
    run(a, TITLE_CARD_DELAY_S * 2);
    expect(a.phase).toBe('done');

    const b = new OpeningDirector();
    b.restore(a.toSave());
    expect(b.phase).toBe('done');
    expect(run(b, 5)).toEqual([]);
  });
});

describe('isDeckLanding', () => {
  it('accepts the deck surface and a metre either side of it', () => {
    expect(isDeckLanding({ x: 0, y: DECK_SURFACE_Y, z: 0 })).toBe(true);
    expect(isDeckLanding({ x: 4.9, y: DECK_SURFACE_Y + 0.9, z: 7.9 })).toBe(true);
    expect(isDeckLanding({ x: -4.9, y: DECK_SURFACE_Y - 0.9, z: -7.9 })).toBe(true);
  });

  it('rejects anything outside the deck footprint or off its height', () => {
    expect(isDeckLanding({ x: 6, y: DECK_SURFACE_Y, z: 0 })).toBe(false);
    expect(isDeckLanding({ x: 0, y: DECK_SURFACE_Y, z: 9 })).toBe(false);
    expect(isDeckLanding({ x: 0, y: 6.6, z: 0 })).toBe(false);
    expect(isDeckLanding({ x: 0, y: -0.35, z: 0 })).toBe(false);
  });
});
