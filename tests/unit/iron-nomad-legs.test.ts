import { expect, it } from 'vitest';
import * as THREE from 'three';
import { IronNomadLegs } from '@/machine/IronNomadLegs';
import type { Materials } from '@/art/Materials';
import { LEGS, STRIDE_LENGTH } from '@/data/gait';
import { isPlanted } from '@/machine/Gait';
import profile from '@/data/iron-nomad.json';

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
  for (const [id, sx, sy] of [
    ['FrontRight', 1, -1],
    ['FrontLeft', -1, -1],
    ['RearRight', 1, 1],
    ['RearLeft', -1, 1],
  ] as const) {
    const hip = new THREE.Group();
    hip.name = `Leg_${id}_Hip`;
    hip.position.set(sx * 6.5, 9.6, -sy * 6);
    root.add(hip);
    for (const part of ['Upper', 'Lower', 'Foot']) {
      const node = new THREE.Group();
      node.name = `Leg_${id}_${part}`;
      (part === 'Upper' ? hip : root).add(node);
    }
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
    }
  }
  legs.setDistance(3);
  const before = foot.position.clone();
  expect(legs.setDistance(3)).toHaveLength(0);
  expect(foot.position.distanceTo(before)).toBeLessThan(0.00001);
  legs.dispose();
  material.dispose();
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
