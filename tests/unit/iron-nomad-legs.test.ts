import { expect, it } from 'vitest';
import * as THREE from 'three';
import { IronNomadLegs } from '@/machine/IronNomadLegs';
import type { Materials } from '@/art/Materials';
import { STRIDE_LENGTH } from '@/data/gait';
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
