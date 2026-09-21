import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BuildPieceInstance } from '@/building/BuildSystem';
import { validateSaveForExport } from '@/save/SaveExportCodec';
import type { SaveGameV1 } from '@/save/SaveSchema';
import {
  migrateNomadFoundation,
  NOMAD_LAYOUT_V1,
  NOMAD_LAYOUT_V2,
  NOMAD_LAYOUT_V3,
  reconcileOpeningScanner,
  remapNomadLocalPose,
} from '@/save/NomadFoundationMigration';

const saveFixture = (): SaveGameV1 => ({
  version: 1,
  savedAt: 42,
  seed: 'foundation-save',
  distanceTraveled: 1_200,
  player: {
    position: { x: 1, y: 11.93, z: -2 },
    health: 100,
    inventory: [],
    equipment: {
      currentWeapon: 'rifle',
      weapons: [{ id: 'rifle', ammoInMag: 6, reserveAmmo: 20 }],
    },
  },
  machine: {
    layout: NOMAD_LAYOUT_V1,
    structures: [],
    devices: [],
    fuel: 10,
    coreHealth: 100,
    navigationTier: 0,
  },
  progression: {
    unlocks: [],
    firstRun: { completed: [], counters: {} },
    radio: {
      status: 'found',
      armedAtSimTime: 1,
      foundAtSimTime: 2,
      foundAtDistance: 100,
      eligibleChestsOpened: 1,
    },
  },
  world: {
    chunkIndex: 18,
    threatDirector: null,
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
        signalStartedAt: 100,
      },
    },
  },
});

const crate = (id: string): BuildPieceInstance => ({
  instanceId: id,
  definitionId: 'crate',
  cell: { x: 1, y: -1, z: 2 },
  rotation: 0,
  health: 80,
  state: { slots: [{ itemId: 'components', count: 3 }] },
});

