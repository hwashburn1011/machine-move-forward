import { describe, expect, it } from 'vitest';
import { ThreatDirector, CALM_MIN, RECOVERY_M } from '@/enemies/ThreatDirector';

describe('external encounter queue', () => {
  it('reads legacy skiff queue and writes an explicit vehicle id', () => {
    const director = new ThreatDirector('queue');
    director.restore({
      ...director.toSave(),
      vehicleQueued: true,
      queuedVehicle: undefined,
      phase: 'buildup',
      phaseEndsAt: 100,
    });
    expect(director.toSave().queuedVehicle).toBe('skiff');
    expect(director.toSave().vehicleQueued).toBeUndefined();
    expect(director.update(100, 0, 1).vehicle?.type).toBe('skiff');
    expect(director.update(200, 0, 1).vehicle).toBeNull();
  });
  it('defers a queued gunboat during infantry and sanctuary, then claims exactly once', () => {
    const director = new ThreatDirector('queue');
    expect(director.queueExternal('gunboat')).toBe(true);
    expect(director.queueExternal('gunboat')).toBe(true);
    expect(director.tryBeginExternal('gunboat', 0, 1)).toBe(false);
    director.setSanctuary(true, 0);
    expect(director.tryBeginExternal('gunboat', 100, 0)).toBe(false);
    director.setSanctuary(false, 100);
    director.update(400, 0, 1);
    expect(director.tryBeginExternal('gunboat', 400, 0)).toBe(true);
    expect(director.tryBeginExternal('gunboat', 400, 0)).toBe(false);
    expect(director.update(10000, 0, 1)).toEqual({ spawn: null, entered: null, vehicle: null });
  });
  it('respects recovery floor and aborts an orphan without increasing victories', () => {
    const director = new ThreatDirector('queue');
    director.finishExternalEncounter(100);
    director.queueExternal('gunboat');
    expect(director.tryBeginExternal('gunboat', 100 + RECOVERY_M - 1, 0)).toBe(false);
    expect(director.tryBeginExternal('gunboat', 100 + RECOVERY_M, 0)).toBe(true);
    const victories = director.waves;
    expect(director.abortOrphanExternal(900)).toBe(true);
    expect(director.abortOrphanExternal(900)).toBe(false);
    expect(director.waves).toBe(victories);
    expect(director.hasActiveExternalEncounter).toBe(false);
    expect(director.phaseEnds).toBe(900 + CALM_MIN);
  });
  it('retains a vehicle queue instead of spawning infantry on occupied buildup', () => {
    const director = new ThreatDirector('queue');
    director.restore({
      ...director.toSave(),
      queuedVehicle: 'gunboat',
      phase: 'buildup',
      phaseEndsAt: 100,
    });
    expect(director.update(110, 2, 1).vehicle).toBeNull();
    expect(director.currentPhase).toBe('buildup');
    expect(director.pendingCount).toBe(0);
    expect(director.update(120, 0, 1).vehicle?.type).toBe('gunboat');
  });
});
