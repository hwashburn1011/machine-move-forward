import { describe, expect, it } from 'vitest';
import { MachineDamage } from '@/machine/MachineDamage';
import { SUBSYSTEMS } from '@/data/subsystems';

const wreck = (m: MachineDamage, id: Parameters<MachineDamage['damage']>[0]) =>
  m.damage(id, SUBSYSTEMS[id].maxHealth + 999);

describe('machine condition', () => {
  it('starts whole', () => {
    const m = new MachineDamage();
    expect(m.fraction('engine')).toBe(1);
    expect(m.isStopped).toBe(false);
    expect(m.enginePower).toBe(1);
    expect(m.damaged()).toEqual([]);
  });

  it('subtracts armour from every hit', () => {
    const m = new MachineDamage();
    const dealt = m.damage('engine', 10);
    expect(dealt).toBe(10 - SUBSYSTEMS.engine.armor);
    expect(m.health('engine')).toBe(SUBSYSTEMS.engine.maxHealth - dealt);
  });

  it('never drops below zero or rises above full', () => {
    const m = new MachineDamage();
    wreck(m, 'engine');
    expect(m.health('engine')).toBe(0);
    m.repair('engine', 99999);
    expect(m.health('engine')).toBe(SUBSYSTEMS.engine.maxHealth);
  });

  it('stops the machine when the engine reaches zero, and only then', () => {
    const m = new MachineDamage();
    m.damage('engine', SUBSYSTEMS.engine.maxHealth - SUBSYSTEMS.engine.armor - 1);
    expect(m.isStopped).toBe(false);
    wreck(m, 'engine');
    expect(m.isStopped).toBe(true);
    expect(m.enginePower).toBe(0);
  });

  it('does not stop the machine for a wrecked leg — a limp is not a halt', () => {
    const m = new MachineDamage();
    for (const id of [
      'leg-front-left',
      'leg-front-right',
      'leg-rear-left',
      'leg-rear-right',
    ] as const) {
      wreck(m, id);
    }
    expect(m.isStopped).toBe(false);
    expect(m.speedScale).toBeGreaterThan(0);
  });

  it('scales engine power continuously, so the machine is read by how it moves', () => {
    const m = new MachineDamage();
    const full = SUBSYSTEMS.engine.maxHealth;
    m.damage('engine', full / 2 + SUBSYSTEMS.engine.armor);
    expect(m.enginePower).toBeCloseTo(0.5, 5);
  });

  it('lists toward the damaged side', () => {
    // Positive is to port, which is the gait's own sign rather than a new one:
    // `gaitPose` records that positive roll raises starboard, and this term is
    // added to that roll. The opposite sign would list AWAY from the broken
    // leg.
    const m = new MachineDamage();
    expect(m.lean).toBe(0);
    wreck(m, 'leg-front-left');
    const port = m.lean;
    expect(port).toBeGreaterThan(0);

    const other = new MachineDamage();
    wreck(other, 'leg-front-right');
    expect(other.lean).toBeCloseTo(-port, 5);
  });

  it('does not list when both sides are equally hurt', () => {
    const m = new MachineDamage();
    wreck(m, 'leg-front-left');
    wreck(m, 'leg-front-right');
    expect(m.lean).toBeCloseTo(0, 5);
  });

  it('reports what is hurt, worst first, for the HUD', () => {
    const m = new MachineDamage();
    m.damage('leg-rear-left', 20);
    wreck(m, 'engine');
    expect(m.damaged().map((d) => d.id)).toEqual(['engine', 'leg-rear-left']);
  });

  it('round-trips through a save', () => {
    const m = new MachineDamage();
    m.damage('engine', 50);
    wreck(m, 'leg-rear-right');

    const loaded = new MachineDamage();
    loaded.restore(m.toSave());
    expect(loaded.health('engine')).toBe(m.health('engine'));
    expect(loaded.health('leg-rear-right')).toBe(0);
  });

  it('treats an absent save as an undamaged machine', () => {
    const m = new MachineDamage();
    m.damage('engine', 50);
    m.restore(undefined);
    expect(m.fraction('engine')).toBe(1);
  });

  it('ignores a subsystem it does not recognise rather than throwing', () => {
    // A save from a build with a sixth subsystem must load, not crash.
    const m = new MachineDamage();
    m.restore([{ id: 'railgun', health: 10 }]);
    expect(m.fraction('engine')).toBe(1);
  });
});
