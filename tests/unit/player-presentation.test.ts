import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { directionalBlend, directionalMotion } from '@/player/PlayerGait';
import { directionalWeights, locomotionCadence, PlayerVisual } from '@/player/PlayerVisual';
import { authoredLocomotionSpeed } from '@/player/AnimationProfile';
import { PlayerFootPlacement } from '@/player/PlayerFootPlacement';
import {
  isUpperBodyTrack,
  playerCombatSnapshot,
  reloadClipForWeapon,
} from '@/player/WeaponPresentation';

describe('player presentation', () => {
  it('resolves directional clips with deadzone and airborne fallback', () => {
    expect(directionalMotion(0, 0.1, false, true)).toBe('idle');
    expect(directionalMotion(0, 1, false, true)).toBe('walk_fwd');
    expect(directionalMotion(-1, 0, true, true)).toBe('crouch_walk_right');
    expect(directionalMotion(0, 1, false, false)).toBe('jump');
  });
  it('blends diagonals between cardinal authored clips', () => {
    expect(directionalBlend(1, 1)).toEqual({
      primary: 'fwd',
      secondary: 'left',
      primaryWeight: 0.5,
      secondaryWeight: 0.5,
    });
    expect(directionalBlend(-0.25, -0.75)).toEqual({
      primary: 'back',
      secondary: 'right',
      primaryWeight: 0.75,
      secondaryWeight: 0.25,
    });
  });
  it('uses the effective authored directional speed for cadence without changing movement', () => {
    const weights = directionalWeights(directionalBlend(1, 1));
    const reference =
      (authoredLocomotionSpeed('walk', 'fwd') + authoredLocomotionSpeed('walk', 'left')) / 2;
    expect(locomotionCadence(reference * 1.5, 'walk', weights)).toBeCloseTo(1.5, 6);
    expect(locomotionCadence(100, 'walk', weights)).toBe(2.5);
    expect(locomotionCadence(0, 'walk', weights)).toBe(0.1);
  });
  it('keeps cardinal phases continuous while blending direction and removes idle contribution', () => {
    const scene = new THREE.Group();
    const rig = new THREE.Bone();
    rig.name = 'S07_Rig';
    scene.add(rig);
    const names = [
      'armed_idle',
      ...['fwd', 'back', 'left', 'right'].map((direction) => `armed_walk_${direction}`),
      ...['fwd', 'back', 'left', 'right'].map((direction) => `armed_run_${direction}`),
    ];
    const clips = names.map(
      (name) =>
        new THREE.AnimationClip(name, 1, [
          new THREE.VectorKeyframeTrack('S07_Rig.position', [0, 1], [0, 0, 0, 0, 0, 0]),
        ]),
    );
    const visual = new PlayerVisual({ scene, clips } as never, {} as never);
    const internals = visual as unknown as {
      held: THREE.Object3D;
      actions: Map<string, THREE.AnimationAction>;
    };
    internals.held = new THREE.Group();
    visual.setMotion(0, true, false, new THREE.Vector3());
    visual.update(0.2);
    visual.setMotion(2, true, false, new THREE.Vector3(0, 0, 2));
    visual.update(0.2);
    expect(internals.actions.get('armed_idle')?.getEffectiveWeight()).toBe(0);
    const phase = internals.actions.get('armed_walk_fwd')!.time;
    visual.setMotion(2, true, false, new THREE.Vector3(-1, 0, 1));
    expect(internals.actions.get('armed_walk_fwd')!.time).toBe(phase);
    expect(internals.actions.get('armed_walk_right')!.time).toBeCloseTo(phase, 7);
    // The opening uses a running pose at its actual travel speed. Ordinary
    // movement still selects walking when no cinematic gait is supplied.
    visual.setMotion(4.45, true, false, new THREE.Vector3(0, 0, 4.45), 'run');
    visual.update(0.25);
    const run = internals.actions.get('armed_run_fwd')!;
    expect(run.getEffectiveTimeScale()).toBeCloseTo(
      4.45 / authoredLocomotionSpeed('run', 'fwd'),
      6,
    );
    expect(run.getEffectiveWeight()).toBeGreaterThan(0.7);
    visual.setMotion(4.45, true, false, new THREE.Vector3(0, 0, 4.45));
    visual.update(0.25);
    expect(internals.actions.get('armed_walk_fwd')!.getEffectiveWeight()).toBeGreaterThan(0.7);
    visual.dispose();
  });
  it('adjusts bones only, ignores player in both probes, and restores airborne pose', () => {
    const root = new THREE.Group();
    root.rotation.set(0.15, 0.4, -0.08);
    root.scale.setScalar(1.3);
    const makeLeg = (x: number) => {
      const thigh = new THREE.Bone(),
        calf = new THREE.Bone(),
        foot = new THREE.Bone();
      thigh.position.set(x, 0, 0);
      calf.position.set(0, -0.8, 0.18);
      foot.position.set(0, -0.75, -0.08);
      root.add(thigh);
      thigh.add(calf);
      calf.add(foot);
      return { thigh, calf, foot };
    };
    const left = makeLeg(-0.2),
      right = makeLeg(0.2);
    root.updateWorldMatrix(true, true);
    const leftLocal = left.foot.position.clone(),
      rightLocal = right.foot.position.clone();
    const leftRest = left.foot.getWorldPosition(new THREE.Vector3());
    const leftAnimatedRotation = left.foot.getWorldQuaternion(new THREE.Quaternion());
    const calls: boolean[] = [];
    const ik = new PlayerFootPlacement(
      left.foot,
      right.foot,
      {
        sample: (origin, _max, ignore) => {
          calls.push(ignore);
          return {
            hit: true,
            point: { x: origin.x, y: origin.y - 0.15, z: origin.z },
            normal: { x: 0, y: 1, z: 0 },
          };
        },
      },
      {
        leftThigh: left.thigh,
        leftCalf: left.calf,
        rightThigh: right.thigh,
        rightCalf: right.calf,
      },
    );
    ik.update(new THREE.Vector3(), true);
    root.updateWorldMatrix(true, true);
    const solved = left.foot.getWorldPosition(new THREE.Vector3());
    expect(solved.distanceTo(leftRest.clone().setY(leftRest.y + 0.1))).toBeLessThan(0.015);
    expect(left.foot.position).toEqual(leftLocal);
    expect(right.foot.position).toEqual(rightLocal);
    expect(calls).toEqual([true, true]);
    expect(
      left.foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(leftAnimatedRotation),
    ).toBeLessThan(1e-6);
    ik.update(new THREE.Vector3(), false);
    expect(left.thigh.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
  it('applies and removes bounded leg/pelvis corrections without accumulation', () => {
    const root = new THREE.Group(),
      thigh = new THREE.Bone(),
      calf = new THREE.Bone(),
      foot = new THREE.Bone();
    calf.position.set(0, -1, 0.2);
    foot.position.set(0, -1, -0.1);
    root.add(thigh);
    thigh.add(calf);
    calf.add(foot);
    const otherThigh = thigh.clone(),
      otherCalf = otherThigh.children[0] as THREE.Bone,
      otherFoot = otherCalf.children[0] as THREE.Bone;
    root.add(otherThigh);
    root.updateWorldMatrix(true, true);
    const upper = thigh
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(calf.getWorldPosition(new THREE.Vector3()));
    const lower = calf
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(foot.getWorldPosition(new THREE.Vector3()));
    const ik = new PlayerFootPlacement(
      foot,
      otherFoot,
      {
        sample: (origin) => ({
          hit: true,
          point: { x: origin.x, y: origin.y - 0.1, z: origin.z },
          normal: { x: 0, y: 1, z: 0 },
        }),
      },
      { leftThigh: thigh, leftCalf: calf, rightThigh: otherThigh, rightCalf: otherCalf },
    );
    for (let i = 0; i < 100; i++) ik.update(new THREE.Vector3(), true);
    root.updateWorldMatrix(true, true);
    expect(
      thigh
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(calf.getWorldPosition(new THREE.Vector3())),
    ).toBeCloseTo(upper, 7);
    expect(
      calf
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(foot.getWorldPosition(new THREE.Vector3())),
    ).toBeCloseTo(lower, 7);
    ik.resetApplied();
    expect(thigh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(calf.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
  it('copies authoritative reload state without changing the clock', () => {
    const clock = {
      weaponId: 'rifle',
      aiming: true,
      aimPitch: 0.2,
      aimYaw: -0.3,
      reloading: true,
      reloadProgress: 1.4,
    } as const;
    const snapshot = playerCombatSnapshot(clock);
    expect(snapshot.reloadProgress).toBe(1);
    expect(clock.reloadProgress).toBe(1.4);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
  it('selects weapon-specific reload clips and masks out legs/root', () => {
    expect(reloadClipForWeapon('service-rifle')).toBe('reload_rifle');
    expect(reloadClipForWeapon('combat-shotgun')).toBe('reload_shotgun');
    expect(isUpperBodyTrack('upperarm_l.quaternion')).toBe(true);
    expect(isUpperBodyTrack('pelvis.position')).toBe(false);
    expect(isUpperBodyTrack('foot_r.quaternion')).toBe(false);
  });
});
