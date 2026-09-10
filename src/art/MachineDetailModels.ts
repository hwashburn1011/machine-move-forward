import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from './Materials';
import { loadModel, type LoadedModel } from './ModelLoader';
import { applyHeightFog } from './Fog';
import nomad from '@/data/iron-nomad.json';
import {
  DECK_HEIGHT,
  DECK_PLATE_HALF,
  GRID_TILE,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
} from '@/game/constants';

const DECK_W = MACHINE_TILES_X * GRID_TILE;
const DECK_L = MACHINE_TILES_Z * GRID_TILE;

/** A small set of material-batched, visual-only machine details. */
export interface MachineDetailBatch {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
}

export interface MachineStationVisualModels {
  machine: LoadedModel | null;
  collision: LoadedModel | null;
  stations: LoadedModel | null;
}

/** Playable walker export; the constant name remains compatible with older tools. */
export const MACHINE_WALKER_V3_ASSET = nomad.model;

/**
 * Load the optional authored kit from the served model root. The caller keeps
 * the returned models alive for the session and applies them after the
 * synchronous Machine/BuildSystem constructors have established gameplay
 * state. A missing kit leaves the procedural path fully usable.
 */
export async function loadMachineStationVisualModels(
  baseUrl = 'models/authored',
): Promise<MachineStationVisualModels> {
  const [machine, stations, collision] = await Promise.all([
    loadModel(`${baseUrl}/${MACHINE_WALKER_V3_ASSET}`),
    loadModel(`${baseUrl}/station-kit.glb`),
    loadModel(`${baseUrl}/${nomad.collision}`),
  ]);
  const prepared = new Set<THREE.Material>();
  for (const model of [machine, stations])
    model?.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (prepared.has(material)) continue;
        prepared.add(material);
        applyHeightFog(material);
      }
    });
  return { machine, collision, stations };
}

interface Part {
  geometry: THREE.BufferGeometry;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const transformed = parts.map(({ geometry, position, rotation }) => {
    const clone = geometry.clone();
    if (rotation) clone.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    if (position) clone.translate(position.x, position.y, position.z);
    geometry.dispose();
    return clone;
  });
  const merged = BufferGeometryUtils.mergeGeometries(transformed, false);
  for (const geometry of transformed) geometry.dispose();
  if (!merged) throw new Error('MachineDetailModels: merge failed');
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function detailBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth, 2, 1, 2);
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  radialSegments = 12,
): THREE.BufferGeometry {
  const direction = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius * 1.08,
    direction.length(),
    radialSegments,
  );
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

function torusAt(
  position: THREE.Vector3,
  majorRadius: number,
  minorRadius: number,
  rotation: THREE.Euler,
): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(majorRadius, minorRadius, 8, 20);
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

function tube(points: THREE.Vector3[], radius: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, 12, radius, 8, false);
}

function batch(
  name: string,
  parts: Part[],
  material: THREE.Material,
  castShadow = false,
): MachineDetailBatch {
  return { name, geometry: merge(parts), material, castShadow };
}

/**
 * Build the machine's layered visual skin. These meshes are deliberately
 * collider-free: the authoritative deck, gate, room, and rail extents remain
 * in `MachineGeometry` and continue to define walkability and build cells.
 */
