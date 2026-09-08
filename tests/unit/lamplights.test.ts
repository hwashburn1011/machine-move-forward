import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assignLamps, LampLights, LAMP_HYSTERESIS, type LampSample } from '@/building/LampLights';
import { getQualitySettings, QUALITY_TIERS } from '@/core/renderer/QualitySettings';

/**
 * Which lamps get one of the handful of real lights.
 *
 * A pure function of its inputs, tested as one. The pool itself is Three.js
 * and untestable in node; the decision about which lamps it points at is the
 * only part that can be wrong in a way a player would notice, so it is the
 * part that lives out here.
 */
const lamp = (id: string, x: number, lit = true): LampSample => ({ id, x, y: 0, z: 0, lit });

const ORIGIN = { x: 0, y: 0, z: 0 };

describe('assignLamps', () => {
  it('takes the nearest N', () => {
    const lamps = [lamp('far', 30), lamp('near', 2), lamp('mid', 10)];
    expect(assignLamps(lamps, ORIGIN, 2, [])).toEqual(['near', 'mid']);
  });

  it('takes everything when the pool is bigger than the lamps', () => {
    const lamps = [lamp('a', 1), lamp('b', 2)];
    expect(assignLamps(lamps, ORIGIN, 8, []).sort()).toEqual(['a', 'b']);
  });

  it('never lights an unpowered lamp, however close it is', () => {
    // The whole point of the shed: a lamp with no power is dark, and being
    // right in front of the camera must not buy it a light.
    const lamps = [lamp('shed', 0, false), lamp('lit', 20)];
    expect(assignLamps(lamps, ORIGIN, 4, [])).toEqual(['lit']);
  });

  it('drops a lamp from the pool the moment it sheds', () => {
    const before = assignLamps([lamp('a', 1)], ORIGIN, 4, []);
    expect(before).toEqual(['a']);
    expect(assignLamps([lamp('a', 1, false)], ORIGIN, 4, before)).toEqual([]);
  });

  it('assigns nothing when there is no pool at all', () => {
    expect(assignLamps([lamp('a', 1)], ORIGIN, 0, [])).toEqual([]);
  });

  it('breaks ties by id, so float noise cannot reorder it', () => {
    const lamps = [lamp('b', 5), lamp('a', 5), lamp('c', 5)];
    expect(assignLamps(lamps, ORIGIN, 2, [])).toEqual(['a', 'b']);
  });

  it('is pure: the same inputs give the same answer and the inputs survive', () => {
    const lamps = [lamp('a', 3), lamp('b', 1), lamp('c', 9)];
    const snapshot = JSON.stringify(lamps);
    const first = assignLamps(lamps, ORIGIN, 2, []);
    const second = assignLamps(lamps, ORIGIN, 2, []);
    expect(first).toEqual(second);
    expect(JSON.stringify(lamps)).toBe(snapshot);
  });

  describe('hysteresis', () => {
    it('holds a standing assignment against a barely-closer challenger', () => {
      // Two lamps a hair apart, one light. Without hysteresis the pool would
      // swap between them every time the camera drifted a centimetre, and a
      // player walking down a corridor would watch the lighting flicker.
      const lamps = [lamp('held', 10), lamp('rival', 10 - LAMP_HYSTERESIS / 2)];
      expect(assignLamps(lamps, ORIGIN, 1, ['held'])).toEqual(['held']);
    });

    it('yields once the challenger is decisively closer', () => {
      const lamps = [lamp('held', 10), lamp('rival', 10 - LAMP_HYSTERESIS * 2)];
      expect(assignLamps(lamps, ORIGIN, 1, ['held'])).toEqual(['rival']);
    });

    it('is stable under small camera movement', () => {
      const lamps = [lamp('a', 4), lamp('b', 4.2), lamp('c', 12)];
      let assigned = assignLamps(lamps, ORIGIN, 2, []);
      const first = [...assigned];
      // Walk the camera a few centimetres at a time. The set must not change.
      for (let i = 1; i <= 20; i++) {
        assigned = assignLamps(lamps, { x: i * 0.01, y: 0, z: 0 }, 2, assigned);
      }
      expect([...assigned].sort()).toEqual([...first].sort());
    });

    it('still reassigns when the camera genuinely walks away', () => {
      const lamps = [lamp('near-origin', 0), lamp('far-off', 100)];
      let assigned = assignLamps(lamps, ORIGIN, 1, []);
      expect(assigned).toEqual(['near-origin']);
      assigned = assignLamps(lamps, { x: 100, y: 0, z: 0 }, 1, assigned);
      expect(assigned).toEqual(['far-off']);
    });

    it('ignores a previous assignment naming a lamp that no longer exists', () => {
      // Demolished between reassignments. It must not hold a slot open.
      const lamps = [lamp('a', 8)];
      expect(assignLamps(lamps, ORIGIN, 1, ['demolished'])).toEqual(['a']);
    });
  });
});

describe('the light budget', () => {
  it('grows with the quality tier and never exceeds eight', () => {
    const counts = QUALITY_TIERS.map((tier) => getQualitySettings(tier).lampLights);
    expect(counts).toEqual([2, 4, 6, 8]);
    for (const n of counts) expect(n).toBeLessThanOrEqual(8);
  });

  it('gives even the lowest tier enough to light a room', () => {
    expect(getQualitySettings('low').lampLights).toBeGreaterThan(0);
  });

  it('resizes the live pool and hides removed lights immediately', () => {
    const scene = new THREE.Scene();
    const pool = new LampLights(scene, 4);
    pool.applyQuality(2);
    expect(pool.size).toBe(2);
    expect(pool.group.children).toHaveLength(2);
    pool.applyQuality(0);
    expect(pool.size).toBe(0);
    expect(pool.group.children).toHaveLength(0);
    pool.dispose();
  });
});
