import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  findHandBone,
  fitHeldItem,
  handGripAlign,
  handGripAxes,
  weaponAlign,
  type Box,
} from '@/art/HeldItem';

/**
 * Putting a weapon in a hand, in the parts that are arithmetic.
 *
 * The bone names and the boxes below are the real ones, read out of the `.glb`
 * files the game actually ships: the player is a Mixamo rig and the scavenger a
 * Blender export, and they agree about nothing. That disagreement is the whole
 * reason this module exists rather than a hard-coded bone name.
 */

const MIXAMO = [
  'mixamorig:Hips',
  'mixamorig:Spine',
  'mixamorig:RightShoulder',
  'mixamorig:RightArm',
  'mixamorig:RightForeArm',
  'mixamorig:RightHand',
  'mixamorig:RightHandThumb1',
  'mixamorig:RightHandIndex1',
  'mixamorig:RightHandMiddle1',
  'mixamorig:LeftHand',
  'mixamorig:LeftHandIndex1',
];

const BLENDER = ['Bone', 'Torso', 'Arm.R', 'Hand.R', 'Arm.L', 'Hand.L', 'Head'];

/**
 * The shipped rifle's own bounding box, measured in the browser off
 * `rifle.glb` with its node transforms applied.
 */
const RIFLE: Box = {
  min: { x: -1.6048, y: -0.7415, z: -0.098 },
  max: { x: 3.8168, y: 0.8598, z: 0.098 },
};

/** The same, for `shotgun.glb`. */
const SHOTGUN: Box = {
  min: { x: -1.4771, y: -0.5633, z: -0.1233 },
  max: { x: 4.3078, y: 0.3794, z: 0.1233 },
};

/**
 * The player rig's right-hand children, as directions from the wrist.
 *
 * Measured in the browser. `handGripAxes` normalises, so unit vectors stand in
 * for the raw rest offsets without changing any answer.
 */
const MIXAMO_FINGERS = [
  { name: 'mixamorigRightHandThumb1', offset: { x: -0.4151, y: 0.8584, z: 0.3015 } },
  { name: 'mixamorigRightHandIndex1', offset: { x: -0.0273, y: 0.9782, z: 0.206 } },
  { name: 'mixamorigRightHandMiddle1', offset: { x: 0, y: 1, z: 0 } },
  { name: 'mixamorigRightHandRing1', offset: { x: -0.02, y: 0.95, z: -0.22 } },
  { name: 'mixamorigRightHandPinky1', offset: { x: -0.0354, y: 0.9007, z: -0.4331 } },
];

describe('finding the hand to hang a weapon off', () => {
  it('finds the wrist on a Mixamo rig, not a knuckle', () => {
    // Every finger bone contains "RightHand" too. A rifle parented to a
    // knuckle tracks the finger's curl, and the curl is in the animation.
    expect(findHandBone(MIXAMO)).toBe('mixamorig:RightHand');
  });

  it('finds the hand on a Blender export, which names it nothing alike', () => {
    expect(findHandBone(BLENDER)).toBe('Hand.R');
  });

  it('prefers the right hand when both are present', () => {
    expect(findHandBone(['Hand.L', 'Hand.R'])).toBe('Hand.R');
    expect(findHandBone(['mixamorig:LeftHand', 'mixamorig:RightHand'])).toBe(
      'mixamorig:RightHand',
    );
  });

  it('takes either hand rather than nothing when only one exists', () => {
    expect(findHandBone(['Bone', 'Hand.L'])).toBe('Hand.L');
  });

  it('gives up honestly on a rig with no hands at all', () => {
    expect(findHandBone(['Bone', 'Torso', 'Head'])).toBeNull();
    expect(findHandBone([])).toBeNull();
  });
});

