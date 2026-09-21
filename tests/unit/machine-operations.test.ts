/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { CaretakerDirector } from '@/companion/CaretakerDirector';
import {
  evaluateCaretakerWork,
  chooseCaretakerJob,
  type CaretakerWorkSnapshot,
} from '@/companion/CaretakerWork';
import { projectMachineOperations } from '@/game/MachineOperations';
import { MachineOperationsUI } from '@/ui/MachineOperationsUI';

const empty = (): CaretakerWorkSnapshot => ({ crates: [], producers: [], gardens: [] });

describe('caretaker priorities', () => {
  it('keeps legacy auto water-first ordering and explicit category filters', () => {
    const snapshot: CaretakerWorkSnapshot = {
      crates: [
        {
          id: 'crate-b',
          reachable: true,
          items: [{ itemId: 'water', count: 1 }],
          spaceByItem: { scrap: 1 },
        },
      ],
      gardens: [{ id: 'garden-a', reachable: true, water: 0 }],
      producers: [{ id: 'refinery-a', reachable: true, output: { itemId: 'scrap', count: 1 } }],
    };
    expect(chooseCaretakerJob(snapshot)).toMatchObject({ kind: 'water-garden' });
    expect(chooseCaretakerJob(snapshot, 'gardens')).toMatchObject({ kind: 'water-garden' });
    expect(chooseCaretakerJob(snapshot, 'outputs')).toMatchObject({ kind: 'store-output' });
  });

  it.each([
    ['garden-unreachable', { gardens: [{ id: 'g', reachable: false, water: 0 }] }],
    ['water-unavailable', { gardens: [{ id: 'g', reachable: true, water: 0 }] }],
    [
      'water-source-unreachable',
      {
        crates: [
          { id: 'c', reachable: false, items: [{ itemId: 'water', count: 1 }], spaceByItem: {} },
        ],
        gardens: [{ id: 'g', reachable: true, water: 0 }],
      },
    ],
    [
      'output-unreachable',
      { producers: [{ id: 'p', reachable: false, output: { itemId: 'scrap', count: 1 } }] },
    ],
    [
      'storage-unreachable',
      {
        producers: [{ id: 'p', reachable: true, output: { itemId: 'scrap', count: 1 } }],
        crates: [{ id: 'c', reachable: false, items: [], spaceByItem: { scrap: 1 } }],
      },
    ],
    [
      'storage-full',
      {
        producers: [{ id: 'p', reachable: true, output: { itemId: 'scrap', count: 1 } }],
        crates: [{ id: 'c', reachable: true, items: [], spaceByItem: {} }],
      },
    ],
  ] as const)('reports %s with deterministic precedence', (reason, partial) => {
    const result = evaluateCaretakerWork(
      { ...empty(), ...partial },
      reason.startsWith('garden') || reason.startsWith('water') ? 'gardens' : 'outputs',
    );
    expect(result).toMatchObject({ kind: 'blocked', reason });
  });

  it('keeps an issued transaction frozen when priority changes', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    const work: CaretakerWorkSnapshot = {
      crates: [
        {
          id: 'c',
          reachable: true,
          items: [{ itemId: 'water', count: 1 }],
          spaceByItem: { scrap: 1 },
        },
      ],
      gardens: [{ id: 'g', reachable: true, water: 0 }],
      producers: [{ id: 'p', reachable: true, output: { itemId: 'scrap', count: 1 } }],
    };
    const first = d.plan(work);
    expect(d.setPriority('outputs')).toBe(true);
    expect(d.snapshot().job).toEqual(first);
    d.cancel();
    expect(d.plan(work)?.kind).toBe('store-output');
  });
});

describe('machine operations projection', () => {
  it('maps service panels and equipment to stable decks and clears stale pins', () => {
    const view = projectMachineOperations({
      structures: [
        {
          instanceId: 'generator-1',
          definitionId: 'generator',
          cell: { x: 1, y: -2, z: 2 },
          rotation: 0,
          health: 100,
        },
      ],
      subsystems: [{ id: 'engine', health: 10 }],
      pinnedTask: { kind: 'structure', id: 'missing' },
    });
    expect(view.pin).toBeNull();
    expect(
      view.decks
        .find((deck) => deck.id === 'lower')
        ?.nodes.some((node) => node.id === 'generator-1'),
    ).toBe(true);
    expect(
      view.decks.flatMap((deck) => deck.nodes).find((node) => node.id === 'engine')?.source,
    ).toEqual({ kind: 'subsystem', id: 'engine' });
    expect(
      view.decks
        .flatMap((deck) => deck.nodes)
        .every((node) => node.x >= 0 && node.x <= 1 && node.z >= 0 && node.z <= 1),
    ).toBe(true);
  });
});

describe('MachineOperationsUI', () => {
  it('routes deck, pin and priority actions and keeps literal labels safe', () => {
    const parent = document.createElement('main');
    const callbacks = {
      selectDeck: vi.fn(),
      pinTask: vi.fn(),
      setCaretakerPriority: vi.fn(),
      close: vi.fn(),
    };
    const view = projectMachineOperations({
      structures: [
        {
          instanceId: '<unsafe>',
          definitionId: 'generator',
          cell: { x: 0, y: -2, z: 0 },
          rotation: 0,
          health: 100,
        },
      ],
      pinnedTask: null,
    });
    const ui = new MachineOperationsUI(parent, callbacks);
    ui.open(view);
    expect(ui.isOpen).toBe(true);
    expect(parent.querySelectorAll('[data-deck]')).toHaveLength(3);
    (parent.querySelector('[data-deck="lower"]') as HTMLButtonElement).click();
    expect(callbacks.selectDeck).toHaveBeenCalledWith('lower');
    expect(parent.textContent).toContain('Generator');
    expect(parent.textContent).not.toContain('<unsafe>');
    const pin = parent.querySelector('.machine-operations-node button') as HTMLButtonElement;
    pin.click();
    expect(callbacks.pinTask).toHaveBeenCalledWith({ kind: 'structure', id: '<unsafe>' });
    const select = parent.querySelector('select') as HTMLSelectElement;
    select.value = 'outputs';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(callbacks.setCaretakerPriority).toHaveBeenCalledWith('outputs');
    ui.hide();
    expect(ui.isOpen).toBe(false);
    ui.dispose();
  });
});
