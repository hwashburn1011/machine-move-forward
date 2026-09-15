/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/Game';
import { ExpeditionUI, type ExpeditionView } from '@/ui/ExpeditionUI';

type Effect = { type: 'route-available' } | { type: 'begin-signal' };

interface StoryResult {
  ok: true;
  effects: Effect[];
}

interface GameHarness {
  closePanels: (reclaimControl?: boolean) => void;
  applyStoryEffects: (effects: readonly Effect[]) => void;
  openExpedition: () => void;
  releasePointerLock: () => void;
  resume: () => void;
  requestControl: (ready: () => void) => void;
  artTransition: boolean;
  radioTraceView: () => { traceReady: boolean; traceDisabledReason: null };
  story: {
    chapter: { id: string; title: string };
    currentPhase: string;
    snapshot: () => { nextExpedition: { id: string } | null; objective: string };
    beginNextExpedition: () => StoryResult;
    beginWreckExpedition: () => StoryResult;
  };
  world: { distanceTraveled: number };
  destination: { playerOnMachine: () => boolean };
  player: { worldPosition: object };
  isStableForStory: () => boolean;
  enemies: { activeCount: number };
  vehicleScene: { active: boolean };
  gunboatScene: { active: boolean };
  expeditionAssetIds: () => string[];
  campaignArtReady: () => boolean;
  radioUI: { isOpen: boolean; close: () => void };
  expeditionUI: ExpeditionUI;
  inventoryUI: { isOpen: boolean; setMode: (mode: string) => void };
  researchUI: Closeable;
  helmUI: Closeable;
  homeUI: Closeable;
  fieldworkUI: Closeable;
  caretakerUI: Closeable;
  campaignLog: Closeable;
  fieldworkTargetId: null;
  caretakerPanelTarget: null;
  homeShelfId: null;
  inventoryTargetId: null;
  transferFeedback: null;
  closeFieldwork: () => void;
  closeSpecialPanels: () => void;
  course: { holdCourse: () => void };
  expeditionView: () => ExpeditionView;
  combat: { cancelPendingBursts: () => void };
  options: { bypassPointerLock: boolean; canvas: HTMLCanvasElement };
  state: { paused: boolean };
  titleCamera: null;
  arrivalScene: null;
  signalBattle: null;
  freeCamera: null;
  ending: { phase: string };
  syncInputContext: () => void;
  input: { clearAll: () => void; suppressUntilReleased: () => void };
  titleScreen: { show: (mode: string) => void; hide: () => void };
  hud: { setWarning: (message: string) => void };
  bus: { emit: () => void };
  requestAutosave: () => void;
  lockRequestPending: boolean;
  cancelControlRequest: (() => void) | null;
}

interface Closeable {
  isOpen: boolean;
  close: () => void;
}

