import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from '@/art/Materials';
import { createMachineDetailBatches } from '@/art/MachineDetailModels';
import {
  DECK_HEIGHT,
  DECK_PLATE_HALF,
  LEVEL_HEIGHT,
  GRID_TILE,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
  DECK_SURFACE_Y,
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
   *
   * `blocksBuild` defaults to true: a box standing on the deck takes the build
   * cells it occupies out of play. A false here means solid to bodies and
   * invisible to the build grid, which is the right answer for a thin barrier
   * hugging a cell boundary — see the railings, and `projectEquipmentCells`.
   */
  colliders: {
    half: THREE.Vector3;
    center: THREE.Vector3;
    rotX?: number;
    blocksBuild?: boolean;
    /** Retracts only while the expedition gangway is deployed. */
    expeditionGate?: boolean;
  }[];
}

/** Replace the fixed helm fallback after authored assets finish loading. */
export function installNavigationHelm(
  machineGroup: THREE.Group,
  authored: THREE.Object3D,
): boolean {
  const required = ['HelmRoot', 'GyroInstalled', 'HelmPowerLamp', 'HelmInteract'];
  if (!required.every((name) => authored.getObjectByName(name))) return false;
  let meshes = 0;
  let valid = true;
  authored.traverse((object) => {
    if (
      ![
        ...object.position.toArray(),
        ...object.quaternion.toArray(),
        ...object.scale.toArray(),
      ].every(Number.isFinite)
    )
      valid = false;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const positions = mesh.geometry?.getAttribute('position');
      if (!positions || positions.count < 3 || !Array.from(positions.array).every(Number.isFinite))
        valid = false;
      else meshes++;
    }
  });
  if (!valid || !meshes) return false;
  const existing = machineGroup.getObjectByName('HelmRoot');
  if (!existing?.parent) return false;
  const parent = existing.parent as THREE.Group;
  const position = existing.position.clone();
  parent.remove(existing);
  if (!existing.userData.authored)
    existing.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
    });
  authored.position.copy(position);
  authored.name = 'HelmRoot';
  authored.userData.authored = true;
  parent.add(authored);
  return true;
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

  const markVisualFallback = (mesh: THREE.Mesh, skin?: string) => {
    mesh.userData.machineDetailFallback = true;
    if (skin) mesh.userData.machineVisualSkin = skin;
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
    const box: MachineBuild['colliders'][number] = {
      half: new THREE.Vector3(hx, hy, hz),
      center: new THREE.Vector3(x, y, z),
      ...(rotX === undefined ? {} : { rotX }),
    };
    colliders.push(box);
    return box;
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
  collide(
    (WELL_MIN_X + DECK_W / 2) / 2,
    DECK_PLATE_HALF,
    DECK_L / 2,
    (-DECK_W / 2 + WELL_MIN_X) / 2,
    DECK_HEIGHT,
    0,
  );
  collide(
    (DECK_W / 2 - WELL_MAX_X) / 2,
    DECK_PLATE_HALF,
    DECK_L / 2,
    (WELL_MAX_X + DECK_W / 2) / 2,
    DECK_HEIGHT,
    0,
  );
  collide(
    (WELL_MAX_X - WELL_MIN_X) / 2,
    DECK_PLATE_HALF,
    (DECK_L / 2 + WELL_MIN_Z) / 2,
    WELL_MID_X,
    DECK_HEIGHT,
    (-DECK_L / 2 + WELL_MIN_Z) / 2,
  );
  collide(
    (WELL_MAX_X - WELL_MIN_X) / 2,
    DECK_PLATE_HALF,
    (DECK_L / 2 - WELL_MAX_Z) / 2,
    WELL_MID_X,
    DECK_HEIGHT,
    (DECK_L / 2 + WELL_MAX_Z) / 2,
  );

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
  add(mergeParts(chassisParts), materials.hullDark).name = 'lower-room-shell';

  // Visible cross-members, so the underside reads as structure rather than a
  // solid lump. They belong against the ceiling: putting these visual-only
  // beams at HULL_BOTTOM made a row of low obstacles across the engine-room
  // floor even though no matching collider existed. Keeping them above the
  // walkable capsule volume preserves the lower-room silhouette without
  // inventing collision for decorative framing. The member over the stair
  // opening is split around the opening as well: the ramp needs headroom, so
  // visual clearance cannot depend on the player ignoring an uncollidable
  // beam.
  const ceilingFrame: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const z = -DECK_L / 2 + 1.2 + i * ((DECK_L - 2.4) / 6);
    const beamWidth = DECK_W + 0.5;
    const beamMinX = -beamWidth / 2;
    const beamMaxX = beamWidth / 2;
    const openingMinX = WELL_MIN_X + 0.12;
    const openingMaxX = WELL_MAX_X - 0.12;
    const crossesStairwell = z > WELL_MIN_Z - 0.17 && z < WELL_MAX_Z + 0.17;
    if (!crossesStairwell) {
      ceilingFrame.push({
        geo: bevelledBox(beamWidth, 0.42, 0.34, 0.05),
        pos: [0, DECK_UNDERSIDE - 0.21, z],
      });
      continue;
    }
    for (const [minX, maxX] of [
      [beamMinX, openingMinX],
      [openingMaxX, beamMaxX],
    ] as const) {
      ceilingFrame.push({
        geo: bevelledBox(maxX - minX, 0.42, 0.34, 0.05),
        pos: [(minX + maxX) / 2, DECK_UNDERSIDE - 0.21, z],
      });
    }
  }
  const frame = add(mergeParts(ceilingFrame), materials.hullDark);
  frame.name = 'lower-room-ceiling-frame';
  frame.userData.machineDetailFallback = true;

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
  // Inset INTO the well rather than sitting on its lip. The well's edges fall
  // exactly on grid-cell boundaries, and projectEquipmentCells rounds a
  // collider outward to whole 2m cells -- so a 14cm rail balanced on the
  // boundary blocked the entire neighbouring deck cell from being built on.
  const COAM_INSET = 0.2;
  for (const edgeX of [WELL_MIN_X + COAM_INSET, WELL_MAX_X - COAM_INSET]) {
    coamParts.push({
      geo: bevelledBox(COAM_T, COAM_H, WELL_MAX_Z - WELL_MIN_Z, 0.03),
      pos: [edgeX, coamY, WELL_MID_Z],
    });
    collide(COAM_T / 2, COAM_H / 2, (WELL_MAX_Z - WELL_MIN_Z) / 2, edgeX, coamY, WELL_MID_Z);
  }
  // Fore bulkhead. Aft is left open as the way down; the deck's own port
  // railing already guards the outboard side.
  // Inset on both axes for the same reason as the side rails: any part of this
  // that reaches past the well's own grid cell blocks a whole 2m deck cell.
  const foreW = WELL_MAX_X - WELL_MIN_X - COAM_INSET * 2;
  coamParts.push({
    geo: bevelledBox(foreW, COAM_H, COAM_T, 0.03),
    pos: [WELL_MID_X, coamY, WELL_MIN_Z + COAM_INSET],
  });
  collide(foreW / 2, COAM_H / 2, COAM_T / 2, WELL_MID_X, coamY, WELL_MIN_Z + COAM_INSET);
  markVisualFallback(add(mergeParts(coamParts), materials.bareSteel), 'deck').name =
    'stairwell-coaming';

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

  // Narrower than the well by the coaming inset, so the ramp fits between
  // the rails rather than poking through them.
  const stairWidth = WELL_MAX_X - WELL_MIN_X - 0.55;
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

  // --- Flanks ---------------------------------------------------------------
  // What is left where the treads were. The tread housings carried most of the
  // machine's silhouette below the deck and ran the full length of it; a
  // walker's silhouette is its legs, so this is now a shallow sponson that
  // closes the hull's side and gives the leg housings something to bolt to.
  //
  // It keeps the housings' collider, which is load-bearing in a way that is
  // easy to miss: it stands about a third of a metre proud of the deck, under
  // the character controller's autostep, so it is a curb the player walks over
  // rather than an obstruction — and it is what stops anything walking off the
  // side of the machine INTO the space the legs swing through.
  for (const side of [-1, 1]) {
    const x = side * (DECK_W / 2 + 0.35);
    const width = 0.7;
    const top = DECK_UNDERSIDE;
    const bottom = 1.4;
    const sponson: Part[] = [
      {
        geo: bevelledBox(width, top - bottom, DECK_L - 2.6, 0.12),
        pos: [x, (bottom + top) / 2, 0],
      },
    ];
    // The authored v3 hull is inset from this collider-owned flank. Keep this
    // exact envelope visible until a replacement covers the same outline.
    add(mergeParts(sponson), materials.hull).name = side < 0 ? 'sponson-port' : 'sponson-starboard';

    // The collider is the sponson, not a box the size of the tread housing
    // that used to be here. Leaving it at the old size would put an invisible
    // wall a metre outboard of anything drawn.
    collide(width / 2, (top - bottom) / 2, (DECK_L - 2.6) / 2, x, (bottom + top) / 2, 0);
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
  markVisualFallback(add(plough, materials.hull), 'prow').name = 'plough-visual';
  // The plough is a raked blade; a box around its bulk is enough to stop
  // anything walking out through the machine's face.
  collide(DECK_W / 2 + 1.2, 1.05, 0.7, 0, HULL_BOTTOM + 0.35, prowZ - 1.1);

  const prowBlock = bevelledBox(DECK_W - 1.0, 1.1, 1.6, 0.1);
  prowBlock.translate(0, DECK_HEIGHT + 0.64, prowZ + 0.6);
  // The v3 prow skin now covers this exact broad armor envelope. Keep the
  // collider below as the gameplay source of truth, but allow the authored
  // prow to replace this visual shell when its named root is present.
  markVisualFallback(add(prowBlock, materials.hull), 'prow').name = 'prow-block-visual';
  collide((DECK_W - 1.0) / 2, 0.55, 0.8, 0, DECK_HEIGHT + 0.64, prowZ + 0.6);

  // Hazard stripe: the one saturated accent on the whole machine, placed on
  // the prow so the eye lands on the front.
  const stripe = bevelledBox(DECK_W - 1.4, 0.34, 0.12, 0.03);
  stripe.translate(0, DECK_HEIGHT + 0.64, prowZ - 0.22);
  add(stripe, materials.hazard).name = 'prow-hazard-stripe';

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
    {
      name: 'engine',
      size: [2.8, 1.8, 2.6],
      pos: [0, DECK_HEIGHT + 0.99, DECK_L / 2 - 2.0],
      mat: materials.hull,
    },
    {
      name: 'generator',
      size: [1.5, 1.2, 1.5],
      pos: [-3.0, DECK_HEIGHT + 0.69, DECK_L / 2 - 4.4],
      mat: materials.rustedSteel,
    },
    {
      name: 'fuel-tank',
      size: [1.6, 1.5, 2.4],
      pos: [3.1, DECK_HEIGHT + 0.84, DECK_L / 2 - 4.6],
      mat: materials.bareSteel,
    },
    // Turned fore-and-aft and moved outboard to clear the stairwell column.
    {
      name: 'workbench',
      size: [1.2, 1.0, 2.6],
      pos: [-4.2, DECK_HEIGHT + 0.59, 0.6],
      mat: materials.hullDark,
    },
    {
      name: 'crate-a',
      size: [1.3, 1.1, 1.3],
      pos: [3.2, DECK_HEIGHT + 0.64, 1.4],
      mat: materials.rustedSteel,
    },
    {
      name: 'crate-b',
      size: [1.3, 1.1, 1.3],
      pos: [3.2, DECK_HEIGHT + 0.64, -0.2],
      mat: materials.rustedSteel,
    },
    {
      name: 'collector',
      size: [1.2, 1.6, 1.2],
      pos: [-3.4, DECK_HEIGHT + 0.89, -4.2],
      mat: materials.hull,
    },
  ];

  // Fixed navigation helm contract. The authored FA01 model replaces this
  // fallback at the same machine-local anchor; its interaction face points
  // aft (+Z) into the open deck lane.
  const helmRoot = new THREE.Group();
  helmRoot.name = 'HelmRoot';
  helmRoot.position.set(-1.8, DECK_SURFACE_Y, -5.6);
  group.add(helmRoot);
  const helmBody = bevelledBox(1.2, 1.35, 0.75, 0.06);
  helmBody.translate(0, 0.675, 0);
  const helmMesh = new THREE.Mesh(helmBody, materials.hull);
  helmMesh.castShadow = helmMesh.receiveShadow = true;
  markVisualFallback(helmMesh, 'navigation-helm').name = 'NavigationHelmFallback';
  helmRoot.add(helmMesh);
  const gyro = new THREE.Group();
  gyro.name = 'GyroInstalled';
  helmRoot.add(gyro);
  const helmLamp = new THREE.Group();
  helmLamp.name = 'HelmPowerLamp';
  helmRoot.add(helmLamp);
  const interact = new THREE.Group();
  interact.name = 'HelmInteract';
  interact.position.set(0, 0.85, 0.48);
  helmRoot.add(interact);
  collide(0.6, 0.675, 0.375, -1.8, DECK_SURFACE_Y + 0.675, -5.6);

  for (const item of equipment) {
    const geo = bevelledBox(item.size[0], item.size[1], item.size[2], 0.07);
    geo.translate(item.pos[0], item.pos[1], item.pos[2]);
    const mesh = add(geo, item.mat);
    mesh.name = item.name;
    markVisualFallback(mesh, item.name === 'engine' ? 'engine' : `equipment:${item.name}`);
    collide(item.size[0] / 2, item.size[1] / 2, item.size[2] / 2, ...item.pos);
  }

  // Exhaust stacks on the engine — vertical elements break up an otherwise
  // very horizontal silhouette.
  const stacks: Part[] = [];
  for (const dx of [-0.9, 0.9]) {
    const s = new THREE.CylinderGeometry(0.19, 0.24, 2.2, 10);
    stacks.push({ geo: s, pos: [dx, DECK_HEIGHT + 2.9, DECK_L / 2 - 1.4] });
  }
  markVisualFallback(add(mergeParts(stacks), materials.rustedSteel), 'engine').name =
    'engine-exhaust-visual';
  // Solid. These stand 2.2m proud of the deck right where a player walks, and
  // without this you stand inside one.
  for (const dx of [-0.9, 0.9]) {
    collide(0.24, 1.1, 0.24, dx, DECK_HEIGHT + 2.9, DECK_L / 2 - 1.4);
  }

  // Light hardpoint pedestal (handoff section 17 — LIGHT class).
  const hardpoint = new THREE.CylinderGeometry(0.42, 0.55, 0.5, 12);
  hardpoint.translate(2.9, DECK_HEIGHT + 0.34, -4.6);
  add(hardpoint, materials.bareSteel).name = 'hardpoint-light';
  collide(0.55, 0.25, 0.55, 2.9, DECK_HEIGHT + 0.34, -4.6);

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
    if (side === 1) {
      for (const z of [-4.4, 4.4]) {
        rails.push({ geo: bevelledBox(0.09, 0.09, 6.8, 0.02), pos: [x, railY + 0.42, z] });
      }
    } else {
      rails.push({ geo: bevelledBox(0.09, 0.09, DECK_L - 0.4, 0.02), pos: [x, railY + 0.42, 0] });
    }
    for (let i = 0; i < 9; i++) {
      const z = -DECK_L / 2 + 0.6 + i * ((DECK_L - 1.2) / 8);
      if (side === 1 && Math.abs(z) < 1) continue;
      rails.push({ geo: bevelledBox(0.09, 1.0, 0.09, 0.02), pos: [x, railY - 0.06, z] });
    }
  }
  // A retracting safety gate gives the deployed gangway a real opening in the
  // machine's existing rail. The remaining rail stays solid while moored.
  const gateX = DECK_W / 2 - 0.12;
  const gate = new THREE.Group();
  gate.name = 'ExpeditionGate';
  gate.add(
    new THREE.Mesh(
      mergeParts([
        { geo: bevelledBox(0.09, 0.09, 2, 0.02), pos: [gateX, railY + 0.42, 0] },
        { geo: bevelledBox(0.09, 1, 0.09, 0.02), pos: [gateX, railY - 0.06, 0] },
      ]),
      materials.hazard,
    ),
  );
  gate.traverse((object) => {
    object.castShadow = object.receiveShadow = true;
  });
  group.add(gate);
  // Rear rail.
  rails.push({
    geo: bevelledBox(DECK_W - 0.4, 0.09, 0.09, 0.02),
    pos: [0, railY + 0.42, DECK_L / 2 - 0.12],
  });
  // Only the static rail is replaced. The independent ExpeditionGate keeps
  // its runtime animation and collider, with the same opening in the trim.
  markVisualFallback(add(mergeParts(rails), materials.bareSteel), 'deck').name =
    'static-deck-rails';

  // Railings are barriers, not decoration. One continuous collider a side
  // rather than one per post: the posts have gaps you can see through and
  // should not be able to walk through, which is what a railing IS.
  //
  // Topped just under the deck-plus-jump height on purpose. A player who walks
  // into it is stopped; a player who deliberately jumps can still clear it and
  // go over the side, which is a thing they do.
  //
  // None of them block a build cell, and that is the whole reason
  // `blocksBuild` exists. A rail is 12cm thick and sits hard against the deck
  // lip, so it lies across a grid boundary: containment alone put the port and
  // starboard rails into cells x=±2 AND x=±3, and the rear rail into the whole
  // aft row. Measured, that is 24 cells -- both outboard columns entirely, so
  // nothing could be built out over the side at all, plus the six gaps between
  // the equipment in the outermost deck columns. `Machine.ts` already warns
  // about this exact cost for the old tread housings, which the autostep rule
  // spares; a rail is deliberately taller than autostep, so it has to say so
  // itself.
  const RAIL_TOP = 0.95;
  for (const side of [-1, 1]) {
    if (side === 1) {
      for (const z of [-4.4, 4.4]) {
        collide(
          0.06,
          RAIL_TOP / 2,
          3.4,
          DECK_W / 2 - 0.05,
          DECK_HEIGHT + DECK_PLATE_HALF + RAIL_TOP / 2,
          z,
        ).blocksBuild = false;
      }
      const gateCollider = collide(
        0.06,
        RAIL_TOP / 2,
        1,
        DECK_W / 2 - 0.05,
        DECK_HEIGHT + DECK_PLATE_HALF + RAIL_TOP / 2,
        0,
      );
      gateCollider.blocksBuild = false;
      gateCollider.expeditionGate = true;
      continue;
    }
    collide(
      0.06,
      RAIL_TOP / 2,
      (DECK_L - 0.4) / 2,
      // Hard against the deck edge rather than on the rail's own centreline.
      // Boarding scavengers are put down a little in from the lip and were
      // being pinched between the rail and their own capsule radius.
      side * (DECK_W / 2 - 0.05),
      DECK_HEIGHT + DECK_PLATE_HALF + RAIL_TOP / 2,
      0,
    ).blocksBuild = false;
  }
  collide(
    (DECK_W - 0.4) / 2,
    RAIL_TOP / 2,
    0.06,
    0,
    DECK_HEIGHT + DECK_PLATE_HALF + RAIL_TOP / 2,
    DECK_L / 2 - 0.12,
  ).blocksBuild = false;

  // Layered machine details are visual-only and material-batched. The
  // collider list above remains the source of truth for walkability, build
  // cells, the gate opening, and the engine-room route.
  for (const detail of createMachineDetailBatches(materials)) {
    const mesh = new THREE.Mesh(detail.geometry, detail.material);
    mesh.name = detail.name;
    mesh.userData.machineDetailFallback = true;
    if (detail.name === 'MachineWeldedFrame' || detail.name === 'MachineBearingsAndHatches') {
      mesh.userData.machineVisualSkin = 'hull';
    }
    mesh.castShadow = detail.castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { group, colliders };
}
