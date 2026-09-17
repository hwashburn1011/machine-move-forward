import { describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/Game';
import type { SaveGameV1 } from '@/save/SaveSchema';

// Prototype seams intentionally use a small structural mock rather than
// constructing the renderer-backed Game.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Harness = Record<string, any>;

const gameMethods = Game.prototype as unknown as {
  startCampaign(this: Harness, profile?: 'story' | 'survival', preserve?: boolean): Promise<void>;
  openCampaignLibrary(this: Harness, mode: 'boot' | 'pause'): Promise<void>;
  closeCampaignLibrary(this: Harness): void;
  loadFrom(this: Harness, slot: string): Promise<boolean>;
};

function campaignSave(seed = 'selected-seed'): SaveGameV1 {
  return {
    version: 1,
    savedAt: 42,
    seed,
    distanceTraveled: 12,
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

function libraryHarness(safe: boolean): Harness {
  const show = vi.fn();
  const h = Object.create(Game.prototype) as Harness;
  Object.assign(h, {
    libraryMode: null,
    libraryBusy: false,
    newCampaignBusy: false,
    continuing: false,
    artTransition: false,
    disposed: false,
    state: { paused: false },
    input: { clearAll: vi.fn() },
    syncInputContext: vi.fn(),
    releasePointerLock: vi.fn(),
    titleScreen: { hide: vi.fn(), show: vi.fn(), setCampaignBusy: vi.fn(), showStatus: vi.fn() },
    saveLibrary: {
      show,
      hide: vi.fn(),
      updateRows: vi.fn(),
      setBusy: vi.fn(),
      showStatus: vi.fn(),
    },
    isSafeToSave: vi.fn(() => safe),
    libraryAction: vi.fn(async () => undefined),
  });
  return h;
}

function campaignStartHarness(preserveContinue: () => Promise<void>): Harness {
  const h = Object.create(Game.prototype) as Harness;
  Object.assign(h, {
    newCampaignBusy: false,
    continuing: false,
    artTransition: false,
    disposed: false,
    state: { seed: 'old-campaign' },
    saves: { preserveContinue: vi.fn(preserveContinue) },
    titleScreen: { setCampaignBusy: vi.fn(), showStatus: vi.fn() },
    startNewGame: vi.fn(),
  });
  return h;
}

describe('Game campaign library integration seams', () => {
  it('gates pause snapshots through the safe save predicate', async () => {
    const unsafe = libraryHarness(false);
    await gameMethods.openCampaignLibrary.call(unsafe, 'pause');
    expect(unsafe.saveLibrary.show).toHaveBeenCalledWith(
      expect.objectContaining({ canLoad: false, canSnapshot: false }),
    );
    expect(unsafe.titleScreen.hide).toHaveBeenCalledOnce();

    const safe = libraryHarness(true);
    await gameMethods.openCampaignLibrary.call(safe, 'pause');
    expect(safe.saveLibrary.show).toHaveBeenCalledWith(
      expect.objectContaining({ canLoad: false, canSnapshot: true }),
    );
  });

  it('waits for committed preservation before starting the requested campaign', async () => {
    let resolvePreserve!: () => void;
    const h = campaignStartHarness(
      () => new Promise<void>((resolve) => (resolvePreserve = resolve)),
    );
    const pending = gameMethods.startCampaign.call(h, 'survival', true);
    expect(h.saves.preserveContinue).toHaveBeenCalledWith('Before new campaign');
    expect(h.startNewGame).not.toHaveBeenCalled();
    resolvePreserve();
    await pending;
    expect(h.startNewGame).toHaveBeenCalledWith('survival');
    expect(h.titleScreen.setCampaignBusy).toHaveBeenLastCalledWith(false);
  });

  it('keeps the old campaign untouched when preservation fails', async () => {
    const h = campaignStartHarness(async () => {
      throw new Error('quota');
    });
    await gameMethods.startCampaign.call(h, 'story', true);
    expect(h.state.seed).toBe('old-campaign');
    expect(h.startNewGame).not.toHaveBeenCalled();
    expect(h.titleScreen.showStatus).toHaveBeenCalledWith(
      expect.stringContaining('Unable to preserve'),
      true,
    );
    expect(h.titleScreen.setCampaignBusy).toHaveBeenLastCalledWith(false);
  });

  it('ignores duplicate New Game requests while preservation is in flight', async () => {
    let resolvePreserve!: () => void;
    const h = campaignStartHarness(
      () => new Promise<void>((resolve) => (resolvePreserve = resolve)),
    );
    const first = gameMethods.startCampaign.call(h, 'story', true);
    await gameMethods.startCampaign.call(h, 'survival', true);
    expect(h.saves.preserveContinue).toHaveBeenCalledOnce();
    expect(h.startNewGame).not.toHaveBeenCalled();
    resolvePreserve();
    await first;
    expect(h.startNewGame).toHaveBeenCalledWith('story');
  });

  it('passes the exact selected library slot to loadFrom', async () => {
    const load = vi.fn(async () => campaignSave());
    const h = Object.create(Game.prototype) as Harness;
    Object.assign(h, {
      artTransition: false,
      disposed: false,
      saves: { load },
      prepareCampaignArt: vi.fn(async () => false),
    });
    await expect(gameMethods.loadFrom.call(h, 'campaign:selected-slot')).resolves.toBe(false);
    expect(load).toHaveBeenCalledWith('campaign:selected-slot');
  });

  it('keeps pause frozen when the pause library closes', () => {
    const h = libraryHarness(true);
    h.libraryMode = 'pause';
    h.state.paused = true;
    gameMethods.closeCampaignLibrary.call(h);
    expect(h.libraryMode).toBeNull();
    expect(h.state.paused).toBe(true);
    expect(h.titleScreen.show).toHaveBeenCalledWith('pause');
  });
});
