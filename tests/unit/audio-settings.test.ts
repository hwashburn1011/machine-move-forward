import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '@/ui/TitleScreen';
import { calmPadEnvelope, DEFAULT_AMBIENCE_VOLUME, droneGain, dronePitch } from '@/audio/SoundBank';

afterEach(() => vi.unstubAllGlobals());

describe('ambience preferences', () => {
  const stored = (value: unknown): void => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(value) });
  };

  it('upgrades old settings without changing master volume or graphics', () => {
    stored({ volume: 0.35, quality: 'high' });
    expect(loadSettings()).toEqual({
      volume: 0.35,
      quality: 'high',
      ambienceVolume: DEFAULT_AMBIENCE_VOLUME,
    });
  });

  it('preserves ambience off independently of master volume', () => {
    stored({ volume: 0.8, ambienceVolume: 0 });
    expect(loadSettings()).toMatchObject({ volume: 0.8, ambienceVolume: 0 });
  });

  it('clamps bad slider values and recovers malformed preferences', () => {
    stored({ ambienceVolume: 5 });
    expect(loadSettings().ambienceVolume).toBe(1);
    stored({ ambienceVolume: -2 });
    expect(loadSettings().ambienceVolume).toBe(0);
    stored({ ambienceVolume: 'loud' });
    expect(loadSettings().ambienceVolume).toBe(DEFAULT_AMBIENCE_VOLUME);
    stored(null);
    expect(loadSettings().ambienceVolume).toBe(DEFAULT_AMBIENCE_VOLUME);
  });
});

describe('continuous sound fatigue', () => {
  it('leaves a long rest between softly shaped atmosphere phrases', () => {
    expect(calmPadEnvelope(0)).toBe(0);
    expect(calmPadEnvelope(7)).toBeCloseTo(1);
    for (let t = 14; t < 36; t++) expect(calmPadEnvelope(t)).toBe(0);
    expect(calmPadEnvelope(36)).toBe(0);
    expect(calmPadEnvelope(43)).toBeCloseTo(1);
    expect(calmPadEnvelope(0.01)).toBeLessThan(0.001);
    expect(calmPadEnvelope(13.99)).toBeLessThan(0.001);
  });

  it('never schedules NaN or infinite audio parameters for a stopped/invalid drive', () => {
    for (const [speed, base] of [
      [0, 0],
      [10, 0],
      [NaN, 7.5],
      [7.5, Infinity],
    ]) {
      expect(droneGain(speed!, base!)).toBe(droneGain(0, 1));
      expect(dronePitch(speed!, base!)).toBe(dronePitch(0, 1));
    }
  });
});
