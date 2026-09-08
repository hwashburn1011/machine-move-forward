import * as THREE from 'three';

/**
 * The single source of truth for colour in the game.
 *
 * Art direction (handoff section 41): Raft readability + SAND industrial
 * desert. Stylised, warm, strong silhouettes, readable forms.
 *
 * The load-bearing idea here is the colour-temperature split: lit surfaces run
 * warm ochre, shadowed surfaces run cool violet. That split — not detail, not
 * texture resolution — is most of what makes a desert render read as genuinely
 * sunlit rather than flat.
 */

// Color(hex) already converts sRGB into Three's linear working space. Converting
// again crushes midtones in the steel, sand and sky before lighting even begins.
const c = (hex: number) => new THREE.Color(hex);

export const PALETTE = Object.freeze({
  // --- Sand -----------------------------------------------------------------
  /** Full sun on an open dune face. */
  sandLit: c(0xd9a463),
  /** The shaded side of a dune — cool, not merely darker. */
  sandShadow: c(0x7d6248),
  /** Deep trough between dunes, warmest and darkest. */
  sandDeep: c(0x5a4130),
  /** Wind-scoured crest, lighter and desaturated. */
  sandCrest: c(0xe8c493),

  // --- Sky ------------------------------------------------------------------
  skyZenith: c(0x2f6ea8),
  skyHorizon: c(0xe2b183),
  skyDust: c(0xdaa06a),
  sunDisc: c(0xfff4d6),

  // --- Light ----------------------------------------------------------------
  /** Direct sun colour. Hot, slightly gold. */
  sunLight: c(0xffe3b0),
  /** Bounce from the sand back up onto the machine's underside. */
  bounceLight: c(0xc08a52),
  /** Sky fill from above. Cool, which is what sells the temperature split. */
  skyFill: c(0x6f8fb5),

  // --- Machine --------------------------------------------------------------
  /** Main hull paint — desaturated industrial green-grey. */
  hullPaint: c(0x8f9478),
  /** Shadowed structural members and chassis. */
  hullDark: c(0x565a4b),
  rust: c(0xa85c2e),
  steel: c(0x9ba0a3),
  /** Deck plating, walked on and worn. */
  deckPlate: c(0x9a9488),
  /** Player-built plating — lighter, so additions read as newer than the hull. */
  buildPlate: c(0xb6b1a2),

  // --- Accents --------------------------------------------------------------
  /** Focal point colour. Used sparingly — hazard stripes, warning lights. */
  accentOrange: c(0xe07a2f),
  accentTeal: c(0x3f9e94),
  hazard: c(0xd8b13a),

  // --- UI -------------------------------------------------------------------
  uiAmber: c(0xd8a05a),
  uiDanger: c(0xd6483b),
} as const);

export type PaletteKey = keyof typeof PALETTE;

/** sRGB hex strings for DOM/UI use, where the browser handles colour space. */
export const CSS_COLORS = Object.freeze({
  uiAmber: '#d8a05a',
  uiDanger: '#d6483b',
  uiPanel: 'rgba(14, 11, 8, 0.72)',
  uiPanelEdge: 'rgba(216, 160, 90, 0.28)',
  uiText: '#e8d5b8',
  uiTextDim: '#9a8569',
} as const);