describe('fitting a weapon to a real length', () => {
  it('scales the shipped rifle to the length the game wants', () => {
    // It measures about 5.42 units on its long axis and has to end up 0.88m.
    const fit = fitHeldItem(RIFLE, 0.88);
    expect(fit.scale).toBeCloseTo(0.88 / 5.4216, 6);
    expect(fit.longAxis).toBe('x');
  });

  it('calls the longest dimension the barrel, whichever axis it is on', () => {
    const along = (axis: 'x' | 'y' | 'z'): Box => ({
      min: { x: 0, y: 0, z: 0 },
      max: { x: axis === 'x' ? 4 : 1, y: axis === 'y' ? 4 : 1, z: axis === 'z' ? 4 : 1 },
    });
    expect(fitHeldItem(along('y'), 1).longAxis).toBe('y');
    expect(fitHeldItem(along('z'), 1).longAxis).toBe('z');
  });

  it('calls the thinnest dimension the one across the gun', () => {
    // A gun is long, about as deep as a fist, and thin. Both shipped models
    // are barely 2mm thick against a 5-unit barrel once scaled.
    expect(fitHeldItem(RIFLE, 0.88).thinAxis).toBe('z');
    expect(fitHeldItem(SHOTGUN, 0.95).thinAxis).toBe('z');
  });

  it('puts the muzzle on the far side of the model origin', () => {
    // The origin sits near the grip, so most of the length is barrel. Getting
    // this backwards is a rifle carried muzzle-first into the player's back.
    expect(fitHeldItem(RIFLE, 0.88).muzzleSign).toBe(1);
    expect(fitHeldItem(SHOTGUN, 0.95).muzzleSign).toBe(1);

    const mirrored: Box = { min: { x: -3.8, y: -0.7, z: -0.1 }, max: { x: 1.6, y: 0.8, z: 0.1 } };
    expect(fitHeldItem(mirrored, 0.88).muzzleSign).toBe(-1);
  });

  it('refuses to scale a model with no size, rather than emitting Infinity', () => {
    // A NaN in a matrix does not throw. It silently stops the mesh being
    // drawn, and then the bug is "the weapon is invisible" with no error.
    const fit = fitHeldItem({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, 0.9);
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.scale).toBe(1);
  });
});

/** A model-space direction, after the alignment, rounded for comparison. */
function aligned(box: Box, v: [number, number, number]): number[] {
  const q = weaponAlign(fitHeldItem(box, 1));
  const out = new THREE.Vector3(...v).applyQuaternion(q);
  // `+ 0` folds -0 onto 0: they are the same direction and toEqual disagrees.
  return [out.x, out.y, out.z].map((n) => Math.round(n * 1000) / 1000 + 0);
}

describe('putting a weapon into the canonical frame', () => {
  it('aims the shipped rifle down +Z, which is out of the muzzle', () => {
    // The rifle is authored along X with the barrel on +X. The version this
    // replaced swung +X onto MINUS Z, so the muzzle pointed behind the holder.
    expect(aligned(RIFLE, [1, 0, 0])).toEqual([0, 0, 1]);
  });

  it('aims the shotgun the same way, though it is a different model', () => {
    expect(aligned(SHOTGUN, [1, 0, 0])).toEqual([0, 0, 1]);
  });

  it('puts the thin axis across the gun, on +X', () => {
    expect(aligned(RIFLE, [0, 0, 1])).toEqual([1, 0, 0]);
  });

  it('is a rotation, not a reflection — a mirrored gun has its sights underneath', () => {
    for (const box of [RIFLE, SHOTGUN]) {
      const m = new THREE.Matrix4().makeRotationFromQuaternion(weaponAlign(fitHeldItem(box, 1)));
      expect(m.determinant()).toBeCloseTo(1, 6);
    }
  });

  it('leaves a model already authored down +Z alone', () => {
    const authored: Box = { min: { x: -0.1, y: -0.3, z: -1 }, max: { x: 0.1, y: 0.3, z: 4 } };
    expect(aligned(authored, [0, 0, 1])).toEqual([0, 0, 1]);
  });
});

