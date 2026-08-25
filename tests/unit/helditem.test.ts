import { describe, expect, it } from 'vitest';
import { findHandBone, fitHeldItem, heldItemRotation } from '@/art/HeldItem';

/**
 * Putting a weapon in a hand, in the parts that are arithmetic.
 *
 * The bone names below are the real ones, read out of the two `.glb` files the
 * game actually ships: the player is a Mixamo rig and the scavenger a Blender
 * export, and they agree about nothing. That disagreement is the whole reason
 * this module exists rather than a hard-coded bone name.
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
  it('scales an authored model to the length the game wants', () => {
    // The shipped rifle measures about 5.4 units on its long axis and has to
    // end up 0.88m, which is roughly a sixth.
    const fit = fitHeldItem({ x: 5.4, y: 0.9, z: 0.3 }, 0.88);
    expect(fit.scale).toBeCloseTo(0.88 / 5.4, 9);
    expect(fit.longAxis).toBe('x');
  });

  it('calls the longest dimension the barrel, whichever axis it is on', () => {
    expect(fitHeldItem({ x: 1, y: 4, z: 1 }, 1).longAxis).toBe('y');
    expect(fitHeldItem({ x: 1, y: 1, z: 4 }, 1).longAxis).toBe('z');
  });

  it('refuses to scale a model with no size, rather than emitting Infinity', () => {
    // A NaN in a matrix does not throw. It silently stops the mesh being
    // drawn, and then the bug is "the weapon is invisible" with no error.
    const fit = fitHeldItem({ x: 0, y: 0, z: 0 }, 0.9);
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.scale).toBe(1);
  });
});

describe('aiming the long axis the way the holder faces', () => {
  it('swings X round onto Z', () => {
    expect(heldItemRotation('x')).toEqual({ x: 0, y: Math.PI / 2, z: 0 });
  });

  it('tips Y down onto Z — the case that shipped broken once', () => {
    expect(heldItemRotation('y')).toEqual({ x: Math.PI / 2, z: 0, y: 0 });
  });

  it('leaves Z alone, since it is already forward', () => {
    expect(heldItemRotation('z')).toEqual({ x: 0, y: 0, z: 0 });
  });
});
