import { describe, expect, it } from 'vitest';
import { boardingEncounterToSave, createBoardingEncounter, damageBoardingCrew, damageBoardingHook, restoreBoardingEncounter, stepBoardingEncounter } from '@/vehicles/BoardingEncounter';
import { VehicleManager } from '@/vehicles/VehicleManager';

describe('boarding encounter choreography', () => {
  it('keeps the complete telegraphed sequence and saves live counters', () => {
    let s = createBoardingEncounter('port', 2);
    for (let i = 0; i < 30 && s.phase === 'approach'; i++) s = stepBoardingEncounter(s, { dt: 0.25, hookRange: 10 });
    expect(s.phase).toBe('firing-pass');
    s = stepBoardingEncounter(s, { dt: 2.1, hookRange: 10 });
    expect(s.phase).toBe('alongside');
    s = stepBoardingEncounter(s, { dt: 1.6, hookRange: 10 });
    expect(s.phase).toBe('hook-flight');
    s = stepBoardingEncounter(s, { dt: 0.1, hookRange: 10, hookAttached: true });
    expect(s.phase).toBe('attached');
    s = stepBoardingEncounter(s, { dt: 0.5, hookRange: 10 });
    expect(s.phase).toBe('boarding');
    const restored = restoreBoardingEncounter(boardingEncounterToSave(s));
    expect(restored.phase).toBe('boarding');
    expect(restored.crewHealth).toEqual([55, 55]);
  });

  it('supports counterplay against crew, hull and hook', () => {
    let s = createBoardingEncounter();
    s = damageBoardingCrew(s, 0, 55);
    s = damageBoardingCrew(s, 1, 55);
    expect(stepBoardingEncounter(s, { dt: 0.1, hookRange: 10 }).phase).toBe('retreat');
    s = createBoardingEncounter();
    s = damageBoardingHook(s, 70);
    expect(stepBoardingEncounter(s, { dt: 0.1, hookRange: 10 }).phase).toBe('retreat');
  });

  it('lands the surviving crew member by status, even when crew zero died first', () => {
    const landed: number[] = [];
    const manager = new VehicleManager({
      onSpawn: () => undefined,
      onState: () => undefined,
      onCrewLand: (index) => landed.push(index),
      onDestroyed: () => undefined,
      onRetreat: () => undefined,
      onVolley: () => undefined,
    });
    expect(manager.spawn()).toBe(true);
    manager.damageCrew(0, 55);
    for (let i = 0; i < 80 && manager.snapshot?.phase !== 'boarding'; i++) manager.fixedUpdate(0.25);
    expect(manager.snapshot?.phase).toBe('boarding');
    for (let i = 0; i < 20 && landed.length === 0; i++) manager.fixedUpdate(0.25);
    expect(landed).toEqual([1]);
    expect(manager.snapshot?.crewStatus).toEqual(['dead', 'landed']);
  });

  it('selects a tutorial profile per spawn and returns to regular stats next time', () => {
    const profiles: { maxHealth: number; hookHealth: number; damage: number; shots: number; stagger: number; telegraph: number }[] = [];
    const manager = new VehicleManager({
      onSpawn: (_id, state, profile) => profiles.push({
        maxHealth: state.hullHealth,
        hookHealth: state.hookHealth,
        damage: profile.weapon.damage,
        shots: profile.weapon.volleyShots,
        stagger: profile.crewStaggerSeconds,
        telegraph: profile.telegraphSeconds,
      }),
      onState: () => undefined,
      onCrewLand: () => undefined,
      onDestroyed: () => undefined,
      onRetreat: () => undefined,
      onVolley: () => undefined,
    });

    expect(manager.spawn('skiff', 'port', true)).toBe(true);
    expect(manager.snapshot?.hullHealth).toBe(220);
    expect(manager.snapshot?.hookHealth).toBe(45);
    manager.clear();
    expect(manager.spawn('skiff', 'port')).toBe(true);
    expect(manager.snapshot?.hullHealth).toBe(260);
    expect(manager.snapshot?.hookHealth).toBe(60);
    expect(profiles).toEqual([
      { maxHealth: 220, hookHealth: 45, damage: 8, shots: 2, stagger: 2.25, telegraph: 1 },
      { maxHealth: 260, hookHealth: 60, damage: 12, shots: 3, stagger: 1.5, telegraph: 2 },
    ]);
  });

  it('does not let a terminal callback invalidate the state publication', () => {
    let published = 0;
    const manager = new VehicleManager({
      onSpawn: () => undefined,
      onState: () => { published++; },
      onCrewLand: () => undefined,
      onDestroyed: () => undefined,
      onRetreat: () => undefined,
      onVolley: () => undefined,
      onEnded: () => manager.clear(),
    });
    manager.spawn();
    manager.damageCrew(0, 55);
    manager.damageCrew(1, 55);
    manager.fixedUpdate(0.1);
    manager.fixedUpdate(3.1);
    expect(published).toBe(2);
    expect(manager.snapshot).toBeNull();
  });
});
