import { expect, it } from 'vitest';
import * as THREE from 'three';
import { IronNomadLegs } from '@/machine/IronNomadLegs';
import type { Materials } from '@/art/Materials';
import { LEGS, STRIDE_LENGTH } from '@/data/gait';
import { isPlanted } from '@/machine/Gait';
import profile from '@/data/iron-nomad.json';
import {
  NOMAD_LEG_GAME_ANCHORS,
  NOMAD_LEG_SOURCE_RIG,
  nomadLegGameHip,
  nomadLegSourceRig,
} from '@/data/nomad-leg-contract';
import { solveNomadKnee } from '@/machine/IronNomadLegs';

it('drives glTF Y-up pivots to planted world-space feet, and stops with travel', () => {
  const material = new THREE.MeshBasicMaterial();
  const legs = new IronNomadLegs({ hullDark: material } as unknown as Materials);
  const body = new THREE.Group(),
    wrapper = new THREE.Group(),
    root = new THREE.Group();
  root.name = 'IronNomad_FourLegWalker';
  wrapper.add(root);
  body.add(wrapper);
  wrapper.scale.fromArray(profile.scale);
  wrapper.rotation.y = Math.PI;
  wrapper.position.y = profile.offsetY;
  for (const [id, sx, sy, side, end] of [
    ['FrontRight', 1, -1, -1, -1],
    ['FrontLeft', -1, -1, 1, -1],
    ['RearRight', 1, 1, -1, 1],
    ['RearLeft', -1, 1, 1, 1],
  ] as const) {
    const rig = nomadLegSourceRig(sx, sy);
    const hip = new THREE.Group();
    hip.name = `Leg_${id}_Hip`;
    hip.position.set(rig.hip.x, rig.hip.z, -rig.hip.y);
    root.add(hip);
    for (const part of ['Upper', 'Lower', 'Foot']) {
      const node = new THREE.Group();
      node.name = `Leg_${id}_${part}`;
      (part === 'Upper' ? hip : root).add(node);
    }
    body.updateMatrixWorld(true);
    const expected = nomadLegGameHip(side, end);
    const actual = hip.getWorldPosition(new THREE.Vector3());
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
  }
  legs.apply(wrapper);
  const foot = root.getObjectByName('Leg_FrontRight_Foot')!;
  for (const tilt of [0, 0.025]) {
    body.rotation.set(tilt, 0, -tilt);
    body.position.y = tilt;
    for (let d = 0; d < STRIDE_LENGTH; d += 0.1) {
      legs.setDistance(d);
      body.updateMatrixWorld(true);
      const actual = foot.getWorldPosition(new THREE.Vector3());
      const target = legs.footPosition(0, new THREE.Vector3());
      expect(actual.x).toBeCloseTo(target.x, 4);
      expect(actual.z).toBeCloseTo(target.z, 4);
      expect(actual.y - target.y).toBeCloseTo(0.8166667, 4);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
        foot.getWorldQuaternion(new THREE.Quaternion()),
      );
      expect(up.y).toBeGreaterThan(0.9999);
      expect(Number.isFinite(root.getObjectByName('Leg_FrontRight_Upper')!.quaternion.w)).toBe(
        true,
      );

      // The authored upper's local +Y is source-rig +Z after Blender-to-glTF
      // conversion. Its rotation must aim that axis from the measured v3 hip
      // toward the knee solved from the same translated rest rig.
      const rig = nomadLegSourceRig(1, -1);
      const h = new THREE.Vector3(rig.hip.x, rig.hip.y, rig.hip.z);
      const k = new THREE.Vector3(rig.knee.x, rig.knee.y, rig.knee.z);
      const f = new THREE.Vector3(rig.foot.x, rig.foot.y, rig.foot.z);
      const localGltf = root.worldToLocal(target.clone().add(new THREE.Vector3(0, 0.8166667, 0)));
      const localSource = new THREE.Vector3(localGltf.x, -localGltf.z, localGltf.y);
      const knee = solveNomadKnee(h, k, f, localSource);
      const expectedAxis = knee.sub(h).normalize();
      const upper = root.getObjectByName('Leg_FrontRight_Upper')!;
      const gltfAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(upper.quaternion);
      const actualAxis = new THREE.Vector3(gltfAxis.x, -gltfAxis.z, gltfAxis.y).normalize();
      expect(actualAxis.dot(expectedAxis)).toBeGreaterThan(0.999999);
    }
  }
  legs.setDistance(3);
  const before = foot.position.clone();
  expect(legs.setDistance(3)).toHaveLength(0);
  expect(foot.position.distanceTo(before)).toBeLessThan(0.00001);
  legs.dispose();
  material.dispose();
});

