import { describe, it, expect } from 'vitest';
import { migrate, SaveMigrationError } from '@/save/migrations';
import { CURRENT_SAVE_VERSION, type SaveGameV1 } from '@/save/SaveSchema';
import { MachineDamage } from '@/machine/MachineDamage';

const validSave = (): SaveGameV1 => ({
  version: 1,
  savedAt: 1_700_000_000,
  seed: 'test-seed',
  distanceTraveled: 1234.5,
  player: {
    position: { x: 0, y: 3.4, z: -1 },
    health: 87,
    inventory: [],
    equipment: {
      currentWeapon: 'rifle',
      weapons: [{ id: 'rifle', ammoInMag: 12, reserveAmmo: 90 }],
    },
  },
  machine: {
    structures: [],
    devices: [],
    fuel: 80,
    coreHealth: 100,
    navigationTier: 0,
  },
  progression: { unlocks: [] },
  world: { chunkIndex: 19, threatDirector: null },
});

describe('migrate', () => {
  it('passes a current-version save through unchanged', () => {
    const save = validSave();
    expect(migrate(save)).toEqual(save);
  });

  it('does not mutate its input', () => {
    const save = validSave();
    const snapshot = structuredClone(save);
    const out = migrate(save);
    out.distanceTraveled = 99999;
    expect(save).toEqual(snapshot);
  });

  it('rejects a non-object', () => {
    expect(() => migrate(null)).toThrow(SaveMigrationError);
    expect(() => migrate('nope')).toThrow(SaveMigrationError);
    expect(() => migrate(42)).toThrow(SaveMigrationError);
  });

  it('rejects data with no version field', () => {
    expect(() => migrate({ seed: 'x' })).toThrow(/version/i);
  });

  it('rejects a non-integer version', () => {
    expect(() => migrate({ version: 1.5 })).toThrow(SaveMigrationError);
    expect(() => migrate({ version: 'one' })).toThrow(SaveMigrationError);
  });

  it('rejects a version below 1', () => {
    expect(() => migrate({ version: 0 })).toThrow(/unknown save version/i);
  });

  it('rejects a save from a newer build with a clear message', () => {
    expect(() => migrate({ version: CURRENT_SAVE_VERSION + 1 })).toThrow(/newer version/i);
  });

  it('fills in a missing progression block', () => {
    const save = validSave() as Partial<SaveGameV1>;
    delete save.progression;
    expect(migrate(save).progression.unlocks).toEqual([]);
  });

  it('fills in a missing machine block', () => {
    const save = validSave() as Partial<SaveGameV1>;
    delete save.machine;
    const out = migrate(save);
    expect(out.machine.navigationTier).toBe(0);
    expect(out.machine.structures).toEqual([]);
  });

  it('fills in a missing world block', () => {
    const save = validSave() as Partial<SaveGameV1>;
    delete save.world;
    expect(migrate(save).world.threatDirector).toBeNull();
  });

  it('preserves distance and seed, which the world regenerates from', () => {
    const out = migrate(validSave());
    expect(out.distanceTraveled).toBe(1234.5);
    expect(out.seed).toBe('test-seed');
  });
});

describe('machine condition in a save', () => {
  it('needs no migration, because absent is a legal value', () => {
    // The same argument threatDirector made in this file: the old shape is
    // still a legal value of the new type, and absent has exactly one
    // sensible reading — nothing was damaged.
    expect(CURRENT_SAVE_VERSION).toBe(1);
  });

  it('reads a pre-damage save as an undamaged machine', () => {
    const d = new MachineDamage();
    d.damage('engine', 100);
    d.restore(undefined);
    expect(d.fraction('engine')).toBe(1);
  });

  it("carries every subsystem's health across a round trip", () => {
    const before = new MachineDamage();
    before.damage('engine', 90);
    before.damage('leg-rear-left', 99999);

    const after = new MachineDamage();
    after.restore(JSON.parse(JSON.stringify(before.toSave())));

    expect(after.health('engine')).toBe(before.health('engine'));
    expect(after.health('leg-rear-left')).toBe(0);
    expect(after.isStopped).toBe(false);
  });

  it('accepts a save that carries the optional field', () => {
    const save = validSave();
    save.machine.subsystems = new MachineDamage().toSave();
    expect(migrate(save).machine.subsystems).toHaveLength(5);
  });
});
