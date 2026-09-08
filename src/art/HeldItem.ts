import * as THREE from 'three';

/**
 * Putting a weapon in a character's hand.
 *
 * Three problems, all of which look trivial and are not, and all of which are
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
 *
 * **Gripping it.** This is the one that shipped wrong twice. A held object is
 * fixed with respect to the HAND — that is the entire meaning of "held" — so
 * its orientation has to be expressed in the hand bone's own frame and then
 * left alone. The version this replaces instead cancelled the hand's BIND-pose
 * world rotation and substituted the body's, which is the same thing only
 * while the character is standing in its bind pose. A Mixamo bind pose has the
 * arms straight out sideways, every real pose is most of a right angle away
 * from that, and that right angle was landing on the gun: the rifle came out
 * hanging muzzle-down through the player's thigh, and it swung whenever the
 * wrist did. See `handGripAlign` for the frame that replaced it.
 */

export type Axis = 'x' | 'y' | 'z';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box, as measured off a loaded model. */
export interface Box {
  min: Vec3;
  max: Vec3;
}

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
  longAxis: Axis;
  /**
   * Which end of that axis the muzzle is on.
   *
   * Measured, not typed in. A gun is modelled with its origin near the grip
   * and most of its length out in front of that, so the far end of the long
   * axis from the origin is the barrel. Both shipped weapons put roughly four
   * fifths of themselves on one side of their own origin, which is not a
   * coincidence about these two files but a fact about how anyone rigs a gun
   * meant to be held.
   */
  muzzleSign: 1 | -1;
  /**
   * The thinnest axis, which is across the gun from one flat side to the other.
   *
   * A gun is long, about as deep as a fist, and thin. Naming the long axis and
   * the thin one names the third by elimination, and three axes is a whole
   * orientation rather than one direction — enough to say which way is up
   * without a per-model table.
   */
  thinAxis: Axis;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/**
 * Scale a weapon to a real length, and work out how it is laid out.
 *
 * The long axis IS the barrel. That holds for every gun ever modelled and it
 * saves carrying a per-model orientation table that would rot the moment a
 * model is swapped — which the project expects to happen, since both current
 * weapons are placeholders in the same sense the scavenger is.
 *
 * @param box     the model's measured bounding box, in its own space
 * @param wanted  how long the weapon should actually be, in metres
 */
export function fitHeldItem(box: Box, wanted: number): HeldFit {
  const size: Record<Axis, number> = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  };
  const longest = Math.max(size.x, size.y, size.z);

  // A degenerate box means the model failed to load or has no geometry.
  // Scaling by Infinity puts NaNs through the whole scene graph, and a NaN
  // matrix silently stops a mesh being drawn rather than erroring.
  if (!(longest > 1e-6)) return { scale: 1, longAxis: 'x', muzzleSign: 1, thinAxis: 'z' };

  const longAxis = AXES.find((a) => size[a] === longest) as Axis;
  const rest = AXES.filter((a) => a !== longAxis) as [Axis, Axis];
  const thinAxis = size[rest[0]] <= size[rest[1]] ? rest[0] : rest[1];
  const muzzleSign = Math.abs(box.max[longAxis]) >= Math.abs(box.min[longAxis]) ? 1 : -1;

  return { scale: wanted / longest, longAxis, muzzleSign, thinAxis };
}

const unit = (axis: Axis, sign: number): THREE.Vector3 =>
  new THREE.Vector3(axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0);

/**
 * The frame every weapon is put into before it is put into a hand: +Z out of
 * the muzzle, +Y up through the sights, +X out of the shooter's right.
 *
 * Having one at all is the point. The model's axes are the author's business
 * and the hand's are the rigger's, and with nothing in between, every pairing
 * of the two needs its own hand-tuned Euler — which is how the first attempt
 * ended up with a rifle that suited the player and put the scavenger's through
 * its own leg. One canonical frame turns that N×M problem into N + M.
 */
