import { describe, expect, it } from 'vitest';
import { HomeLife, sanitizeKeepsakeState, type HomeLifePiece } from '@/building/HomeLife';
import type { RoomGraph } from '@/building/RoomDetector';

const cell = (x: number, z: number) => ({ x, y: 0, z });
const pieces: HomeLifePiece[] = [
  { instanceId: 'chair-1', definitionId: 'chair', cell: cell(1, 1) },
  { instanceId: 'table-1', definitionId: 'table', cell: cell(1, 2) },
];
const graph: RoomGraph = {
  rooms: [
    {
      id: 7,
      level: 0,
      cells: [cell(1, 1), cell(1, 2)],
      interiorVolume: 20,
      enclosed: true,
      boundaryEdges: [],
      doorways: [],
    },
  ],
  byCell: new Map([
    ['1,0,1', 7],
    ['1,0,2', 7],
  ]),
  links: [],
};
const context = (patch: Partial<Parameters<HomeLife['start']>[1]> = {}) => ({
  chairId: 'chair-1',
  playerCell: cell(1, 1),
  sameRoom: true,
  rangeM: 1,
  alive: true,
  health: 40,
  maxHealth: 100,
  safe: true,
  busy: false,
  moving: false,
  firing: false,
  ...patch,
});

describe('HomeLife', () => {
  it('rests only in an enclosed comfortable room and heals at two HP/s', () => {
    const life = new HomeLife(graph, pieces);
    expect(life.start('chair-1', context())).toEqual({ ok: true });
    expect(life.tick(0.5, context())).toEqual({ healAmount: 1 });
    expect(life.tick(1, context({ health: 99 }))).toEqual({ healAmount: 2 });
  });

  it('cancels for movement, danger, room changes, missing furniture, and full health', () => {
    const life = new HomeLife(graph, pieces);
    expect(life.start('chair-1', context())).toEqual({ ok: true });
    expect(life.tick(1, context({ moving: true }))).toEqual({
      healAmount: 0,
      cancelReason: 'moving',
    });
    expect(life.start('chair-1', context({ safe: false }))).toEqual({
      ok: false,
      reason: 'unsafe',
    });
    expect(life.start('chair-1', context({ playerCell: cell(9, 9), sameRoom: true }))).toEqual({
      ok: false,
      reason: 'room-not-enclosed',
    });
    expect(life.start('chair-1', context({ health: 100 }))).toEqual({
      ok: false,
      reason: 'full-health',
    });
    expect(new HomeLife(graph, [pieces[0]!]).start('chair-1', context())).toEqual({
      ok: false,
      reason: 'no-comfort',
    });
  });

  it('rejects invalid time and caps healing at missing health', () => {
    const life = new HomeLife(graph, pieces);
    life.start('chair-1', context({ health: 98 }));
    expect(life.tick(Number.NaN, context({ health: 98 }))).toEqual({ healAmount: 0 });
    expect(life.tick(-1, context({ health: 98 }))).toEqual({ healAmount: 0 });
    expect(life.tick(10, context({ health: 99 }))).toEqual({ healAmount: 20 });
  });

  it('sanitizes keepsake facts against known bounded choices', () => {
    const known = ['orchard-memory-core', 'course-gyro'];
    expect(sanitizeKeepsakeState({ factId: 'course-gyro' }, known)).toEqual({
      factId: 'course-gyro',
    });
    expect(sanitizeKeepsakeState({ factId: 'future-fact' }, known)).toEqual({});
    expect(sanitizeKeepsakeState({ factId: 'x'.repeat(129) }, known)).toEqual({});
    expect(sanitizeKeepsakeState({ factId: 4 }, known)).toEqual({});
  });

  it('rechecks a replaced layout and exposes a read-only inspection seam', () => {
    const life = new HomeLife(graph, pieces);
    expect(life.inspect('chair-1', context())).toBeNull();
    expect(life.start('chair-1', context())).toEqual({ ok: true });
    expect(life.activeChairId).toBe('chair-1');
    life.updateLayout({ rooms: [], byCell: new Map(), links: [] }, pieces);
    expect(life.tick(1, context())).toEqual({ healAmount: 0, cancelReason: 'room-not-enclosed' });
    expect(life.activeChairId).toBeNull();
  });

  it('rejects invalid range and health inputs without starting rest', () => {
    const life = new HomeLife(graph, pieces);
    expect(life.start('chair-1', context({ rangeM: Number.NaN }))).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(life.start('chair-1', context({ rangeM: -1 }))).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(life.start('chair-1', context({ maxHealth: Number.NaN }))).toEqual({
      ok: false,
      reason: 'full-health',
    });
    expect(life.active).toBe(false);
  });
});
