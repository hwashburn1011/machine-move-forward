/**
 * Where a hit came from, in screen terms.
 *
 * Pure, so the awkward half of a damage indicator — the trigonometry that
 * decides whether an arrow points left or right — is testable in node rather
 * than by being punched in a browser.
 *
 * Scavengers board astern and the player faces forward, so most hits arrive
 * from behind. An indicator that cannot tell front from back would be worse
 * than none at all.
 */

/**
 * Bearing of `from` relative to where the player is looking.
 *
 * Radians: 0 is dead ahead, positive is to the right, ±π is directly behind.
 * `cameraYaw` is `PlayerCamera`'s, where 0 looks down -Z.
 */
export function damageBearing(
  fromX: number,
  fromZ: number,
  playerX: number,
  playerZ: number,
  cameraYaw: number,
): number {
  const dx = fromX - playerX;
  const dz = fromZ - playerZ;

  // Standing exactly on the player: any answer is arbitrary, NaN is not, and
  // it would reach the DOM as a broken transform.
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;

  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // Yaw 0 looks down -Z, so forward is (-sin, -cos) and right is (cos, -sin).
  const ahead = dx * -sin + dz * -cos;
  const right = dx * cos + dz * -sin;

  return Math.atan2(right, ahead);
}
