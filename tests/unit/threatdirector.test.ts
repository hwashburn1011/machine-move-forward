import { describe, expect, it } from 'vitest';
import {
  BUILDUP_M,
  CALM_MIN,
  CALM_SPREAD,
  CONTACT_STAGGER_M,
  MERCY_HEALTH_FRACTION,
  RECOVERY_M,
  SANCTUARY_RELEASE_M,
  ThreatDirector,
  type ThreatPhase,
} from '@/enemies/ThreatDirector';
import { MAX_ACTIVE_ENEMIES } from '@/data/enemies';

const HEALTHY = 1;

/**
 * Walk a director forward in 5m steps, holding the deck at `activeCount`.
 *
 * Small steps on purpose: the director must not depend on being called at any
 * particular granularity, and a test that advances in one leap would not
 * notice if it did.
 */
function walk(
  d: ThreatDirector,
  from: number,
  metres: number,
  activeCount: () => number,
  health = HEALTHY,
): { spawns: number[]; phases: { phase: ThreatPhase; at: number }[]; end: number } {
  const spawns: number[] = [];
  const phases: { phase: ThreatPhase; at: number }[] = [];
  let at = from;

  for (; at < from + metres; at += 5) {
    const out = d.update(at, activeCount(), health);
    if (out.entered) phases.push({ phase: out.entered, at });
    if (out.spawn) spawns.push(at);
  }

  return { spawns, phases, end: at };
}

/**
 * Walk forward until the next wave has fully landed, and report its size.
 *
 * A wave is not "whatever spawned in the next 4000m": a full cycle is under
 * 1500m, so a fixed stretch counts several of them together. This runs to the
 * next `contact` and stops at the `engagement` that closes it.
 */
function nextWave(
  d: ThreatDirector,
  from: number,
  activeCount: () => number,
  health = HEALTHY,
): { size: number; at: number; spawns: number[]; end: number } {
  let at = from;
  let inWave = false;
  const spawns: number[] = [];
  let started = from;

  for (let i = 0; i < 4000; i++, at += 5) {
    const out = d.update(at, activeCount(), health);
    // The normal pacing loop now includes a single external skiff after two
    // infantry waves. These infantry-focused helpers finish that owned
    // encounter so the old composition assertions continue to exercise only
    // infantry behavior.
    if (out.vehicle) {
      d.finishExternalEncounter(at);
      continue;
    }
    if (out.entered === 'contact') {
      inWave = true;
      started = at;
    }
    if (out.spawn) spawns.push(at);
    if (inWave && out.entered === 'engagement') break;
  }

  return { size: spawns.length, at: started, spawns, end: at + 5 };
}

/** As `nextWave`, but reporting WHAT arrived rather than only how many. */
function nextWaveKinds(
  d: ThreatDirector,
  from: number,
  activeCount: () => number,
  health = HEALTHY,
): { kinds: string[]; end: number } {
  let at = from;
  let inWave = false;
  const kinds: string[] = [];

  for (let i = 0; i < 4000; i++, at += 5) {
    const out = d.update(at, activeCount(), health);
    if (out.vehicle) {
      d.finishExternalEncounter(at);
      continue;
    }
    if (out.entered === 'contact') inWave = true;
    if (out.spawn) kinds.push(out.spawn.defId);
    if (inWave && out.entered === 'engagement') break;
  }

  return { kinds, end: at + 5 };
}