export function weaponAlign(fit: HeldFit): THREE.Quaternion {
  const barrel = unit(fit.longAxis, fit.muzzleSign);
  const lateral = unit(fit.thinAxis, 1);
  // Right-handed by construction. Taking the cross product rather than picking
  // the remaining axis and guessing its sign is what stops the basis coming
  // out mirrored, which reads as a gun with its sights underneath.
  const up = barrel.clone().cross(lateral);

  // Columns map the canonical frame onto the model's. The weapon needs that
  // journey in the other direction, hence the transpose.
  const basis = new THREE.Matrix4().makeBasis(lateral, up, barrel).transpose();
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

/** The two directions of a fist that matter, in the hand bone's own frame. */
export interface GripAxes {
  /** Wrist to knuckles — the way an extended finger points. */
  fingers: Vec3;
  /** Out of the side of the fist the thumb is on. */
  thumb: Vec3;
}

/**
 * Which way a fist points, read off the finger bones hanging from the wrist.
 *
 * A child bone's local position is its REST offset and nothing else: animation
 * moves a skeleton by rotating bones, never by translating them, so this is
 * the same answer in every frame of every clip. That is what makes it safe to
 * measure once in the constructor — and it is exactly the property that
 * measuring the hand's world rotation did not have.
 *
 * The fallbacks are the ordinary bone convention, down the bone is +Y, for a
 * rig whose hand has no fingers modelled at all. The scavenger is such a rig,
 * and carries no weapon precisely because a scavenger holding a rifle it never
 * fires would be the model contradicting the AI.
 */
export function handGripAxes(children: readonly { name: string; offset: Vec3 }[]): GripAxes {
  const named = (want: string): Vec3 | undefined =>
    children.find((c) => c.name.toLowerCase().includes(want))?.offset;

  const thumb = named('thumb');
  const notThumb = children.filter((c) => !c.name.toLowerCase().includes('thumb'));

  // The middle finger is the axis of the fist. Index is the next best thing,
  // and the mean of whatever knuckles do exist beats a guess.
  let fingers = named('middle') ?? named('index');
  if (!fingers && notThumb.length > 0) {
    const sum = notThumb.reduce(
      (acc, c) => ({ x: acc.x + c.offset.x, y: acc.y + c.offset.y, z: acc.z + c.offset.z }),
      { x: 0, y: 0, z: 0 },
    );
    const n = notThumb.length;
    fingers = { x: sum.x / n, y: sum.y / n, z: sum.z / n };
  }

  return {
    fingers: fingers ?? { x: 0, y: 1, z: 0 },
    thumb: thumb ?? { x: 0, y: 0, z: 1 },
  };
}

/**
 * Where a weapon sits in a fist, as a rotation in the HAND BONE's own frame.
 *
 * Make a finger gun: the barrel goes where the index finger points and the
 * sights go where the thumb points. That is the whole model, and it is worth
 * saying why so little is enough. A pistol grip is gripped like any other rod
 * — it passes through the fist from the thumb side out past the pinky — which
 * pins two degrees of freedom, and those two are precisely the directions
 * named here. The third, the roll about the barrel, is the per-weapon `rotate`
 * in `weapon-models.ts`, and that one is genuinely taste.
 *
 * Because the answer lives in the hand's frame it is a CONSTANT. The gun is
 * never told about the idle clip, the walk cycle, or which way the body faces;
 * it is bolted to the wrist and inherits all of that for nothing. The version
 * this replaced tried instead to hold the weapon level with the BODY, which is
 * not something a hand can do, and the arithmetic that promised it was sampled
 * at the single instant — the bind pose — where the two happen to agree.
 */
export function handGripAlign(axes: GripAxes): THREE.Quaternion {
  const forward = new THREE.Vector3(axes.fingers.x, axes.fingers.y, axes.fingers.z);
  if (forward.lengthSq() < 1e-12) forward.set(0, 1, 0);
  forward.normalize();

  const up = new THREE.Vector3(axes.thumb.x, axes.thumb.y, axes.thumb.z);
  // Only the part of the thumb square to the barrel can mean "up"; the rest of
  // it lies along the barrel and says nothing about roll.
  up.addScaledVector(forward, -up.dot(forward));
  if (up.lengthSq() < 1e-12) {
    // A thumb parallel to the fingers is not a hand, but a rig can still claim
    // one. Any square direction beats a zero-length one, which would make the
    // basis singular and feed NaNs into the scene graph.
    up.copy(Math.abs(forward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
    up.addScaledVector(forward, -up.dot(forward));
  }
  up.normalize();

  const right = up.clone().cross(forward);
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}
