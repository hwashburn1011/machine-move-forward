import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from '@/art/Materials';
import { DECK_HEIGHT, GRID_TILE, MACHINE_TILES_X, MACHINE_TILES_Z } from '@/game/constants';

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
  /** Fixed-collider boxes: half-extents and centre, in machine-local space. */
  colliders: { half: THREE.Vector3; center: THREE.Vector3 }[];
}

const DECK_W = MACHINE_TILES_X * GRID_TILE; // 10m
const DECK_L = MACHINE_TILES_Z * GRID_TILE; // 16m

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

  const collide = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => {
    colliders.push({
      half: new THREE.Vector3(hx, hy, hz),
      center: new THREE.Vector3(x, y, z),
    });
  };

  // --- Deck ---------------------------------------------------------------
  // Individual plates rather than one slab, so the tread texture and the bevel
  // seams give the deck a readable physical scale to walk across.
  const deckPlates: Part[] = [];
  const plate = GRID_TILE;
  for (let ix = 0; ix < MACHINE_TILES_X; ix++) {
    for (let iz = 0; iz < MACHINE_TILES_Z; iz++) {
      const x = -DECK_W / 2 + plate / 2 + ix * plate;
      const z = -DECK_L / 2 + plate / 2 + iz * plate;
      deckPlates.push({
        geo: bevelledBox(plate * 0.985, 0.18, plate * 0.985, 0.035),
        pos: [x, DECK_HEIGHT, z],
      });
    }
  }
  const deck = add(mergeParts(deckPlates), materials.deckPlate);
  deck.name = 'deck';
  // One collider for the whole deck — 40 plate colliders would buy nothing.
  collide(DECK_W / 2, 0.09, DECK_L / 2, 0, DECK_HEIGHT, 0);

  // --- Chassis ------------------------------------------------------------
  const chassisParts: Part[] = [
    // Main underframe.
    { geo: bevelledBox(DECK_W - 0.6, 1.5, DECK_L - 0.4, 0.09), pos: [0, DECK_HEIGHT - 1.05, 0] },
  ];
  // Visible cross-members, so the underside reads as structure not a solid lump.
  for (let i = 0; i < 7; i++) {
    const z = -DECK_L / 2 + 1.2 + i * ((DECK_L - 2.4) / 6);
    chassisParts.push({ geo: bevelledBox(DECK_W + 0.5, 0.42, 0.34, 0.05), pos: [0, DECK_HEIGHT - 1.75, z] });
  }
  add(mergeParts(chassisParts), materials.hullDark);

  // --- Treads -------------------------------------------------------------
  // Large and obviously load-bearing. These carry most of the silhouette.
  for (const side of [-1, 1]) {
    const x = side * (DECK_W / 2 + 0.75);
    const housing: Part[] = [
      { geo: bevelledBox(1.5, 1.25, DECK_L - 0.8, 0.1), pos: [x, DECK_HEIGHT - 0.5, 0] },
    ];
    add(mergeParts(housing), materials.hull);

    // Tread belt.
    const belt: Part[] = [
      { geo: bevelledBox(1.62, 1.5, DECK_L - 1.6, 0.12), pos: [x, DECK_HEIGHT - 1.75, 0] },
    ];
    add(mergeParts(belt), materials.rubber);

    // Road wheels, poking below the belt line.
    const wheels: Part[] = [];
    for (let i = 0; i < 6; i++) {
      const z = -DECK_L / 2 + 1.6 + i * ((DECK_L - 3.2) / 5);
      const w = new THREE.CylinderGeometry(0.55, 0.55, 1.35, 14);
      w.rotateZ(Math.PI / 2);
      wheels.push({ geo: w, pos: [x, DECK_HEIGHT - 2.35, z] });
    }
    add(mergeParts(wheels), materials.bareSteel);

    collide(0.85, 1.4, DECK_L / 2, x, DECK_HEIGHT - 1.0, 0);
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
  plough.translate(0, DECK_HEIGHT - 2.5, prowZ - 1.1);
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
    { name: 'engine', size: [3.2, 1.8, 2.6], pos: [0, DECK_HEIGHT + 0.99, DECK_L / 2 - 2.0], mat: materials.hull },
    { name: 'generator', size: [1.5, 1.2, 1.5], pos: [-3.0, DECK_HEIGHT + 0.69, DECK_L / 2 - 4.4], mat: materials.rustedSteel },
    { name: 'fuel-tank', size: [1.6, 1.5, 2.4], pos: [3.1, DECK_HEIGHT + 0.84, DECK_L / 2 - 4.6], mat: materials.bareSteel },
    { name: 'workbench', size: [2.6, 1.0, 1.2], pos: [-2.6, DECK_HEIGHT + 0.59, 0.6], mat: materials.hullDark },
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
