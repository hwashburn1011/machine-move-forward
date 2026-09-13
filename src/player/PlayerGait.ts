/**
 * Which clip the player's legs should be playing.
 *
 * Pure, and separate from the scene graph, because the failure here is quiet
 * rather than loud: a threshold slightly wrong leaves the character sprinting
 * on the spot or sliding across the deck in an idle pose, and neither throws.
 */

export type Gait = 'idle' | 'walk' | 'run';
export type DirectionalMotion = 'fwd' | 'back' | 'left' | 'right';
export interface DirectionalBlend {
  primary: DirectionalMotion;
  secondary: DirectionalMotion | null;
  primaryWeight: number;
  secondaryWeight: number;
}
export const MOTION_DEADZONE = 0.15;

/** Two-axis blend for authored cardinal clips. Game-local right is +X, forward is +Z. */
export function directionalBlend(x: number, z: number): DirectionalBlend {
  const ax = Math.abs(x),
    az = Math.abs(z),
    total = ax + az;
  // Facing glTF +Z, the character's physical right is local -X.
  const horizontal: DirectionalMotion = x < 0 ? 'right' : 'left';
  const vertical: DirectionalMotion = z < 0 ? 'back' : 'fwd';
  if (!Number.isFinite(total) || Math.hypot(x, z) <= MOTION_DEADZONE)
    return { primary: 'fwd', secondary: null, primaryWeight: 1, secondaryWeight: 0 };
  if (az >= ax)
    return {
      primary: vertical,
      secondary: ax > STOPPED ? horizontal : null,
      primaryWeight: az / total,
      secondaryWeight: ax / total,
    };
  return {
    primary: horizontal,
    secondary: az > STOPPED ? vertical : null,
    primaryWeight: ax / total,
    secondaryWeight: az / total,
  };
}

/**
 * Below this the player counts as stopped.
 *
 * The character controller reports a hair of speed even when standing still,
 * and without a floor the legs twitch between idle and walk forever.
 */
const STOPPED = MOTION_DEADZONE;

/** Above this the walk becomes a run. */
const RUNNING = 4.2;

export function playerGait(speed: number, _grounded: boolean): Gait {
  // A NaN would compare false against everything below and fall through to a
  // run, leaving the character sprinting on the spot.
  if (!Number.isFinite(speed) || speed <= STOPPED) return 'idle';
  return speed >= RUNNING ? 'run' : 'walk';
}

/** Resolve local movement to an authored clip, with a stable deadzone. */
export function directionalMotion(
  x: number,
  z: number,
  crouching: boolean,
  grounded: boolean,
): string {
  if (!grounded) return crouching ? 'crouch_jump' : 'jump';
  const magnitude = Math.hypot(x, z);
  if (!Number.isFinite(magnitude) || magnitude <= STOPPED)
    return crouching ? 'crouch_idle' : 'idle';
  const direction = directionalBlend(x, z).primary;
  return crouching ? `crouch_walk_${direction}` : `walk_${direction}`;
}
