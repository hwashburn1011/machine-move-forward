import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from '@/art/Materials';
import {
  DECK_HEIGHT,
  DECK_PLATE_HALF,
  LEVEL_HEIGHT,
  GRID_TILE,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
} from '@/game/constants';

/**
 * The machine, built entirely in code.
 *
 * Everything here leans on one idea: bevelled edges. A hard-edged box reads as
 * a programmer primitive no matter how good the material is, because real
 * manufactured metal always has a broken edge that catches a highlight along
 * every silhouette line. `bevelledBox` is doing most of the visual work in
 * this file.
 */

/**
 * A box with chamfered edges. Built by scaling an inset cube outward along its
 * own normals, which is cheap and gives a clean, consistent chamfer.
 */
export function bevelledBox(
  width: number,
  height: number,
  depth: number,
  bevel = 0.06,
): THREE.BufferGeometry {
  const b = Math.min(bevel, width / 2.5, height / 2.5, depth / 2.5);

  const shape = new THREE.Shape();
  const hw = width / 2 - b;
  const hh = height / 2 - b;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - b * 2,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // ExtrudeGeometry builds along +Z from the origin; recentre it.
  geo.translate(0, 0, -(depth - b * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}

interface Part {
  geo: THREE.BufferGeometry;
  pos: [number, number, number];
  rotY?: number;
}

/** Merge same-material parts into one geometry to keep draw calls down. */
function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const transformed = parts.map(({ geo, pos, rotY }) => {
    const g = geo.clone();
    if (rotY) g.rotateY(rotY);
    g.translate(pos[0], pos[1], pos[2]);
    geo.dispose();
    return g;
  });
  const merged = BufferGeometryUtils.mergeGeometries(transformed, false);
  for (const g of transformed) g.dispose();
  if (!merged) throw new Error('mergeParts: merge failed');
  return merged;
}

export interface MachineBuild {
  group: THREE.Group;
  /**
   * Fixed-collider boxes: half-extents and centre, in machine-local space.
   *
   * `rotX` tilts a box about the X axis — the engine-room stair is a single
   * smooth ramp rather than stepped treads, because stepped colliders make a
   * kinematic character controller judder and catch on every tread.
   */
  colliders: { half: THREE.Vector3; center: THREE.Vector3; rotX?: number }[];
}

const DECK_W = MACHINE_TILES_X * GRID_TILE; // 10m
const DECK_L = MACHINE_TILES_Z * GRID_TILE; // 16m

/**
 * Absolute Y of the hull's underside, and of the engine-room floor plane.
 *
 * Running gear is anchored to ABSOLUTE ground, not to `DECK_HEIGHT`. The
 * treads rest on sand; the deck rides above them. Writing the wheels as
 * `DECK_HEIGHT - 2.35` tied the two together, so raising the deck to make room
 * for the engine room lifted the wheels off the ground with it.
 *
 * This value equals `DECK_HEIGHT - LEVEL_HEIGHT`, which is what makes the
 * engine room a clean level -1 on the build grid.
 */
const HULL_BOTTOM = DECK_HEIGHT - LEVEL_HEIGHT;

/** Underside of the deck plate — the engine room's ceiling. */
const DECK_UNDERSIDE = DECK_HEIGHT - DECK_PLATE_HALF;

/** Assemble the 5x8-tile starting machine from handoff section 49. */
export function buildMachine(materials: Materials): MachineBuild {
  const group = new THREE.Group();
  const colliders: MachineBuild['colliders'] = [];

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const collide = (
    hx: number,
    hy: number,
    hz: number,
    x: number,
    y: number,
    z: number,
    rotX?: number,
  ) => {
    colliders.push({
      half: new THREE.Vector3(hx, hy, hz),
      center: new THREE.Vector3(x, y, z),
      ...(rotX === undefined ? {} : { rotX }),
    });
  };

  // --- Stairwell ----------------------------------------------------------
  // The hole in the deck you go down through, in machine-local world metres.
  // Aligned to the deck PLATES (centred on odd z) rather than to build-grid
  // cells (centred on even z) -- the deck is 16m against a 2m grid whose Z
  // origin does not divide it evenly, so the two are offset by a metre and
  // nothing can satisfy both. Plate alignment wins because the hole has to be
  // cut out of actual plates.
  // Port side, deliberately NOT the centreline. Measured with it amidships:
  // everything walking fore-and-aft along x=0 -- arrivals, the player, anything
  // the AI steered -- went straight down the hole, because that is the one
  // clear lane on a deck this cluttered. Off to port it is somewhere you go
  // rather than somewhere you fall.
  // One plate column in from the port edge. Hard against the edge, the ramp
  // overlapped the engine room's own port wall and there was nothing to land
  // on below the outboard half of the opening.
  const WELL_MIN_X = -DECK_W / 2 + GRID_TILE;
  const WELL_MAX_X = WELL_MIN_X + GRID_TILE;
  const WELL_MIN_Z = -2.0;
  const WELL_MAX_Z = 2.0;
  const WELL_MID_X = (WELL_MIN_X + WELL_MAX_X) / 2;
  const WELL_MID_Z = (WELL_MIN_Z + WELL_MAX_Z) / 2;
  const inWell = (x: number, z: number) =>
    x > WELL_MIN_X && x < WELL_MAX_X && z > WELL_MIN_Z && z < WELL_MAX_Z;

  // --- Deck ---------------------------------------------------------------
  // Individual plates rather than one slab, so the tread texture and the bevel
  // seams give the deck a readable physical scale to walk across.
  const deckPlates: Part[] = [];
  const plate = GRID_TILE;
  for (let ix = 0; ix < MACHINE_TILES_X; ix++) {
    for (let iz = 0; iz < MACHINE_TILES_Z; iz++) {
      const x = -DECK_W / 2 + plate / 2 + ix * plate;
      const z = -DECK_L / 2 + plate / 2 + iz * plate;
      if (inWell(x, z)) continue;
      deckPlates.push({
        geo: bevelledBox(plate * 0.985, 0.18, plate * 0.985, 0.035),
        pos: [x, DECK_HEIGHT, z],
      });
    }
  }
  const deck = add(mergeParts(deckPlates), materials.deckPlate);
  deck.name = 'deck';
  // Four slabs around the stairwell rather than one for the whole deck. Still
  // far cheaper than 40 plate colliders, and it leaves an actual hole -- a
  // single slab would floor over the well and there would be no way down.
  // Full-length slabs outboard and inboard of the well, then the two stubs
  // fore and aft of it.
  collide((WELL_MIN_X + DECK_W / 2) / 2, DECK_PLATE_HALF, DECK_L / 2,
    (-DECK_W / 2 + WELL_MIN_X) / 2, DECK_HEIGHT, 0);
  collide((DECK_W / 2 - WELL_MAX_X) / 2, DECK_PLATE_HALF, DECK_L / 2,
    (WELL_MAX_X + DECK_W / 2) / 2, DECK_HEIGHT, 0);
  collide((WELL_MAX_X - WELL_MIN_X) / 2, DECK_PLATE_HALF, (DECK_L / 2 + WELL_MIN_Z) / 2,
    WELL_MID_X, DECK_HEIGHT, (-DECK_L / 2 + WELL_MIN_Z) / 2);
  collide((WELL_MAX_X - WELL_MIN_X) / 2, DECK_PLATE_HALF, (DECK_L / 2 - WELL_MAX_Z) / 2,
    WELL_MID_X, DECK_HEIGHT, (DECK_L / 2 + WELL_MAX_Z) / 2);

  // --- Chassis ------------------------------------------------------------
  // The hull is a SHELL, not a solid block: floor, four walls, and the deck
  // overhead form the engine room. A solid underframe would leave the deck
  // opening dropping into nothing.
  const ROOM_HALF_W = (DECK_W - 0.6) / 2;
  const ROOM_HALF_L = (DECK_L - 0.4) / 2;
  const ROOM_WALL_T = 0.3;
  const ROOM_FLOOR_T = 0.3;
  const ROOM_H = DECK_UNDERSIDE - HULL_BOTTOM;
  const ROOM_MID_Y = (HULL_BOTTOM + DECK_UNDERSIDE) / 2;

  const chassisParts: Part[] = [
    // Floor. Its top face is exactly HULL_BOTTOM, which is level -1's floor
    // plane, so a body standing here reports level -1 with no special case.
    {
      geo: bevelledBox(ROOM_HALF_W * 2, ROOM_FLOOR_T, ROOM_HALF_L * 2, 0.09),
      pos: [0, HULL_BOTTOM - ROOM_FLOOR_T / 2, 0],
    },
    // Port and starboard walls.
    {
      geo: bevelledBox(ROOM_WALL_T, ROOM_H, ROOM_HALF_L * 2, 0.06),
      pos: [-ROOM_HALF_W + ROOM_WALL_T / 2, ROOM_MID_Y, 0],
    },
    {
      geo: bevelledBox(ROOM_WALL_T, ROOM_H, ROOM_HALF_L * 2, 0.06),
      pos: [ROOM_HALF_W - ROOM_WALL_T / 2, ROOM_MID_Y, 0],
    },
    // Fore and aft bulkheads.
    {
      geo: bevelledBox(ROOM_HALF_W * 2, ROOM_H, ROOM_WALL_T, 0.06),
      pos: [0, ROOM_MID_Y, -ROOM_HALF_L + ROOM_WALL_T / 2],
    },
    {
      geo: bevelledBox(ROOM_HALF_W * 2, ROOM_H, ROOM_WALL_T, 0.06),
      pos: [0, ROOM_MID_Y, ROOM_HALF_L - ROOM_WALL_T / 2],
    },
  ];

  // Colliders matching that shell, so the room is somewhere you can stand
  // rather than a hole you fall through.
  collide(ROOM_HALF_W, ROOM_FLOOR_T / 2, ROOM_HALF_L, 0, HULL_BOTTOM - ROOM_FLOOR_T / 2, 0);
  collide(ROOM_WALL_T / 2, ROOM_H / 2, ROOM_HALF_L, -ROOM_HALF_W + ROOM_WALL_T / 2, ROOM_MID_Y, 0);
  collide(ROOM_WALL_T / 2, ROOM_H / 2, ROOM_HALF_L, ROOM_HALF_W - ROOM_WALL_T / 2, ROOM_MID_Y, 0);
  collide(ROOM_HALF_W, ROOM_H / 2, ROOM_WALL_T / 2, 0, ROOM_MID_Y, -ROOM_HALF_L + ROOM_WALL_T / 2);
  collide(ROOM_HALF_W, ROOM_H / 2, ROOM_WALL_T / 2, 0, ROOM_MID_Y, ROOM_HALF_L - ROOM_WALL_T / 2);
  // Visible cross-members, so the underside reads as structure not a solid lump.
  for (let i = 0; i < 7; i++) {
    const z = -DECK_L / 2 + 1.2 + i * ((DECK_L - 2.4) / 6);
    chassisParts.push({ geo: bevelledBox(DECK_W + 0.5, 0.42, 0.34, 0.05), pos: [0, HULL_BOTTOM + 0.05, z] });
  }
  add(mergeParts(chassisParts), materials.hullDark);

  // --- Stairwell coaming ---------------------------------------------------
  // A lip around three sides of the opening. Without it the well is an open
  // hole in the middle of the only clear stretch of deck, and everything
  // crossing the deck -- arrivals, the player, anything the AI steers -- drops
  // into the engine room by accident. Taller than AUTOSTEP_HEIGHT so nothing
  // steps over it casually.
  //
  // The aft side is deliberately left open: that is where the ramp's head is,
  // so the one way in is the way you would actually walk down.
  const COAM_H = 0.9;
  const COAM_T = 0.14;
  const coamY = DECK_HEIGHT + DECK_PLATE_HALF + COAM_H / 2;
  const coamParts: Part[] = [];
  // Starboard side, facing the open deck -- this is the edge people walk past.
  for (const edgeX of [WELL_MIN_X - COAM_T / 2, WELL_MAX_X + COAM_T / 2]) {
    coamParts.push({
      geo: bevelledBox(COAM_T, COAM_H, WELL_MAX_Z - WELL_MIN_Z, 0.03),
      pos: [edgeX, coamY, WELL_MID_Z],
    });
    collide(COAM_T / 2, COAM_H / 2, (WELL_MAX_Z - WELL_MIN_Z) / 2, edgeX, coamY, WELL_MID_Z);
  }
  // Fore bulkhead. Aft is left open as the way down; the deck's own port
  // railing already guards the outboard side.
  coamParts.push({
    geo: bevelledBox(WELL_MAX_X - WELL_MIN_X + COAM_T, COAM_H, COAM_T, 0.03),
    pos: [WELL_MID_X, coamY, WELL_MIN_Z - COAM_T / 2],
  });
  collide((WELL_MAX_X - WELL_MIN_X + COAM_T) / 2, COAM_H / 2, COAM_T / 2,
    WELL_MID_X, coamY, WELL_MIN_Z - COAM_T / 2);
  add(mergeParts(coamParts), materials.bareSteel).name = 'stairwell-coaming';

  // --- Engine room stair --------------------------------------------------
  // A single smooth ramp from the deck opening down to the engine room floor.
  // Smooth rather than stepped for the same reason the build-piece stairs are:
  // stepped colliders make a kinematic controller judder and catch.
  //
  // The ramp spans the full length of the well, so nothing is ever climbing
  // underneath a floored cell -- the mistake that makes the build-grid stairs
  // piece unusable is precisely a landing sitting over the ramp.
  const STAIR_TOP_Y = DECK_HEIGHT + DECK_PLATE_HALF;
  const STAIR_BOTTOM_Y = HULL_BOTTOM;
  const stairRise = STAIR_TOP_Y - STAIR_BOTTOM_Y;
  const stairRun = WELL_MAX_Z - WELL_MIN_Z;
  const stairSlope = Math.atan2(stairRise, stairRun);
  const stairLength = Math.hypot(stairRise, stairRun);

  const stairWidth = WELL_MAX_X - WELL_MIN_X - 0.12;
  const stair = bevelledBox(stairWidth, 0.24, stairLength, 0.04);
  stair.rotateX(-stairSlope);
  stair.translate(WELL_MID_X, (STAIR_TOP_Y + STAIR_BOTTOM_Y) / 2, WELL_MID_Z);
  add(stair, materials.bareSteel).name = 'engine-stair';
  collide(
    stairWidth / 2,
    0.12,
    stairLength / 2,
    WELL_MID_X,
    (STAIR_TOP_Y + STAIR_BOTTOM_Y) / 2,
    WELL_MID_Z,
    -stairSlope,
  );

  // A lamp so the room is not pitch black. Interior lighting proper arrives
  // with the power system; this is emissive geometry, not a light source, and
  // is deliberately the cheapest thing that stops the room reading as a void.
  const engineLamp = bevelledBox(0.5, 0.12, 0.5, 0.03);
  engineLamp.translate(WELL_MID_X, DECK_UNDERSIDE - 0.1, -4.0);
  add(engineLamp, materials.emissiveWarn).name = 'engine-lamp';

  // --- Treads -------------------------------------------------------------
  // Large and obviously load-bearing. These carry most of the silhouette.
  for (const side of [-1, 1]) {
    const x = side * (DECK_W / 2 + 0.75);
    const housing: Part[] = [
      { geo: bevelledBox(1.5, DECK_UNDERSIDE - 0.9, DECK_L - 0.8, 0.1), pos: [x, (0.9 + DECK_UNDERSIDE) / 2, 0] },
    ];
    add(mergeParts(housing), materials.hull);

    // Tread belt.
    const belt: Part[] = [
      { geo: bevelledBox(1.62, 1.5, DECK_L - 1.6, 0.12), pos: [x, HULL_BOTTOM + 0.05, 0] },
    ];
    add(mergeParts(belt), materials.rubber);

    // Road wheels, poking below the belt line.
    const wheels: Part[] = [];
    for (let i = 0; i < 6; i++) {
      const z = -DECK_L / 2 + 1.6 + i * ((DECK_L - 3.2) / 5);
      const w = new THREE.CylinderGeometry(0.55, 0.55, 1.35, 14);
      w.rotateZ(Math.PI / 2);
      wheels.push({ geo: w, pos: [x, HULL_BOTTOM - 0.55, z] });
    }
    add(mergeParts(wheels), materials.bareSteel);

    collide(0.85, DECK_UNDERSIDE / 2, DECK_L / 2, x, DECK_UNDERSIDE / 2, 0);
  }

  // --- Prow ---------------------------------------------------------------
  // The strongest single silhouette element and the machine's "face".
  const prowZ = -DECK_L / 2;
  const ploughShape = new THREE.Shape();
  ploughShape.moveTo(-DECK_W / 2 - 1.2, 0);
  ploughShape.lineTo(DECK_W / 2 + 1.2, 0);
  ploughShape.lineTo(DECK_W / 2 + 0.5, 2.1);
  ploughShape.lineTo(-DECK_W / 2 - 0.5, 2.1);
  ploughShape.closePath();
  const plough = new THREE.ExtrudeGeometry(ploughShape, {
    depth: 0.35,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 1,
  });
  plough.rotateX(-0.42);
  plough.translate(0, HULL_BOTTOM - 0.7, prowZ - 1.1);
  add(plough, materials.hull);

  const prowBlock = bevelledBox(DECK_W - 1.0, 1.1, 1.6, 0.1);
  prowBlock.translate(0, DECK_HEIGHT + 0.64, prowZ + 0.6);
  add(prowBlock, materials.hull);
  collide((DECK_W - 1.0) / 2, 0.55, 0.8, 0, DECK_HEIGHT + 0.64, prowZ + 0.6);

  // Hazard stripe: the one saturated accent on the whole machine, placed on
  // the prow so the eye lands on the front.
  const stripe = bevelledBox(DECK_W - 1.4, 0.34, 0.12, 0.03);
  stripe.translate(0, DECK_HEIGHT + 0.64, prowZ - 0.22);
  add(stripe, materials.hazard);

  // --- Equipment (handoff section 49 starting loadout) --------------------
  const equipment: {
    name: string;
    size: [number, number, number];
    pos: [number, number, number];
    mat: THREE.Material;
  }[] = [
    // 2.8 wide, not 3.2. At 3.2 the slots either side of it — to the
    // generator to port, the fuel tank to starboard — come out 0.65m and
    // 0.70m, against a scavenger that needs 0.76m to pass. Both read as open
    // road to anything that looks down them and are dead ends to anything that
    // walks in, and a wedged scavenger cannot move in any direction at all.
    // The grid cells this blocks are unchanged either way: they are rounded to
    // the 2m tile, and 1.4 and 1.6 both round to the same column.
    { name: 'engine', size: [2.8, 1.8, 2.6], pos: [0, DECK_HEIGHT + 0.99, DECK_L / 2 - 2.0], mat: materials.hull },
    { name: 'generator', size: [1.5, 1.2, 1.5], pos: [-3.0, DECK_HEIGHT + 0.69, DECK_L / 2 - 4.4], mat: materials.rustedSteel },
    { name: 'fuel-tank', size: [1.6, 1.5, 2.4], pos: [3.1, DECK_HEIGHT + 0.84, DECK_L / 2 - 4.6], mat: materials.bareSteel },
    // Turned fore-and-aft and moved outboard to clear the stairwell column.
    { name: 'workbench', size: [1.2, 1.0, 2.6], pos: [-4.2, DECK_HEIGHT + 0.59, 0.6], mat: materials.hullDark },
    { name: 'crate-a', size: [1.3, 1.1, 1.3], pos: [3.2, DECK_HEIGHT + 0.64, 1.4], mat: materials.rustedSteel },
    { name: 'crate-b', size: [1.3, 1.1, 1.3], pos: [3.2, DECK_HEIGHT + 0.64, -0.2], mat: materials.rustedSteel },
    { name: 'collector', size: [1.2, 1.6, 1.2], pos: [-3.4, DECK_HEIGHT + 0.89, -4.2], mat: materials.hull },
  ];

  for (const item of equipment) {
    const geo = bevelledBox(item.size[0], item.size[1], item.size[2], 0.07);
    geo.translate(item.pos[0], item.pos[1], item.pos[2]);
    add(geo, item.mat).name = item.name;
    collide(item.size[0] / 2, item.size[1] / 2, item.size[2] / 2, ...item.pos);
  }

  // Exhaust stacks on the engine — vertical elements break up an otherwise
  // very horizontal silhouette.
  const stacks: Part[] = [];
  for (const dx of [-0.9, 0.9]) {
    const s = new THREE.CylinderGeometry(0.19, 0.24, 2.2, 10);
    stacks.push({ geo: s, pos: [dx, DECK_HEIGHT + 2.9, DECK_L / 2 - 1.4] });
  }
  add(mergeParts(stacks), materials.rustedSteel);

  // Light hardpoint pedestal (handoff section 17 — LIGHT class).
  const hardpoint = new THREE.CylinderGeometry(0.42, 0.55, 0.5, 12);
  hardpoint.translate(2.9, DECK_HEIGHT + 0.34, -4.6);
  add(hardpoint, materials.bareSteel).name = 'hardpoint-light';

  // A single warning lamp, emissive so it survives the bloom threshold.
  const lamp = bevelledBox(0.3, 0.3, 0.3, 0.05);
  lamp.translate(0, DECK_HEIGHT + 1.95, DECK_L / 2 - 2.0);
  add(lamp, materials.emissiveWarn);

  // --- Railings -----------------------------------------------------------
  // Thin, so they read as detail rather than mass, and they make the deck feel
  // like somewhere a person stands.
  const rails: Part[] = [];
  const railY = DECK_HEIGHT + 0.62;
  for (const side of [-1, 1]) {
    const x = side * (DECK_W / 2 - 0.12);
    rails.push({ geo: bevelledBox(0.09, 0.09, DECK_L - 0.4, 0.02), pos: [x, railY + 0.42, 0] });
    for (let i = 0; i < 9; i++) {
      const z = -DECK_L / 2 + 0.6 + i * ((DECK_L - 1.2) / 8);
      rails.push({ geo: bevelledBox(0.09, 1.0, 0.09, 0.02), pos: [x, railY - 0.06, z] });
    }
  }
  // Rear rail.
  rails.push({
    geo: bevelledBox(DECK_W - 0.4, 0.09, 0.09, 0.02),
    pos: [0, railY + 0.42, DECK_L / 2 - 0.12],
  });
  add(mergeParts(rails), materials.bareSteel);

  return { group, colliders };
}
