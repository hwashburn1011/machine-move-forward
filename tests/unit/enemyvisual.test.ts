import { describe, it, expect } from 'vitest';
import { fitToCapsule, resolveClip } from '@/enemies/EnemyVisual';

/** A pack that names things the obvious way. */
const TYPICAL = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];

describe('clip resolution', () => {
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
