import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SaveExportCodec, SaveExportError, validateSaveForExport } from '@/save/SaveExportCodec';
import type { SaveGameV1 } from '@/save/SaveSchema';
import { ThreatDirector } from '@/enemies/ThreatDirector';
import { StoryDirector } from '@/story/StoryDirector';

const fixture = (): SaveGameV1 => ({
  version: 1,
  savedAt: 42,
  seed: 'unicode-seed',
  distanceTraveled: 18,
  player: {
    position: { x: 1, y: 2, z: 3 },
    health: 87,
    inventory: [null],
    equipment: {
      currentWeapon: 'rifle',
      weapons: [{ id: 'rifle', ammoInMag: 4, reserveAmmo: 20 }],
    },
  },
  machine: { structures: [], devices: [], fuel: 9, coreHealth: 100, navigationTier: 0 },
  progression: { unlocks: [] },
  world: { chunkIndex: 1, threatDirector: null },
});

describe('SaveExportCodec', () => {
  it('imports legacy Survival as Story without changing progress or mutating the source', () => {
    const legacy = { ...fixture(), profile: 'survival' as const };
    const before = structuredClone(legacy);
    const decoded = SaveExportCodec.decode(
      JSON.stringify({
        format: 'machine-move-forward-save',
        formatVersion: 1,
        name: 'Legacy run',
        save: legacy,
      }),
    );
    expect(decoded.save).toEqual({ ...before, profile: 'story' });
    expect(legacy).toEqual(before);
    expect(validateSaveForExport(legacy)).toEqual({ ...before, profile: 'story' });
    expect(() => validateSaveForExport({ ...legacy, profile: 'future-mode' })).toThrow(/profile/);
  });

  it('round trips Unicode names and complete nested saves without aliasing', () => {
    const text = SaveExportCodec.encode('  日本語 expedition  ', fixture());
    const decoded = SaveExportCodec.decode(text);
    expect(decoded.name).toBe('日本語 expedition');
    expect(decoded.save).toEqual(fixture());
    decoded.save.player.position.x = 99;
    expect(fixture().player.position.x).toBe(1);
  });

  it.each([
    '{}',
    '{"format":"machine-move-forward-save","formatVersion":2}',
    '{"format":"machine-move-forward-save","formatVersion":1,"name":"x","save":{"version":1}}',
    '{"format":"machine-move-forward-save","formatVersion":1,"name":"x","save":{"version":1,"__proto__":{}}}',
  ])('rejects malformed export %s', (text) => {
    expect(() => SaveExportCodec.decode(text)).toThrow();
  });

  it('rejects invalid nested state before trusting it', () => {
    const bad = fixture();
    (bad.player.inventory as unknown[])[0] = { itemId: 'scrap', count: Infinity };
    expect(() => validateSaveForExport(bad)).toThrow(/non-finite|inventory/i);
    expect(() => SaveExportCodec.encode('', fixture())).toThrow();
  });

  it.each([
    ['machine fuel', (s: SaveGameV1) => ((s.machine.fuel as unknown) = 'full')],
    [
      'structure id',
      (s: SaveGameV1) =>
        s.machine.structures.push({
          instanceId: 'x',
          definitionId: 'future-piece' as never,
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 1,
        }),
    ],
    ['needs', (s: SaveGameV1) => (s.player.needs = { hydration: 101, nourishment: 10 })],
    [
      'ending phase',
      (s: SaveGameV1) =>
        (s.world.story = {
          format: 2,
          completed: [],
          recoveredUniques: [],
          active: null,
          ending: { format: 1, phase: 'forged', committedAtDistance: null, arrivalElapsedS: 0 },
        } as never),
    ],
    [
      'route chart',
      (s: SaveGameV1) =>
        (s.world.routeChart = {
          format: 1,
          nextSlot: 0,
          discovered: 'bad' as never,
          visited: [],
          missed: [],
        }),
    ],
    [
      'weapon attachment',
      (s: SaveGameV1) =>
        (s.player.equipment.weapons[0]!.attachments = {
          researched: ['unknown'] as never,
          active: 'unknown' as never,
        }),
    ],
  ])('rejects malformed %s branches', (_label, mutate) => {
    const bad = fixture();
    mutate(bad);
    expect(() => validateSaveForExport(bad)).toThrow();
  });

  it('accepts a complete ending and optional runtime ledger shape', () => {
    const save = fixture();
    save.world.story = {
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: [],
      active: null,
      chapterComplete: true,
      ending: { format: 1, phase: 'complete', committedAtDistance: 400, arrivalElapsedS: 12 },
    } as never;
    save.world.routeChart = { format: 1, nextSlot: 1, discovered: [], visited: [], missed: [] };
    save.world.dustFront = { format: 1, phase: 'clear', elapsedS: 0, nextAtM: 1000, sequence: 0 };
    save.world.radioRaids = { wave: 1, remaining: 24 };
    expect(SaveExportCodec.decode(SaveExportCodec.encode('Ending ✅', save)).save).toEqual(save);
  });

  it('round trips the recorded full cold checkpoint without changing payload fields', () => {
    const report = JSON.parse(readFileSync('docs/interior-galley/validation.json', 'utf8')) as {
      cold?: { checkpoint?: unknown };
    };
    expect(report.cold?.checkpoint).toBeTruthy();
    const checkpoint = validateSaveForExport(report.cold!.checkpoint);
    const decoded = SaveExportCodec.decode(
      SaveExportCodec.encode('Galley cold checkpoint', checkpoint),
    );
    expect(decoded.save).toEqual(checkpoint);
    expect(decoded.save.world.raidRecovery).toEqual({ recovered: [] });
  });

  it('applies migration defaults before requiring legacy v1 blocks', () => {
    for (const key of ['machine', 'progression', 'world'] as const) {
      const legacy = fixture() as Partial<SaveGameV1>;
      delete legacy[key];
      const migrated = validateSaveForExport(legacy);
      expect(migrated.machine.structures).toEqual([]);
      expect(migrated.progression.unlocks).toEqual([]);
      expect(migrated.world.threatDirector).toBeNull();
    }
  });

  it('accepts the published legacy expedition projection used by the restore consumer', () => {
    const save = fixture();
    const legacy = new StoryDirector().legacyProjection();
    save.world.story = legacy as never;
    expect(validateSaveForExport(save).world.story).toEqual(legacy);

    const malformed = fixture();
    malformed.world.story = { ...legacy, journalsRead: [7] } as never;
    expect(() => validateSaveForExport(malformed)).toThrow(SaveExportError);
  });

  it('canonicalizes only ThreatDirector JSON deadline sentinels without mutating live state', () => {
    const liveThreat = new ThreatDirector('fresh-campaign').toSave();
    expect(liveThreat.sanctuaryReleaseAt).toBe(Number.POSITIVE_INFINITY);
    const save = fixture();
    save.world.threatDirector = liveThreat;

    const validated = validateSaveForExport(save);
    expect(validated.world.threatDirector?.sanctuaryReleaseAt).toBeNull();
    expect(liveThreat.sanctuaryReleaseAt).toBe(Number.POSITIVE_INFINITY);
    expect(SaveExportCodec.decode(SaveExportCodec.encode('Fresh opening', save)).save).toEqual(
      validated,
    );

    const engagement = fixture();
    engagement.world.threatDirector = {
      ...liveThreat,
      phase: 'engagement',
      phaseEndsAt: Number.POSITIVE_INFINITY,
      pending: ['scavenger', 'scavenger'],
    };
    expect(validateSaveForExport(engagement).world.threatDirector).toMatchObject({
      phaseEndsAt: null,
      pending: ['scavenger', 'scavenger'],
      sanctuaryReleaseAt: null,
    });

    const unrelatedInfinity = fixture();
    unrelatedInfinity.machine.devices = [{ deadline: Number.POSITIVE_INFINITY }];
    expect(() => validateSaveForExport(unrelatedInfinity)).toThrow(/non-finite/);
  });

  it('accepts every populated schema branch consumed during restore', () => {
    const save = fixture();
    save.profile = 'story';
    save.player.needs = { hydration: 50, nourishment: 60 };
    save.player.equipment.weapons[0] = {
      id: 'rifle',
      ammoInMag: 40,
      reserveAmmo: 150,
      magazineBonus: 15,
      attachments: { researched: ['rifle-stabilizer'], active: 'rifle-stabilizer' },
    };
    save.machine.layout = 'iron-nomad-v1';
    save.machine.structures = [
      {
        instanceId: 'bp-0',
        definitionId: 'wall',
        cell: { x: 0, y: 0, z: 0 },
        edge: { x: 0, y: 0, z: 0, axis: 'x' },
        rotation: 0,
        health: 150,
      },
      {
        instanceId: 'bp-2',
        definitionId: 'crate',
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 110,
        state: { slots: [{ itemId: 'scrap', count: 2 }, null] },
      },
      {
        instanceId: 'bp-3',
        definitionId: 'condenser',
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 130,
        state: { progress: 10, stored: 1 },
      },
      {
        instanceId: 'bp-4',
        definitionId: 'seed-garden',
        cell: { x: 0, y: 0, z: 0 },
        rotation: 0,
        health: 100,
        state: { format: 1, water: 1, greens: 3, progressS: 40 },
      },
    ];
    save.machine.course = { tier: 1, bearingDeg: 4, desiredDeg: 6, throttle: 0.8, lateralM: 2 };
    save.machine.subsystems = [{ id: 'engine', health: 200 }];
    save.progression = {
      unlocks: ['manual-turret'],
      turretBlueprintProgress: 1,
      turrets: [{ instanceId: 'bp-5', yaw: 0, pitch: 0, filter: 'all' }],
      automaticTurrets: [{ instanceId: 'bp-6', yaw: 0, pitch: 0 }],
      firstRun: { completed: ['salvage'], counters: { salvage: 2 } },
      upgrades: { researched: ['lean-governor'], active: { power: 'lean-governor' } },
      caretaker: { format: 1, recruited: true, mode: 'companion' },
      radio: {
        status: 'found',
        armedAtSimTime: 1,
        foundAtSimTime: 2,
        foundAtDistance: 3,
        eligibleChestsOpened: 1,
      },
      radioDrop: {
        status: 'pending',
        armedAtSimTime: null,
        foundAtSimTime: null,
        foundAtDistance: null,
        eligibleChestsOpened: 0,
      },
      opening: { phase: 'done' },
    };
    save.world = {
      chunkIndex: 1,
      threatDirector: {
        phase: 'calm',
        phaseEndsAt: 10,
        wavesSurvived: 1,
        pending: ['scavenger'],
        nextReleaseAt: 0,
        draws: 1,
        wavesSinceVehicle: 1,
        queuedVehicle: null,
        externalEncounterActive: false,
        sanctuaryActive: false,
        sanctuaryReleaseAt: 0,
      },
      story: {
        format: 2,
        completed: [],
        recoveredUniques: [],
        active: {
          expeditionId: 'wreck-one',
          routeId: null,
          phase: 'signal',
          arrivalDistance: null,
          journalsRead: [],
          scriptedEncounter: 'not-due',
          signalStartedAt: 1,
        },
      },
      radioRaids: { wave: 1, remaining: 20 },
      raidRecovery: {
        active: {
          objective: 'theft',
          carrierId: 'enemy-1',
          targetId: 'bp-2',
          entry: { x: 0, y: 0, z: 0 },
          state: 'carrying',
          cargo: { itemId: 'scrap', count: 2 },
        },
        recovered: [{ itemId: 'components', count: 2 }],
      },
      routeChart: {
        format: 1,
        nextSlot: 2,
        discovered: ['route-contact-1'],
        visited: [],
        missed: [],
        active: {
          id: 'route-contact-1',
          slot: 1,
          kind: 'water-cache',
          atDistanceM: 100,
          worldX: 10,
          confidence: 1,
          hazard: 'calm',
          detectedAtM: 10,
          expiresAtM: 120,
          state: 'detected',
          rewards: [{ type: 'item', itemId: 'water', remaining: 4 }],
        },
      },
      dustFront: { format: 1, phase: 'forecast', elapsedS: 5, nextAtM: 100, sequence: 1 },
    };
    expect(validateSaveForExport(save)).toEqual(save);
  });

  /* eslint-disable @typescript-eslint/no-explicit-any -- malformed input cases intentionally violate SaveGameV1 */
  it.each([
    ['profile', (s: any) => (s.profile = 'nightmare')],
    ['player health', (s: any) => (s.player.health = -1)],
    ['inventory zero stack', (s: any) => (s.player.inventory = [{ itemId: 'scrap', count: 0 }])],
    ['inventory capacity', (s: any) => (s.player.inventory = Array(21).fill(null))],
    ['needs primitive', (s: any) => (s.player.needs = 0)],
    ['missing current weapon state', (s: any) => (s.player.equipment.weapons = [])],
    ['unsafe reserve', (s: any) => (s.player.equipment.weapons[0].reserveAmmo = 2 ** 53)],
    ['magazine bonus type', (s: any) => (s.player.equipment.weapons[0].magazineBonus = 'large')],
    ['attachment object', (s: any) => (s.player.equipment.weapons[0].attachments = null)],
    ['layout type', (s: any) => (s.machine.layout = 7)],
    ['fractional navigation tier', (s: any) => (s.machine.navigationTier = 0.5)],
    ['excess fuel', (s: any) => (s.machine.fuel = 101)],
    [
      'invalid course throttle',
      (s: any) =>
        (s.machine.course = { tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 0, lateralM: 0 }),
    ],
    [
      'duplicate subsystems',
      (s: any) =>
        (s.machine.subsystems = [
          { id: 'engine', health: 1 },
          { id: 'engine', health: 1 },
        ]),
    ],
    [
      'structure instance id',
      (s: any) =>
        s.machine.structures.push({
          instanceId: 'x',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 1,
        }),
    ],
    [
      'structure rotation',
      (s: any) =>
        s.machine.structures.push({
          instanceId: 'bp-1',
          definitionId: 'floor',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0.5,
          health: 1,
        }),
    ],
    [
      'crate payload',
      (s: any) =>
        s.machine.structures.push({
          instanceId: 'bp-1',
          definitionId: 'crate',
          cell: { x: 0, y: 0, z: 0 },
          rotation: 0,
          health: 1,
          state: { slots: 'poison' },
        }),
    ],
    ['unlock entry', (s: any) => (s.progression.unlocks = [{}])],
    ['blueprint progress', (s: any) => (s.progression.turretBlueprintProgress = 'bad')],
    ['first-run iterable', (s: any) => (s.progression.firstRun = { completed: 7, counters: {} })],
    [
      'first-run counter',
      (s: any) => (s.progression.firstRun = { completed: [], counters: { salvage: 0 } }),
    ],
    [
      'upgrade branch',
      (s: any) =>
        (s.progression.upgrades = {
          researched: ['lean-governor'],
          active: { defense: 'lean-governor' },
        }),
    ],
    ['caretaker primitive', (s: any) => (s.progression.caretaker = false)],
    [
      'radio state',
      (s: any) =>
        (s.progression.radio = {
          status: 'found',
          armedAtSimTime: null,
          foundAtSimTime: null,
          foundAtDistance: null,
          eligibleChestsOpened: 0,
        }),
    ],
    ['opening phase', (s: any) => (s.progression.opening = { phase: 'forged' })],
    ['turret record', (s: any) => (s.progression.turrets = [{}])],
    [
      'threat counter',
      (s: any) =>
        (s.world.threatDirector = {
          phase: 'calm',
          phaseEndsAt: 1,
          wavesSurvived: 0.5,
          pending: [],
          nextReleaseAt: 0,
          draws: 0,
        }),
    ],
    [
      'threat queue',
      (s: any) =>
        (s.world.threatDirector = {
          phase: 'calm',
          phaseEndsAt: 1,
          wavesSurvived: 0,
          pending: ['unknown'],
          nextReleaseAt: 0,
          draws: 0,
        }),
    ],
    ['radio raid wave', (s: any) => (s.world.radioRaids = { wave: 0.5, remaining: 20 })],
    [
      'raid recovery cap',
      (s: any) => (s.world.raidRecovery = { recovered: [{ itemId: 'components', count: 6 }] }),
    ],
    [
      'route rewards',
      (s: any) =>
        (s.world.routeChart = {
          format: 1,
          nextSlot: 2,
          discovered: [],
          visited: [],
          missed: [],
          active: {
            id: 'route-contact-1',
            slot: 1,
            kind: 'water-cache',
            atDistanceM: 10,
            worldX: 0,
            confidence: 1,
            hazard: 'calm',
            detectedAtM: 0,
            expiresAtM: 20,
            state: 'detected',
            rewards: [{}],
          },
        }),
    ],
    [
      'dust duration',
      (s: any) =>
        (s.world.dustFront = { format: 1, phase: 'front', elapsedS: 71, nextAtM: 0, sequence: 1 }),
    ],
    [
      'story ids',
      (s: any) =>
        (s.world.story = { format: 2, completed: [{}], recoveredUniques: [], active: null }),
    ],
    [
      'active story shape',
      (s: any) =>
        (s.world.story = {
          format: 2,
          completed: [],
          recoveredUniques: [],
          active: { phase: 'approach', journalsRead: [] },
        }),
    ],
    [
      'ending clamp',
      (s: any) =>
        (s.world.story = {
          format: 2,
          completed: [],
          recoveredUniques: [],
          active: null,
          ending: { format: 1, phase: 'complete', committedAtDistance: 10, arrivalElapsedS: 20 },
        }),
    ],
  ])('rejects malformed restore branch: %s', (_label, mutate) => {
    const bad = fixture();
    mutate(bad);
    expect(() => validateSaveForExport(bad)).toThrow(SaveExportError);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
