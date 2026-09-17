import { describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/Game';
import { ThreatDirector } from '@/enemies/ThreatDirector';
import { RadioRaids } from '@/story/RadioRaids';
import type { SaveGameV1 } from '@/save/SaveSchema';

type GamePacingMethods = {
  updateRadioRaids(dt: number): void;
  updateSpawns(dt?: number): void;
  isStableForStory(): boolean;
  restoreThreatPacing(save: SaveGameV1): void;
};

const methods = Game.prototype as unknown as GamePacingMethods;

interface Harness {
  bus: { emit: ReturnType<typeof vi.fn> };
  director: ThreatDirector;
  enemies: { activeCount: number; spawn: ReturnType<typeof vi.fn> };
  radioRaids: RadioRaids;
  state: { seed: string; playerDead: boolean };
  story: { permitsRadioRaids: boolean; currentPhase: string };
  threatPhase: string;
  vehicleScene: { active: boolean; spawn: ReturnType<typeof vi.fn> };
  world: { distanceTraveled: number };
}

function threatPhases(game: Harness): string[] {
  return game.bus.emit.mock.calls
    .filter((call) => call[0] === 'threat:phase')
    .map((call) => (call[1] as { phase: string }).phase);
}

function harness(): Harness {
  const director = new ThreatDirector('game-pacing');
  const radioRaids = new RadioRaids();
  radioRaids.restore({ wave: 2, remaining: 0 });
  const game = Object.assign(Object.create(Game.prototype), {
    campaignProfile: 'story',
    director,
    radioRaids,
    threatPhase: 'calm',
    world: { distanceTraveled: 100 },
    state: { seed: 'game-pacing', playerDead: false },
    ending: { phase: 'available' },
    destination: {
      docked: false,
      active: false,
      playerOnMachine: () => true,
    },
    optionalModelId: null,
    routeChart: { contact: null },
    enemies: {
      activeCount: 0,
      spawn: vi.fn(() => ({ id: 'enemy-1' })),
    },
    vehicleManager: { active: false },
    vehicleScene: { active: false, spawn: vi.fn(() => true) },
    gunboatScene: { active: false, spawn: vi.fn(() => true) },
    pendingBoardingOutcome: null,
    scriptedGunboatPending: false,
    scriptedGunboatActive: false,
    scriptedSkiffPending: false,
    scriptedSkiffActive: false,
    buildMode: false,
    defense: { mounted: false },
    player: {
      stats: { health: 100, maxHealth: 100 },
      worldPosition: { x: 0, y: 0, z: 0 },
    },
    raidMissions: { start: vi.fn(() => 'defense') },
    tutorialStarted: false,
    bus: { emit: vi.fn() },
    showBoardingWarning: vi.fn(),
    firstRun: { isComplete: true },
    enemySpawnsEnabled: true,
    story: { permitsRadioRaids: false, currentPhase: 'complete' },
    gunboatResolutionApplied: false,
    machine: {
      deckBounds: { max: { x: 7, z: 10 } },
      deckSpawn: { x: 0, y: 3, z: 0 },
    },
    spawner: { placementFor: vi.fn(() => ({ x: 2, y: 3, z: -4 })) },
    hook: null,
    titleCamera: null,
    arrivalScene: null,
    signalBattle: null,
    freeCamera: null,
    inventoryUI: { isOpen: false },
    radioUI: { isOpen: false },
    researchUI: { isOpen: false },
    expeditionUI: { isOpen: false },
    helmUI: { isOpen: false },
    homeUI: { isOpen: false },
    fieldworkUI: { isOpen: false },
    caretakerUI: { isOpen: false },
    campaignLog: { isOpen: false },
    opening: { phase: 'done' },
  });
  return game as unknown as Harness;
}

function restoreBuildup(
  game: Harness,
  lane: 'ordinary' | 'radio-raid',
  queued = false,
): void {
  game.director.restore({
    ...game.director.toSave(),
    phase: 'buildup',
    phaseEndsAt: game.world.distanceTraveled,
    pending: [],
    queuedVehicle: queued ? 'skiff' : null,
    externalEncounterActive: false,
    lane,
  });
  game.threatPhase = 'buildup';
}

describe('Game shared threat pacing integration', () => {
  it('publishes one radio buildup and engagement edge around a successful scene start', () => {
    const game = harness();
    game.director.restore({
      ...game.director.toSave(),
      phase: 'calm',
      phaseEndsAt: 100,
      lane: 'radio-raid',
    });

    methods.updateRadioRaids.call(game, 1 / 60);
    expect(threatPhases(game)).toEqual(['buildup']);
    methods.updateRadioRaids.call(game, 1 / 60);
    expect(threatPhases(game)).toEqual(['buildup']);

    game.world.distanceTraveled = game.director.phaseEnds;
    methods.updateRadioRaids.call(game, 1 / 60);
    expect(game.vehicleScene.spawn).toHaveBeenCalledTimes(1);
    expect(threatPhases(game)).toEqual(['buildup', 'engagement']);
    expect(game.director.hasActiveExternalEncounter).toBe(true);
  });

  it('publishes recovery without a false engagement when a radio scene rejects the spawn', () => {
    const game = harness();
    restoreBuildup(game, 'radio-raid');
    game.vehicleScene.spawn.mockReturnValue(false);

    methods.updateRadioRaids.call(game, 1 / 60);
    expect(threatPhases(game)).toEqual(['recovery']);
    expect(game.director.currentPhase).toBe('recovery');
    expect(game.director.hasActiveExternalEncounter).toBe(false);

    methods.updateRadioRaids.call(game, 1 / 60);
    expect(threatPhases(game)).toEqual(['recovery']);
  });

  it('releases stale radio ownership on a null plan instead of deadlocking future raids', () => {
    const game = harness();
    restoreBuildup(game, 'radio-raid');
    game.radioRaids.started();

    methods.updateRadioRaids.call(game, 1 / 60);
    expect(game.vehicleScene.spawn).not.toHaveBeenCalled();
    expect(threatPhases(game)).toEqual(['recovery']);
    expect(game.radioRaids.plan(game.state.seed)).not.toBeNull();
  });

  it('spawns a deferred ordinary contact body through the radio update path', () => {
    const game = harness();
    game.director.restore({
      ...game.director.toSave(),
      phase: 'contact',
      phaseEndsAt: null as unknown as number,
      pending: ['scavenger'],
      nextReleaseAt: 0,
      lane: 'ordinary',
    });
    game.threatPhase = 'contact';

    methods.updateRadioRaids.call(game, 1 / 60);
    expect(game.enemies.spawn).toHaveBeenCalledTimes(1);
    expect(game.enemies.spawn.mock.calls[0]?.[0]).toBe('scavenger');
    expect(game.director.toSave().lane).toBe('ordinary');
    expect(game.director.pendingCount).toBe(0);
  });

  it('does not begin the signal takeover over pending or active director phases', () => {
    const game = harness();
    game.story.currentPhase = 'signal';
    game.director.restore({
      ...game.director.toSave(),
      phase: 'contact',
      phaseEndsAt: null as unknown as number,
      pending: ['scavenger'],
      lane: 'ordinary',
    });
    expect(methods.isStableForStory.call(game)).toBe(false);

    game.director.restore({
      ...game.director.toSave(),
      phase: 'calm',
      phaseEndsAt: 500,
      pending: [],
      lane: 'ordinary',
      externalEncounterActive: false,
    });
    expect(methods.isStableForStory.call(game)).toBe(true);
  });

  it('makes ordinary external spawn failure a single recovery edge', () => {
    const game = harness();
    restoreBuildup(game, 'ordinary', true);
    game.vehicleScene.spawn.mockReturnValue(false);

    methods.updateSpawns.call(game, 1 / 60);
    expect(threatPhases(game)).toEqual(['recovery']);
    expect(game.director.currentPhase).toBe('recovery');
    expect(game.director.hasActiveExternalEncounter).toBe(false);
  });

  it('publishes ordinary vehicle engagement only after the scene accepts it', () => {
    const game = harness();
    restoreBuildup(game, 'ordinary', true);

    methods.updateSpawns.call(game, 1 / 60);
    expect(game.vehicleScene.spawn).toHaveBeenCalledTimes(1);
    expect(threatPhases(game)).toEqual(['engagement']);
    expect(game.director.hasActiveExternalEncounter).toBe(true);
  });

  it('gives a pre-director Survival save its profile calm without skipping into a threat', () => {
    const game = harness();
    const save = {
      distanceTraveled: 5_000,
      profile: 'survival',
      world: { threatDirector: undefined },
    } as unknown as SaveGameV1;

    methods.restoreThreatPacing.call(game, save);
    expect(game.director.currentPhase).toBe('calm');
    expect(game.director.phaseEnds).toBeGreaterThanOrEqual(5_300);
    expect(game.director.phaseEnds).toBeLessThanOrEqual(5_800);
    expect(game.threatPhase).toBe('calm');
  });

  it('keeps an old saved deadline exact and uses profile quiet for orphan recovery', () => {
    const game = harness();
    const oldDirector = {
      ...game.director.toSave(),
      phase: 'calm' as const,
      phaseEndsAt: 5_123,
    };
    delete oldDirector.lane;
    methods.restoreThreatPacing.call(
      game,
      {
        distanceTraveled: 5_000,
        profile: 'survival',
        world: { threatDirector: oldDirector },
      } as unknown as SaveGameV1,
    );
    expect(game.director.phaseEnds).toBe(5_123);
    expect(game.director.toSave().lane).toBe('ordinary');

    methods.restoreThreatPacing.call(
      game,
      {
        distanceTraveled: 8_000,
        profile: 'survival',
        world: {
          threatDirector: {
            ...oldDirector,
            phase: 'engagement',
            externalEncounterActive: true,
          },
        },
      } as unknown as SaveGameV1,
    );
    expect(game.director.currentPhase).toBe('calm');
    expect(game.director.phaseEnds).toBe(8_300);
    expect(game.director.hasActiveExternalEncounter).toBe(false);
  });
});
