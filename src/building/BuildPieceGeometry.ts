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

function nonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (out !== geo) geo.dispose();
  return out;
}

function tubeBetween(points: THREE.Vector3[], radius: number, segments = 12): THREE.BufferGeometry {
  return nonIndexed(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 8, false),
  );
}

function gaugeFace(x: number, y: number, z: number, radius = 0.14): THREE.BufferGeometry {
  const bezel = new THREE.TorusGeometry(radius, 0.025, 8, 20);
  bezel.rotateX(Math.PI / 2);
  bezel.translate(x, y, z);
  return nonIndexed(bezel);
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
        (side * (DOOR_OPENING_WIDTH + jambWidth)) / 2,
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
    parts.push(at(tread, 0, stepRise * (i + 0.5), run / 2 - stepRun * (i + 0.5)));
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
    // Hinges and a central latch are small, but give the storage piece a
    // readable opening edge at the camera's normal gameplay distance.
    at(bevelledBox(0.18, 0.06, 0.08, 0.015), -0.38, h + 0.04, -0.44),
    at(bevelledBox(0.18, 0.06, 0.08, 0.015), 0.38, h + 0.04, -0.44),
    at(bevelledBox(0.14, 0.16, 0.08, 0.018), 0, h * 0.58, -0.73),
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
  // Two recessed drawers and a real vise silhouette make this read as a
  // working station rather than a waist-high crate.
  for (const x of [-0.48, 0.48]) {
    parts.push(at(bevelledBox(0.62, 0.24, 0.045, 0.015), x, 0.66, -0.47));
    parts.push(at(bevelledBox(0.17, 0.035, 0.05, 0.01), x, 0.66, -0.5));
  }
  parts.push(at(bevelledBox(0.34, 0.14, 0.25, 0.025), 0.48, 1.08, -0.18));
  parts.push(at(bevelledBox(0.42, 0.05, 0.3, 0.015), 0.48, 1.18, -0.18));
  for (const x of [-0.58, -0.38, -0.18]) {
    parts.push(at(bevelledBox(0.045, 0.16, 0.045, 0.008), x, 1.08, 0.1));
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

  // Curved vessel bands and a transfer pipe break up the tall silhouette.
  for (const y of [0.45, 1.1, 1.75]) {
    shell.push(nonIndexed(new THREE.TorusGeometry(0.67, 0.035, 8, 24)).translate(0, y, 0));
  }
  shell.push(
    tubeBetween(
      [
        new THREE.Vector3(0.52, 1.95, 0.35),
        new THREE.Vector3(0.83, 2.25, 0.28),
        new THREE.Vector3(0.83, 2.65, 0.15),
      ],
      0.055,
    ),
  );
  shell.push(nonIndexed(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16)).translate(0, 2.95, 0));

  // The one lit element on the deck at night, and the cue that tells a crate
  // and a refinery apart at a glance.
  const indicator: THREE.BufferGeometry[] = [
    at(bevelledBox(0.34, 0.14, 0.06, 0.02), 0, 1.58, 0.67),
    gaugeFace(0.32, 1.38, 0.67, 0.14),
    at(bevelledBox(0.018, 0.1, 0.012, 0.004), 0.32, 1.38, 0.67),
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
    ...[-0.32, -0.16, 0, 0.16, 0.32].map((offset) =>
      at(bevelledBox(0.07, 0.54, w * 0.82, 0.018), offset, h * 0.62, -w * 0.44),
    ),
  ];
  // Exhaust stack, offset so the silhouette is not symmetrical.
  shell.push(at(bevelledBox(0.2, 0.85, 0.2, 0.04), w * 0.3, h + 0.42, -w * 0.2));
  shell.push(
    tubeBetween(
      [
        new THREE.Vector3(-0.5, 0.52, 0.52),
        new THREE.Vector3(-0.78, 0.72, 0.72),
        new THREE.Vector3(-0.78, 1.34, 0.72),
      ],
      0.045,
    ),
  );
  shell.push(nonIndexed(new THREE.TorusGeometry(0.22, 0.025, 8, 20)).translate(0, 0.1, 0));

  // The status panel: the cue that tells a generator from a crate at a glance,
  // and the one the emissive material makes glow while it is running.
  const panel: THREE.BufferGeometry[] = [
    at(bevelledBox(0.42, 0.16, 0.06, 0.02), -0.2, h * 0.72, w * 0.44),
    gaugeFace(0.22, h * 0.72, w * 0.48, 0.13),
    at(bevelledBox(0.016, 0.09, 0.012, 0.004), 0.22, h * 0.72, w * 0.48),
    at(bevelledBox(0.48, 0.035, 0.08, 0.01), 0, h * 0.93, w * 0.45),
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

  // Rimmed diffuser and a recessed inner glass face. The second material group
  // remains the existing emissive slot used by pieceMaterial('lamp').
  head.push(at(bevelledBox(0.3, 0.08, 0.18, 0.025), 0, y - 0.18, 0));

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

/**
 * A finned tower with a catch tray and a running light.
 *
 * Tall and narrow where the stove is low and wide, so the kitchen corner of a
 * deck reads as three distinct objects rather than three grey boxes: the
 * refinery is a tank, the stove is a counter, this is a chimney.
 */
function condenserGeometry(): THREE.BufferGeometry {
  const shell: THREE.BufferGeometry[] = [
    at(bevelledBox(0.9, 1.7, 0.9, 0.07), 0, 1.0, 0),
    // The tray it drips into, at knee height, proud of the column.
    at(bevelledBox(1.25, 0.16, 1.25, 0.04), 0, 0.14, 0),
    at(bevelledBox(1.1, 0.1, 1.1, 0.03), 0, 0.34, 0),
  ];
  // Condensing fins up the column. The reason it is not a plain post.
  for (const y of [0.75, 1.05, 1.35, 1.65]) {
    shell.push(at(bevelledBox(1.16, 0.07, 1.16, 0.02), 0, y, 0));
  }

  const indicator: THREE.BufferGeometry[] = [at(bevelledBox(0.2, 0.1, 0.06, 0.02), 0, 1.92, 0.44)];

  return grouped([shell, indicator]);
}

/**
 * A shin-high trough of soil with a rail round it and shoots inside.
 *
 * The only build piece that is deliberately SHORT. A player standing among
 * three of them should be able to see over the whole garden, which is most of
 * what makes a planted deck read as a place rather than as storage.
 */
function planterGeometry(): THREE.BufferGeometry {
  const w = 1.6;
  const h = 0.5;

  const box: THREE.BufferGeometry[] = [
    at(bevelledBox(w, h, w * 0.8, 0.05), 0, h / 2, 0),
    at(bevelledBox(w * 1.05, 0.09, w * 0.85, 0.03), 0, h, 0),
  ];
  for (const sx of [-1, 1]) {
    box.push(at(bevelledBox(0.1, h * 1.1, 0.1, 0.02), sx * w * 0.47, h * 0.55, w * 0.37));
  }

  // The crop. Small upright slabs rather than modelled leaves: at this size a
  // few green rectangles read as planting and anything more reads as clutter.
  const crop: THREE.BufferGeometry[] = [];
  for (const dx of [-0.42, 0, 0.42]) {
    for (const dz of [-0.22, 0.22]) {
      crop.push(at(bevelledBox(0.16, 0.34, 0.06, 0.02), dx, h + 0.17, dz));
    }
  }

  return grouped([box, crop]);
}

// ---------------------------------------------------------------------------
// Decoration
// ---------------------------------------------------------------------------
//
// The four pieces that get NO COLLIDER, which is what makes them the safe
// place for a downloaded model. Everything below is a procedural fallback in
// the sense `ASSETS.md` means it: a crude, honest shape at the right scale,
// used when no furniture pack is installed and replaced without touching
// placement, saving, or refunds — see `decorModelUrl`.
//
// Authored small on purpose. A 2m cell holding a 2m table reads as a floor
// tile with a lid; furniture has to leave room to walk round it, and decor is
// the only thing on this deck that a body walks THROUGH.

/** A seat, a back and four legs, facing -Z like every other rotatable piece. */
function chairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    at(bevelledBox(0.52, 0.07, 0.5, 0.02), 0, 0.46, 0),
    at(bevelledBox(0.5, 0.6, 0.06, 0.02), 0, 0.76, -0.22),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(at(bevelledBox(0.06, 0.44, 0.06, 0.015), sx * 0.21, 0.22, sz * 0.2));
    }
  }
  return merge(parts);
}