describe('reading a fist off its finger bones', () => {
  it('takes the middle finger as the axis of the fist', () => {
    expect(handGripAxes(MIXAMO_FINGERS).fingers).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('takes the thumb bone as the side the thumb is on', () => {
    expect(handGripAxes(MIXAMO_FINGERS).thumb.z).toBeCloseTo(0.3015, 4);
  });

  it('falls back to the index finger when there is no middle', () => {
    const noMiddle = MIXAMO_FINGERS.filter((c) => !c.name.includes('Middle'));
    expect(handGripAxes(noMiddle).fingers.z).toBeCloseTo(0.206, 4);
  });

  it('averages whatever knuckles exist when none is named', () => {
    const anonymous = [
      { name: 'a', offset: { x: 0, y: 2, z: 1 } },
      { name: 'b', offset: { x: 0, y: 2, z: -1 } },
    ];
    expect(handGripAxes(anonymous).fingers).toEqual({ x: 0, y: 2, z: 0 });
  });

  it('gives the ordinary bone convention for a hand with no fingers at all', () => {
    // The scavenger's rig. It carries nothing today, but a rig with no fingers
    // must degrade to a plausible fist rather than a zero-length basis.
    expect(handGripAxes([]).fingers).toEqual({ x: 0, y: 1, z: 0 });
    expect(handGripAxes([]).thumb).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe('gripping a weapon', () => {
  const axes = handGripAxes(MIXAMO_FINGERS);
  const grip = handGripAlign(axes);

  const dir = (q: THREE.Quaternion, v: [number, number, number]) =>
    new THREE.Vector3(...v).applyQuaternion(q);

  it('points the muzzle where an extended finger points', () => {
    const muzzle = dir(grip, [0, 0, 1]);
    const fingers = new THREE.Vector3(axes.fingers.x, axes.fingers.y, axes.fingers.z).normalize();
    expect(muzzle.dot(fingers)).toBeCloseTo(1, 6);
  });

  it('points the sights toward the thumb', () => {
    const up = dir(grip, [0, 1, 0]);
    const thumb = new THREE.Vector3(axes.thumb.x, axes.thumb.y, axes.thumb.z).normalize();
    // Not equal — only the part of the thumb square to the barrel is "up" —
    // but it must be on the thumb's side rather than the pinky's.
    expect(up.dot(thumb)).toBeGreaterThan(0.2);
  });

  it('is orthonormal, so the gun is neither sheared nor mirrored', () => {
    const m = new THREE.Matrix4().makeRotationFromQuaternion(grip);
    expect(m.determinant()).toBeCloseTo(1, 6);
  });

  it('survives a rig whose thumb bone lies along the fingers', () => {
    const degenerate = handGripAlign({ fingers: { x: 0, y: 1, z: 0 }, thumb: { x: 0, y: 1, z: 0 } });
    for (const n of [degenerate.x, degenerate.y, degenerate.z, degenerate.w]) {
      expect(Number.isFinite(n)).toBe(true);
    }
    expect(degenerate.length()).toBeCloseTo(1, 6);
  });

  /**
   * The regression that matters.
   *
   * The bug was not that the weapon pointed the wrong way once; it was that
   * where it pointed depended on the POSE. So pose the arm — the way idle and
   * walk both do — and check the muzzle still follows the hand.
   */
  it('keeps the muzzle in the hand however the arm is posed', () => {
    const body = new THREE.Group();
    const wrist = new THREE.Bone();
    const knuckle = new THREE.Bone();
    knuckle.name = 'mixamorigRightHandMiddle1';
    knuckle.position.set(0, 1, 0);
    wrist.add(knuckle);
    body.add(wrist);

    const mount = new THREE.Object3D();
    mount.quaternion.copy(handGripAlign(handGripAxes([{ name: knuckle.name, offset: knuckle.position }])));
    wrist.add(mount);

    for (const pose of [
      new THREE.Euler(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0), // arm down, which is what idle does
      new THREE.Euler(0.4, -1.1, 2.3), // and something arbitrary
    ]) {
      wrist.quaternion.setFromEuler(pose);
      // The body turns too, because the player does.
      body.rotation.y = 1.9;
      body.updateMatrixWorld(true);

      const muzzle = new THREE.Vector3(0, 0, 1).applyQuaternion(
        mount.getWorldQuaternion(new THREE.Quaternion()),
      );
      const finger = knuckle
        .getWorldPosition(new THREE.Vector3())
        .sub(wrist.getWorldPosition(new THREE.Vector3()))
        .normalize();

      expect(muzzle.dot(finger)).toBeCloseTo(1, 5);
    }
  });
});
