import type { DirectionalMotion } from './PlayerGait';

/** Metres/second of the Blender stance phase, before runtime speed matching.
 * Authored by tools/art/animation_polish/build.py: stride / (period * duty).
 * This scales presentation only; the character controller owns all movement.
 */
export function authoredLocomotionSpeed(
  gait: 'walk' | 'run' | 'crouch_walk',
  direction: DirectionalMotion,
): number {
  const stride = gait === 'run' ? 1.38 : gait === 'walk' ? 1.1 : 0.63;
  const duration = gait === 'run' ? 12 / 30 : 16 / 30;
  const duty = gait === 'run' ? 0.5 : gait === 'walk' ? 0.58 : 0.62;
  const directionScale =
    direction === 'left' || direction === 'right' ? 0.72 : direction === 'back' ? 0.82 : 1;
  return (stride * directionScale) / (duration * duty);
}

/** Fade IK out during swing so stairs do not pin the airborne boot. */
export function footContactWeight(phase: number, gait: 'walk' | 'run' | 'crouch_walk'): number {
  const duty = gait === 'run' ? 0.5 : gait === 'walk' ? 0.58 : 0.62;
  const smooth = (a: number, b: number, t: number) => {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  return 1 - smooth(duty - 0.04, duty + 0.04, phase) + smooth(0.94, 1, phase);
}
