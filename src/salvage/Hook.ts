/**
 * How far the thrown hook is from the player, and which way it is going.
 *
 * Pure, because the whole feel of the reel lives in these numbers and none of
 * it is observable from a screenshot: a hook that never turns around leaves
 * the cable stretched across the desert forever, and one that turns around a
 * frame too early never reaches anything.
 */

export type HookPhase = 'out' | 'back' | 'done';

export interface HookState {
  /** Metres from the player, along the direction it was thrown. */
  distance: number;
  phase: HookPhase;
}

/** Metres per second the hook flies, both ways. */
export const HOOK_SPEED = 42;

/**
 * Advance the hook by one frame.
 *
 * Turns around on reaching its reach rather than stopping there, so pressing
 * the key always produces a throw that visibly goes out and comes back --
 * which is the only way to learn where the thing actually points.
 */
export function stepHook(state: HookState, dt: number, maxRange: number): HookState {
  if (state.phase === 'done') return state;

  const step = HOOK_SPEED * Math.max(0, dt);

  if (state.phase === 'out') {
    const distance = state.distance + step;
    // Turn at the end of its reach, never past it.
    if (distance >= maxRange) return { distance: maxRange, phase: 'back' };
    return { distance, phase: 'out' };
  }

  const distance = state.distance - step;
  if (distance <= 0) return { distance: 0, phase: 'done' };
  return { distance, phase: 'back' };
}
