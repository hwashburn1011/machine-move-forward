/**
 * Making the scavenger read as a threat rather than as scenery.
 *
 * The CC0 placeholder is a friendly-looking robot whose dominant colour is
 * `#ca9337` — an amber almost exactly the tone of the dunes it walks in front
 * of. Between that and a silhouette built out of soft boxes, it reads as part
 * of the machine. The player looked straight at one and reported an empty
 * deck.
 *
 * Pure: colour maths only, no Three.js, so the rules are checkable in node.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Perceived brightness, Rec. 709. */
export function luminance(c: Rgb): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** How far each channel is pulled towards neutral before being darkened. */
const DESATURATE = 0.55;

/** What the colour is multiplied down to. */
const DARKEN = 0.42;

/** Warm bias left in, so the result reads as rusted steel rather than plastic. */
const RUST = 0.09;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Recolour a material towards scorched, rusted metal.
 *
 * Darkens rather than recolours outright, so the model keeps the internal
 * contrast that gives it its shape — flattening everything to one hostile
 * colour would cost the silhouette the thing being fixed depends on.
 */
export function hostileTint(c: Rgb): Rgb {
  const l = luminance(c);
  const desaturated = {
    r: c.r + (l - c.r) * DESATURATE,
    g: c.g + (l - c.g) * DESATURATE,
    b: c.b + (l - c.b) * DESATURATE,
  };
  return {
    r: clamp01(desaturated.r * DARKEN + l * RUST),
    g: clamp01(desaturated.g * DARKEN + l * RUST * 0.35),
    b: clamp01(desaturated.b * DARKEN),
  };
}
