import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '@/game/Game';
import { EarlyRadioDrop } from '@/progression/EarlyRadioDrop';
import { reconcileOpeningScanner } from '@/save/NomadFoundationMigration';
import { validateSaveForExport } from '@/save/SaveExportCodec';
import type { SaveGameV1 } from '@/save/SaveSchema';

type FoundationGameMethods = {
  scannerRecipeRefusal(id: string): string | null;
  updateVehicles(dt: number): void;
  closeTerminal(reclaim?: boolean, afterClose?: () => void): void;
};

const methods = Game.prototype as unknown as FoundationGameMethods;

describe('Game Nomad foundation seams', () => {
  it('refuses scanner-module assembly without a healthy workbench or after one module exists', () => {
    const pieces: Array<{ instanceId: string; definitionId: string; health: number }> = [];
    let installed = false;
    let carried = false;
    let stored = false;
    const game = Object.assign(Object.create(Game.prototype), {
      scanner: {
        get installed() {
          return installed;
        },
      },
      inventory: { has: vi.fn(() => carried) },
      build: {
        serialise: vi.fn(() => pieces),
        crateContainer: vi.fn(() => ({ has: () => stored })),
      },
    });

    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toBe(
      'Build a functional workbench first.',
    );

    pieces.push({ instanceId: 'bench-1', definitionId: 'workbench', health: 0 });
    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toBe(
      'Build a functional workbench first.',
    );

    pieces[0]!.health = 100;
    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toBeNull();

    carried = true;
    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toMatch(
      /already assembled or installed/i,
    );
    carried = false;
    stored = true;
    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toMatch(
      /already assembled or installed/i,
    );
    stored = false;
    installed = true;
    expect(methods.scannerRecipeRefusal.call(game, 'craft-scanner-replacement-module')).toMatch(
      /already assembled or installed/i,
    );

    expect(methods.scannerRecipeRefusal.call(game, 'craft-rifle-ammo')).toBeNull();
  });

  it('deposits only carried fuel and debits exactly what the tank accepts', () => {
    let carried = 0;
    const remove = vi.fn();
    const addFuel = vi.fn(() => 2);
    const game = Object.assign(Object.create(Game.prototype), {
      inventory: {
        count: vi.fn((id: string) => (id === 'fuel' ? carried : 0)),
        remove,
      },
      // Nearby/storage resources deliberately contain fuel; depositFuel must not use them.
      resources: { count: vi.fn(() => 20) },
      machine: { power: { addFuel } },
      player: { playRefuel: vi.fn() },
      bus: { emit: vi.fn() },
      requestAutosave: vi.fn(),
      audio: { play: vi.fn() },
    });

    expect((game as Game).depositFuel()).toBe(false);
    expect(addFuel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    carried = 3;
    expect((game as Game).depositFuel()).toBe(true);
    expect(addFuel).toHaveBeenCalledWith(3);
    expect(remove).toHaveBeenCalledWith('fuel', 2);
    expect(game.requestAutosave).toHaveBeenCalledTimes(1);
  });

  it.each(['locked', 'signal', 'crossfire'])(
    'bars the tutorial skiff while the opening scanner is in %s',
    (phase) => {
      const spawn = vi.fn(() => true);
      const game = Object.assign(Object.create(Game.prototype), {
        gunboatScene: { active: false },
        opening: { phase: 'done' },
        vehicleManager: { active: false },
        pendingBoardingOutcome: null,
        enemies: { activeCount: 0 },
        state: { playerDead: false, simTime: 100 },
        story: { chapter: { id: 'wreck-one' }, currentPhase: phase },
        tutorialReadyAt: 0,
        vehicleScene: { spawn },
      });

      methods.updateVehicles.call(game, 1 / 60);
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('releases only the terminal-owned pause when the terminal closes', () => {
    const close = vi.fn();
    const setTerminalOpen = vi.fn();
    const syncInputContext = vi.fn();
    const clearAll = vi.fn();
    const suppressUntilReleased = vi.fn();
    const afterClose = vi.fn();
    const game = Object.assign(Object.create(Game.prototype), {
      terminal: { close },
      terminalPauseOwned: true,
      state: { paused: true },
      player: { setTerminalOpen },
      machine: { power: { unregisterConsumer: vi.fn() } },
      syncInputContext,
      input: { clearAll, suppressUntilReleased },
      requestControl: vi.fn((ready: () => void) => ready()),
    });

    methods.closeTerminal.call(game, true, afterClose);
    expect(close).toHaveBeenCalledTimes(1);
    expect(setTerminalOpen).toHaveBeenCalledWith(false);
    expect(game.machine.power.unregisterConsumer).toHaveBeenCalledTimes(1);
    expect(game.terminalPauseOwned).toBe(false);
    expect(game.state.paused).toBe(false);
    expect(syncInputContext).toHaveBeenCalledTimes(1);
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(suppressUntilReleased).toHaveBeenCalledWith(['fire', 'aim', 'interact']);
    expect(afterClose).toHaveBeenCalledTimes(1);

    game.state.paused = true;
    methods.closeTerminal.call(game, false);
    expect(game.state.paused).toBe(true);
  });

  it('projects a legacy signal scanner state that passes the pure export validator', () => {
    const recorded = JSON.parse(
      readFileSync('docs/campaign/continuity-validation/wreck-committed-save.json', 'utf8'),
    ) as { save: SaveGameV1 };
    const legacy = structuredClone(recorded.save);
    const signalStartedAt = legacy.distanceTraveled - 1_100;
    legacy.world.story = {
      format: 2,
      completed: [],
      recoveredUniques: [],
      journalArchive: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'signal',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
        signalStartedAt,
      },
      radioTraceEligible: false,
      ending: {
        format: 1,
        phase: 'available',
        committedAtDistance: null,
        arrivalElapsedS: 0,
      },
    };
    delete legacy.progression.scanner;

    const restored = structuredClone(legacy);
    restored.progression.scanner = reconcileOpeningScanner(legacy);
    expect(restored.progression.scanner).toEqual({
      format: 1,
      phase: 'scanning',
      elapsedS: 90,
      pendingDelayS: 0,
    });

    const beforeValidation = structuredClone(restored);
    const validated = validateSaveForExport(restored);
    expect(restored).toEqual(beforeValidation);
    expect(validated).not.toBe(restored);
    expect(validated.progression.scanner).toEqual(restored.progression.scanner);

    // The oldest signal saves can prove the receiver through Story while lacking its
    // separate ledger. Game projects that hardware fact before its next save.
    const ledgerless = structuredClone(legacy);
    delete ledgerless.progression.radio;
    delete ledgerless.progression.radioDrop;
    ledgerless.progression.scanner = reconcileOpeningScanner(ledgerless);
    const receiver = new EarlyRadioDrop();
    receiver.restore({ status: 'found' });
    ledgerless.progression.radio = receiver.toSave();
    expect(validateSaveForExport(ledgerless).progression).toMatchObject({
      radio: { status: 'found', eligibleChestsOpened: 1 },
      scanner: { phase: 'scanning', elapsedS: 90 },
    });
  });
});
