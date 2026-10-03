import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BuildSystem } from '@/building/BuildSystem';
import { buildPieceGeometry, pieceColliders } from '@/building/BuildPieceGeometry';
import { cellCenter } from '@/building/BuildGrid';
import { BuildPreview } from '@/building/BuildPreview';
import { Machine } from '@/machine/Machine';
import { PhysicsWorld, initRapier } from '@/core/physics/PhysicsWorld';
import { EventBus } from '@/core/events/EventBus';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { DECK_SURFACE_Y, LEVEL_HEIGHT } from '@/game/constants';
import type { Materials } from '@/art/Materials';

beforeAll(initRapier);

describe('built floors attached to the moving hull', () => {
  it.each([-2, -1, 0])('matches the authored deck and collision on level %i', (level) => {
    const geometry = buildPieceGeometry('floor');
    geometry.computeBoundingBox();
    const origin = cellCenter({ x: 6, y: level, z: 0 });
    const collider = pieceColliders('floor')[0]!;
    const expected = DECK_SURFACE_Y + level * LEVEL_HEIGHT;
    expect(origin.y + geometry.boundingBox!.max.y).toBeCloseTo(expected, 5);
    expect(origin.y + collider.offset.y + collider.half.y).toBeCloseTo(expected, 5);
  });

  it('keeps placement, physics, preview, interaction and restored pieces together through a stride', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const material = new THREE.MeshStandardMaterial();
    const materials = Object.fromEntries(
      [
        'hull',
        'hullDark',
        'bareSteel',
        'rustedSteel',
        'rubber',
        'accent',
        'hazard',
        'emissiveWarn',
        'deckPlate',
        'buildPlate',
        'stationMetal',
        'glass',
      ].map((name) => [name, material]),
    ) as unknown as Materials;
    const machine = new Machine(scene, physics, materials);
    const bus = new EventBus();
    const resources = new ResourceAccess(
      new Container(16),
      () => [],
      () => ({ x: 0, y: 0, z: 0 }),
      bus,
    );
    const build = new BuildSystem(scene, physics, bus, materials, machine, resources);
    const preview = new BuildPreview(scene);
    try {
      machine.setPose({ heave: 0.11, pitch: 0.012, roll: -0.014 });
      machine.fixedUpdate(0);
      const cell = { x: 7, y: 0, z: 6 };
      const floor = build.place({ piece: 'floor', cell, rotation: 0 }, true)!;
      const crate = build.place({ piece: 'crate', cell, rotation: 0 }, true)!;
      expect(floor).not.toBeNull();
      build.crateContainer(crate.instanceId)!.add('scrap', 7);
      const snapshot = build.serialise();
      const bodies = physics.bodyCount;
      for (let frame = 0; frame < 90; frame++) {
        machine.setPose({
          heave: 0.12 * Math.sin(frame * 0.17),
          pitch: 0.016 * Math.sin(frame * 0.13),
          roll: 0.014 * Math.cos(frame * 0.11),
        });
        machine.fixedUpdate(0);
        physics.step();
        scene.updateMatrixWorld(true);
        const local = new THREE.Vector3(cell.x * 2, DECK_SURFACE_Y, cell.z * 2);
        const surface = local.clone().applyMatrix4(machine.group.matrixWorld);
        expect(
          build.visual(floor.instanceId)!.getWorldPosition(new THREE.Vector3()).distanceTo(surface),
        ).toBeLessThan(1e-6);
        const up = new THREE.Vector3(0, 1, 0).transformDirection(machine.group.matrixWorld);
        const hit = physics.raycast(
          surface.clone().addScaledVector(up, 2),
          up.clone().negate(),
          3,
          undefined,
          (collider) => (physics.getUserData(collider) as { id?: string })?.id === floor.instanceId,
        );
        expect(hit).not.toBeNull();
        expect(hit!.point.distanceTo(surface)).toBeLessThan(0.0001);
        expect(hit!.collider.parent()).toBe(machine.constructionBody);
        expect(
          build.stationsNear(surface, 0.001).some((ref) => ref.instanceId === crate.instanceId),
        ).toBe(true);
        expect(
          new THREE.Vector3().copy(build.crates()[0]!.position).distanceTo(surface),
        ).toBeLessThan(1e-6);
        preview.updateTargeted(
          {
            viewOrigin: surface.clone().addScaledVector(up, 2),
            viewDirection: up.clone().negate(),
            chestWorld: surface.clone().addScaledVector(up, 1),
            piece: 'floor',
            rotation: 0,
            grid: build.gridView,
            machineTransform: build.group.matrixWorld,
            levelMode: 'manual',
            manualLevel: 0,
            autoLevel: 0,
            raycast: () => [],
          },
          build,
        );
        expect(preview.placement?.cell).toEqual(cell);
        expect(preview.mesh.position.distanceTo(surface)).toBeLessThan(0.0001);
      }
      build.restore(snapshot);
      physics.step();
      expect(physics.bodyCount).toBe(bodies);
      expect(build.crateContainer(crate.instanceId)!.count('scrap')).toBe(7);
      expect(build.group.parent).toBe(machine.group);
      build.clear();
      expect(machine.constructionBody.isValid()).toBe(true);
      expect(machine.constructionBody.numColliders()).toBe(0);
    } finally {
      preview.dispose();
      build.dispose();
      machine.dispose();
      physics.dispose();
      material.dispose();
    }
  });
});
