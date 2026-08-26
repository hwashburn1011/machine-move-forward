import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bevelledBox } from '@/machine/MachineGeometry';
import type { Materials } from '@/art/Materials';
import type { PieceId } from '@/data/build-pieces';
import {
  CHARACTER_SKIN,
  GRID_TILE,
  LEVEL_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '@/game/constants';
import {
  CAPSULE_HALF_HEIGHT as ENEMY_CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS as ENEMY_CAPSULE_RADIUS,
} from '@/enemies/EnemyMesh';

/**
 * Code-built geometry for the six build pieces.
 *
 * Everything reuses `bevelledBox`, which is what keeps player-built structures
 * looking manufactured and consistent with the machine rather than reading as
 * a different, blockier art style bolted on.
 *
 * All geometry is authored around the cell or edge origin at the FLOOR plane,
 * so placement is a single translate with no per-piece offset bookkeeping.
 */

const T = GRID_TILE;
const WALL_THICKNESS = 0.16;
const WALL_HEIGHT = LEVEL_HEIGHT - 0.18;
const DOOR_OPENING_WIDTH = 1.1;

/**
 * Half-thickness of a built floor plate, and the height of its walking
 * surface above the level's floor plane.
 *
 * Named because the doorway has to subtract it. Geometry here is authored
 * around the floor PLANE, but a body stands on the PLATE, which is this much
 * higher.
 */
const FLOOR_PLATE_HALF = 0.08;
const FLOOR_PLATE_TOP = FLOOR_PLATE_HALF * 2;

/**
 * The tallest body that has to fit through a doorway, skin included.
 *
 * The character controller keeps `CHARACTER_SKIN` of clearance around the
 * capsule, so the space a body needs is its own height plus that gap at both
 * ends. Measuring the capsule alone is what made the old opening look
 * adequate when it was not.
 */
const TALLEST_BODY =
  2 *
    Math.max(
      PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS,
      ENEMY_CAPSULE_HALF_HEIGHT + ENEMY_CAPSULE_RADIUS,
    ) +
  2 * CHARACTER_SKIN;

/**
 * Headroom above the tallest body. Touching is not passing.
 *
 * The controller needs room to resolve a contact; a body that clears the
 * lintel by a millimetre catches on it the instant autostep lifts it onto a
 * plate, which is exactly the freeze this constant exists to prevent.
 */
const DOOR_HEAD_CLEARANCE = 0.15;

/**
 * Opening height, measured from the floor PLANE so it can be used directly as
 * a collider offset — but derived from the PLATE, because that is what a body
 * stands on.
 *
 * Previously a flat 2.1, which left 1.94 of real headroom once the plate took
 * its 0.16. Against a 1.92 capsule plus 0.04 of skin that was a 2mm interference,
 * and every character — player and enemy alike — jammed under the lintel and
 * stopped dead. Deriving it means the relationship cannot drift again if the
 * plate or either capsule changes.
 */
const DOOR_OPENING_HEIGHT = FLOOR_PLATE_TOP + TALLEST_BODY + DOOR_HEAD_CLEARANCE;

export interface ColliderSpec {
  half: THREE.Vector3;
  offset: THREE.Vector3;
  /** Rotation about X, for the stair ramp. */
  rotX?: number;
}

/** Merge parts, disposing the inputs. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('BuildPieceGeometry: merge failed');
  return merged;
}

/**
 * Merge one geometry per material, then merge those WITH groups.
 *
 * Two passes rather than one: `mergeGeometries(parts, true)` emits a group per
 * input part, so a one-pass merge of nine boxes would need nine materials.
 * Collapsing each material's parts first gives exactly one group per material.
 */
function grouped(groups: THREE.BufferGeometry[][]): THREE.BufferGeometry {
  const perMaterial = groups.map((parts) => merge(parts));
  const out = BufferGeometryUtils.mergeGeometries(perMaterial, true);
  for (const g of perMaterial) g.dispose();
  if (!out) throw new Error('BuildPieceGeometry: grouped merge failed');
  return out;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  return geo;
}

function floorGeometry(): THREE.BufferGeometry {
  // Slightly under a full tile so neighbouring plates show a seam, which gives
  // the deck a readable physical scale to walk across.
  return at(bevelledBox(T * 0.99, 0.16, T * 0.99, 0.035), 0, 0.08, 0);
}

function roofGeometry(): THREE.BufferGeometry {
  const panel = at(bevelledBox(T * 0.99, 0.14, T * 0.99, 0.03), 0, LEVEL_HEIGHT - 0.07, 0);
  // A pair of ribs so a roof reads as a panel rather than a flat lid.
  const ribs = [-0.45, 0.45].map((offset) =>
    at(bevelledBox(T * 0.94, 0.1, 0.13, 0.02), 0, LEVEL_HEIGHT - 0.19, offset * T * 0.5),
  );
  return merge([panel, ...ribs]);
}

function wallGeometry(): THREE.BufferGeometry {
  const frame = at(bevelledBox(T, WALL_HEIGHT, WALL_THICKNESS, 0.05), 0, WALL_HEIGHT / 2, 0);
  // Recessed centre panel: a flat slab reads as a placeholder, a panelled one
  // reads as fabricated plate.
  const inset = at(
    bevelledBox(T * 0.7, WALL_HEIGHT * 0.62, WALL_THICKNESS * 1.35, 0.03),
    0,
    WALL_HEIGHT * 0.52,
    0,
  );
  return merge([frame, inset]);
}

function doorwayGeometry(): THREE.BufferGeometry {
  const jambWidth = (T - DOOR_OPENING_WIDTH) / 2;
  const parts: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    parts.push(
      at(
        bevelledBox(jambWidth, WALL_HEIGHT, WALL_THICKNESS, 0.05),
        side * (DOOR_OPENING_WIDTH + jambWidth) / 2,
        WALL_HEIGHT / 2,
        0,
      ),
    );
  }

  // Lintel above the opening.
  const lintelHeight = WALL_HEIGHT - DOOR_OPENING_HEIGHT;
  parts.push(
    at(
      bevelledBox(DOOR_OPENING_WIDTH, lintelHeight, WALL_THICKNESS, 0.04),
      0,
      DOOR_OPENING_HEIGHT + lintelHeight / 2,
      0,
    ),
  );

  return merge(parts);
}

