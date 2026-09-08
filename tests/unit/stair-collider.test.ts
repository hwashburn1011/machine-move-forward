import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildSystem } from '@/building/BuildSystem';
import { cellKey } from '@/building/BuildGrid';
import { stairsCells, stairsExit } from '@/building/BuildValidation';
import { Container } from '@/items/Container';
import { EventBus } from '@/core/events/EventBus';
import { ResourceAccess } from '@/items/ResourceAccess';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { Machine } from '@/machine/Machine';

function stubMaterials(): Materials {
  const material = new THREE.MeshBasicMaterial();
  return {
    hull: material,
    hullDark: material,
    rustedSteel: material,
    deckPlate: material,
    buildPlate: material,
    stationMetal: material,
    bareSteel: material,
    accent: material,
    hazard: material,
    rubber: material,
    treadMap: new THREE.DataTexture(),
    glass: material,
    emissiveWarn: material,
  } as unknown as Materials;
}

function buildForStairs(rotated: { quaternion: THREE.Quaternion }[]): BuildSystem {
  const inventory = new Container(16);
  const bus = new EventBus();
  const resources = new ResourceAccess(
    inventory,
    () => [],
    () => ({ x: 0, y: 0, z: 0 }),
    bus,
  );
  const machine = {
    equipmentCells: [],
    deckCells: [{ x: 0, y: 0, z: 0 }],
    fixedLinks: [],
    movement: { totalWeight: 0 },
  } as unknown as Machine;
  const physics = {
    addFixedBox: () => ({}),
    addFixedBoxRotated: (
      _half: THREE.Vector3,
      _center: THREE.Vector3,
      quaternion: THREE.Quaternion,
    ) => {
      rotated.push({ quaternion: quaternion.clone() });
      return {};
    },
    removeCollider: () => undefined,
  } as unknown as PhysicsWorld;
  return new BuildSystem(new THREE.Scene(), physics, bus, stubMaterials(), machine, resources);
}

describe('stair collider orientation', () => {
  it('keeps the 3-4-5 uphill axis and walkable top normal for every rotation', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const rotated: { quaternion: THREE.Quaternion }[] = [];
      const build = buildForStairs(rotated);
      const base = { x: 0, y: 0, z: 0 };

      expect(build.place({ piece: 'floor', cell: base, rotation: 0 }, true)).not.toBeNull();
      expect(build.place({ piece: 'stairs', cell: base, rotation }, true)).not.toBeNull();
      expect(rotated).toHaveLength(1);

      const { quaternion } = rotated[0]!;
      // The authored box points along local -Z. Its X rotation supplies the
      // 3m rise over the 4m horizontal run; do not pre-rotate the vector here.
      const uphill = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      const topNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
      const run = [
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
      ][rotation]!;

      expect(
        uphill.dot(new THREE.Vector3(run.x * (4 / 5), 3 / 5, run.z * (4 / 5))),
      ).toBeGreaterThan(0.999);
      expect(
        topNormal.dot(new THREE.Vector3(-run.x * (3 / 5), 4 / 5, -run.z * (3 / 5))),
      ).toBeGreaterThan(0.999);
    }
  });

  it('links a repathing enemy from the ramp run directly to the upper exit', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const rotated: { quaternion: THREE.Quaternion }[] = [];
      const build = buildForStairs(rotated);
      const base = { x: 0, y: 0, z: 0 };
      const { run } = stairsCells(base, rotation);
      const exit = stairsExit(base, rotation);
      const lowerExit = { ...exit, y: 0 };

      expect(build.place({ piece: 'floor', cell: base, rotation: 0 }, true)).not.toBeNull();
      expect(build.place({ piece: 'stairs', cell: base, rotation }, true)).not.toBeNull();
      // Give the upper floor real support through the same placement rules a
      // player uses: a floor below the exit and a wall bearing its near edge.
      expect(build.place({ piece: 'floor', cell: lowerExit, rotation: 0 }, true)).not.toBeNull();
      expect(
        build.place(
          {
            piece: 'wall',
            cell: lowerExit,
            edge: { x: lowerExit.x, y: lowerExit.y, z: lowerExit.z, axis: 'x' },
            rotation: 0,
          },
          true,
        ),
      ).not.toBeNull();
      expect(build.place({ piece: 'floor', cell: exit, rotation: 0 }, true)).not.toBeNull();

      const links = build.navGraph.links.get(cellKey(run)) ?? [];
      expect(links.map(cellKey)).toContain(cellKey(exit));
    }
  });
});
