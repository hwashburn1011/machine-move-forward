import { describe, expect, it } from 'vitest';
import { AutomaticDefenseSystem, selectAutomaticTarget } from '@/defense/AutomaticDefenseSystem';

const origin = { x: 0, y: 0, z: 0 };
describe('AutomaticDefenseSystem', () => {
  it('ranks visible legal targets and excludes skiffs', () => {
    const targets = [
      {
        id: 'skiff',
        kind: 'vehicle',
        vehicleId: 'skiff' as const,
        part: 'hull' as const,
        position: { x: 1, y: 0, z: 0 },
      },
      { id: 'hidden', kind: 'infantry', position: { x: 2, y: 0, z: 0 } },
      {
        id: 'gunboat',
        kind: 'vehicle',
        vehicleId: 'gunboat' as const,
        part: 'hull' as const,
        position: { x: 3, y: 0, z: 0 },
      },
    ];
    expect(selectAutomaticTarget(origin, targets, 30, (t) => t.id !== 'hidden')?.id).toBe(
      'gunboat',
    );
  });

  it('uses wrapped yaw and requires lock delay before firing', () => {
    let fired = 0;
    let visible = true;
    const system = new AutomaticDefenseSystem({
      isPowered: () => true,
      getHealth: () => 100,
      getPosition: () => origin,
      getTargets: () => [{ id: 'enemy', kind: 'infantry', position: { x: 0.1, y: 0, z: 10 } }],
      hasLineOfSight: () => visible,
      raycast: () => true,
      damageTarget: () => undefined,
      onFired: () => fired++,
    });
    system.register('t', { yaw: Math.PI - 0.01, pitch: 0 });
    system.update(0.1);
    expect(fired).toBe(0);
    system.update(0.3);
    expect(fired).toBe(1);
    visible = false;
    system.update(1);
    expect(fired).toBe(1);
  });

  it('resets target and lock on power loss, death, occlusion, and restore', () => {
    let powered = true;
    let alive = true;
    let fired = 0;
    const system = new AutomaticDefenseSystem({
      isPowered: () => powered,
      getHealth: () => (alive ? 100 : 0),
      getPosition: () => origin,
      getTargets: () => [{ id: 'enemy', kind: 'infantry', position: { x: 0, y: 0, z: -5 }, alive }],
      damageTarget: () => undefined,
      onFired: () => fired++,
    });
    system.register('t');
    system.update(0.35);
    expect(fired).toBe(1);
    powered = false;
    system.update(1);
    powered = true;
    system.update(0.1);
    expect(fired).toBe(1);
    alive = false;
    system.update(1);
    expect(fired).toBe(1);
    system.restore([{ instanceId: 't', yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY }]);
    expect(system.toSave()[0]!.yaw).toBe(0);
    expect(system.toSave()[0]!.pitch).toBe(0);
  });

  it.each([1, -1])('crosses the rear yaw seam in direction %s and fires', (sign) => {
    let fired = 0;
    const wanted = -sign * 2.7;
    const system = new AutomaticDefenseSystem({
      isPowered: () => true,
      getHealth: () => 100,
      getPosition: () => origin,
      getTargets: () => [
        {
          id: 'gunboat-weapon',
          kind: 'gunboat-weapon',
          position: { x: Math.sin(wanted) * 10, y: 0, z: -Math.cos(wanted) * 10 },
        },
      ],
      hasLineOfSight: () => true,
      raycast: () => true,
      damageTarget: () => undefined,
      onFired: () => fired++,
    });
    system.register('t', { yaw: sign * 2.7, pitch: 0 });
    for (let frame = 0; frame < 60; frame++) system.update(1 / 60);
    expect(system.toSave()[0]!.yaw).toBeCloseTo(wanted, 5);
    expect(fired).toBe(1);
  });

  it('does not bank cooldown shots and tracks consistently across fixed dt', () => {
    let firedA = 0;
    const make = (onFired: () => void) =>
      new AutomaticDefenseSystem({
        isPowered: () => true,
        getHealth: () => 100,
        getPosition: () => origin,
        getTargets: () => [{ id: 'e', kind: 'infantry', position: { x: 0, y: 0, z: -5 } }],
        damageTarget: () => undefined,
        onFired,
      });
    const a = make(() => firedA++);
    a.register('a');
    for (let i = 0; i < 35; i++) a.update(0.01);
    expect(firedA).toBe(1);
    a.update(3);
    expect(firedA).toBe(2);
    let firedB = 0;
    const b = make(() => firedB++);
    b.register('b');
    b.update(0.35);
    expect(firedB).toBe(1);
    b.update(0.01);
    expect(firedB).toBe(1);
  });
});
