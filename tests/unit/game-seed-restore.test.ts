import { describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/Game';
import { Rng } from '@/core/math/Random';

const STOP = new Error('stop after seed adoption');

interface Harness {
  game: SeedHarnessGame;
  calls: string[];
  load: ReturnType<typeof vi.fn>;
}

interface SeedHarnessGame {
  state: { seed: string; simTime: number; paused: boolean; godMode: boolean; playerDead: boolean };
  lootRng: unknown;
  closePanels: () => void;
  [key: string]: unknown;
}

const gameMethods = Game.prototype as unknown as {
  loadFrom(this: SeedHarnessGame, slot: string): Promise<boolean>;
  startNewGame(this: SeedHarnessGame, profile?: 'story'): void;
};

function harness(seed = 'boot-seed'): Harness {
  const game = Object.create(Game.prototype) as SeedHarnessGame;
  const calls: string[] = [];
  const load = vi.fn();

  Object.assign(game, {
    artTransition: false,
    disposed: false,
    continuing: false,
    requestedSeed: seed,
    state: { seed, simTime: 0, paused: false, godMode: false, playerDead: false },
    saves: { load },
    cameraClothFade: { restore: vi.fn() },
    hud: { setWarning: vi.fn() },
    world: {
      reseed: vi.fn((next: string, distance: number) => {
        expect(game.state.seed).toBe(next);
        calls.push(`world:${next}:${distance}`);
      }),
    },
    spawner: {
      reseed: vi.fn((next: string, distance: number) => {
        expect(game.state.seed).toBe(next);
        calls.push(`spawner:${next}:${distance}`);
      }),
    },
    director: {
      reseed: vi.fn((next: string) => {
        expect(game.state.seed).toBe(next);
        calls.push(`director:${next}`);
      }),
    },
    salvage: {
      reseed: vi.fn((next: string, distance: number) => {
        expect(game.state.seed).toBe(next);
        calls.push(`salvage:${next}:${distance}`);
      }),
    },
    lootRng: { old: true },
    prepareCampaignArt: vi.fn(async () => {
      calls.push('art-ready');
      return true;
    }),
    expeditionAssetIds: vi.fn(() => []),
    stopHomeRest: vi.fn(() => {
      calls.push('stop-home');
      throw STOP;
    }),
  });

  return { game, calls, load };
}

function save(seed: string, distanceTraveled: number) {
  return {
    version: 1,
    savedAt: 42,
    seed,
    distanceTraveled,
    player: {
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: [null],
      equipment: {
        currentWeapon: 'rifle',
        weapons: [{ id: 'rifle', ammoInMag: 4, reserveAmmo: 20 }],
      },
    },
    machine: {
      structures: [],
      devices: [],
      fuel: 9,
      coreHealth: 100,
      navigationTier: 0,
    },
    progression: { unlocks: [] },
    world: { chunkIndex: 0, threatDirector: null },
  };
}

describe('Game campaign seed adoption', () => {
  it.each([
    ['missing seed', { ...save('campaign-a', 100), seed: undefined }],
    ['empty seed', save('', 100)],
    ['NaN distance', save('campaign-a', Number.NaN)],
    ['infinite distance', save('campaign-a', Number.POSITIVE_INFINITY)],
    ['negative distance', save('campaign-a', -1)],
  ])('rejects a malformed save before loading art or mutating seed owners: %s', async (_, raw) => {
    const h = harness('boot-seed');
    h.load.mockResolvedValue(raw);
    const previousLoot = h.game.lootRng;

    await expect(gameMethods.loadFrom.call(h.game, 'quicksave')).resolves.toBe(false);

    expect(h.game.state.seed).toBe('boot-seed');
    expect(h.game.lootRng).toBe(previousLoot);
    expect(h.calls).toEqual([]);
  });

  it('leaves every seed owner untouched when required campaign art cannot be prepared', async () => {
    const h = harness('boot-seed');
    h.load.mockResolvedValue(save('campaign-a', 4321));
    const previousLoot = h.game.lootRng;
    h.game.prepareCampaignArt = vi.fn(async () => {
      h.calls.push('art-failed');
      return false;
    });

    await expect(gameMethods.loadFrom.call(h.game, 'quicksave')).resolves.toBe(false);

    expect(h.game.state.seed).toBe('boot-seed');
    expect(h.game.lootRng).toBe(previousLoot);
    expect(h.calls).toEqual(['art-failed']);
  });

  it('adopts the saved seed before any loaded world lifecycle continues', async () => {
    const h = harness('boot-seed');
    h.load.mockResolvedValue(save('campaign-a', 4321));
    const previousLoot = h.game.lootRng;

    await expect(gameMethods.loadFrom.call(h.game, 'quicksave')).rejects.toBe(STOP);

    expect(h.game.state.seed).toBe('campaign-a');
    expect(h.calls).toEqual([
      'art-ready',
      'world:campaign-a:4321',
      'spawner:campaign-a:4321',
      'director:campaign-a',
      'salvage:campaign-a:4321',
      'stop-home',
    ]);
    expect(h.game.lootRng).toBeInstanceOf(Rng);
    expect(h.game.lootRng).not.toBe(previousLoot);
  });

  it('reapplies the campaign seed on every load instead of inheriting consumed streams', async () => {
    const h = harness('boot-seed');
    h.load.mockResolvedValue(save('campaign-a', 725));

    await expect(gameMethods.loadFrom.call(h.game, 'quicksave')).rejects.toBe(STOP);
    const firstLoot = h.game.lootRng;
    h.calls.length = 0;
    await expect(gameMethods.loadFrom.call(h.game, 'quicksave')).rejects.toBe(STOP);

    expect(h.calls).toEqual([
      'art-ready',
      'world:campaign-a:725',
      'spawner:campaign-a:725',
      'director:campaign-a',
      'salvage:campaign-a:725',
      'stop-home',
    ]);
    expect(h.game.lootRng).toBeInstanceOf(Rng);
    expect(h.game.lootRng).not.toBe(firstLoot);
  });

  it('returns to the originally requested seed when New Game follows a loaded campaign', () => {
    const h = harness('requested-new-game-seed');
    h.game.state.seed = 'loaded-campaign-seed';
    h.game.closePanels = vi.fn(() => {
      h.calls.push('close-panels');
      throw STOP;
    });

    expect(() => gameMethods.startNewGame.call(h.game, 'story')).toThrow(STOP);

    expect(h.game.state.seed).toBe('requested-new-game-seed');
    expect(h.calls).toEqual([
      'world:requested-new-game-seed:0',
      'spawner:requested-new-game-seed:0',
      'director:requested-new-game-seed',
      'salvage:requested-new-game-seed:0',
      'close-panels',
    ]);
  });
});
