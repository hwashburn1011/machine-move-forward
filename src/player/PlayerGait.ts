/**
 * Which clip the player's legs should be playing.
 *
 * Pure, and separate from the scene graph, because the failure here is quiet
 * rather than loud: a threshold slightly wrong leaves the character sprinting
 * on the spot or sliding across the deck in an idle pose, and neither throws.
 */

export type Gait = 'idle' | 'walk' | 'run';

/**
 * Below this the player counts as stopped.
 *
 * The character controller reports a hair of speed even when standing still,
 * and without a floor the legs twitch between idle and walk forever.
 */
const STOPPED = 0.15;

/** Above this the walk becomes a run. */
const RUNNING = 4.2;

export function playerGait(speed: number, _grounded: boolean): Gait {
  // A NaN would compare false against everything below and fall through to a
  // run, leaving the character sprinting on the spot.
  if (!Number.isFinite(speed) || speed <= STOPPED) return 'idle';
  return speed >= RUNNING ? 'run' : 'walk';
}