describe('ThreatDirector', () => {
  it('starts calm and stays quiet for at least the guaranteed stretch', () => {
    const d = new ThreatDirector('seed-a');
    expect(d.currentPhase).toBe('calm');

    const r = walk(d, 0, CALM_MIN, () => 0);
    expect(r.spawns).toHaveLength(0);
    expect(d.currentPhase).toBe('calm');
  });

  it('never schedules a calm outside its own bounds, on any seed', () => {
    for (let i = 0; i < 200; i++) {
      const d = new ThreatDirector(`seed-${i}`);
      expect(d.phaseEnds).toBeGreaterThanOrEqual(CALM_MIN);
      expect(d.phaseEnds).toBeLessThanOrEqual(CALM_MIN + CALM_SPREAD);
    }
  });

  it('telegraphs before it spawns: buildup always precedes contact', () => {
    const d = new ThreatDirector('seed-b');
    const r = walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + 100, () => 0);

    const buildup = r.phases.find((p) => p.phase === 'buildup');
    const contact = r.phases.find((p) => p.phase === 'contact');
    expect(buildup).toBeDefined();
    expect(contact).toBeDefined();
    expect(contact?.at).toBeGreaterThan(buildup?.at ?? 0);
    // And nothing arrives during the warning.
    expect(r.spawns.every((s) => s >= (contact?.at ?? 0))).toBe(true);
  });

  it('gives the whole warning distance, not a token one', () => {
    const d = new ThreatDirector('seed-b');
    const r = walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + 100, () => 0);
    const buildup = r.phases.find((p) => p.phase === 'buildup');
    const contact = r.phases.find((p) => p.phase === 'contact');
    // Within one 5m step of the nominal warning.
    expect((contact?.at ?? 0) - (buildup?.at ?? 0)).toBeGreaterThanOrEqual(BUILDUP_M - 5);
  });

  it('staggers a wave rather than dropping it on one frame', () => {
    // Survive three waves so the fourth is more than one body. `activeCount`
    // stays 0, so each arrival is "killed" the instant it lands.
    const d = new ThreatDirector('seed-c');
    let wave = nextWave(d, 0, () => 0);
    for (let i = 0; i < 3; i++) wave = nextWave(d, wave.end, () => 0);

    expect(wave.size).toBeGreaterThan(1);
    const gaps = wave.spawns.slice(1).map((s, i) => s - (wave.spawns[i] as number));
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(CONTACT_STAGGER_M);
  });

  it('holds the wave while the deck is full, and does not forget it', () => {
    const d = new ThreatDirector('seed-d');
    // Run to a wave with the deck permanently at capacity.
    const full = walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + 500, () => MAX_ACTIVE_ENEMIES);
    expect(d.currentPhase).toBe('contact');
    expect(full.spawns).toHaveLength(0);
    expect(d.pendingCount).toBeGreaterThan(0);

    // Room appears; the held body lands at once rather than waiting out
    // another stagger interval on top of the wait it has already served.
    const freed = d.update(full.end, 0, HEALTHY);
    expect(freed.spawn).not.toBeNull();
  });

  it('does not enter recovery until the deck is actually clear', () => {
    const d = new ThreatDirector('seed-e');
    // Get to engagement, then hold one enemy alive for a long way.
    walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + 200, () => 0);
    const held = walk(d, 5000, RECOVERY_M * 4, () => 1);
    expect(held.phases.some((p) => p.phase === 'recovery')).toBe(false);
  });

  it('guarantees a quiet stretch after a wave, before the next calm even starts', () => {
    const d = new ThreatDirector('seed-f');
    // Full cycle with the deck clearing immediately.
    const r = walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + RECOVERY_M + 200, () => 0);
    const recovery = r.phases.find((p) => p.phase === 'recovery');
    expect(recovery).toBeDefined();

    const after = walk(d, recovery?.at ?? 0, RECOVERY_M - 10, () => 0);
    expect(after.spawns).toHaveLength(0);
    expect(after.phases.some((p) => p.phase === 'buildup')).toBe(false);
  });

  it('grows waves as they are survived, and never past what the deck holds', () => {
    const d = new ThreatDirector('seed-g');
    const sizes: number[] = [];
    let end = 0;
    for (let i = 0; i < 12; i++) {
      const wave = nextWave(d, end, () => 0);
      end = wave.end;
      sizes.push(wave.size);
    }
    expect(sizes[0]).toBe(1);
    expect(sizes.at(-1) as number).toBeGreaterThan(sizes[0] as number);
    for (const s of sizes) expect(s).toBeLessThanOrEqual(MAX_ACTIVE_ENEMIES);
  });

  it('sends one fewer at a player who is nearly dead', () => {
    const sixthWave = (health: number): number => {
      const d = new ThreatDirector('seed-h');
      let wave = nextWave(d, 0, () => 0, health);
      for (let i = 0; i < 5; i++) wave = nextWave(d, wave.end, () => 0, health);
      return wave.size;
    };
    expect(sixthWave(1)).toBeGreaterThan(1);
    expect(sixthWave(MERCY_HEALTH_FRACTION - 0.1)).toBe(sixthWave(1) - 1);
  });

  it('holds raiders back until scavengers have been fought', () => {
    // The first waves teach that backing away and shooting works. The raider
    // is the answer to that lesson, so it must arrive after it, not with it.
    const d = new ThreatDirector('seed-raid');
    const kinds: string[][] = [];
    let end = 0;
    for (let i = 0; i < 6; i++) {
      const wave = nextWaveKinds(d, end, () => 0);
      end = wave.end;
      kinds.push(wave.kinds);
    }

    expect(kinds[0]).toEqual(['scavenger']);
    expect(kinds[1]?.every((k) => k === 'scavenger')).toBe(true);
    expect(kinds.slice(2).some((w) => w.includes('raider'))).toBe(true);
  });

  it('never sends a wave of nothing but raiders', () => {
    // A pure raider wave is a rush with no shape to it. There is always a
    // scavenger anchoring one.
    const d = new ThreatDirector('seed-mix');
    let end = 0;
    for (let i = 0; i < 12; i++) {
      const wave = nextWaveKinds(d, end, () => 0);
      end = wave.end;
      if (wave.kinds.length === 0) continue;
      expect(wave.kinds.some((id) => id !== 'raider')).toBe(true);
    }
  });

  it('is deterministic for a seed and different between seeds', () => {
    const run = (seed: string): number[] => walk(new ThreatDirector(seed), 0, 6000, () => 0).spawns;

    expect(run('same')).toEqual(run('same'));
    expect(run('one')).not.toEqual(run('two'));
  });

  it('a long jump does not skip the warning', () => {
    // The debug skip, and a save loaded far ahead. Whatever distance the world
    // crossed, the player is given the whole telegraph from where they are --
    // arriving in a fight the game never announced would be the worst possible
    // reading of "the encounter is visible before it is dangerous".
    const d = new ThreatDirector('seed-i');
    const jumped = CALM_MIN + CALM_SPREAD + BUILDUP_M + 500;
    const out = d.update(jumped, 0, HEALTHY);
    expect(out.entered).toBe('buildup');
    expect(out.spawn).toBeNull();
    expect(d.phaseEnds).toBeGreaterThanOrEqual(jumped + BUILDUP_M);
  });

  it('restores to the same future it was saved from', () => {
    const original = new ThreatDirector('seed-j');
    walk(original, 0, 3000, () => 0);
    const at = 3000;

    const restored = new ThreatDirector('seed-j');
    restored.restore(original.toSave());

    expect(restored.currentPhase).toBe(original.currentPhase);
    expect(restored.waves).toBe(original.waves);
    expect(walk(restored, at, 6000, () => 0).spawns).toEqual(
      walk(original, at, 6000, () => 0).spawns,
    );
  });

  it('survives a save round-trip through JSON, where Infinity does not', () => {
    const d = new ThreatDirector('seed-k');
    walk(d, 0, CALM_MIN + CALM_SPREAD + BUILDUP_M + 20, () => 4);
    expect(d.currentPhase).toBe('contact');

    const restored = new ThreatDirector('seed-k');
    restored.restore(JSON.parse(JSON.stringify(d.toSave())));
    expect(restored.currentPhase).toBe('contact');
    expect(restored.phaseEnds).toBe(Infinity);
  });

  it('requests one skiff after two survived infantry waves and keeps encounters exclusive', () => {
    const d = new ThreatDirector('seed-skiff');
    const first = nextWave(d, 0, () => 0);
    const second = nextWave(d, first.end, () => 0);

    let at = second.end;
    let requestAt = -1;
    let warningAt = -1;
    for (let i = 0; i < 4000; i++, at += 5) {
      const decision = d.update(at, 0, HEALTHY);
      if (decision.entered === 'buildup') warningAt = at;
      if (decision.vehicle) {
        requestAt = at;
        expect(decision.vehicle).toEqual({ type: 'skiff' });
        expect(decision.spawn).toBeNull();
        break;
      }
    }

    expect(requestAt).toBeGreaterThan(0);
    expect(requestAt - warningAt).toBeGreaterThanOrEqual(BUILDUP_M);
    // Once requested, a live external encounter blocks both infantry and a
    // second vehicle, even when the caller omits the fourth argument.
    const held = d.update(requestAt + 500, 0, HEALTHY, true);
    expect(held.vehicle).toBeNull();
    expect(held.spawn).toBeNull();
    expect(d.hasActiveExternalEncounter).toBe(true);
  });

  it('keeps at least 650m quiet after an external encounter, including a long-distance finish', () => {
    const d = new ThreatDirector('seed-quiet');
    d.finishExternalEncounter(50_000);

    const duringRecovery = d.update(50_000 + RECOVERY_M - 1, 0, HEALTHY);
    expect(duringRecovery.spawn).toBeNull();
    expect(duringRecovery.vehicle).toBeNull();
    expect(d.currentPhase).toBe('recovery');

    const recoveryEdge = d.update(50_000 + RECOVERY_M, 0, HEALTHY);
    expect(recoveryEdge.spawn).toBeNull();
    expect(recoveryEdge.vehicle).toBeNull();
    expect(recoveryEdge.entered).toBe('calm');

    const beforeNextTelegraph = d.update(50_000 + RECOVERY_M + CALM_MIN - 1, 0, HEALTHY);
    expect(beforeNextTelegraph.spawn).toBeNull();
    expect(beforeNextTelegraph.vehicle).toBeNull();
    expect(beforeNextTelegraph.entered).toBeNull();

    let nextTelegraphAt = 50_000 + RECOVERY_M + CALM_MIN;
    let nextTelegraph = d.update(nextTelegraphAt, 0, HEALTHY);
    while (
      !nextTelegraph.entered &&
      nextTelegraphAt < 50_000 + RECOVERY_M + CALM_MIN + CALM_SPREAD
    ) {
      nextTelegraphAt += 5;
      nextTelegraph = d.update(nextTelegraphAt, 0, HEALTHY);
    }
    expect(nextTelegraph.entered).toBe('buildup');
    expect(nextTelegraphAt - 50_000).toBeGreaterThanOrEqual(RECOVERY_M + CALM_MIN);
  });

  it('restores recovery and the recurring skiff cadence through a JSON save', () => {
    const original = new ThreatDirector('seed-save-skiff');
    const first = nextWave(original, 0, () => 0);
    const second = nextWave(original, first.end, () => 0);
    let at = second.end;
    let requestAt = -1;
    for (let i = 0; i < 4000; i++, at += 5) {
      const out = original.update(at, 0, HEALTHY);
      if (out.vehicle) {
        requestAt = at;
        break;
      }
    }
    expect(requestAt).toBeGreaterThan(0);
    original.finishExternalEncounter(requestAt + 37);

    const restored = new ThreatDirector('seed-save-skiff');
    restored.restore(JSON.parse(JSON.stringify(original.toSave())));
    expect(restored.currentPhase).toBe('recovery');
    expect(restored.hasActiveExternalEncounter).toBe(false);
    expect(restored.phaseEnds).toBe(requestAt + 37 + RECOVERY_M);

    const originalFuture = walk(original, requestAt + 37, RECOVERY_M + CALM_MIN + 10, () => 0);
    const restoredFuture = walk(restored, requestAt + 37, RECOVERY_M + CALM_MIN + 10, () => 0);
    expect(restoredFuture.phases).toEqual(originalFuture.phases);
    expect(restoredFuture.spawns).toEqual(originalFuture.spawns);
  });

  it('suppresses future schedules in a destination sanctuary and releases into 300m calm', () => {
    const d = new ThreatDirector('seed-sanctuary');
    d.setSanctuary(true, 500);
    expect(d.update(50_000, 2, HEALTHY).spawn).toBeNull();
    expect(d.currentPhase).toBe('calm');

    d.setSanctuary(false, 500);
    expect(d.update(500 + SANCTUARY_RELEASE_M - 1, 2, HEALTHY).spawn).toBeNull();
    const released = d.update(500 + SANCTUARY_RELEASE_M, 2, HEALTHY);
    expect(released.entered).toBe('calm');
    expect(released.spawn).toBeNull();
    expect(d.phaseEnds).toBe(500 + SANCTUARY_RELEASE_M + CALM_MIN);
  });

  it('does not erase active enemies when sanctuary begins', () => {
    const d = new ThreatDirector('seed-sanctuary-live');
    d.setSanctuary(true, 0);
    const saved = d.toSave();
    expect(saved.sanctuaryActive).toBe(true);
    expect(d.update(10_000, 3, HEALTHY, true).spawn).toBeNull();
    expect(d.hasActiveExternalEncounter).toBe(true);
  });
});