it('derives the measured v3 hip and translated source rig from the layout profile', () => {
  expect(NOMAD_LEG_GAME_ANCHORS.hipAbs).toEqual({ x: 8.9375, y: 7.9966666667, z: 7.8 });
  expect(NOMAD_LEG_GAME_ANCHORS.repairAbs).toEqual({ x: 10.3625, z: 7.8 });
  expect(NOMAD_LEG_SOURCE_RIG.hipAbs).toEqual({
    x: 11.916666666666668,
    y: 9.75,
    z: 9.6,
  });
  const hip = NOMAD_LEG_SOURCE_RIG.hipAbs;
  const knee = NOMAD_LEG_SOURCE_RIG.kneeAbs;
  const foot = NOMAD_LEG_SOURCE_RIG.footAbs;
  expect(knee.x - hip.x).toBeCloseTo(2.2, 12);
  expect(knee.y - hip.y).toBeCloseTo(-0.9, 12);
  expect(knee.z - hip.z).toBeCloseTo(-4.55, 12);
  expect(foot.x - knee.x).toBeCloseTo(0.65, 12);
  expect(foot.y - knee.y).toBeCloseTo(2.9, 12);
  expect(foot.z - knee.z).toBeCloseTo(-4.05, 12);
});

it('holds planted feet at one permanent world X while the course moves laterally', () => {
  const material = new THREE.MeshBasicMaterial();
  const legs = new IronNomadLegs({ hullDark: material } as unknown as Materials);
  const plantedWorldX = new Map<number, number>();
  for (let step = 0; step <= 600; step++) {
    const distance = step * 0.012;
    const lateral = distance * 0.35;
    legs.setDistance(distance, lateral);
    for (let i = 0; i < LEGS.length; i++) {
      if (!isPlanted(distance, LEGS[i]!)) {
        plantedWorldX.delete(i);
        continue;
      }
      const worldX = legs.footPosition(i, new THREE.Vector3()).x + lateral;
      const prior = plantedWorldX.get(i);
      if (prior !== undefined) expect(worldX).toBeCloseTo(prior, 8);
      else plantedWorldX.set(i, worldX);
    }
  }
  legs.dispose();
  material.dispose();
});

it('produces the same lateral foot pose at 30, 60 and 144 render samples', () => {
  const poses = [30, 60, 144].map((hz) => {
    const material = new THREE.MeshBasicMaterial();
    const legs = new IronNomadLegs({ hullDark: material } as unknown as Materials);
    const duration = 2;
    for (let frame = 0; frame <= duration * hz; frame++) {
      const time = frame / hz;
      const distance = time * 3.3;
      legs.setDistance(distance, time * 0.8);
    }
    const pose = LEGS.map((_, index) => legs.footPosition(index, new THREE.Vector3()).clone());
    const before = pose.map((point) => point.clone());
    expect(legs.setDistance(6.6, 1.6)).toHaveLength(0);
    for (let i = 0; i < pose.length; i++)
      expect(legs.footPosition(i, new THREE.Vector3()).distanceTo(before[i]!)).toBeLessThan(1e-10);
    legs.dispose();
    material.dispose();
    return pose;
  });
  for (let cadence = 1; cadence < poses.length; cadence++)
    for (let leg = 0; leg < LEGS.length; leg++)
      expect(poses[cadence]![leg]!.distanceTo(poses[0]![leg]!)).toBeLessThan(1e-7);
});

it('does not replay plant transitions when interpolated render samples move backward', () => {
  const material = new THREE.MeshBasicMaterial();
  const legs = new IronNomadLegs({ hullDark: material } as unknown as Materials);
  const plantedWorldX = new Map<number, number>();
  let distance = 0;
  let lateral = 0;
  for (let tick = 1; tick <= 240; tick++) {
    const previousDistance = distance;
    const previousLateral = lateral;
    distance += 3.3 / 60;
    lateral += 0.8 / 60;
    const planted = [...legs.setDistance(distance, lateral)];
    for (const alpha of [0.8, 0.45, 0.1]) {
      const renderedDistance = THREE.MathUtils.lerp(previousDistance, distance, alpha);
      const renderedLateral = THREE.MathUtils.lerp(previousLateral, lateral, alpha);
      expect(legs.setDistance(renderedDistance, renderedLateral)).toHaveLength(0);
    }
    expect(legs.setDistance(distance, lateral)).toHaveLength(0);
    for (let i = 0; i < LEGS.length; i++) {
      if (!isPlanted(distance, LEGS[i]!)) {
        plantedWorldX.delete(i);
        continue;
      }
      const worldX = legs.footPosition(i, new THREE.Vector3()).x + lateral;
      if (planted.includes(i) || !plantedWorldX.has(i)) plantedWorldX.set(i, worldX);
      expect(worldX).toBeCloseTo(plantedWorldX.get(i)!, 8);
    }
  }
  legs.dispose();
  material.dispose();
});
