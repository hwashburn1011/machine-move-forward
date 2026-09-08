import { describe, expect, it } from 'vitest';
import { Producer } from '@/building/Producer';
import {
  CONDENSER_PERIOD_S,
  PLANTER_PERIOD_S,
  isProducer,
  producerRoleOf,
} from '@/data/needs';
import { BUILD_PIECES, isStation, type PieceId } from '@/data/build-pieces';
import { DRAWS, powerRoleOf } from '@/data/power';

const DT = 1 / 60;

/** Step a producer for a stretch of simulated seconds. Returns units made. */
function run(producer: Producer, seconds: number, running = true): number {
  let made = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) made += producer.fixedUpdate(DT, running);
  return made;
}

describe('the production timer', () => {
  it('starts empty and idle', () => {
    const p = new Producer(90, 1);
    expect(p.stored).toBe(0);
    expect(p.progress).toBe(0);
    expect(p.isFull).toBe(false);
  });

  it('produces one unit per period while it is running', () => {
    const p = new Producer(90, 4);
    expect(run(p, 89)).toBe(0);
    expect(p.stored).toBe(0);

    expect(run(p, 2)).toBe(1);
    expect(p.stored).toBe(1);
  });

  it('accumulates nothing at all while it is not running', () => {
    const p = new Producer(90, 4);
    expect(run(p, 300, false)).toBe(0);
    expect(p.stored).toBe(0);
    expect(p.progress).toBe(0);
  });

  it('picks up exactly where it stopped when it starts again', () => {
    // The condenser sheds when the generator does. Losing the half-made litre
    // every brownout would make the device feel broken rather than switched off.
    const p = new Producer(90, 4);
    run(p, 60);
    const held = p.progress;
    run(p, 120, false);
    expect(p.progress).toBe(held);

    expect(run(p, 31)).toBe(1);
  });

  it('stops at capacity and banks nothing beyond it', () => {
    const p = new Producer(10, 2);
    expect(run(p, 1000)).toBe(2);
    expect(p.stored).toBe(2);
    expect(p.isFull).toBe(true);

    // And the timer does not creep on behind a full store, so claiming does
    // not immediately dump a backlog the player never watched being made.
    expect(p.progress).toBeLessThanOrEqual(10);
  });

  it('resumes the moment room is made', () => {
    const p = new Producer(10, 1);
    run(p, 100);
    expect(p.stored).toBe(1);
    expect(p.claim()).toBe(1);
    expect(p.stored).toBe(0);
    expect(run(p, 11)).toBe(1);
  });

  it('makes several units in one long step, up to capacity', () => {
    // A harness warping time, and a browser tab that was in the background,
    // both hand this a step far larger than a frame.
    const p = new Producer(10, 3);
    expect(p.fixedUpdate(1000, true)).toBe(3);
    expect(p.stored).toBe(3);
  });

  it('ignores a zero or negative step', () => {
    const p = new Producer(10, 3);
    run(p, 9);
    const held = p.progress;
    expect(p.fixedUpdate(0, true)).toBe(0);
    expect(p.fixedUpdate(-100, true)).toBe(0);
    expect(p.progress).toBe(held);
  });
});

describe('claiming', () => {
  it('empties the store by default', () => {
    const p = new Producer(10, 3);
    run(p, 100);
    expect(p.claim()).toBe(3);
    expect(p.stored).toBe(0);
  });

  it('takes only as much as the caller has room for', () => {
    // The player's bag can be full. Handing them three and dropping two on the
    // deck would be worse than leaving them in the box.
    const p = new Producer(10, 3);
    run(p, 100);
    expect(p.claim(2)).toBe(2);
    expect(p.stored).toBe(1);
  });

  it('claims nothing from an empty store, and nothing on a zero limit', () => {
    const p = new Producer(10, 3);
    expect(p.claim()).toBe(0);
    run(p, 100);
    expect(p.claim(0)).toBe(0);
    expect(p.stored).toBe(3);
  });
});

describe('production across a save', () => {
  it('round-trips the store AND the partial progress', () => {
    const p = new Producer(90, 3);
    run(p, 140);
    expect(p.stored).toBe(1);

    const loaded = new Producer(90, 3);
    loaded.restore(p.toSave());
    expect(loaded.stored).toBe(p.stored);
    expect(loaded.progress).toBeCloseTo(p.progress, 6);

    // And it finishes the unit it was part way through, rather than starting over.
    expect(run(loaded, 41)).toBe(1);
  });

  it('reads an absent save as an empty, unstarted device', () => {
    const p = new Producer(90, 3);
    run(p, 200);
    p.restore(undefined);
    expect(p.stored).toBe(0);
    expect(p.progress).toBe(0);
  });

  it('clamps a corrupt save into range', () => {
    const p = new Producer(90, 2);
    p.restore({ progress: -50, stored: 99 });
    expect(p.progress).toBe(0);
    expect(p.stored).toBe(2);
  });
});

describe('determinism', () => {
  it('gives the same answer for the same steps, every time', () => {
    const trace = (): string => {
      const p = new Producer(7, 5);
      const out: number[] = [];
      for (let i = 0; i < 3000; i++) out.push(p.fixedUpdate(DT, i % 400 < 300));
      return `${out.join('')}|${p.stored}|${p.progress}`;
    };
    expect(trace()).toBe(trace());
  });
});

describe('the two production pieces', () => {
  it('makes the condenser a powered station that wrings water from the air', () => {
    const role = producerRoleOf('condenser');
    expect(role).toEqual({
      itemId: 'water',
      periodS: CONDENSER_PERIOD_S,
      capacity: 1,
      needsPower: true,
    });
    expect(isStation('condenser')).toBe(true);
    // The designed extension point: a new consumer is a line in `powerRoleOf`,
    // not a new call site.
    expect(powerRoleOf('condenser')).toEqual({
      kind: 'consumer',
      draw: DRAWS.condenser,
      priority: 'station',
    });
  });

  it('makes the planter an unpowered station that grows greens', () => {
    const role = producerRoleOf('planter');
    expect(role).toEqual({
      itemId: 'greens',
      periodS: PLANTER_PERIOD_S,
      capacity: 3,
      needsPower: false,
    });
    expect(isStation('planter')).toBe(true);
    // Deliberately off the grid: one device that stops when the generator
    // sheds and one that carries on is what makes the pair legible.
    expect(powerRoleOf('planter')).toBeNull();
  });

  it('leaves every other piece out of production entirely', () => {
    for (const id of Object.keys(BUILD_PIECES) as PieceId[]) {
      if (id === 'condenser' || id === 'planter') continue;
      expect(producerRoleOf(id), id).toBeNull();
      expect(isProducer(id), id).toBe(false);
    }
  });

  it('grows food slower than it makes water, and neither in a hurry', () => {
    expect(PLANTER_PERIOD_S).toBeGreaterThan(CONDENSER_PERIOD_S);
    expect(CONDENSER_PERIOD_S).toBeGreaterThan(30);
  });

  it('keeps a pair of devices ahead of the drain they answer', () => {
    // One condenser and one planter, left alone for the twenty-five minutes a
    // meter takes to empty, must comfortably cover it. If they cannot, the
    // survival layer is a treadmill rather than a background pressure.
    const minutes = 25;
    expect((minutes * 60) / CONDENSER_PERIOD_S).toBeGreaterThan(1);
    expect((minutes * 60) / PLANTER_PERIOD_S).toBeGreaterThan(1);
  });
});