export function createMachineDetailBatches(materials: Materials): MachineDetailBatch[] {
  const steel: Part[] = [];
  const dark: Part[] = [];
  const rubber: Part[] = [];
  const accent: Part[] = [];

  // Welded ceiling beams and short cross-members make the hull read as a
  // fabricated frame when seen from the engine room and the side. They stay
  // above the lower-room capsule volume; a visual-only beam at floor height
  // looks like an invisible collision bug even when physics has no collider.
  const ceilingFrameY = DECK_HEIGHT - DECK_PLATE_HALF - 0.14;
  const stairWellMinX = -DECK_W / 2 + GRID_TILE;
  const stairWellMaxX = stairWellMinX + GRID_TILE;
  const openingMinX = stairWellMinX + 0.12;
  const openingMaxX = stairWellMaxX - 0.12;
  for (const z of [-6.2, -3.1, 0, 3.1, 6.2]) {
    const beamWidth = DECK_W + 0.25;
    const beamMinX = -beamWidth / 2;
    const beamMaxX = beamWidth / 2;
    const crossesStairwell = z > -2.11 && z < 2.11;
    if (!crossesStairwell) {
      dark.push({
        geometry: detailBox(beamWidth, 0.24, 0.22),
        position: new THREE.Vector3(0, ceilingFrameY, z),
      });
      continue;
    }
    for (const [minX, maxX] of [
      [beamMinX, openingMinX],
      [openingMaxX, beamMaxX],
    ] as const) {
      dark.push({
        geometry: detailBox(maxX - minX, 0.24, 0.22),
        position: new THREE.Vector3((minX + maxX) / 2, ceilingFrameY, z),
      });
    }
  }
  for (const x of [-4.35, 4.35]) {
    dark.push({
      geometry: detailBox(0.22, 0.3, DECK_L - 1.2),
      position: new THREE.Vector3(x, ceilingFrameY - 0.03, 0),
    });
  }

  // Wheel hubs, bearing races and six visible suspension cylinders.
  for (const x of [-5.45, 5.45]) {
    for (const z of [-5.35, 0, 5.35]) {
      const side = x < 0 ? -1 : 1;
      steel.push({
        geometry: cylinderBetween(
          new THREE.Vector3(x - side * 0.28, 1.55, z),
          new THREE.Vector3(x + side * 0.28, 1.55, z),
          0.46,
          16,
        ),
      });
      steel.push({
        geometry: torusAt(
          new THREE.Vector3(x + side * 0.31, 1.55, z),
          0.37,
          0.055,
          new THREE.Euler(0, 0, Math.PI / 2),
        ),
      });
      steel.push({
        geometry: cylinderBetween(
          new THREE.Vector3(x, 1.75, z),
          new THREE.Vector3(x, 2.85, z + side * 0.16),
          0.11,
          12,
        ),
      });
      rubber.push({
        geometry: torusAt(
          new THREE.Vector3(x + side * 0.34, 1.55, z),
          0.23,
          0.045,
          new THREE.Euler(0, 0, Math.PI / 2),
        ),
      });
    }
  }

  // Tread lugs are shallow and repeated in one batch, giving the running gear
  // a readable manufactured rhythm without changing its collision envelope.
  for (const x of [-5.28, 5.28]) {
    for (let i = 0; i < 9; i++) {
      const z = -6.6 + i * 1.65;
      rubber.push({
        geometry: detailBox(0.24, 0.16, 0.55),
        position: new THREE.Vector3(x, 1.48, z),
        rotation: new THREE.Euler(0, 0, x < 0 ? -0.1 : 0.1),
      });
    }
  }

  // Formed service hatches, perimeter seams and restrained bolt heads on the
  // deck. These stay below the existing autostep clearance.
  for (const [x, z] of [
    [1.9, -1.9],
    [1.9, 1.9],
    [-1.9, 4.9],
  ] as const) {
    steel.push({
      geometry: detailBox(1.25, 0.06, 0.86),
      position: new THREE.Vector3(x, DECK_HEIGHT + 0.12, z),
    });
    for (const sx of [-0.48, 0.48]) {
      for (const sz of [-0.3, 0.3]) {
        steel.push({
          geometry: cylinderBetween(
            new THREE.Vector3(x + sx, DECK_HEIGHT + 0.15, z + sz),
            new THREE.Vector3(x + sx, DECK_HEIGHT + 0.18, z + sz),
            0.035,
            8,
          ),
        });
      }
    }
  }

  // Two bent pipes and their clamps connect the engine block to the aft hull.
  for (const side of [-1, 1]) {
    const x = side * 1.35;
    steel.push({
      geometry: tube(
        [
          new THREE.Vector3(x, DECK_HEIGHT + 1.75, 5.8),
          new THREE.Vector3(x * 1.05, DECK_HEIGHT + 2.35, 5.2),
          new THREE.Vector3(side * 2.25, DECK_HEIGHT + 2.35, 4.5),
        ],
        0.07,
      ),
    });
    for (const z of [5.35, 4.95]) {
      steel.push({
        geometry: torusAt(
          new THREE.Vector3(x, DECK_HEIGHT + 2.03, z),
          0.09,
          0.018,
          new THREE.Euler(Math.PI / 2, 0, 0),
        ),
      });
    }
  }

  // Small hazard tabs make the service access legible at normal gameplay
  // distance without introducing a new material or a noisy texture layer.
  for (const z of [-6.9, 6.9]) {
    accent.push({
      geometry: detailBox(2.4, 0.05, 0.12),
      position: new THREE.Vector3(0, DECK_HEIGHT + 0.15, z),
    });
  }

  return [
    batch('MachineWeldedFrame', dark, materials.hullDark, true),
    batch('MachineBearingsAndHatches', steel, materials.bareSteel, true),
    batch('MachineTreadLugs', rubber, materials.rubber, false),
    batch('MachineServiceMarkings', accent, materials.hazard, false),
  ];
}
