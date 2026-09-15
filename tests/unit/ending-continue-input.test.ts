/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/Game';

type LeaveTitle = (this: unknown) => void;
type ContinueGame = (this: unknown) => Promise<void>;

const leaveTitle = (Game.prototype as unknown as { leaveTitle: LeaveTitle }).leaveTitle;
const continueGame = (Game.prototype as unknown as { continueGame: ContinueGame }).continueGame;

function fixture(phase: string, bypassPointerLock = false) {
  const requestPointerLock = vi.fn();
  const game = Object.assign(Object.create(Game.prototype), {
    titleCamera: {},
    state: { paused: true },
    setHudVisible: vi.fn(),
    titleScreen: { hide: vi.fn() },
    options: { bypassPointerLock },
    input: { requestPointerLock },
    ending: { phase, snapshot: { arrivalElapsedS: 0 } },
  });
  return { game, requestPointerLock };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function continueFixture(phase: string) {
  const canvas = document.createElement('canvas');
  let pointerLockElement: Element | null = null;
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => pointerLockElement,
  });
  document.exitPointerLock = vi.fn(() => {
    pointerLockElement = null;
  });
  const lock = deferred<void>();
  const requestPointerLock = vi.fn(() =>
    lock.promise.then(() => {
      pointerLockElement = canvas;
    }),
  );
  const game = Object.assign(Object.create(Game.prototype), {
    continuing: false,
    artTransition: false,
    ending: { phase: 'available', snapshot: { arrivalElapsedS: 3 } },
    options: { bypassPointerLock: false },
    state: { paused: true },
    titleCamera: {},
    titleScreen: { hide: vi.fn(), showStatus: vi.fn() },
    setHudVisible: vi.fn(),
    input: { requestPointerLock },
    newestSave: vi.fn(async () => 'quicksave'),
    loadFrom: vi.fn(async () => {
      game.ending.phase = phase;
      return true;
    }),
    beginOpening: vi.fn(),
    combat: { cancelPendingBursts: vi.fn() },
    syncInputContext: vi.fn(),
    refreshEndingView: vi.fn(),
    director: { setSanctuary: vi.fn() },
    world: { distanceTraveled: 100 },
    playerCamera: { camera: {} },
    positionArrival: vi.fn(),
    prepareArrival: vi.fn(() => ({ begin: vi.fn() })),
    arrivalScene: { update: vi.fn() },
  });
  return { game, lock, requestPointerLock, canvas };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'pointerLockElement');
  Reflect.deleteProperty(document, 'exitPointerLock');
});

describe('ending Continue pointer ownership', () => {
  it.each(['committed', 'arrival', 'credits'])(
    'does not request a late pointer lock during %s restore',
    (phase) => {
      const { game, requestPointerLock } = fixture(phase);
      leaveTitle.call(game);
      expect(requestPointerLock).not.toHaveBeenCalled();
      expect(game.state.paused).toBe(false);
      expect(game.titleCamera).toBeNull();
    },
  );

  it.each(['available', 'complete'])('requests control for ordinary %s entry', (phase) => {
    const { game, requestPointerLock } = fixture(phase);
    leaveTitle.call(game);
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('still honors the pointer-lock bypass option', () => {
    const { game, requestPointerLock } = fixture('complete', true);
    leaveTitle.call(game);
    expect(requestPointerLock).not.toHaveBeenCalled();
  });

  it.each(['committed', 'arrival', 'credits'])(
    'keeps the deferred continue cursor free during %s restore',
    async (phase) => {
      const { game, lock, requestPointerLock } = continueFixture(phase);
      const continuing = continueGame.call(game);
      await continuing;
      expect(game.loadFrom).toHaveBeenCalledWith('quicksave');
      expect(game.continuing).toBe(false);
      expect(game.titleScreen.showStatus).not.toHaveBeenCalled();
      expect(game.beginOpening).toHaveBeenCalledWith('continue');
      expect(game.refreshEndingView).toHaveBeenCalledTimes(1);
      expect(game.combat.cancelPendingBursts).toHaveBeenCalledTimes(1);
      if (phase === 'arrival' || phase === 'credits') {
        expect(game.arrivalScene.update).toHaveBeenCalledWith(3);
        expect(game.prepareArrival).toHaveBeenCalledTimes(1);
      }
      expect(requestPointerLock).not.toHaveBeenCalled();
      lock.resolve();
      await Promise.resolve();
      expect(document.pointerLockElement).toBeNull();
    },
  );

  it.each(['available', 'complete'])(
    'retains ordinary pointer capture for %s continue',
    async (phase) => {
      const { game, lock, requestPointerLock, canvas } = continueFixture(phase);
      const continuing = continueGame.call(game);
      await continuing;
      expect(game.titleScreen.showStatus).not.toHaveBeenCalled();
      expect(game.refreshEndingView).toHaveBeenCalledTimes(1);
      expect(requestPointerLock).toHaveBeenCalledTimes(1);
      lock.resolve();
      await Promise.resolve();
      expect(document.pointerLockElement).toBe(canvas);
    },
  );
});
