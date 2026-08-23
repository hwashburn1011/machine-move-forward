import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bevelledBox } from '@/machine/MachineGeometry';
import type { Materials } from '@/art/Materials';
import type { PieceId } from '@/data/build-pieces';
import { GRID_TILE, LEVEL_HEIGHT } from '@/game/constants';

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
const DOOR_OPENING_HEIGHT = 2.1;

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

function stairsGeometry(): THREE.BufferGeometry {
  // Rises one level over two tiles, starting at the far edge of the base cell
  // and arriving at the landing.
  const run = T * 2;
  const rise = LEVEL_HEIGHT;
  const stepRun = run / STAIR_STEPS;
  const stepRise = rise / STAIR_STEPS;

  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < STAIR_STEPS; i++) {
    const tread = bevelledBox(T * 0.9, stepRise + 0.04, stepRun * 1.02, 0.02);
    parts.push(
      at(tread, 0, stepRise * (i + 0.5), -run / 2 + stepRun * (i + 0.5)),
    );
  }

  // Stringers down both sides, so the flight reads as a built object.
  for (const side of [-1, 1]) {
    const stringer = bevelledBox(0.12, 0.34, run * 1.02, 0.03);
    stringer.rotateX(-Math.atan2(rise, run));
    parts.push(at(stringer, side * T * 0.46, rise / 2, 0));
  }

  return merge(parts);
}

const BUILDERS: Record<PieceId, () => THREE.BufferGeometry> = {
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

export function pieceMaterial(piece: PieceId, materials: Materials): THREE.Material {
  switch (piece) {
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
    case 'floor':
      return [{ half: new THREE.Vector3(T / 2, 0.08, T / 2), offset: new THREE.Vector3(0, 0.08, 0) }];

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
          rotX: -slope,
        },
      ];
    }
  }
}
