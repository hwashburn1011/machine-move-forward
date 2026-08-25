import { describe, expect, it } from 'vitest';
import {
  allSoundIds,
  DRONE_FULL_GAIN,
  DRONE_FULL_HZ,
  DRONE_IDLE_GAIN,
  DRONE_IDLE_HZ,
  droneGain,
  dronePitch,
  semitoneRatio,
  soundSpec,
  spatialise,
} from '@/audio/SoundBank';
import { toListener } from '@/audio/GameSounds';

/**
 * The half of the audio layer that has no `AudioContext` in it.
 *
 * Which is deliberately most of it: what a sound IS, where it sits relative to
 * the listener, and how the machine's note follows its speed are all arithmetic
 * a browser adds nothing to. `AudioEngine` is what is left, and it is checked in
 * `tools/combat.mjs` against a real context, because nothing but a real one can
 * say whether a node graph actually plays.
 */

describe('the sound bank', () => {
  it('has a usable recipe for every sound it names', () => {
    const ids = allSoundIds();
    expect(ids.length).toBeGreaterThan(10);

    for (const id of ids) {
      const spec = soundSpec(id);
      // A voice with no envelope is silence with extra steps, and a decay of
      // zero is a click every browser renders differently.
      expect(spec.envelope.peak, id).toBeGreaterThan(0);
      expect(spec.envelope.peak, id).toBeLessThanOrEqual(1);
      expect(spec.envelope.decay, id).toBeGreaterThan(0);
      expect(spec.envelope.attack, id).toBeGreaterThanOrEqual(0);

      if (spec.source.kind === 'noise') {
        expect(spec.source.hz, id).toBeGreaterThan(0);
        expect(spec.source.q, id).toBeGreaterThan(0);
      } else {
        expect(spec.source.hz, id).toBeGreaterThan(0);
        // An exponential ramp to zero is an error in WebAudio, not a fade.
        if (spec.source.toHz !== undefined) expect(spec.source.toHz, id).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every sound short enough to be a cue rather than a bed', () => {
    // The one continuous sound is the drone, and it is not a voice. Anything
    // here that ran for seconds would still be sounding when the next one
    // fired -- four footfalls a second is the constraint that sets this.
    for (const id of allSoundIds()) {
      const { attack, decay } = soundSpec(id).envelope;
      expect(attack + decay, id).toBeLessThanOrEqual(2);
    }
  });

  it('converts semitones to the ratios they actually mean', () => {
    expect(semitoneRatio(0)).toBe(1);
    expect(semitoneRatio(12)).toBeCloseTo(2, 10);
    expect(semitoneRatio(-12)).toBeCloseTo(0.5, 10);
  });
});

describe('the engine drone', () => {
  it('rises with speed, between its own bounds', () => {
    expect(dronePitch(0, 7.5)).toBeCloseTo(DRONE_IDLE_HZ);
    expect(dronePitch(7.5, 7.5)).toBeCloseTo(DRONE_FULL_HZ);
    expect(dronePitch(3.75, 7.5)).toBeGreaterThan(DRONE_IDLE_HZ);
    expect(dronePitch(3.75, 7.5)).toBeLessThan(DRONE_FULL_HZ);
  });

  it('is quieter when the machine is slower', () => {
    expect(droneGain(0, 7.5)).toBeCloseTo(DRONE_IDLE_GAIN);
    expect(droneGain(7.5, 7.5)).toBeCloseTo(DRONE_FULL_GAIN);
  });

  it('clamps rather than extrapolating', () => {
    // A machine slowed to a crawl by weight must not drop below audibility;
    // one somehow driven past its base speed must not scream.
    expect(dronePitch(-5, 7.5)).toBeCloseTo(DRONE_IDLE_HZ);
    expect(dronePitch(50, 7.5)).toBeCloseTo(DRONE_FULL_HZ);
    expect(droneGain(50, 7.5)).toBeCloseTo(DRONE_FULL_GAIN);
  });
});

describe('placing a sound', () => {
  it('is loudest at the listener and silent past its reach', () => {
    expect(spatialise(0, 0).gain).toBe(1);
    expect(spatialise(0, 100).gain).toBe(0);
    expect(spatialise(0, 5).gain).toBeGreaterThan(spatialise(0, 15).gain);
  });

  it('pans to the side the sound is actually on', () => {
    expect(spatialise(6, 0).pan).toBeGreaterThan(0.5);
    expect(spatialise(-6, 0).pan).toBeLessThan(-0.5);
    // Dead ahead is centred, and so is dead behind: a stereo pan cannot say
    // "behind you", and pretending otherwise would put a sound to one side for
    // no reason the player could act on.
    expect(Math.abs(spatialise(0, 6).pan)).toBeLessThan(0.01);
    expect(Math.abs(spatialise(0, -6).pan)).toBeLessThan(0.01);
  });

  it('never pans past the speakers', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const { pan } = spatialise(Math.cos(a) * 9, Math.sin(a) * 9);
      expect(pan).toBeGreaterThanOrEqual(-1);
      expect(pan).toBeLessThanOrEqual(1);
    }
  });
});

describe('the listener frame', () => {
  const AT_ORIGIN = { x: 0, z: 0, yaw: 0 };

  it('puts a sound dead ahead in front, not to one side', () => {
    // Yaw 0 faces +Z, matching Player.facing and the HUD's damage arc.
    const { dx, dz } = toListener(0, 10, AT_ORIGIN);
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(10);
  });

  it('puts a sound to starboard on the right', () => {
    const { dx, dz } = toListener(10, 0, AT_ORIGIN);
    expect(dx).toBeCloseTo(10);
    expect(dz).toBeCloseTo(0);
  });

  it('follows the listener round when they turn', () => {
    // Turn a quarter turn to the right; what was ahead is now to port.
    const turned = { x: 0, z: 0, yaw: Math.PI / 2 };
    const { dx, dz } = toListener(0, 10, turned);
    expect(dx).toBeCloseTo(-10);
    expect(dz).toBeCloseTo(0);
  });

  it('is relative to where the listener stands, not to the origin', () => {
    const away = { x: 4, z: -3, yaw: 0 };
    const { dx, dz } = toListener(4, -3, away);
    expect(Math.hypot(dx, dz)).toBeCloseTo(0);
  });

  it('preserves distance whatever the listener is facing', () => {
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.3) {
      const { dx, dz } = toListener(3, 4, { x: 0, z: 0, yaw });
      expect(Math.hypot(dx, dz)).toBeCloseTo(5, 9);
    }
  });
});