/** A top and four legs. Low and wide enough to read as a place to eat. */
function tableGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    at(bevelledBox(1.2, 0.08, 0.8, 0.025), 0, 0.74, 0),
    at(bevelledBox(1.05, 0.06, 0.65, 0.02), 0, 0.66, 0),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(at(bevelledBox(0.08, 0.7, 0.08, 0.02), sx * 0.5, 0.35, sz * 0.3));
    }
  }
  return merge(parts);
}

/**
 * A flat woven mat, a couple of centimetres proud of the plate.
 *
 * Proud rather than flush: coplanar with the deck it would z-fight, and a rug
 * that flickers is worse than no rug. Two centimetres is below the character
 * controller's step height by an order of magnitude, so nothing can catch on
 * it even in principle — and it has no collider anyway.
 */
function rugGeometry(): THREE.BufferGeometry {
  const body = at(bevelledBox(1.5, 0.03, 1.05, 0.01), 0, 0.185, 0);
  const border = at(bevelledBox(1.28, 0.035, 0.84, 0.01), 0, 0.19, 0);
  return grouped([[body], [border]]);
}

/** An upright with three boards and a scatter of oddments on them. */
function shelfGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(at(bevelledBox(0.07, 1.5, 0.34, 0.02), sx * 0.55, 0.75, 0));
  }
  for (const y of [0.42, 0.86, 1.3]) {
    parts.push(at(bevelledBox(1.16, 0.06, 0.36, 0.015), 0, y, 0));
  }

  // What is on the shelves. Small boxes, because a shelf with nothing on it
  // reads as a bookcase in a showroom rather than as somebody's home.
  const oddments: THREE.BufferGeometry[] = [
    at(bevelledBox(0.14, 0.22, 0.14, 0.02), -0.35, 0.56, 0),
    at(bevelledBox(0.11, 0.17, 0.11, 0.02), -0.15, 0.53, 0.04),
    at(bevelledBox(0.18, 0.15, 0.16, 0.02), 0.32, 0.97, -0.02),
    at(bevelledBox(0.12, 0.24, 0.12, 0.02), 0.05, 1.45, 0),
  ];

  return grouped([parts, oddments]);
}