const methods = Game.prototype as unknown as {
  beginWreckTrace(this: GameHarness): void;
  closePanels(this: GameHarness, reclaimControl?: boolean): void;
  applyStoryEffects(this: GameHarness, effects: readonly Effect[]): void;
  openExpedition(this: GameHarness): void;
  releasePointerLock(this: GameHarness): void;
  resume(this: GameHarness): void;
  requestControl(this: GameHarness, ready: () => void): void;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function fixture(effects: Effect[]) {
  const canvas = document.createElement('canvas');
  let pointerLockElement: Element | null = null;
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => pointerLockElement,
  });
  document.exitPointerLock = vi.fn(() => {
    pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  const lock = deferred<void>();
  const requestPointerLock = vi.fn(() =>
    lock.promise.then(() => {
      pointerLockElement = canvas;
      document.dispatchEvent(new Event('pointerlockchange'));
    }),
  );
  canvas.requestPointerLock = requestPointerLock;

  const root = document.createElement('section');
  document.body.append(root);
  const selected = vi.fn();
  const expeditionUI = new ExpeditionUI(root, { close: vi.fn(), selectRoute: selected });
  const radioUI = {
    isOpen: true,
    close: vi.fn(() => {
      radioUI.isOpen = false;
    }),
  };
  const closed = (): Closeable => ({ isOpen: false, close: vi.fn() });
  const game = Object.create(Game.prototype) as GameHarness;
  Object.assign(game, {
    artTransition: false,
    radioTraceView: () => ({ traceReady: true, traceDisabledReason: null }),
    story: {
      chapter: { id: 'glass-orchard', title: 'Glass Orchard' },
      currentPhase: effects.some((effect) => effect.type === 'route-available')
        ? 'route-selection'
        : 'signal',
      snapshot: () => ({
        nextExpedition: effects.some((effect) => effect.type === 'route-available')
          ? { id: 'glass-orchard' }
          : null,
        objective: 'Choose a route.',
      }),
      beginNextExpedition: () => ({ ok: true, effects }),
      beginWreckExpedition: () => ({ ok: true, effects }),
    },
    world: { distanceTraveled: 100 },
    destination: { playerOnMachine: () => true },
    player: { worldPosition: {} },
    isStableForStory: () => true,
    enemies: { activeCount: 0 },
    vehicleScene: { active: false },
    gunboatScene: { active: false },
    expeditionAssetIds: () => [],
    campaignArtReady: () => true,
    radioUI,
    expeditionUI,
    inventoryUI: { isOpen: false, setMode: vi.fn() },
    researchUI: closed(),
    helmUI: closed(),
    homeUI: closed(),
    fieldworkUI: closed(),
    caretakerUI: closed(),
    campaignLog: closed(),
    fieldworkTargetId: null,
    caretakerPanelTarget: null,
    homeShelfId: null,
    inventoryTargetId: null,
    transferFeedback: null,
    closeFieldwork: vi.fn(),
    closeSpecialPanels: vi.fn(),
    course: { holdCourse: vi.fn() },
    expeditionView: () => ({
      phase: 'route-selection',
      objective: 'Choose a route.',
      strength: 1,
      remainingM: null,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: true,
      expeditionId: 'glass-orchard',
      routes: ['orchard-caretaker', 'orchard-cold-vault'],
    }),
    combat: { cancelPendingBursts: vi.fn() },
    options: { bypassPointerLock: false, canvas },
    state: { paused: false },
    titleCamera: null,
    arrivalScene: null,
    signalBattle: null,
    freeCamera: null,
    ending: { phase: 'available' },
    syncInputContext: vi.fn(),
    input: { clearAll: vi.fn(), suppressUntilReleased: vi.fn() },
    titleScreen: { show: vi.fn(), hide: vi.fn() },
    hud: { setWarning: vi.fn() },
    bus: { emit: vi.fn() },
    requestAutosave: vi.fn(),
    lockRequestPending: false,
    cancelControlRequest: null,
  } satisfies Partial<GameHarness>);
  game.closePanels = methods.closePanels;
  game.applyStoryEffects = methods.applyStoryEffects;
  game.openExpedition = methods.openExpedition;
  game.releasePointerLock = methods.releasePointerLock;
  game.resume = methods.resume;
  game.requestControl = methods.requestControl;

  return { game, lock, requestPointerLock, expeditionUI, root, selected, canvas };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('story route input ownership', () => {
  it('keeps route selection unlocked even after a deferred lock could settle', async () => {
    const { game, lock, requestPointerLock, expeditionUI, root, selected } = fixture([
      { type: 'route-available' },
    ]);

    methods.beginWreckTrace.call(game);

    expect(expeditionUI.isOpen).toBe(true);
    expect(requestPointerLock).not.toHaveBeenCalled();
    expect(game.lockRequestPending).toBe(false);
    lock.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.pointerLockElement).toBeNull();

    const select = root.querySelector('[data-route="orchard-caretaker"]') as HTMLButtonElement;
    expect(select.disabled).toBe(false);
    select.click();
    const confirm = root.querySelector(
      '[data-route-confirm="orchard-caretaker"]',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(selected).toHaveBeenCalledWith('orchard-caretaker');
  });

  it('still reclaims control after the non-route first Wreck transition', async () => {
    const { game, lock, requestPointerLock, canvas } = fixture([{ type: 'begin-signal' }]);

    methods.beginWreckTrace.call(game);

    expect(requestPointerLock).toHaveBeenCalledTimes(1);
    expect(game.lockRequestPending).toBe(true);
    lock.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.pointerLockElement).toBe(canvas);
    expect(game.state.paused).toBe(false);
    expect(game.lockRequestPending).toBe(false);
  });
});
