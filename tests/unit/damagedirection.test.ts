import { describe, it, expect } from 'vitest';
import { damageBearing } from '@/ui/DamageDirection';

/**
 * Where a hit came from, in screen terms.
 *
 * 0 is straight ahead, positive is to the right, ±π is behind. The camera's
 * yaw is the one from `PlayerCamera`: 0 looks down -Z.
 */
describe('bearing of an attacker', () => {
  const P = { x: 0, z: 0 };

  it('reads straight ahead when the attacker is in front', () => {
    // Facing -Z, attacker at -Z.
    expect(damageBearing(0, -5, P.x, P.z, 0)).toBeCloseTo(0, 5);
  });

  it('reads behind when the attacker is at your back', () => {
    // This is the case the player actually hit: scavengers board astern.
    expect(Math.abs(damageBearing(0, 5, P.x, P.z, 0))).toBeCloseTo(Math.PI, 5);
  });

  it('reads right for an attacker off the right shoulder', () => {
    expect(damageBearing(5, 0, P.x, P.z, 0)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('reads left for an attacker off the left shoulder', () => {
    expect(damageBearing(-5, 0, P.x, P.z, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('turns with the camera', () => {
    // Turn to face the attacker and the arrow must swing to dead ahead, or it
    // is pointing at the world rather than at the screen.
    expect(damageBearing(5, 0, P.x, P.z, -Math.PI / 2)).toBeCloseTo(0, 5);
  });

  it('is measured from the player, not the origin', () => {
    // Attacker due north of a player who is not at 0,0.
    expect(damageBearing(10, 5, 10, 10, 0)).toBeCloseTo(0, 5);
  });

  it('never returns NaN when the attacker is exactly underfoot', () => {
    // Falling damage or a zero position on the event would otherwise poison
    // the CSS transform and blank the whole indicator.
    expect(Number.isFinite(damageBearing(3, 3, 3, 3, 0.4))).toBe(true);
  });
});