const BUILDERS: Record<PieceId, () => THREE.BufferGeometry> = {
  stove: stoveGeometry,
  condenser: condenserGeometry,
  planter: planterGeometry,
  // The defence factory replaces this placeholder mesh when available. The
  // plate keeps saves and headless build validation usable before that asset
  // is loaded.
  'turret-manual': floorGeometry,
  'collector-auto': crateGeometry,
  'turret-auto': floorGeometry,
  chair: chairGeometry,
  table: tableGeometry,
  rug: rugGeometry,
  shelf: shelfGeometry,
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
    case 'condenser':
      return [materials.stationMetal, materials.emissiveWarn];
    case 'turret-manual':
      return [materials.stationMetal, materials.emissiveWarn];
    case 'collector-auto':
      return [materials.stationMetal, materials.emissiveWarn];
    case 'turret-auto':
      return [materials.stationMetal, materials.emissiveWarn];
    // Group 1 is the crop, and it is the one place on this machine anything
    // is alive. `accent` is the warmest thing in the palette; a green would
    // need a material of its own for six small slabs.
    case 'planter':
      return [materials.rustedSteel, materials.accent];

    // Furniture is warmer than the hull it stands on, deliberately: the whole
    // job of decoration here is to make an interior read as lived in rather
    // than as more machine.
    case 'chair':
    case 'table':
      return materials.rustedSteel;
    case 'rug':
      return [materials.accent, materials.rustedSteel];
    case 'shelf':
      return [materials.rustedSteel, materials.accent];
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
      return [{ half: new THREE.Vector3(0.7, 0.55, 0.7), offset: new THREE.Vector3(0, 0.55, 0) }];
    case 'workbench':
      return [{ half: new THREE.Vector3(0.9, 0.51, 0.45), offset: new THREE.Vector3(0, 0.51, 0) }];
    case 'refinery':
      return [{ half: new THREE.Vector3(0.75, 0.95, 0.75), offset: new THREE.Vector3(0, 0.95, 0) }];

    case 'generator':
      return [{ half: new THREE.Vector3(0.85, 0.65, 0.72), offset: new THREE.Vector3(0, 0.65, 0) }];

    case 'stove':
      return [{ half: new THREE.Vector3(0.79, 0.55, 0.62), offset: new THREE.Vector3(0, 0.55, 0) }];

    case 'condenser':
      return [{ half: new THREE.Vector3(0.63, 0.95, 0.63), offset: new THREE.Vector3(0, 0.95, 0) }];

    case 'turret-manual':
      return [{ half: new THREE.Vector3(0.82, 0.5, 0.82), offset: new THREE.Vector3(0, 0.5, 0) }];
    case 'collector-auto':
      return [{ half: new THREE.Vector3(0.82, 0.55, 0.82), offset: new THREE.Vector3(0, 0.55, 0) }];
    case 'turret-auto':
      return [{ half: new THREE.Vector3(0.82, 0.5, 0.82), offset: new THREE.Vector3(0, 0.5, 0) }];

    // Shin-high, and the collider says so. A knee-high box the player can see
    // over but not step through is exactly what a planter is.
    case 'planter':
      return [{ half: new THREE.Vector3(0.84, 0.3, 0.68), offset: new THREE.Vector3(0, 0.3, 0) }];

    // None, deliberately. A lamp is a fitting on a wall that already has a
    // collider; giving it one of its own would put a shin-catcher in the
    // doorway it lights, and a body can no more walk into it than into the
    // wall it hangs on.
    case 'lamp':
      return [];

    // None either, and this is the decoration constraint itself rather than a
    // per-piece judgement: `buildsColliders` says no for the whole category
    // and `BuildSystem.createColliders` returns before it ever gets here. A
    // chair you cannot trip over is a chair whose model need not match a
    // collider, which is what lets a CC0 furniture pack in at all.
    case 'chair':
    case 'table':
    case 'rug':
    case 'shelf':
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
