import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/events/EventBus';

describe('EventBus', () => {
  it('delivers a payload to a subscriber', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('player:damaged', fn);
    bus.emit('player:damaged', { amount: 10, remaining: 90, source: 'enemy' });
    expect(fn).toHaveBeenCalledWith({ amount: 10, remaining: 90, source: 'enemy' });
  });

  it('delivers to every subscriber in registration order', () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on('weapon:fired', () => order.push(1));
    bus.on('weapon:fired', () => order.push(2));
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 29 });
    expect(order).toEqual([1, 2]);
  });

  it('unsubscribes via the returned disposer', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('weapon:fired', fn);
    off();
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 29 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() unsubscribes the named listener', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('weapon:fired', fn);
    bus.off('weapon:fired', fn);
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('once() fires exactly one time', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('enemy:killed', fn);
    bus.emit('enemy:killed', { enemyId: 'e1', position: { x: 0, y: 0, z: 0 } });
    bus.emit('enemy:killed', { enemyId: 'e2', position: { x: 0, y: 0, z: 0 } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when emitting an event with no listeners', () => {
    const bus = new EventBus();
    expect(() => bus.emit('world:chunk-recycled', { chunkIndex: 3 })).not.toThrow();
  });

  it('isolates a throwing listener so later listeners still run', () => {
    const bus = new EventBus();
    const after = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('weapon:fired', () => {
      throw new Error('boom');
    });
    bus.on('weapon:fired', after);
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 1 });
    expect(after).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a listener unsubscribing during emit does not skip the next listener', () => {
    const bus = new EventBus();
    const second = vi.fn();
    const offFirst = bus.on('weapon:fired', () => offFirst());
    bus.on('weapon:fired', second);
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clear() removes every listener', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('weapon:fired', fn);
    bus.clear();
    bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
