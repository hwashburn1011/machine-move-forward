/**
 * Naming a place on the deck.
 *
 * Pure, and machine-relative rather than player-relative. "Aft" stays true
 * while the player spins on the spot looking for whatever is hitting them,
 * and it is the word that actually tells them which way to walk — where
 * "behind you" stops being true the moment they turn.
 */

/**
 * Fraction of the deck's half-extent past which a spot counts as an end or a
 * side rather than the middle.
 *
 * Derived from the deck rather than fixed in metres because the machine grows
 * as the player builds onto it, and a constant would slowly come to call half
 * the deck "the bow".
 */
const EDGE_FRACTION = 0.34;

/**
 * What to call the spot at (`x`, `z`) on a deck of the given half-extents.
 *
 * The prow is -Z, so that end is the bow. Ship words throughout: the back
 * corners are quarters, not "back left".
 */
export function deckBearingName(
  x: number,
  z: number,
  halfWidth: number,
  halfLength: number,
): string {
  // A zero-size deck would divide to Infinity and reach the HUD as "NaN".
  const sideAt = Math.max(halfWidth * EDGE_FRACTION, 1e-6);
  const endAt = Math.max(halfLength * EDGE_FRACTION, 1e-6);

  const side = x <= -sideAt ? 'port' : x >= sideAt ? 'starboard' : null;
  const end = z <= -endAt ? 'bow' : z >= endAt ? 'quarter' : null;

  if (side && end) return `the ${side} ${end}`;
  if (end) return end === 'bow' ? 'the bow' : 'the stern';
  if (side) return `the ${side} rail`;
  return 'amidships';
}