function railingGeometry(): THREE.BufferGeometry {
  const height = 1.05;
  const parts: THREE.BufferGeometry[] = [
    at(bevelledBox(T, 0.08, 0.08, 0.02), 0, height, 0),
    at(bevelledBox(T * 0.96, 0.05, 0.05, 0.015), 0, height * 0.55, 0),
  ];
  for (const x of [-0.46, -0.15, 0.15, 0.46]) {
    parts.push(at(bevelledBox(0.07, height, 0.07, 0.02), x * T, height / 2, 0));
  }
  return merge(parts);
}

const STAIR_STEPS = 12;

/**
 * A flight rising one level over two tiles.
 *
 * **It climbs toward -Z, which is the direction `rotationDelta(0)` points**,
 * and getting that wrong is what made this piece unusable since it was
 * written. The cells and the geometry each had a notion of "up the stairs" and
 * they were opposites: `stairsCells` put the run and the landing at -Z while
 * the flight rose toward +Z, so the staircase was built back to front. Walking
 * into the base cell you met the TOP of the flight, three metres of it, and
 * the thing that stopped you was the ramp's underside — measured, a contact
 * normal of (0, -0.8, 0.6), which is a diagnosis nobody could act on because
 * the reversal is not visible from either side alone.
 *
 * So the sign here is not a taste choice and must not be "tidied": it is
 * pinned to `rotationDelta` by `stairsclimb.test.ts`.
 */
function stairsGeometry(): THREE.BufferGeometry {
  const run = T * 2;
  const rise = LEVEL_HEIGHT;
  const stepRun = run / STAIR_STEPS;
  const stepRise = rise / STAIR_STEPS;

  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < STAIR_STEPS; i++) {
    const tread = bevelledBox(T * 0.9, stepRise + 0.04, stepRun * 1.02, 0.02);
    parts.push(
      at(tread, 0, stepRise * (i + 0.5), run / 2 - stepRun * (i + 0.5)),
    );
  }

  // Stringers down both sides, so the flight reads as a built object.
  for (const side of [-1, 1]) {
    const stringer = bevelledBox(0.12, 0.34, run * 1.02, 0.03);
    stringer.rotateX(Math.atan2(rise, run));
    parts.push(at(stringer, side * T * 0.46, rise / 2, 0));
  }

  return merge(parts);
}

