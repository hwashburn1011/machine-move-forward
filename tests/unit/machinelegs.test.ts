import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { MachineLegs } from '@/machine/MachineLegs';
import { footAt } from '@/machine/Gait';
import { LEGS, LOWER_LEG, STRIDE_LENGTH, UPPER_LEG, type LegDefinition } from '@/data/gait';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';

/**
 * The legs as they are actually assembled: a scene graph, driven by the gait
 * through the IK.
 *
 * This is the test that catches sign errors. `Gait` and `LegIK` are each
 * correct on their own and provably so, and they are still perfectly capable
 * of producing legs that swing backwards or splay into the hull, because
 * between them and the screen sits a hierarchy of rotations whose conventions
 * have to agree. Asking where the foot bone ENDS UP, in world space, after the
 * whole chain has been applied, is the only question that covers all of it.
 *
 * Three.js runs happily in node as long as nothing asks for a renderer, so
 * this needs no browser.
 */

function stubMaterials(): Materials {
  const m = new THREE.MeshStandardMaterial();
  return {
    hull: m,
    hullDark: m,
    bareSteel: m,
    rustedSteel: m,
    rubber: m,
    accent: m,
    hazard: m,
  } as unknown as Materials;
}

/** Where the foot actually is once every joint in the chain has been applied. */
function footWorld(legs: MachineLegs, index: number): THREE.Vector3 {
  const foot = legs.footObject(index);
  foot.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
}

function kneeWorld(legs: MachineLegs, index: number): THREE.Vector3 {
  const knee = legs.kneeObject(index);
  knee.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(knee.matrixWorld);
}

describe('the legs, assembled and driven', () => {
  it('puts every foot exactly where the gait asked for it', () => {
    const legs = new MachineLegs(stubMaterials());
    for (let i = 0; i < 24; i++) {
      const d = (i / 24) * STRIDE_LENGTH;
      legs.setDistance(d);
      LEGS.forEach((leg, index) => {
        const wanted = footAt(d, leg);
        const got = footWorld(legs, index);
        expect(got.x).toBeCloseTo(wanted.x, 6);
        expect(got.y).toBeCloseTo(wanted.y, 6);
        expect(got.z).toBeCloseTo(wanted.z, 6);
      });
    }
  });

  it('keeps the bones the length they are supposed to be', () => {
    const legs = new MachineLegs(stubMaterials());
    legs.setDistance(2.7);
    LEGS.forEach((leg, index) => {
      const hip = new THREE.Vector3(leg.hip.x, leg.hip.y, leg.hip.z);
      expect(kneeWorld(legs, index).distanceTo(hip)).toBeCloseTo(UPPER_LEG, 6);
      expect(footWorld(legs, index).distanceTo(kneeWorld(legs, index))).toBeCloseTo(LOWER_LEG, 6);
    });
  });

  it('hangs its knees below its hips, never above them', () => {
    // A leg that folds the wrong way puts the knee up through the deck.
    const legs = new MachineLegs(stubMaterials());
    for (let i = 0; i < 36; i++) {
      legs.setDistance((i / 36) * STRIDE_LENGTH);
      LEGS.forEach((leg, index) => {
        expect(kneeWorld(legs, index).y).toBeLessThan(leg.hip.y);
      });
    }
  });

  it('keeps the knees outboard of the hull, not inside the engine room', () => {
    const legs = new MachineLegs(stubMaterials());
    for (let i = 0; i < 36; i++) {
      legs.setDistance((i / 36) * STRIDE_LENGTH);
      LEGS.forEach((leg, index) => {
        const knee = kneeWorld(legs, index);
        expect(Math.abs(knee.x)).toBeGreaterThan(5);
        expect(Math.sign(knee.x)).toBe(leg.side);
      });
    }
  });

  it('trails its knees behind its feet, the way a walker reads', () => {
    // Knee-back, like a bird's leg or every mech ever drawn — not a knee
    // buckling forward under the load. "Behind" is the way the ground recedes,
    // which is the way the world scrolls, so the test asks rather than assumes.
    const legs = new MachineLegs(stubMaterials());
    legs.setDistance(0);
    LEGS.forEach((_leg, index) => {
      const knee = WORLD_Z_PER_METRE * kneeWorld(legs, index).z;
      const foot = WORLD_Z_PER_METRE * footWorld(legs, index).z;
      expect(knee).toBeGreaterThan(foot);
    });
  });

  it('moves without jumping, all the way through a stride', () => {
    const legs = new MachineLegs(stubMaterials());
    const step = STRIDE_LENGTH / 2000;
    const previous = LEGS.map(() => new THREE.Vector3());
    legs.setDistance(0);
    LEGS.forEach((_l, i) => previous[i]?.copy(footWorld(legs, i)));

    for (let i = 1; i < 2000; i++) {
      legs.setDistance(i * step);
      LEGS.forEach((_l, index) => {
        const now = footWorld(legs, index);
        expect(now.distanceTo(previous[index] as THREE.Vector3)).toBeLessThan(step * 20);
        (previous[index] as THREE.Vector3).copy(now);
      });
    }
  });

  it('does not move at all while the machine is stopped', () => {
    const legs = new MachineLegs(stubMaterials());
    legs.setDistance(13.2);
    const before = LEGS.map((_l, i) => footWorld(legs, i));
    legs.setDistance(13.2);
    LEGS.forEach((_l, i) => {
      expect(footWorld(legs, i).distanceTo(before[i] as THREE.Vector3)).toBe(0);
    });
  });

  it('reports a foot planting, once per leg per stride', () => {
    // What the footfalls in the sand and the puff of dust hang off.
    const legs = new MachineLegs(stubMaterials());
    const plants: number[] = LEGS.map(() => 0);
    const steps = 600;
    // Started off a stride boundary on purpose. Whether a plant that falls
    // exactly on one is counted at its near or its far side is a question
    // about floating point, not about the gait, and in play the machine covers
    // an eighth of a metre a step and never lands on one.
    const from = 0.1;
    legs.setDistance(from);
    for (let i = 1; i <= steps; i++) {
      for (const index of legs.setDistance(from + (i / steps) * STRIDE_LENGTH * 3)) {
        plants[index] = (plants[index] ?? 0) + 1;
      }
    }
    for (const count of plants) expect(count).toBe(3);
  });

  it('gives every leg its own place on the machine', () => {
    const legs = new MachineLegs(stubMaterials());
    legs.setDistance(1.4);
    const seen = new Set<string>();
    LEGS.forEach((_l, i) => {
      const p = footWorld(legs, i);
      seen.add(`${Math.round(p.x)},${Math.round(p.z)}`);
    });
    expect(seen.size).toBe(LEGS.length);
  });
});

describe('what the legs are made of', () => {
  it('builds one object per leg, hung off a single group', () => {
    const legs = new MachineLegs(stubMaterials());
    expect(legs.object3D.children.length).toBe(LEGS.length);
  });

  it('draws something for every leg', () => {
    const legs = new MachineLegs(stubMaterials());
    let meshes = 0;
    legs.object3D.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThanOrEqual(LEGS.length * 3);
  });

  it('names its legs, so a scene graph can be read', () => {
    const legs = new MachineLegs(stubMaterials());
    const names = legs.object3D.children.map((c) => c.name);
    expect(names).toEqual(LEGS.map((leg: LegDefinition) => `leg-${leg.id}`));
  });
});
