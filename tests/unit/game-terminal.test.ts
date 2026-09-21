/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { Container } from '@/items/Container';
import { GameTerminal, type GameTerminalSource } from '@/game/GameTerminal';

function source(paused: boolean, aboard = true): GameTerminalSource {
  const inventory = new Container(4);
  const crate = new Container(4);
  inventory.add('scrap', 4);
  return {
    state: { paused },
    isPlayerAboard: () => aboard,
    profile: () => 'story',
    inventory,
    player: {
      stats: { health: 90, maxHealth: 100, stamina: 80, maxStamina: 100 },
      needs: { hydration: 70, nourishment: 80 },
      worldPosition: { x: 0, y: 0, z: 0 },
    },
    combat: {
      current: {
        def: { id: 'rifle', name: 'Rifle' },
        ammoInMag: 6,
        reserveAmmo: 12,
        infiniteReserve: false,
        researchedAttachments: [],
      },
    },
    resources: { canAfford: () => true },
    machine: { power: { isPowered: () => true }, damage: { damaged: () => [] } },
    build: {
      serialise: () => [
        {
          instanceId: 'crate-1',
          definitionId: 'crate',
          cell: { x: 0, y: -2, z: 0 },
          rotation: 0,
          health: 100,
        },
        {
          instanceId: 'bench-1',
          definitionId: 'workbench',
          cell: { x: 1, y: -2, z: 0 },
          rotation: 0,
          health: 100,
        },
      ],
      crateContainer: () => crate,
      collectorContainer: () => undefined,
      canBuildPiece: () => true,
      producersNear: () => [],
      gardenSnapshot: () => null,
    },
    caretaker: {
      snapshot: () => ({
        recruited: false,
        mode: 'companion',
        phase: 'idle',
        job: null,
        token: null,
        serviceRemainingS: 0,
        refusal: null,
        priority: 'auto',
      }),
    },
    actions: {
      eat: vi.fn(() => true),
      drink: vi.fn(() => true),
      onInventoryChanged: vi.fn(),
      onCraftCompleted: vi.fn(),
    },
  };
}

describe('GameTerminal runtime adapter', () => {
  it('refuses opening while running and builds fresh exact storage/station views while paused', () => {
    const parent = document.createElement('main');
    const running = new GameTerminal(parent, source(false));
    expect(running.open()).toBe(false);
    const pausedSource = source(true);
    const terminal = new GameTerminal(parent, pausedSource);
    expect(terminal.open('workshop')).toBe(true);
    expect(parent.textContent).toContain('Workshop');
    expect(parent.textContent).toContain('Installed stations');
    expect(terminal.isOpen).toBe(true);
  });

  it('routes selected station and close through the callback-only UI', () => {
    const parent = document.createElement('main');
    const terminalSource = source(true);
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open('workshop');
    (parent.querySelector('[data-focus-key="station:bench-1"]') as HTMLButtonElement).click();
    expect(terminal.isOpen).toBe(true);
    const close = parent.querySelector('.terminal-close') as HTMLButtonElement;
    close.click();
    expect(terminal.isOpen).toBe(false);
  });

  it('keeps output selection independent from transfer storage and falls back when its crate disappears', () => {
    const parent = document.createElement('main');
    const terminalSource = source(true);
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open('workshop');
    let output = parent.querySelector(
      '[data-testid="terminal-output-destination"]',
    ) as HTMLSelectElement;
    expect(output.value).toBe('carried');

    output.value = 'crate-1';
    output.dispatchEvent(new Event('change', { bubbles: true }));
    output = parent.querySelector(
      '[data-testid="terminal-output-destination"]',
    ) as HTMLSelectElement;
    expect(output.value).toBe('crate-1');

    (terminal as unknown as { dispatch: (command: unknown) => void }).dispatch({
      kind: 'select-storage',
      id: 'crate-1',
    });
    output = parent.querySelector(
      '[data-testid="terminal-output-destination"]',
    ) as HTMLSelectElement;
    expect(output.value).toBe('crate-1');

    const build = terminalSource.build as {
      serialise: () => readonly {
        instanceId: string;
        definitionId: string;
        cell: { x: number; y: number; z: number };
        rotation: number;
        health: number;
      }[];
    };
    build.serialise = () => [];
    terminal.refresh();
    output = parent.querySelector(
      '[data-testid="terminal-output-destination"]',
    ) as HTMLSelectElement;
    expect(output.value).toBe('carried');
  });

  it('keeps paused-only commands gated if the game resumes during the panel lifetime', () => {
    const parent = document.createElement('main');
    const terminalSource = source(true);
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open();
    terminalSource.state.paused = false;
    (parent.querySelector('[data-focus-key="slot:carried:0"]') as HTMLButtonElement).click();
    expect(terminal.isOpen).toBe(true);
  });

  it('rejects off-machine open and unique recipe policy without completion credit', () => {
    const parent = document.createElement('main');
    const offMachine = new GameTerminal(parent, source(true, false));
    expect(offMachine.open()).toBe(false);

    const terminalSource = source(true);
    const completed = vi.mocked(terminalSource.actions.onCraftCompleted ?? vi.fn());
    (terminalSource.actions as unknown as { canCraftRecipe: () => string }).canCraftRecipe = () =>
      'Scanner already installed.';
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open('workshop');
    (terminal as unknown as { dispatch: (command: unknown) => void }).dispatch({
      kind: 'craft',
      stationId: 'bench-1',
      recipeId: 'craft-scanner-replacement-module',
      destinationId: 'carried',
    });
    expect(completed).not.toHaveBeenCalled();
  });

  it('does not report inventory changes for failed garden or producer callbacks', () => {
    const parent = document.createElement('main');
    const terminalSource = source(true);
    const changed = vi.fn();
    const actions = terminalSource.actions as unknown as {
      onInventoryChanged: () => void;
      collectOutput: () => { ok: false; moved: 0; leftovers: 0; reason: 'capacity' };
      waterGarden: () => { ok: false; moved: 0; leftovers: 0; reason: 'capacity' };
    };
    actions.onInventoryChanged = changed;
    actions.collectOutput = () => ({ ok: false, moved: 0, leftovers: 0, reason: 'capacity' });
    actions.waterGarden = () => ({ ok: false, moved: 0, leftovers: 0, reason: 'capacity' });
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open();
    (terminal as unknown as { dispatch: (command: unknown) => void }).dispatch({
      kind: 'collect-output',
      sourceId: 'producer',
      destinationId: 'carried',
    });
    (terminal as unknown as { dispatch: (command: unknown) => void }).dispatch({
      kind: 'water-garden',
      gardenId: 'garden',
      sourceId: 'carried',
    });
    expect(changed).not.toHaveBeenCalled();
  });

  it('passes the live objective and radio channel projections through to Signal', () => {
    const parent = document.createElement('main');
    const terminalSource = source(true);
    Object.assign(terminalSource, {
      objective: () => ({
        title: 'Reach the relay',
        text: 'Follow the service road.',
        progress: 'Route 2 of 4',
      }),
      radioMessages: () => [
        {
          id: 'signal-1',
          title: 'Relay reception',
          text: 'A weak carrier repeats beyond the ridge.',
        },
      ],
    });
    const terminal = new GameTerminal(parent, terminalSource);
    terminal.open('signal');
    expect(parent.textContent).toContain('Reach the relay');
    expect(parent.textContent).toContain('Radio channel');
    expect(parent.textContent).toContain('A weak carrier repeats beyond the ridge.');
    terminal.dispose();
  });
});
