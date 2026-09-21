/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { TerminalUI } from '@/ui/TerminalUI';
import type { TerminalView } from '@/game/TerminalView';

const slots = [
  { slot: 0, itemId: 'scrap' as const, label: '<untrusted>', count: 2, usable: false },
  { slot: 1, itemId: 'water' as const, label: 'Clean Water', count: 1, usable: true },
];
const view: TerminalView = {
  activeTab: 'inventory',
  paused: true,
  inventory: {
    carried: {
      id: 'carried',
      label: 'Carried',
      kind: 'carried',
      capacity: 2,
      slots,
      online: true,
      selected: true,
      transferEnabled: true,
      canTakeAll: false,
      canDeposit: false,
      canSort: false,
    },
    storage: [
      {
        id: 'crate-α',
        label: '<storage>',
        kind: 'crate',
        capacity: 2,
        slots: [],
        online: true,
        selected: false,
        transferEnabled: true,
        canTakeAll: true,
        canDeposit: true,
        canSort: true,
      },
    ],
    canManage: true,
    canEat: true,
    canDrink: true,
  },
  character: {
    health: 10,
    maxHealth: 10,
    stamina: 4,
    maxStamina: 4,
    hydration: 1,
    nourishment: 1,
    profile: 'story',
    weapon: {
      id: 'rifle',
      name: 'Rifle',
      ammoInMagazine: 6,
      reserveAmmo: 20,
      infiniteReserve: false,
      attachments: [],
    },
  },
  workshop: {
    stations: [],
    selectedStationId: null,
    recipes: [],
    selectedDestinationId: 'carried',
    outputDestinations: [{ id: 'carried', label: 'Carried inventory' }],
  },
  machine: {
    status: ['Hull nominal'],
    caretaker: {
      recruited: false,
      mode: 'companion',
      priority: 'auto',
      activeJob: null,
      decision: 'no-work',
    },
    physicalNotes: ['Helm remains physical.'],
    repairs: [],
    producers: [],
    gardens: [],
    outputDestinationId: 'carried',
    outputDestinations: [{ id: 'carried', label: 'Carried inventory' }],
  },
  signal: {
    scanner: { installed: false, powered: false, progress: 0, canStart: false },
    records: [],
  },
  build: { categories: [] },
};

