import type { EnemyAIState } from './EnemyAI';

/**
 * How an enemy looks.
 *
 * Only the pure parts so far: which clip a state should play, and how to sit a
 * model inside the collider. Both are free of Three.js and Rapier so the rules
 * are testable in node, matching `EnemyAI` and `BuildValidation`.
 *
 * The class that consumes them arrives with the model wiring.
 */

/**
 * Clip names to try for each AI state, best first.
 *
 * Ordered rather than exact because clip names vary between packs, and a pack
 * missing one should degrade to a worse-matching clip rather than freeze. A
 * pursuing enemy with no Run clip should walk, not stand still while sprinting
 * at you.
 */
const CLIP_PREFERENCES: Record<EnemyAIState, readonly string[]> = {
  idle: ['idle'],
  navigate: ['walk', 'run'],
  pursue: ['run', 'walk'],
  attack: ['attack', 'punch', 'hit'],
  dead: ['death', 'die'],
};

/**
 * The clip to play for a state, or null when the model has none at all.
 *
 * Matches on substring and ignores case: real packs ship names like
 * `Armature|CharacterArmature_Walk`, and an exact match would find nothing.
 */
export function resolveClip(names: readonly string[], state: EnemyAIState): string | null {
  if (names.length === 0) return null;

  for (const wanted of CLIP_PREFERENCES[state]) {
    const found = names.find((name) => name.toLowerCase().includes(wanted));
    if (found) return found;
  }

  // Something is better than a character frozen in its bind pose.
  return names[0] ?? null;
}

export interface CapsuleFit {
  /** Uniform scale to apply to the model. */
  scale: number;
  /** Local Y offset that puts the model's feet on the capsule's base. */
  yOffset: number;
}

/**
 * Scale and lift a model so it fills the collider and stands on its feet.
 *
 * Derived from the capsule rather than hard-coded, so the drawn character and
 * the solid one cannot drift apart — a mismatch between what is drawn and what
 * is solid is the class of bug that put enemies inside the prow.
 */
export function fitToCapsule(
  modelHeight: number,
  modelMinY: number,
  capsuleHeight: number,
): CapsuleFit {
  // A zero-height model means a failed import. Returning Infinity here would
  // poison every transform downstream, so refuse to scale instead.
  const scale = modelHeight > 1e-6 ? capsuleHeight / modelHeight : 1;
  return { scale, yOffset: -modelMinY * scale };
}
