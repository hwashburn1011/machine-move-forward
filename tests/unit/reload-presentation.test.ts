import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ReloadPresentation } from '@/player/ReloadPresentation';
import { footContactWeight } from '@/player/AnimationProfile';

describe('reload presentation over moving legs', () => {
  it('overrides the upper body at the weapon clock, restores it on cancel and never writes the legs', () => {
    const root = new THREE.Group(),
      arm = new THREE.Bone(),
      leg = new THREE.Bone();
    arm.name = 'upperarm_l';
    leg.name = 'thigh_l';
    root.add(arm, leg);
    const clip = new THREE.AnimationClip('reload_rifle', 2, [
      new THREE.VectorKeyframeTrack('upperarm_l.position', [0, 2], [0, 0, 0, 2, 0, 0]),
      new THREE.VectorKeyframeTrack('thigh_l.position', [0, 2], [0, 0, 0, 99, 0, 0]),
    ]);
    const layer = new ReloadPresentation(root, [clip]);
    arm.position.set(0.25, 1, 0);
    leg.position.set(0, -1, 0);
    layer.setState('rifle', true, 0.5);
    layer.apply();
    expect(arm.position.toArray()).toEqual([1, 0, 0]);
    expect(leg.position.toArray()).toEqual([0, -1, 0]);
    // A paused weapon clock holds the same pose without accumulated offsets.
    for (let frame = 0; frame < 100; frame++) {
      layer.resetApplied();
      layer.apply();
    }
    expect(arm.position.toArray()).toEqual([1, 0, 0]);
    layer.setState('rifle', false, 0);
    layer.resetApplied();
    layer.apply();
    expect(arm.position.toArray()).toEqual([0.25, 1, 0]);
  });
  it('keeps the swing foot free and blends its contact at the next step', () => {
    expect(footContactWeight(0.2, 'walk')).toBe(1);
    expect(footContactWeight(0.8, 'walk')).toBe(0);
    expect(footContactWeight(0.97, 'walk')).toBeCloseTo(0.5);
    expect(footContactWeight(0, 'walk')).toBe(1);
  });
});
