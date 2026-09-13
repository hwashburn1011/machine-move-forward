import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitToCapsule, OriginalEnemyPose, resolveClip } from '@/enemies/EnemyVisual';

/** A pack that names things the obvious way. */
const TYPICAL = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];

describe('clip resolution', () => {
  it('never resolves appended polish clips as authoritative originals', () => {
    expect(resolveClip(['polish_hit', 'polish_death', 'Idle'], 'attack')).toBe('Idle');
    expect(resolveClip(['polish_attack'], 'attack')).toBeNull();
  });
  it('maps every AI state to a clip', () => {
    for (const state of ['idle', 'navigate', 'pursue', 'attack', 'dead'] as const) {
      expect(resolveClip(TYPICAL, state)).not.toBeNull();
    }
  });

  it('maps the states to the clips a player would expect', () => {
    expect(resolveClip(TYPICAL, 'idle')).toBe('Idle');
    expect(resolveClip(TYPICAL, 'navigate')).toBe('Walk');
    expect(resolveClip(TYPICAL, 'pursue')).toBe('Run');
    expect(resolveClip(TYPICAL, 'attack')).toBe('Attack');
    expect(resolveClip(TYPICAL, 'dead')).toBe('Death');
  });

  it('matches case-insensitively', () => {
    expect(resolveClip(['idle', 'WALK'], 'navigate')).toBe('WALK');
  });

  it('matches a substring, since packs prefix their clip names', () => {
    // Real packs ship names like "Armature|CharacterArmature_Walk".
    expect(resolveClip(['Armature|Character_Walk'], 'navigate')).toBe('Armature|Character_Walk');
  });

  it('falls back down the chain when the preferred clip is missing', () => {
    // No Run: a pursuing enemy should walk rather than freeze.
    expect(resolveClip(['Idle', 'Walk'], 'pursue')).toBe('Walk');
  });

  it('falls back to the first clip rather than returning nothing', () => {
    expect(resolveClip(['SomeOddName'], 'attack')).toBe('SomeOddName');
  });

  it('returns null only when there are no clips at all', () => {
    expect(resolveClip([], 'idle')).toBeNull();
  });

  it('does not confuse walk and run when both exist', () => {
    expect(resolveClip(['Walk', 'Run'], 'pursue')).toBe('Run');
    expect(resolveClip(['Walk', 'Run'], 'navigate')).toBe('Walk');
  });
});

describe('authoritative enemy pose', () => {
  function rig(includePolish: boolean): OriginalEnemyPose {
    const root = new THREE.Group();
    const muzzle = new THREE.Object3D();
    muzzle.name = 'EnemyMuzzle';
    muzzle.position.set(0, 1, 0);
    root.add(muzzle);
    const clips = [
      new THREE.AnimationClip('idle', 1, [
        new THREE.VectorKeyframeTrack('EnemyMuzzle.position', [0, 1], [0, 1, 0, 0.1, 1, 0]),
      ]),
      new THREE.AnimationClip('attack', 0.3, [
        new THREE.VectorKeyframeTrack('EnemyMuzzle.position', [0, 0.3], [0, 1, 0, 0.6, 1, 0]),
      ]),
    ];
    if (includePolish)
      clips.push(
        new THREE.AnimationClip('polish_attack', 0.3, [
          new THREE.VectorKeyframeTrack('EnemyMuzzle.position', [0, 0.3], [0, 1, 0, 30, 1, 0]),
        ]),
      );
    return new OriginalEnemyPose(root, clips);
  }

  it.each([30, 60, 144])('matches the old-only rig through a three-shot recoil at %i Hz', (fps) => {
    const baseline = rig(false);
    const appended = rig(true);
    baseline.setState('idle', true);
    appended.setState('idle', true);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    for (let frame = 0; frame < fps; frame++) {
      if (frame === 2 || frame === Math.floor(fps / 3) || frame === Math.floor((2 * fps) / 3)) {
        baseline.attack(true);
        appended.attack(true);
      }
      baseline.update(1 / fps, true);
      appended.update(1 / fps, true);
      baseline.muzzlePosition(a);
      appended.muzzlePosition(b);
      expect(b.distanceTo(a)).toBeLessThan(1e-7);
    }
  });

  it('clears attack pose on pooled reset', () => {
    const pose = rig(true);
    pose.setState('idle', true);
    pose.attack(true);
    pose.update(0.15, true);
    pose.reset();
    pose.setState('idle', true);
    pose.update(0, true);
    const point = new THREE.Vector3();
    expect(pose.muzzlePosition(point)).toBe(true);
    expect(point.x).toBeCloseTo(0, 7);
  });
});

describe('the clip names the committed model actually ships', () => {
  // Read off public/models/scavenger.glb — RobotExpressive, by Quaternius.
  // Pinned here because the mapping is what makes that file usable at all, and
  // a swap to a pack that names things differently should fail in node rather
  // than as a scavenger standing still while it sprints at you.
  const SHIPPED = [
    'Dance',
    'Death',
    'Idle',
    'Jump',
    'No',
    'Punch',
    'Running',
    'Sitting',
    'Standing',
    'ThumbsUp',
    'Walking',
    'WalkJump',
    'Wave',
    'Yes',
  ];

  it('covers every AI state', () => {
    expect(resolveClip(SHIPPED, 'idle')).toBe('Idle');
    expect(resolveClip(SHIPPED, 'navigate')).toBe('Walking');
    expect(resolveClip(SHIPPED, 'pursue')).toBe('Running');
    // No clip is named "attack"; "punch" is the second preference and why it
    // is in the chain at all.
    expect(resolveClip(SHIPPED, 'attack')).toBe('Punch');
    expect(resolveClip(SHIPPED, 'dead')).toBe('Death');
  });

  it('prefers Walking over WalkJump', () => {
    // Both contain "walk". Order decides, and a scavenger that jump-walks
    // across the deck is not what navigate means.
    expect(resolveClip(SHIPPED, 'navigate')).not.toBe('WalkJump');
  });
});

describe('fitting a model to the capsule', () => {
  const CAPSULE_HEIGHT = 1.92;

  it('scales a model to the capsule height', () => {
    expect(fitToCapsule(3.84, 0, CAPSULE_HEIGHT).scale).toBeCloseTo(0.5, 6);
  });

  it('scales a small model up as readily as a large one down', () => {
    expect(fitToCapsule(0.96, 0, CAPSULE_HEIGHT).scale).toBeCloseTo(2, 6);
  });

  it('puts the feet at the capsule base when the origin is at the feet', () => {
    expect(fitToCapsule(1.92, 0, CAPSULE_HEIGHT).yOffset).toBeCloseTo(0, 6);
  });

  it('corrects an origin that sits above the feet', () => {
    // Model spans -0.5..1.5 around its origin, so its feet are half a metre
    // below it and it must be lifted by that much, scaled.
    const fit = fitToCapsule(2.0, -0.5, CAPSULE_HEIGHT);
    expect(fit.yOffset).toBeCloseTo(0.5 * fit.scale, 6);
  });

  it('survives a degenerate zero-height model', () => {
    // A model that failed to import must not produce Infinity and poison the
    // whole scene graph.
    const fit = fitToCapsule(0, 0, CAPSULE_HEIGHT);
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.scale).toBeGreaterThan(0);
  });
});