describe('Nomad foundation save migration', () => {
  it.each([
    [8.93, 8.93],
    [11.93, 12.53],
    [14.93, 16.13],
    // Current restore tests place a standing capsule centre 0.99 m above its floor.
    [9.82, 9.82],
    [12.82, 13.42],
    [15.82, 17.02],
  ])('preserves relative player height while remapping v1 deck %s', (fromY, toY) => {
    const remapped = remapNomadLocalPose({ x: 2, y: fromY, z: -4 }, NOMAD_LAYOUT_V1);
    expect(remapped.x).toBe(2);
    expect(remapped.y).toBeCloseTo(toY);
    expect(remapped.z).toBe(-4);
  });

  it('is one-shot, source-immutable, and preserves active and recovery piece payloads', () => {
    const active = crate('bp-1');
    const recovery = crate('bp-2');
    const source = {
      layout: NOMAD_LAYOUT_V1,
      playerPosition: { x: 1, y: 11.93, z: 2 },
      structures: [active],
      recoveryPieces: [recovery],
    } as const;
    const before = structuredClone(source);
    const migrated = migrateNomadFoundation(source);
    expect(migrated).toMatchObject({
      layout: NOMAD_LAYOUT_V3,
      playerPosition: { x: 1, y: 12.53, z: 2 },
      migrated: true,
      relocateStructures: true,
    });
    expect(migrated.structures).toEqual([active]);
    expect(migrated.recoveryPieces).toEqual([recovery]);
    migrated.structures[0]!.state!.slots = [];
    expect(source).toEqual(before);
    expect(
      migrateNomadFoundation({
        ...migrated,
        playerPosition: migrated.playerPosition,
      }),
    ).toMatchObject({
      playerPosition: migrated.playerPosition,
      migrated: false,
      relocateStructures: false,
    });
  });

  it('accepts only the three published layout forms and keeps recovery IDs globally unique', () => {
    for (const layout of [undefined, NOMAD_LAYOUT_V1, NOMAD_LAYOUT_V2]) {
      const save = saveFixture();
      save.machine.layout = layout;
      expect(validateSaveForExport(save).machine.layout).toBe(layout);
    }
    const unknown = saveFixture();
    unknown.machine.layout = 'iron-nomad-v4';
    expect(() => validateSaveForExport(unknown)).toThrow(/unknown machine layout/i);

    const duplicate = saveFixture();
    duplicate.machine.structures = [crate('bp-1')];
    duplicate.machine.recoveryPieces = [crate('bp-1')];
    expect(() => validateSaveForExport(duplicate)).toThrow(/structure state/i);

    const valid = saveFixture();
    valid.machine.recoveryPieces = [crate('bp-2')];
    expect(validateSaveForExport(valid).machine.recoveryPieces).toEqual([crate('bp-2')]);
  });

  it('strictly validates per-phase scanner fields and Story authority', () => {
    const valid = saveFixture();
    valid.progression.scanner = {
      format: 1,
      phase: 'scanning',
      elapsedS: 90,
      pendingDelayS: 0,
    };
    expect(validateSaveForExport(valid).progression.scanner).toEqual(valid.progression.scanner);

    const staleReceiverEdge = structuredClone(valid);
    staleReceiverEdge.world.story = {
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: null,
    };
    staleReceiverEdge.progression.scanner = {
      format: 1,
      phase: 'awaiting-receiver',
      elapsedS: 0,
      pendingDelayS: 0,
    };
    expect(() => validateSaveForExport(staleReceiverEdge)).toThrow(/inconsistent with receiver/i);
    staleReceiverEdge.progression.scanner.phase = 'awaiting-module';
    expect(validateSaveForExport(staleReceiverEdge).progression.scanner?.phase).toBe(
      'awaiting-module',
    );

    const fullScanning = structuredClone(valid);
    fullScanning.progression.scanner!.elapsedS = 180;
    expect(() => validateSaveForExport(fullScanning)).toThrow(/contradictory scanner/i);

    const prematureConsumed = structuredClone(valid);
    prematureConsumed.progression.scanner = {
      format: 1,
      phase: 'consumed',
      elapsedS: 180,
      pendingDelayS: 0,
    };
    expect(() => validateSaveForExport(prematureConsumed)).toThrow(/inconsistent with story/i);

    const crossfire = structuredClone(valid);
    crossfire.world.story!.active!.phase = 'crossfire';
    crossfire.progression.scanner = {
      format: 1,
      phase: 'contact-ready',
      elapsedS: 180,
      pendingDelayS: 0,
    };
    expect(validateSaveForExport(crossfire).progression.scanner?.phase).toBe('contact-ready');

    const crossfireStillDelayed = structuredClone(crossfire);
    crossfireStillDelayed.progression.scanner!.pendingDelayS = 1;
    expect(() => validateSaveForExport(crossfireStillDelayed)).toThrow(/inconsistent with story/i);

    const completedReveal = structuredClone(crossfire);
    completedReveal.world.story!.active!.phase = 'raids';
    completedReveal.progression.scanner!.phase = 'consumed';
    expect(validateSaveForExport(completedReveal).progression.scanner?.phase).toBe('consumed');
  });

  it('reconciles absent legacy scanner state from durable Story without charging a module', () => {
    const partial = saveFixture();
    expect(reconcileOpeningScanner(partial)).toEqual({
      format: 1,
      phase: 'scanning',
      elapsedS: 90,
      pendingDelayS: 0,
    });

    delete partial.world.story!.active!.signalStartedAt;
    expect(reconcileOpeningScanner(partial).elapsedS).toBe(0);

    partial.world.story!.active!.phase = 'crossfire';
    expect(reconcileOpeningScanner(partial)).toEqual({
      format: 1,
      phase: 'contact-ready',
      elapsedS: 180,
      pendingDelayS: 0,
    });

    partial.world.story!.active!.phase = 'raids';
    expect(reconcileOpeningScanner(partial).phase).toBe('consumed');

    const mature = saveFixture();
    delete mature.progression.firstRun;
    delete mature.world.story;
    expect(reconcileOpeningScanner(mature).phase).toBe('consumed');
  });

  it('projects a recorded v1 campaign checkpoint without mutating its structures or payload', () => {
    const recorded = JSON.parse(
      readFileSync('docs/campaign/continuity-validation/wreck-committed-save.json', 'utf8'),
    ) as { save: SaveGameV1 };
    const valid = validateSaveForExport(recorded.save);
    const before = structuredClone(valid.machine.structures);
    const migrated = migrateNomadFoundation({
      layout: valid.machine.layout as typeof NOMAD_LAYOUT_V1,
      playerPosition: valid.player.position,
      structures: valid.machine.structures,
      recoveryPieces: valid.machine.recoveryPieces,
    });
    expect(migrated.layout).toBe(NOMAD_LAYOUT_V3);
    expect(migrated.migrated).toBe(true);
    expect(migrated.structures).toEqual(before);
    expect(valid.machine.structures).toEqual(before);
    expect(reconcileOpeningScanner(valid).phase).toBe('consumed');
  });
});
