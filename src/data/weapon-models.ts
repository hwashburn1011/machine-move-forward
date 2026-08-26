/**
 * Where each weapon's file is, how big it really is, and how it sits in a fist.
 *
 * Data only, and deliberately the one place a person would go to argue about
 * any of it — the same job `data/gait.ts` does for the walk. Getting a weapon
 * to sit convincingly in an animated hand is taste plus a screenshot, not a
 * derivation, so the numbers want to be somewhere obvious rather than buried
 * in the class that applies them.
 *
 * The length is a real-world one and the model is scaled to it (see
 * `fitHeldItem`); an author's own scale is a fact about their file rather than
 * about this game.
 */
export interface WeaponModelDefinition {
  /** Path under `public/`. */
  url: string;
  /** How long the weapon should be on screen, in metres, muzzle to butt. */
  length: number;
  /**
   * Where the model's origin sits relative to the hand, in metres, after
   * scaling.
   *
   * In the CANONICAL WEAPON FRAME, which is the point of having one: +Z runs
   * out of the muzzle, +Y up through the sights, +X out of the weapon's right.
   * A rod held in a fist has its axis a few centimetres out from the wrist
   * bone at the centre of the wrist, which is what the x here is: the seat of
   * the palm, not a fudge to keep the barrel off the thigh.
   *
   * Taste, and it wants a screenshot rather than a derivation — hence living
   * in a data file next to the length rather than inside `PlayerVisual`.
   */
  grip: { x: number; y: number; z: number };
  /**
   * Extra rotation in the fist, radians, applied after the weapon is aligned.
   *
   * Gripping pins every axis but one: the roll about the barrel, which a
   * bounding box cannot measure because it cannot tell a magazine from a
   * carrying handle. That roll is `z`, and it is the only number here anyone
   * should normally need to touch.
   */
  rotate: { x: number; y: number; z: number };
}

export const WEAPON_MODELS: Record<string, WeaponModelDefinition> = {
  rifle: {
    url: 'models/weapons/rifle.glb',
    // An AK-pattern rifle is about 880mm. The definition calls it a Scrapline
    // AR; the model is a wood-furniture Kalashnikov, which is what a machine
    // crew scavenging a desert would plausibly still have working.
    length: 0.88,
    grip: { x: -0.05, y: 0, z: 0 },
    rotate: { x: 0, y: 0, z: 0 },
  },
  shotgun: {
    // Pump-action, wooden stock. Shorter and fatter than the rifle, which is
    // the whole point of having two: they have to be told apart at a glance
    // over the player's shoulder, at the only angle the game ever shows them.
    url: 'models/weapons/shotgun.glb',
    length: 0.95,
    grip: { x: -0.05, y: 0, z: 0 },
    rotate: { x: 0, y: 0, z: 0 },
  },
};

/**
 * What a scavenger carries.
 *
 * Not a gun, and that is a design decision rather than an omission: the
 * scavenger's attack range is 2.2m and the clip it plays is `Punch`. Handing it
 * a rifle it never fires would be the model contradicting the AI, which is
 * worse than an empty hand — the player would read a ranged threat, take cover
 * from it, and be punched.
 */
export const ENEMY_HELD: WeaponModelDefinition | null = null;
