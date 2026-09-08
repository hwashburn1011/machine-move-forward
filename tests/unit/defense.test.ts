import { describe, expect, it } from 'vitest';
import { TURRETS } from '@/data/turrets';
import { Progression } from '@/progression/Progression';
import { DefenseSystem } from '@/defense/DefenseSystem';

const target = { id: 'enemy-1', kind: 'infantry' as const, position: { x: 0, y: 1, z: -10 } };

describe('manual turret', () => {
  it('keeps the first turret unlock deterministic and saveable', () => {
    const p = new Progression();
    expect(p.turretBlueprintReady).toBe(false);
    expect(p.addTurretBlueprintProgress(0.5)).toBe(false);
    expect(new Progression(p.toSave()).snapshot.turretBlueprintProgress).toBe(0.5);
    expect(p.recordSalvageCollected()).toBe(true);
    expect(new Progression(p.toSave()).turretBlueprintReady).toBe(true);
  });

  it('mounts, clamps manual aim, and routes one unobstructed hit', () => {
    const shots: string[] = [];
    const defense = new DefenseSystem({
      isPowered: () => true,
      getHealth: () => 150,
      getPosition: () => ({ x: 0, y: 1, z: 0 }),
      getTargets: () => [target],
      raycast: () => ({ targetId: 'enemy-1', distance: 10 }),
      damageTarget: (id) => shots.push(id),
      onMounted: () => {}, onDismounted: () => {}, onFired: (_, id) => shots.push(`event:${id}`),
    });
    defense.register('turret-1');
    expect(defense.enter('turret-1')).toBe(true);
    defense.aim(99, 99);
    const view = defense.update(0, { dt: 1 / 60, lookX: 0, lookY: 0, fireHeld: true, powered: true, occupied: true });
    expect(view?.pitch).toBe(TURRETS['manual-turret'].traverse.pitchMax);
    expect(shots).toEqual(['enemy-1', 'event:enemy-1']);
    defense.exit();
    expect(defense.mounted).toBeNull();
  });

  it('consumes cadence on an occluded shot so a held trigger cannot probe every tick', () => {
    const events: (string | null)[] = [];
    const defense = new DefenseSystem({
      isPowered: () => true,
      getHealth: () => 150,
      getPosition: () => ({ x: 0, y: 1, z: 0 }),
      getTargets: () => [target],
      raycast: () => null,
      damageTarget: () => { throw new Error('an occluded ray must not deal damage'); },
      onMounted: () => {}, onDismounted: () => {}, onFired: (_, id) => events.push(id),
    });
    defense.register('turret-2');
    expect(defense.enter('turret-2')).toBe(true);
    defense.update(0, { dt: 1 / 60, lookX: 0, lookY: 0, fireHeld: true, powered: true, occupied: true });
    defense.update(0.1, { dt: 1 / 60, lookX: 0, lookY: 0, fireHeld: true, powered: true, occupied: true });
    defense.update(1, { dt: 1 / 60, lookX: 0, lookY: 0, fireHeld: true, powered: true, occupied: true });
    expect(events).toEqual([null, null]);
  });

  it('applies an injected defense modifier once at fire time', () => {
    const damage: number[] = [];
    const defense = new DefenseSystem({
      isPowered: () => true,
      getHealth: () => 150,
      getPosition: () => ({ x: 0, y: 1, z: 0 }),
      getTargets: () => [target],
      raycast: () => ({ targetId: 'enemy-1', distance: 10 }),
      damageTarget: (_, amount) => damage.push(amount),
      getModifiers: () => ({ damageMultiplier: 1.43, fireRateMultiplier: 0.67, powerDrawBonus: 1 }),
      onMounted: () => {}, onDismounted: () => {}, onFired: () => {},
    });
    defense.register('turret-upgraded');
    defense.enter('turret-upgraded');
    defense.update(0, { dt: 1 / 60, lookX: 0, lookY: 0, fireHeld: true, powered: true, occupied: true });
    expect(damage).toEqual([TURRETS['manual-turret'].damage * 1.43]);
    expect(defense.effectivePowerDraw).toBe(TURRETS['manual-turret'].powerDraw + 1);
    expect(defense.effectiveFireRate).toBeCloseTo(TURRETS['manual-turret'].fireRate * 0.67);
  });
});
