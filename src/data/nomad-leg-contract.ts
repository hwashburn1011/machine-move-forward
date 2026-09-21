import profile from './iron-nomad.json';

export interface NomadLegPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Measured v3 leg anchors shared by authored IK, fallback legs and damage.
 *
 * The immutable reference master was built around a 12 x 16 metre core. The
 * v3 art pass expands that core to the profile's 22 x 26 metres and translates
 * every member of a leg by the hip's resulting X/Z delta. Segment lengths and
 * the vertical pose stay unchanged.
 */
const REFERENCE_CORE_HALF_WIDTH = 6;
const REFERENCE_CORE_HALF_LENGTH = 8;
const REFERENCE_GAME_HIP_X = 4.875;
const REFERENCE_GAME_HIP_Z = 4.8;
const REFERENCE_GAME_HIP_Y = 7.9966666667;
const REFERENCE_REPAIR_X = 6.3;

const gameHipX = REFERENCE_GAME_HIP_X * (profile.deckHalfWidth / REFERENCE_CORE_HALF_WIDTH);
const gameHipZ = REFERENCE_GAME_HIP_Z * (profile.deckHalfLength / REFERENCE_CORE_HALF_LENGTH);
const sourceShiftX = (gameHipX - REFERENCE_GAME_HIP_X) / profile.scale[0]!;
const sourceShiftY = (gameHipZ - REFERENCE_GAME_HIP_Z) / profile.scale[2]!;

export const NOMAD_LEG_GAME_ANCHORS = Object.freeze({
  hipAbs: Object.freeze({ x: gameHipX, y: REFERENCE_GAME_HIP_Y, z: gameHipZ }),
  repairAbs: Object.freeze({
    x: gameHipX + (REFERENCE_REPAIR_X - REFERENCE_GAME_HIP_X),
    z: gameHipZ,
  }),
});

/** Blender/source-space positive magnitudes; callers apply leg side/end signs. */
export const NOMAD_LEG_SOURCE_RIG = Object.freeze({
  hipAbs: Object.freeze({ x: 6.5 + sourceShiftX, y: 6 + sourceShiftY, z: 9.6 }),
  kneeAbs: Object.freeze({ x: 8.7 + sourceShiftX, y: 5.1 + sourceShiftY, z: 5.05 }),
  footAbs: Object.freeze({ x: 9.35 + sourceShiftX, y: 8 + sourceShiftY, z: 1 }),
});

export function nomadLegGameHip(side: -1 | 1, end: -1 | 1): NomadLegPoint {
  const hip = NOMAD_LEG_GAME_ANCHORS.hipAbs;
  return { x: side * hip.x, y: hip.y, z: end * hip.z };
}

/** `xSign`/`ySign` are signs in the Blender source frame used by authored IK. */
export function nomadLegSourceRig(xSign: -1 | 1, ySign: -1 | 1) {
  const signed = (point: Readonly<NomadLegPoint>): NomadLegPoint => ({
    x: xSign * point.x,
    y: ySign * point.y,
    z: point.z,
  });
  return {
    hip: signed(NOMAD_LEG_SOURCE_RIG.hipAbs),
    knee: signed(NOMAD_LEG_SOURCE_RIG.kneeAbs),
    foot: signed(NOMAD_LEG_SOURCE_RIG.footAbs),
  };
}
