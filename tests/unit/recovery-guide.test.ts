import { describe, expect, it } from 'vitest';
import { projectRecovery, type RecoverySnapshot } from '@/game/RecoveryGuide';

const base = (): RecoverySnapshot => ({
  firstRunComplete: true,
  fuel: 50,
  fuelCapacity: 100,
  fuelBurnPerSecond: 1,
  machineSpeedMps: 10,
  emergencyCrawl: false,
  generatorCount: 1,
  powerCapacity: 10,
  registeredDemand: 8,
  poweredDraw: 8,
  shedPriorities: ['light', 'station'],
  hydration: 100,
  nourishment: 100,
  waterCarried: 0,
  rationsCarried: 0,
  condenserCount: 1,
  damagedSubsystems: 0,
  repairKits: 0,
  infiniteAmmo: true,
  weaponId: 'rifle',
  ammoReserve: 0,
  safeToSave: true,
});

describe('projectRecovery', () => {
  it('forecasts moving fuel without infinite values and omits range when stopped or crawling', () => {
    expect(projectRecovery(base()).find((hint) => hint.topic === 'fuel')?.severity).toBe('info');
    const moving = projectRecovery({ ...base(), fuel: 20 }).find((hint) => hint.topic === 'fuel');
    expect(moving?.metric).toContain('200 m range');
    const stopped = projectRecovery({ ...base(), fuel: 20, machineSpeedMps: 0 }).find(
      (hint) => hint.topic === 'fuel',
    );
    expect(stopped?.metric).not.toContain('range');
    const crawl = projectRecovery({ ...base(), fuel: 20, emergencyCrawl: true }).find(
      (hint) => hint.topic === 'fuel',
    );
    expect(crawl?.metric).not.toContain('range');
    expect(JSON.stringify(projectRecovery({ ...base(), fuel: 0 }))).not.toContain('Infinity');
  });

  it('reports registered demand separately when power has shed loads', () => {
    const hint = projectRecovery({
      ...base(),
      registeredDemand: 20,
      poweredDraw: 8,
      powerCapacity: 10,
    }).find((item) => item.topic === 'power');
    expect(hint?.severity).toBe('warning');
    expect(hint?.detail).toContain('20');
    expect(hint?.detail).toContain('8');
    expect(hint?.detail).toContain('light');
  });

  it('prioritizes immediate blockers and caps output at three stable topics', () => {
    const hints = projectRecovery({
      ...base(),
      safeToSave: false,
      saveRefusal: 'Clear the attack first.',
      fuel: 0,
      hydration: 0,
      nourishment: 0,
      damagedSubsystems: 2,
    });
    expect(hints).toHaveLength(3);
    expect(hints.map((hint) => hint.topic)).toEqual(['save', 'fuel', 'water']);
    expect(hints[0]?.detail).toBe('Clear the attack first.');
  });

  it('gives concrete water and food recovery actions based on available supplies', () => {
    const hints = projectRecovery({
      ...base(),
      hydration: 10,
      nourishment: 10,
      waterCarried: 1,
      rationsCarried: 1,
    });
    expect(hints.find((hint) => hint.topic === 'water')?.detail).toContain('Drink');
    expect(hints.find((hint) => hint.topic === 'food')?.detail).toContain('Eat');
  });

  it('shows garden ETA only while watered and below output capacity', () => {
    const garden = { water: 1, greens: 0, progressS: 90, cycleS: 180 };
    const hint = projectRecovery({ ...base(), garden });
    expect(hint.find((item) => item.topic === 'garden')?.metric).toContain('90s');
    expect(
      projectRecovery({ ...base(), garden: { ...garden, water: 0 } }).some(
        (item) => item.topic === 'garden',
      ),
    ).toBe(false);
    expect(
      projectRecovery({ ...base(), garden: { ...garden, greens: 6 } }).some(
        (item) => item.topic === 'garden',
      ),
    ).toBe(false);
  });

  it('describes the real scrap-and-components repair action', () => {
    expect(
      projectRecovery({ ...base(), damagedSubsystems: 1, repairKits: 1 }).find(
        (item) => item.topic === 'repair',
      )?.detail,
    ).toContain('access panel');
    expect(
      projectRecovery({ ...base(), damagedSubsystems: 1, repairKits: 0 }).find(
        (item) => item.topic === 'repair',
      )?.detail,
    ).toContain('scrap and components');
  });

  it("warns only the finite-ammo profile and names the selected gun's real workbench recipe", () => {
    const story = projectRecovery({ ...base(), infiniteAmmo: true, ammoReserve: 0 });
    expect(story.some((hint) => hint.topic === 'ammo')).toBe(false);
    expect(JSON.stringify(story).toLowerCase()).not.toContain('scavenge ammo');

    const survival = projectRecovery({ ...base(), infiniteAmmo: false, ammoReserve: 0 });
    const hint = survival.find((item) => item.topic === 'ammo');
    expect(hint).toMatchObject({ severity: 'warning', metric: '0 reserve' });
    expect(hint?.detail).toContain('rifle rounds');
    expect(hint?.detail).toContain('at a workbench');
    expect(
      projectRecovery({
        ...base(),
        infiniteAmmo: false,
        weaponId: 'shotgun',
        ammoReserve: 0,
      }).find((item) => item.topic === 'ammo')?.detail,
    ).toContain('shotgun shells');
    expect(JSON.stringify(survival)).not.toContain('∞');
    expect(
      projectRecovery({ ...base(), infiniteAmmo: false, ammoReserve: 1 }).some(
        (item) => item.topic === 'ammo',
      ),
    ).toBe(false);
  });

  it('sanitizes malformed numeric input without mutating the caller or throwing', () => {
    const snapshot = {
      ...base(),
      fuel: Number.NaN,
      fuelCapacity: Number.POSITIVE_INFINITY,
      machineSpeedMps: -4,
      hydration: Number.NaN,
      damagedSubsystems: Number.POSITIVE_INFINITY,
    };
    const before = { ...snapshot };
    expect(() => projectRecovery(snapshot)).not.toThrow();
    expect(snapshot).toEqual(before);
    expect(projectRecovery(snapshot).length).toBeLessThanOrEqual(3);
  });
});