describe('TerminalUI', () => {
  it('applies bounded text scale and reduced-motion state without rebuilding focusable content', () => {
    const root = document.createElement('main');
    const ui = new TerminalUI(root, { dispatch: vi.fn() });
    ui.show(view);
    ui.setAccessibility({ textScale: 2, reducedMotion: true });
    expect(ui.root.style.getPropertyValue('--terminal-text-scale')).toBe('1.4');
    expect(ui.root.dataset.reducedMotion).toBe('true');
    ui.setAccessibility({ textScale: Number.NaN, reducedMotion: false });
    expect(ui.root.style.getPropertyValue('--terminal-text-scale')).toBe('1');
    expect(ui.root.dataset.reducedMotion).toBe('false');
    ui.dispose();
  });

  it('renders semantic tabs and untrusted labels as text, routing actions', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    document.body.append(root);
    ui.show(view);
    expect(ui.isOpen).toBe(true);
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    expect(root.textContent).toContain('<untrusted>');
    expect(root.textContent).toContain('<storage>');
    expect(root.querySelectorAll('.terminal-slot-cell')).toHaveLength(2);
    expect(root.querySelectorAll('.terminal-slot-use')).toHaveLength(1);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(6);
    (root.querySelector('[data-tab="character"]') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledWith({ kind: 'select-tab', tab: 'character' });
  });

  it('keeps focus across identical updates and traps escape/tab locally', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    document.body.append(root);
    ui.show(view);
    const storage = root.querySelector('[data-focus-key="storage:crate-α"]') as HTMLButtonElement;
    storage.focus();
    ui.update(view);
    expect(document.activeElement).toBe(storage);
    ui.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith({ kind: 'close' });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    buttons.at(-1)?.focus();
    ui.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('disables close while busy and does not install handlers while hidden', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    ui.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dispatch).not.toHaveBeenCalled();
    ui.show({ ...view, busy: true });
    expect((root.querySelector('.terminal-close') as HTMLButtonElement).disabled).toBe(true);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dispatch).not.toHaveBeenCalledWith({ kind: 'close' });
  });

  it('renders functional producer and garden routines with live destination IDs', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    ui.show({
      ...view,
      activeTab: 'machine',
      machine: {
        ...view.machine,
        producers: [
          {
            id: 'condenser-1',
            label: 'Water condenser',
            stored: 2,
            capacity: 4,
            powered: true,
            health: 90,
            canCollect: true,
          },
        ],
        gardens: [
          {
            id: 'garden-1',
            label: 'Seed garden',
            water: 1,
            maxWater: 2,
            greens: 3,
            canWater: true,
            canHarvest: true,
          },
        ],
        outputDestinationId: 'crate-α',
      },
    });
    expect(root.textContent).toContain('2/4 stored');
    expect(root.textContent).toContain('Water 1/2');
    const collect = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Collect output',
    );
    collect?.click();
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'collect-output',
      sourceId: 'condenser-1',
      destinationId: 'crate-α',
    });
    const harvest = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Harvest greens',
    );
    harvest?.click();
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'harvest-garden',
      gardenId: 'garden-1',
      destinationId: 'crate-α',
    });
  });

  it('filters the build catalog locally and shows costs plus clear availability', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    ui.show({
      ...view,
      activeTab: 'build',
      build: {
        categories: [
          {
            id: 'station',
            label: 'Station',
            pieces: [
              {
                id: 'crate',
                label: 'Storage Crate',
                cost: { scrap: 15, components: 2 },
                unlocked: true,
                canBuild: false,
              },
              { id: 'lamp', label: 'Lamp', cost: { scrap: 5 }, unlocked: false, canBuild: false },
              {
                id: 'workbench',
                label: 'Workbench',
                cost: { scrap: 30 },
                unlocked: true,
                canBuild: true,
              },
            ],
          },
        ],
      },
    });
    expect(root.textContent).toContain('Cost: 15 Scrap Metal · 2 Components');
    expect(root.textContent).toContain('Insufficient materials');
    expect(root.textContent).toContain('Locked');
    const search = root.querySelector('#terminal-build-search') as HTMLInputElement;
    search.value = 'lamp';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect((root.querySelector('[data-build-category="station"]') as HTMLElement)?.hidden).toBe(
      false,
    );
    expect(
      (root.querySelector('[data-build-piece-id="crate"]')?.parentElement as HTMLElement)?.hidden,
    ).toBe(true);
    expect(
      (root.querySelector('[data-build-piece-id="lamp"]')?.parentElement as HTMLElement)?.hidden,
    ).toBe(false);
    expect(
      (root.querySelector('[data-build-piece-id="workbench"]')?.parentElement as HTMLElement)
        ?.hidden,
    ).toBe(true);
    search.value = 'work';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    (root.querySelector('[data-build-piece-id="workbench"]') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledWith({ kind: 'select-build-piece', id: 'workbench' });
    ui.dispose();
  });

  it('keeps an unrecruited caretaker compact and actionable state honest', () => {
    const root = document.createElement('main');
    const ui = new TerminalUI(root, { dispatch: vi.fn() });
    ui.show({ ...view, activeTab: 'machine' });
    expect(root.querySelector('.terminal-caretaker-status')?.textContent).toBe(
      'Caretaker not recruited',
    );
    expect(
      [...root.querySelectorAll('button')].filter((node) =>
        node.textContent?.startsWith('Priority:'),
      ),
    ).toHaveLength(0);
    expect(root.textContent).not.toContain('Active job');
    ui.dispose();
  });

  it('renders fieldwork costs and routes research or equip actions', () => {
    const root = document.createElement('main');
    const dispatch = vi.fn();
    const ui = new TerminalUI(root, { dispatch });
    const stats = {
      damage: 1,
      fireRate: 1,
      spread: 1,
      aimSpread: 1,
      recoil: 1,
      range: 1,
      reloadTime: 1,
    };
    ui.show({
      ...view,
      activeTab: 'workshop',
      workshop: {
        ...view.workshop,
        fieldwork: [
          {
            weaponId: 'rifle',
            title: 'Rifle fieldwork',
            profileLabel: 'Ready',
            available: true,
            scrap: 12,
            components: 8,
            researched: [],
            active: null,
            stats,
            ammoInMag: 1,
            reserveAmmo: 2,
            infiniteReserve: false,
          },
          {
            weaponId: 'shotgun',
            title: 'Shotgun fieldwork',
            profileLabel: 'Offline',
            available: false,
            refusal: 'Fieldwork tools unpowered.',
            scrap: 99,
            components: 99,
            researched: ['shotgun-choke'],
            active: 'shotgun-choke',
            stats,
            ammoInMag: 1,
            reserveAmmo: 2,
            infiniteReserve: false,
          },
        ],
      },
    });
    expect(root.textContent).toContain('Cost: 12 Scrap Metal · 8 Components');
    const research = root.querySelector(
      '[data-fieldwork-attachment="rifle-stabilizer"]',
    ) as HTMLButtonElement;
    expect(research.textContent).toBe('Research + equip');
    expect(research.disabled).toBe(false);
    research.click();
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'fieldwork',
      action: 'research',
      weaponId: 'rifle',
      attachmentId: 'rifle-stabilizer',
    });
    const offline = root.querySelector(
      '[data-fieldwork-attachment="shotgun-choke"]',
    ) as HTMLButtonElement;
    expect(offline.disabled).toBe(true);
    expect(root.querySelector('[data-fieldwork-remove="shotgun"]')).not.toBeNull();
    ui.dispose();
  });

  it('renders the current objective and live radio channel without inventing archive state', () => {
    const root = document.createElement('main');
    const ui = new TerminalUI(root, { dispatch: vi.fn() });
    ui.show({
      ...view,
      activeTab: 'signal',
      signal: {
        ...view.signal,
        objective: {
          title: 'Reach the relay',
          text: 'Follow the service road.\nKeep the machine moving.',
          progress: 'Route 2 of 4',
        },
        radioMessages: [
          {
            id: 'signal-1',
            title: 'Relay reception',
            text: 'A weak carrier is repeating beyond the ridge.',
          },
        ],
      },
    });
    expect(root.textContent).toContain('Current objective');
    expect(root.textContent).toContain('Reach the relay');
    expect(root.textContent).toContain('Keep the machine moving.');
    expect(root.textContent).toContain('Radio channel');
    expect(root.textContent).toContain('Relay reception');
    ui.hide();
    ui.show({ ...view, activeTab: 'signal' });
    expect(root.textContent).not.toContain('Current objective');
    expect(root.textContent).not.toContain('Radio channel');
    ui.dispose();
  });
});
