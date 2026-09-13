// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { InventoryUI } from '@/ui/InventoryUI';
import { MachineStatusView } from '@/ui/MachineStatusView';
import { BuildCatalog } from '@/ui/BuildCatalog';
import { BuildUI } from '@/ui/BuildUI';
import { Container } from '@/items/Container';

describe('polish UI components', () => {
  it('shows readable placement reasons and real action names for remapped controls', () => {
    const parent = document.createElement('div');
    const ui = new BuildUI(parent);
    const keys: Record<string, string> = {
      catalog: 'N',
      'rotate-left': 'J',
      'rotate-right': 'K',
      'next-level': 'U',
      'previous-level': 'O',
      'auto-level': 'H',
    };
    ui.update({
      piece: 'floor',
      category: 'structure',
      level: -2,
      rotation: 0,
      scrap: 100,
      components: 20,
      canAfford: () => true,
      validation: { ok: true },
      roomCount: 0,
      enclosedCount: 0,
      targetRejection: 'out-of-reach',
      label: (action) => keys[action] ?? action,
    });
    expect(parent.textContent).toContain('Target is out of reach');
    expect(parent.textContent).not.toContain('out-of-reach');
    expect(parent.textContent).toContain('N Catalog');
    expect(parent.textContent).toContain('J/K or wheel Rotate');
    expect(parent.textContent).toContain('U/O Deck');
    expect(parent.textContent).toContain('H Auto deck');
    ui.dispose();
  });
  it('sorts plain inventory exactly once and closes on stale target', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const sort = vi.fn(),
      close = vi.fn(),
      valid = vi.fn(() => true);
    const ui = new InventoryUI(parent, new Container(3), {
      moveToCrate: vi.fn(),
      moveToPlayer: vi.fn(),
      useSlot: vi.fn(),
      craft: vi.fn(),
      sort,
      close,
    });
    ui.setMode('inventory', { isTargetValid: valid });
    ui.update({ countOf: vi.fn(() => 0), canCraft: vi.fn() });
    parent
      .querySelector('[data-action="sort"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sort).toHaveBeenCalledTimes(1);
    valid.mockReturnValue(false);
    ui.update({ countOf: vi.fn(() => 0), canCraft: vi.fn() });
    expect(close).toHaveBeenCalledTimes(1);
    expect(ui.isOpen).toBe(false);
  });

  it('fires Take All and Deposit Matching once from transfer actions', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const takeAll = vi.fn(),
      depositMatching = vi.fn();
    const ui = new InventoryUI(parent, new Container(3), {
      moveToCrate: vi.fn(),
      moveToPlayer: vi.fn(),
      useSlot: vi.fn(),
      craft: vi.fn(),
      takeAll,
      depositMatching,
      close: vi.fn(),
    });
    ui.setMode('transfer', { crate: new Container(3) });
    ui.update({ countOf: vi.fn(() => 0), canCraft: vi.fn() });
    parent
      .querySelector('[data-action="take-all"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    parent
      .querySelector('[data-action="deposit-matching"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(takeAll).toHaveBeenCalledTimes(1);
    expect(depositMatching).toHaveBeenCalledTimes(1);
  });

  it('keeps machine service details expanded and focused across fuel updates', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new MachineStatusView(parent);
    const snapshot = {
      fuel: { current: 5, capacity: 10 },
      power: { capacity: 4, demand: 2, shed: [] },
      condition: [],
      serviceDecks: [{ name: 'Lower deck', subsystem: 'engine' as never, repairScrap: 2 }],
    };
    view.update(snapshot);
    const summary = view.root.querySelector('summary') as HTMLElement;
    const details = view.root.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    summary.focus();
    view.update({ ...snapshot, fuel: { current: 4, capacity: 10 } });
    expect((view.root.querySelector('details') as HTMLDetailsElement).open).toBe(true);
    expect(document.activeElement?.textContent).toContain('Service decks');
    expect(view.root.textContent).toContain('Engine');
  });

  it('selects a catalog card once and keeps search focused while updating', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const select = vi.fn(),
      catalog = new BuildCatalog(parent, { select });
    catalog.setVisible(true);
    const state = {
      category: 'station' as const,
      selected: 'crate' as const,
      canAfford: () => true,
    };
    catalog.update(state);
    const card = catalog.root.querySelector('[data-piece="crate"]') as HTMLElement;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(select).toHaveBeenCalledTimes(1);
    const input = catalog.root.querySelector('[data-catalog-search]') as HTMLInputElement;
    input.focus();
    input.value = 'gen';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    catalog.update({ ...state, query: 'gen' });
    expect(document.activeElement).toBe(input);
    expect(catalog.root.textContent).toContain('Generator');
  });

  it('routes remapped catalog keys to input while search owns typing and Escape closes', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const close = vi.fn();
    const catalog = new BuildCatalog(parent, { select: vi.fn(), close });
    catalog.setVisible(true);
    catalog.update({ category: 'station', selected: 'crate', canAfford: () => true });
    const received: string[] = [];
    parent.addEventListener('keydown', (event) => received.push(event.code));
    catalog.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(received).toEqual(['KeyN']);
    catalog.root
      .querySelector('[data-catalog-search]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true }));
    expect(close).not.toHaveBeenCalled();
    expect(received).toEqual(['KeyN']);
    catalog.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(received).toEqual(['KeyN']);
  });
});
