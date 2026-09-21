import { beforeAll, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { buildIronNomad } from '@/machine/IronNomadGeometry';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import sharedSolids from '@/data/iron-nomad-shared-solids.json';
import manifest from '../../assets/iron-nomad/gameplay/source/gameplay-manifest.json';
import { DECK_SURFACE_Y } from '@/game/constants';

beforeAll(initRapier);

it('blocks the measured cabin overlap even when detailed models are disabled', () => {
  const material = new THREE.MeshBasicMaterial();
  const materials = new Proxy({}, { get: () => material }) as Materials;
  const build = buildIronNomad(materials);
  const physics = new PhysicsWorld();
  const body = physics.createDrivenBody();
  for (const collider of build.colliders) {
    const rotation = collider.rotX
      ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), collider.rotX)
      : undefined;
    physics.addBoxTo(body, collider.half, collider.center, rotation);
  }
  physics.step();
  const standingY = DECK_SURFACE_Y + 0.99;
  const player = physics.addCharacter(0.34, 0.62, new THREE.Vector3(6.2, standingY, -7.28));
  expect(
    physics.capsuleFits(new THREE.Vector3(6.2, standingY, -7.28), 0.34, 0.62, player.collider),
  ).toBe(false);
  expect(
    physics.capsuleFits(new THREE.Vector3(3.8, standingY, -7.28), 0.34, 0.62, player.collider),
  ).toBe(true);
  for (const solid of sharedSolids) {
    const visual = build.group.getObjectByName(solid.sourceObject)!;
    expect(visual.visible).toBe(true);
    expect(visual.userData.nomadFallback).toBe(true);
    // Each housing is owned by common physics; authored collision cannot add it again.
    expect(manifest.collisionObjects).not.toContain(solid.sourceObject);
  }
  expect(manifest.runtimeSolids).toEqual(sharedSolids);
  physics.dispose();
  build.group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  material.dispose();
});