/** A ribbed cargo box with a lid seam and one accent stripe. */
function crateGeometry(): THREE.BufferGeometry {
  const w = 1.4;
  const h = 1.1;

  const body: THREE.BufferGeometry[] = [at(bevelledBox(w, h, w, 0.06), 0, h / 2, 0)];
  // Corner ribs, so it reads as a made object rather than a cube.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.push(at(bevelledBox(0.1, h, 0.1, 0.02), sx * w * 0.46, h / 2, sz * w * 0.46));
    }
  }

  // Proud of the body by a couple of centimetres so the trim never z-fights.
  const trim: THREE.BufferGeometry[] = [
    at(bevelledBox(w * 1.02, 0.07, w * 1.02, 0.02), 0, h - 0.12, 0),
    at(bevelledBox(w * 1.03, 0.13, w * 1.03, 0.02), 0, h * 0.42, 0),
  ];

  return grouped([body, trim]);
}

/** Waist-high bench with a tool rack panel behind it. */
function workbenchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    at(bevelledBox(1.8, 0.14, 0.9, 0.04), 0, 0.95, 0),
    at(bevelledBox(1.7, 0.6, 0.12, 0.03), 0, 1.45, -0.4),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(at(bevelledBox(0.12, 0.9, 0.12, 0.02), sx * 0.78, 0.45, sz * 0.36));
    }
  }
  return merge(parts);
}

/** Tall tank with pipes and a lit indicator — machinery, not furniture. */
function refineryGeometry(): THREE.BufferGeometry {
  const shell: THREE.BufferGeometry[] = [
    at(bevelledBox(1.3, 1.9, 1.3, 0.08), 0, 0.95, 0),
    at(bevelledBox(1.5, 0.18, 1.5, 0.04), 0, 0.12, 0),
  ];
  // Boxed rather than cylindrical: bevelledBox is extruded and so non-indexed,
  // and mergeGeometries refuses to mix indexed and non-indexed inputs.
  for (const dx of [-0.4, 0.4]) {
    shell.push(at(bevelledBox(0.22, 1.0, 0.22, 0.05), dx, 2.35, 0.2));
  }

  // The one lit element on the deck at night, and the cue that tells a crate
  // and a refinery apart at a glance.
  const indicator: THREE.BufferGeometry[] = [
    at(bevelledBox(0.34, 0.14, 0.06, 0.02), 0, 1.58, 0.67),
  ];

  return grouped([shell, indicator]);
}

/**
 * A squat engine block with a radiator, an exhaust and a lit status panel.
 *
 * Lower and wider than the refinery so the two never read as the same object
 * across a deck — the refinery is a tall tank, this is a machine you crouch at.
 */
function generatorGeometry(): THREE.BufferGeometry {
  const w = 1.6;
  const h = 1.15;

  const shell: THREE.BufferGeometry[] = [
    at(bevelledBox(w, h, w * 0.85, 0.07), 0, h / 2, 0),
    at(bevelledBox(w * 1.05, 0.16, w * 0.92, 0.04), 0, 0.1, 0),
    // Radiator fins across the back.
    ...[-0.3, 0, 0.3].map((offset) =>
      at(bevelledBox(w * 0.9, 0.5, 0.09, 0.02), 0, h * 0.6, -w * 0.44 + offset * 0.02),
    ),
  ];
  // Exhaust stack, offset so the silhouette is not symmetrical.
  shell.push(at(bevelledBox(0.2, 0.85, 0.2, 0.04), w * 0.3, h + 0.42, -w * 0.2));

  // The status panel: the cue that tells a generator from a crate at a glance,
  // and the one the emissive material makes glow while it is running.
  const panel: THREE.BufferGeometry[] = [
    at(bevelledBox(0.42, 0.16, 0.06, 0.02), -0.2, h * 0.72, w * 0.44),
  ];

  return grouped([shell, panel]);
}

/**
 * A bracket and a shaded head, authored around the EDGE plane.
 *
 * It straddles the wall rather than facing one way, and that is a decision
 * rather than an omission: an edge carries no facing — `transformFor` gives it
 * only the axis it lies along — so a one-sided lamp would face a coin-flip
 * direction and light the sand half the time. Straddling reads as a fitting
 * that lights the corridor on both sides, which is what a bulkhead lamp does.
 */
