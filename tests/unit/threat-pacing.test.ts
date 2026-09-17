import { describe, expect, it } from 'vitest';
import {
  ThreatDirector,
  THREAT_PACING_BY_PROFILE,
  type EncounterLane,
  type ThreatEncounterUpdate,
  type ThreatPacing,
} from '@/enemies/ThreatDirector';

const fast: ThreatPacing = { recoveryM: 10, calmMinM: 20, calmSpreadM: 0, buildupM: 5 };

function tick(
  director: ThreatDirector,
  distanceM: number,
  overrides: Partial<ThreatEncounterUpdate> = {},
) {
  return director.updateEncounter({
    distanceM,
    activeCount: 0,
    healthFraction: 1,
    lane: 'ordinary',
    scheduleAllowed: true,
    pacing: fast,
    ...overrides,
  });
}

function restorePhase(
  director: ThreatDirector,
  phase: 'calm' | 'buildup' | 'contact' | 'engagement' | 'recovery',
  phaseEndsAt: number,
  lane: EncounterLane = 'ordinary',
) {
  director.restore({
    ...director.toSave(),
    phase,
    phaseEndsAt,
    lane,
    pending: [],
    externalEncounterActive: false,
  });
}

describe('lane-aware threat pacing', () => {
  it('holds an unsafe radio schedule without an early or repeated warning', () => {
    const director = new ThreatDirector('safe-gate');
    restorePhase(director, 'calm', 100, 'radio-raid');

    expect(tick(director, 500, { lane: 'radio-raid', scheduleAllowed: false })).toEqual({
      spawn: null,
      entered: null,
      vehicle: null,
    });
    expect(director.currentPhase).toBe('calm');

    const warning = tick(director, 500, { lane: 'radio-raid' });
    expect(warning.entered).toBe('buildup');
    expect(director.phaseEnds).toBe(505);

    for (let i = 0; i < 3; i++) {
      const held = tick(director, 900 + i, {
        lane: 'radio-raid',
        scheduleAllowed: false,
      });
      expect(held.entered).toBeNull();
      expect(held.vehicle).toBeNull();
      expect(director.currentPhase).toBe('buildup');
      expect(director.phaseEnds).toBe(505);
    }

    const request = tick(director, 903, { lane: 'radio-raid' });
    expect(request).toEqual({
      spawn: null,
      entered: 'engagement',
      vehicle: { type: 'radio-raid' },
    });
    expect(tick(director, 2_000, { lane: 'radio-raid' }).vehicle).toBeNull();
  });

  it('does not advance recovery, calm, or buildup while distance is stopped', () => {
    const director = new ThreatDirector('stopped');
    restorePhase(director, 'recovery', 110, 'radio-raid');
    for (let i = 0; i < 10_000; i++)
      expect(tick(director, 100, { lane: 'radio-raid' }).entered).toBeNull();
    expect(director.currentPhase).toBe('recovery');

    expect(tick(director, 110, { lane: 'radio-raid' }).entered).toBe('calm');
    const calmEnd = director.phaseEnds;
    for (let i = 0; i < 100; i++)
      expect(tick(director, 110, { lane: 'radio-raid' }).entered).toBeNull();
    expect(director.phaseEnds).toBe(calmEnd);
  });

  it('preserves a scripted vehicle queue across radio scheduling and completion', () => {
    const director = new ThreatDirector('route-queue');
    expect(director.queueExternal('gunboat')).toBe(true);

    expect(tick(director, 0, { lane: 'radio-raid' }).entered).toBe('recovery');
    expect(director.toSave().queuedVehicle).toBe('gunboat');
    expect(tick(director, 10, { lane: 'radio-raid' }).entered).toBe('calm');
    expect(tick(director, 30, { lane: 'radio-raid' }).entered).toBe('buildup');
    const raid = tick(director, 35, { lane: 'radio-raid' });
    expect(raid.vehicle?.type).toBe('radio-raid');
    expect(director.toSave().queuedVehicle).toBe('gunboat');

    director.finishExternalEncounter(40, fast);
    expect(director.toSave().queuedVehicle).toBe('gunboat');
    expect(tick(director, 40, { lane: 'ordinary' }).entered).toBe('recovery');
    expect(director.toSave().queuedVehicle).toBe('gunboat');
    expect(director.tryBeginExternal('gunboat', 49, 0)).toBe(false);
    expect(director.tryBeginExternal('gunboat', 50, 0)).toBe(true);
    expect(director.toSave().queuedVehicle).toBeNull();
  });

  it('retains a different scripted queue added during external ownership', () => {
    const director = new ThreatDirector('late-route-queue');
    director.restore({
      ...director.toSave(),
      phase: 'engagement',
      phaseEndsAt: null as unknown as number,
      externalEncounterActive: true,
      lane: 'ordinary',
    });
    expect(director.queueExternal('gunboat')).toBe(true);
    director.finishExternalEncounter(100, fast);
    expect(director.toSave().queuedVehicle).toBe('gunboat');
    director.finishExternalEncounter(101, fast);
    expect(director.toSave().queuedVehicle).toBe('gunboat');
  });

  it('defers a lane change until an ordinary contact and engagement finish', () => {
    const director = new ThreatDirector('deferred');
    director.restore({
      ...director.toSave(),
      phase: 'contact',
      phaseEndsAt: null as unknown as number,
      pending: ['scavenger'],
      nextReleaseAt: 0,
      lane: 'ordinary',
    });

    const released = tick(director, 0, { lane: 'radio-raid' });
    expect(released.spawn?.defId).toBe('scavenger');
    expect(director.toSave().lane).toBe('ordinary');
    expect(tick(director, 1, { lane: 'radio-raid' }).entered).toBe('engagement');
    expect(director.toSave().lane).toBe('ordinary');

    expect(tick(director, 2, { lane: 'radio-raid' }).entered).toBe('recovery');
    expect(director.toSave().lane).toBe('radio-raid');
    expect(director.phaseEnds).toBe(12);
  });

  it('defers a lane change while live bodies exist even if a legacy phase is calm', () => {
    const director = new ThreatDirector('legacy-live-body');
    restorePhase(director, 'calm', 1_000, 'ordinary');
    expect(tick(director, 10, { lane: 'radio-raid', activeCount: 1 }).entered).toBeNull();
    expect(director.toSave().lane).toBe('ordinary');
    expect(tick(director, 11, { lane: 'radio-raid', activeCount: 0 }).entered).toBe('recovery');
    expect(director.toSave().lane).toBe('radio-raid');
  });

  it('does not reroll a restored calm deadline when the profile is applied', () => {
    const original = new ThreatDirector('cold-profile');
    const saved = {
      ...original.toSave(),
      phase: 'calm' as const,
      phaseEndsAt: 1_234,
      lane: 'ordinary' as const,
    };
    const restored = new ThreatDirector('cold-profile');
    restored.restore(JSON.parse(JSON.stringify(saved)));
    const draws = restored.toSave().draws;

    const before = restored.updateEncounter({
      distanceM: 100,
      activeCount: 0,
      healthFraction: 1,
      lane: 'ordinary',
      scheduleAllowed: true,
      pacing: THREAT_PACING_BY_PROFILE.survival,
    });
    expect(before.entered).toBeNull();
    expect(restored.phaseEnds).toBe(1_234);
    expect(restored.toSave().draws).toBe(draws);

    const warning = restored.updateEncounter({
      distanceM: 1_234,
      activeCount: 0,
      healthFraction: 1,
      lane: 'ordinary',
      scheduleAllowed: true,
      pacing: THREAT_PACING_BY_PROFILE.survival,
    });
    expect(warning.entered).toBe('buildup');
    expect(restored.phaseEnds).toBe(1_234 + THREAT_PACING_BY_PROFILE.survival.buildupM);
  });

  it('restores a radio buildup to the same one-shot request', () => {
    const original = new ThreatDirector('radio-save');
    restorePhase(original, 'buildup', 80, 'radio-raid');
    const restored = new ThreatDirector('radio-save');
    restored.restore(JSON.parse(JSON.stringify(original.toSave())));

    expect(tick(restored, 79, { lane: 'radio-raid' })).toEqual(
      tick(original, 79, { lane: 'radio-raid' }),
    );
    expect(tick(restored, 80, { lane: 'radio-raid' })).toEqual(
      tick(original, 80, { lane: 'radio-raid' }),
    );
    expect(restored.toSave()).toEqual(original.toSave());
  });

  it('restores missing lanes as ordinary and reset clears lane and pacing state', () => {
    const director = new ThreatDirector('compat');
    const old = { ...director.toSave() };
    delete old.lane;
    director.restore(old);
    expect(director.toSave().lane).toBe('ordinary');

    tick(director, 0, { lane: 'radio-raid', pacing: THREAT_PACING_BY_PROFILE.survival });
    director.reset(50);
    const reset = director.toSave();
    expect(reset.lane).toBe('ordinary');
    expect(reset.phase).toBe('calm');
    expect(reset.phaseEndsAt).toBeGreaterThanOrEqual(50 + 400);
    expect(reset.phaseEndsAt).toBeLessThanOrEqual(50 + 400 + 700);
  });

  it('initializes a new survival director with survival quiet without changing combat rules', () => {
    const director = new ThreatDirector('survival-new');
    director.reset(75, THREAT_PACING_BY_PROFILE.survival);
    expect(director.phaseEnds).toBeGreaterThanOrEqual(75 + 300);
    expect(director.phaseEnds).toBeLessThanOrEqual(75 + 300 + 500);
    expect(director.toSave().lane).toBe('ordinary');
  });
});
