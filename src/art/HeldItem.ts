/**
 * Putting a weapon in a character's hand.
 *
 * Two problems, both of which look trivial and are not, and both of which are
 * solved here as pure functions so they can be argued with in node rather than
 * by squinting at a screenshot.
 *
 * **Finding the hand.** Every rig names its bones differently. The player is a
 * Mixamo rig — `mixamorig:RightHand` — and the scavenger is a Blender export —
 * `Hand.R`. This is exactly the problem `resolveClip` already has with
 * animation names, and it gets the same answer: an ordered list of substrings,
 * matched case-insensitively, so a pack that names things a third way degrades
 * to a worse match rather than to a crash.
 *
 * **Fitting the weapon.** A downloaded model arrives at whatever scale and
 * facing its author used, and the two guns here are authored along a different
 * axis from the machine's own convention. Measuring the model and deriving the
 * transform is the same choice `fitToCapsule` makes for characters, and for the
 * same reason: an author's scale is a fact about their file, not about this
 * game, and hard-coding one is how a rifle ends up six centimetres long.
 */

/**
 * Bone-name fragments to try for a hand, best first.
 *
 * Right before left, and `right` before the bare `hand`, so a rig with both
 * hands does not hand back whichever happened to be first in the file.
 */
const RIGHT_HAND = ['righthand', 'hand.r', 'hand_r', 'r_hand', 'hand'] as const;

/**
 * The bone to hang a held item off, or null when the rig has no hand at all.
 *
 * Exact-ish matching first, then substring: `mixamorig:RightHand` contains
 * `righthand` once the colon and case are ignored, but so do
 * `mixamorig:RightHandIndex1` and three more finger bones. The shortest match
 * wins, which is the wrist rather than a knuckle — a rifle hanging off a
 * fingertip tracks the finger's curl, and the curl is in the animation.
 */
export function findHandBone(names: readonly string[]): string | null {
  // The SAME normalisation on both sides, which is the whole trick: `Hand.R`
  // and `hand_r` and `mixamorig:RightHand` are three spellings of one idea,
  // and a separator stripped from one side and not the other silently matches
  // nothing. That is exactly what the first version did with the full stop.
  const strip = (v: string): string => v.toLowerCase().replace(/[:_\s.-]/g, '');
  const normalised = names.map((n) => ({ name: n, key: strip(n) }));

  for (const want of RIGHT_HAND) {
    const key = strip(want);
    const matches = normalised.filter((n) => n.key.includes(key));
    if (matches.length === 0) continue;
    // Shortest name = closest to the wrist. `RightHand` beats
    // `RightHandIndex1`, which is a knuckle and animates like one.
    matches.sort((a, b) => a.name.length - b.name.length);
    return (matches[0] as { name: string }).name;
  }

  return null;
}

export interface HeldFit {
  /** Uniform scale to apply to the model. */
  scale: number;
  /** Which local axis the model's long dimension runs along. */
  longAxis: 'x' | 'y' | 'z';
}

/**
 * Scale a weapon to a real length, and say which way it points.
 *
 * The long axis IS the barrel. That holds for every gun ever modelled and it
 * saves carrying a per-model orientation table that would rot the moment a
 * model is swapped — which the project expects to happen, since both current
 * weapons are placeholders in the same sense the scavenger is.
 *
 * @param size    the model's measured bounding-box extents
 * @param wanted  how long the weapon should actually be, in metres
 */
export function fitHeldItem(
  size: { x: number; y: number; z: number },
  wanted: number,
): HeldFit {
  const longest = Math.max(size.x, size.y, size.z);
  // A degenerate box means the model failed to load or has no geometry.
  // Scaling by Infinity puts NaNs through the whole scene graph, and a NaN
  // matrix silently stops a mesh being drawn rather than erroring.
  if (!(longest > 1e-6)) return { scale: 1, longAxis: 'x' };

  const longAxis = longest === size.x ? 'x' : longest === size.y ? 'y' : 'z';
  return { scale: wanted / longest, longAxis };
}

/**
 * Euler that swings a model's long axis round onto +Z, the way its holder
 * faces.
 *
 * Every author picks a different axis to build a gun along, and all three turn
 * up in practice: the Kalashnikov here measures longest in Y once its own node
 * transforms are applied, and the first version of this function only handled
 * X — so the rifle stood on end alongside the player's leg, muzzle down. It
 * was at least obviously wrong rather than subtly wrong, which is what that
 * version's comment promised, but there is no reason to leave the case out
 * when it is one more line.
 *
 * Returned as an Euler rather than a yaw for the same reason: a long axis of Y
 * is a rotation about X, and a function called `heldItemYaw` could not express
 * it.
 */
export function heldItemRotation(longAxis: 'x' | 'y' | 'z'): {
  x: number;
  y: number;
  z: number;
} {
  if (longAxis === 'x') return { x: 0, y: Math.PI / 2, z: 0 };
  if (longAxis === 'y') return { x: Math.PI / 2, y: 0, z: 0 };
  return { x: 0, y: 0, z: 0 };
}