function lampGeometry(): THREE.BufferGeometry {
  // High on the wall: below head height it would be in the player's face in a
  // 2m-wide corridor, and above the lintel it would be inside the roof.
  const y = WALL_HEIGHT - 0.62;

  const bracket: THREE.BufferGeometry[] = [
    at(bevelledBox(0.5, 0.1, 0.1, 0.02), 0, y + 0.26, 0),
    at(bevelledBox(0.12, 0.3, 0.1, 0.02), 0, y + 0.12, 0),
    // Hood, so the head reads as a fitting rather than a floating brick.
    at(bevelledBox(0.56, 0.08, 0.34, 0.02), 0, y + 0.02, 0),
  ];

  const head: THREE.BufferGeometry[] = [at(bevelledBox(0.44, 0.16, 0.26, 0.03), 0, y - 0.08, 0)];

  return grouped([bracket, head]);
}

/**
 * A squat range with a hob and a flue, and one hot plate that glows.
 *
 * Waist-high like the workbench rather than tall like the refinery, because
 * the two stand next to each other in every kitchen a player will build and
 * the pair has to read as a counter rather than as two towers.
 */
function stoveGeometry(): THREE.BufferGeometry {
  const w = 1.5;
  const h = 0.95;

  const shell: THREE.BufferGeometry[] = [
    at(bevelledBox(w, h, w * 0.8, 0.06), 0, h / 2, 0),
    at(bevelledBox(w * 1.04, 0.14, w * 0.86, 0.03), 0, h + 0.05, 0),
    // Flue, up the back corner, so the silhouette is not a plain box.
    at(bevelledBox(0.17, 0.9, 0.17, 0.03), w * 0.34, h + 0.55, -w * 0.28),
  ];
  for (const sx of [-1, 1]) {
    shell.push(at(bevelledBox(0.1, h * 0.9, 0.1, 0.02), sx * w * 0.44, h * 0.45, w * 0.36));
  }

  // The hot plate. The one lit element, and the cue that tells a stove from a
  // workbench across a dark room.
  const hob: THREE.BufferGeometry[] = [
    at(bevelledBox(0.42, 0.05, 0.42, 0.02), -0.28, h + 0.14, 0.06),
  ];

  return grouped([shell, hob]);
}

const BUILDERS: Record<PieceId, () => THREE.BufferGeometry> = {
  stove: stoveGeometry,
  crate: crateGeometry,
  workbench: workbenchGeometry,
  refinery: refineryGeometry,
  generator: generatorGeometry,
  lamp: lampGeometry,
  floor: floorGeometry,
  wall: wallGeometry,
  doorway: doorwayGeometry,
  railing: railingGeometry,
  roof: roofGeometry,
  stairs: stairsGeometry,
};

const cache = new Map<PieceId, THREE.BufferGeometry>();

/** Shared geometry per piece type. Never dispose these; use `disposeGeometryCache`. */
export function buildPieceGeometry(piece: PieceId): THREE.BufferGeometry {
  let geo = cache.get(piece);
  if (!geo) {
    geo = BUILDERS[piece]();
    cache.set(piece, geo);
  }
  return geo;
}

export function disposeGeometryCache(): void {
  for (const geo of cache.values()) geo.dispose();
  cache.clear();
}

/**
 * Material for a piece. Stations return an array: their geometry carries one
 * group per material, so the trim and the indicator can differ from the shell.
 */
export function pieceMaterial(
  piece: PieceId,
  materials: Materials,
): THREE.Material | THREE.Material[] {
  switch (piece) {
    case 'crate':
      return [materials.rustedSteel, materials.accent];
    case 'workbench':
      return materials.stationMetal;
    case 'refinery':
      return [materials.stationMetal, materials.emissiveWarn];
    case 'generator':
      return [materials.stationMetal, materials.emissiveWarn];
    case 'stove':
      return [materials.stationMetal, materials.emissiveWarn];
    // The glow is group 1 by the same convention, and `BuildSystem` CLONES it
    // per lamp: the shared material is one object, and a lamp that shed power
    // would otherwise darken every other lamp on the machine with it.
    case 'lamp':
      return [materials.bareSteel, materials.emissiveWarn];
    case 'floor':
      return materials.buildPlate;
    case 'roof':
      return materials.hull;
    case 'wall':
    case 'doorway':
      return materials.hull;
    case 'railing':
      return materials.bareSteel;
    case 'stairs':
      return materials.buildPlate;
  }
}

