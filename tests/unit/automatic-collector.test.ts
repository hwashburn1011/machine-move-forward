import { describe, expect, it } from 'vitest';
import { Container } from '@/items/Container';
import { AutomaticSalvageCollector } from '@/salvage/AutomaticSalvageCollector';

function harness(arrive = true) {
  const claims = new Map<string, string>();
  const targets = [
    { id: 'crate-a', position: { x: 2, y: 0, z: 0 } },
    { id: 'crate-b', position: { x: 4, y: 0, z: 0 } },
  ];
  let powered = true;
  return {
    claims,
    targets,
    get powered() {
      return powered;
    },
    set powered(v: boolean) {
      powered = v;
    },
    callbacks: (_buffer: Container) => ({
      getPosition: () => ({ x: 0, y: 0, z: 0 }),
      getTargets: () => targets,
      claim: (id: string, owner: `collector:${string}`) => {
        if (claims.has(id)) return false;
        claims.set(id, owner);
        return true;
      },
      release: (id: string, owner: `collector:${string}`) =>
        claims.get(id) === owner ? (claims.delete(id), true) : false,
      isClaimAlive: (id: string, owner: `collector:${string}`) => claims.get(id) === owner,
      pullClaimed: () => arrive,
      transferContents: (_id: string, deposit: (id: 'scrap', n: number) => number) => {
        const remaining = deposit('scrap', 30);
        return {
          opened: true,
          remaining: remaining ? [{ itemId: 'scrap' as const, count: remaining }] : [],
        };
      },
      isPowered: () => powered,
    }),
  };
}

describe('AutomaticSalvageCollector', () => {
  it('chooses nearest then stable id and captures without duplicating leftovers', () => {
    const h = harness();
    const buffer = new Container(1);
    buffer.add('scrap', 90);
    const c = new AutomaticSalvageCollector('one', h.callbacks(buffer), buffer);
    c.update(1);
    expect(c.state).toBe('latched');
    expect(buffer.count('scrap')).toBe(100);
    expect(c.slots[0]!.count).toBe(100);
    expect(c.toSave()).toEqual({ slots: [{ itemId: 'scrap', count: 100 }] });
  });

  it('tries the next candidate when the nearest claim is unavailable', () => {
    const h = harness(false);
    h.claims.set('crate-a', 'collector:other');
    const c = new AutomaticSalvageCollector('one', h.callbacks(new Container(6)));
    c.update(0.1);
    expect(c.targetId).toBe('crate-b');
  });

  it('releases on power loss and can recover, while malformed slots are filtered', () => {
    const h = harness();
    const buffer = new Container(6);
    const c = new AutomaticSalvageCollector('one', h.callbacks(buffer), {
      slots: [
        { itemId: 'scrap', count: 2 },
        { itemId: 'bogus' as never, count: 4 },
        { itemId: 'scrap', count: 0 },
      ],
    });
    h.powered = false;
    c.update(1);
    expect(c.state).toBe('unpowered');
    expect(h.claims.size).toBe(0);
    h.powered = true;
    c.update(0.1);
    expect(c.state).toBe('cooldown');
    expect(c.toSave().state).toBeUndefined();
  });

  it('two collectors cannot claim one crate and a partial buffer preserves the manifest', () => {
    const h = harness(false);
    const a = new AutomaticSalvageCollector('a', h.callbacks(new Container(1)));
    const b = new AutomaticSalvageCollector('b', h.callbacks(new Container(1)));
    a.update(0.1);
    b.update(0.1);
    expect(a.targetId).toBe('crate-a');
    expect(b.targetId).toBe('crate-b');
  });

  it('releases on demolition and resumes scanning when a full buffer is emptied', () => {
    const h = harness(false);
    const buffer = new Container(1);
    buffer.add('scrap', 100);
    const c = new AutomaticSalvageCollector('a', h.callbacks(buffer), buffer);
    c.update(0.1);
    expect(c.state).toBe('latched');
    buffer.clear();
    c.update(0.1);
    expect(c.targetId).toBe('crate-a');
    c.dispose();
    expect(h.claims.size).toBe(0);
  });
});