/**
 * Physics shapes, in the same local space as the geometry.
 *
 * The doorway deliberately has no collider across its opening, and the stairs
 * use a single smooth ramp rather than per-step boxes — stepped colliders make
 * a kinematic character controller judder and catch on every tread.
 */
export function pieceColliders(piece: PieceId): ColliderSpec[] {
  switch (piece) {
    case 'crate':
      return [
        { half: new THREE.Vector3(0.7, 0.55, 0.7), offset: new THREE.Vector3(0, 0.55, 0) },
      ];
    case 'workbench':
      return [
        { half: new THREE.Vector3(0.9, 0.51, 0.45), offset: new THREE.Vector3(0, 0.51, 0) },
      ];
    case 'refinery':
      return [
        { half: new THREE.Vector3(0.75, 0.95, 0.75), offset: new THREE.Vector3(0, 0.95, 0) },
      ];

    case 'generator':
      return [
        { half: new THREE.Vector3(0.85, 0.65, 0.72), offset: new THREE.Vector3(0, 0.65, 0) },
      ];

    case 'stove':
      return [
        { half: new THREE.Vector3(0.79, 0.55, 0.62), offset: new THREE.Vector3(0, 0.55, 0) },
      ];

    // None, deliberately. A lamp is a fitting on a wall that already has a
    // collider; giving it one of its own would put a shin-catcher in the
    // doorway it lights, and a body can no more walk into it than into the
    // wall it hangs on.
    case 'lamp':
      return [];
    case 'floor':
      return [
        {
          half: new THREE.Vector3(T / 2, FLOOR_PLATE_HALF, T / 2),
          offset: new THREE.Vector3(0, FLOOR_PLATE_HALF, 0),
        },
      ];

    case 'roof':
      return [
        {
          half: new THREE.Vector3(T / 2, 0.07, T / 2),
          offset: new THREE.Vector3(0, LEVEL_HEIGHT - 0.07, 0),
        },
      ];

    case 'wall':
      return [
        {
          half: new THREE.Vector3(T / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
          offset: new THREE.Vector3(0, WALL_HEIGHT / 2, 0),
        },
      ];

    case 'doorway': {
      const jambWidth = (T - DOOR_OPENING_WIDTH) / 2;
      const lintelHeight = WALL_HEIGHT - DOOR_OPENING_HEIGHT;
      return [
        {
          half: new THREE.Vector3(jambWidth / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
          offset: new THREE.Vector3(-(DOOR_OPENING_WIDTH + jambWidth) / 2, WALL_HEIGHT / 2, 0),
        },
        {
          half: new THREE.Vector3(jambWidth / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2),
          offset: new THREE.Vector3((DOOR_OPENING_WIDTH + jambWidth) / 2, WALL_HEIGHT / 2, 0),
        },
        {
          half: new THREE.Vector3(DOOR_OPENING_WIDTH / 2, lintelHeight / 2, WALL_THICKNESS / 2),
          offset: new THREE.Vector3(0, DOOR_OPENING_HEIGHT + lintelHeight / 2, 0),
        },
      ];
    }

    case 'railing':
      return [
        {
          half: new THREE.Vector3(T / 2, 0.55, 0.06),
          offset: new THREE.Vector3(0, 0.55, 0),
        },
      ];

    case 'stairs': {
      const run = T * 2;
      const rise = LEVEL_HEIGHT;
      const slope = Math.atan2(rise, run);
      const length = Math.hypot(run, rise);
      return [
        {
          half: new THREE.Vector3(T * 0.48, 0.12, length / 2),
          offset: new THREE.Vector3(0, rise / 2, 0),
          // Positive, so the slab climbs toward -Z with the treads above it.
          // A smooth slab rather than one box per tread, for the reason the
          // machine's own stair gives: stepped colliders make a kinematic
          // character controller judder and catch on every tread.
          rotX: slope,
        },
      ];
    }
  }
}
