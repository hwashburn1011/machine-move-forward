/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { SaveLibraryUI, type SaveLibraryEntry } from '@/ui/SaveLibraryUI';

const entries: readonly SaveLibraryEntry[] = [
  {
    slot: 'campaign:one',
    name: 'Dawn <watch> & keep walking',
    savedAt: Date.UTC(2026, 8, 15, 12, 30),
    seed: 'seed-one',
    profile: 'survival',
    distanceTraveled: 1234,
    chapterLabel: 'The Long Road',
    system: false,
  },
  {
    slot: 'quicksave',
    name: 'Current run',
    savedAt: Date.UTC(2026, 8, 15, 12),
    seed: 'seed-two',
    profile: 'story',
    distanceTraveled: 20,
    chapterLabel: 'Opening',
    system: true,
  },
];

const show = (ui: SaveLibraryUI, canSnapshot = true, canLoad = true): void =>
  ui.show({ entries, canSnapshot, canLoad });

describe('SaveLibraryUI', () => {
  it('renders rows safely and delegates load/export/import actions', () => {
    const parent = document.createElement('main');
    document.body.append(parent);
    const callbacks = {
      load: vi.fn(),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    };
    const ui = new SaveLibraryUI(parent, callbacks);
    show(ui);
    expect(document.activeElement).toBe(parent.querySelector('#save-library-name'));
    expect(parent.textContent).toContain('Dawn <watch> & keep walking');
    expect(parent.querySelector('[data-save-slot="campaign:one"]')?.innerHTML).toContain('&lt;');
    expect(parent.textContent).toContain('The Long Road');
    expect(parent.textContent).toContain('Survival');
    (parent.querySelector('[data-save-load="campaign:one"]') as HTMLButtonElement).click();
    expect(callbacks.load).toHaveBeenCalledWith('campaign:one');
    ui.setBusy(false);
    (parent.querySelector('[data-save-export="campaign:one"]') as HTMLButtonElement).click();
    expect(callbacks.export).toHaveBeenCalledWith('campaign:one');
    ui.setBusy(false);
    (parent.querySelector('[data-save-import]') as HTMLButtonElement).click();
    expect(callbacks.requestImport).toHaveBeenCalledOnce();
    ui.dispose();
  });

  it('requires named snapshot confirmation and never offers system deletion', () => {
    const parent = document.createElement('main');
    document.body.append(parent);
    const callbacks = {
      load: vi.fn(),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    };
    const ui = new SaveLibraryUI(parent, callbacks);
    show(ui);
    expect(parent.querySelector('[data-save-delete="quicksave"]')).toBeNull();
    (parent.querySelector('[data-save-delete="campaign:one"]') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(parent.querySelector('[data-save-delete-cancel]'));
    expect(parent.textContent).toContain('Delete snapshot “Dawn <watch> & keep walking”?');
    expect(callbacks.delete).not.toHaveBeenCalled();
    (parent.querySelector('[data-save-delete-confirm]') as HTMLButtonElement).click();
    expect(callbacks.delete).toHaveBeenCalledWith('campaign:one');
    ui.dispose();
  });

  it('cancels delete with Escape, then closes on the next Escape', () => {
    const parent = document.createElement('main');
    const close = vi.fn();
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close,
    });
    show(ui);
    (parent.querySelector('[data-save-delete="campaign:one"]') as HTMLButtonElement).click();
    (parent.querySelector('[data-panel="save-library"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(parent.querySelector('[data-save-delete-confirm]')).toBeNull();
    expect(close).not.toHaveBeenCalled();
    (parent.querySelector('[data-panel="save-library"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(ui.isOpen).toBe(false);
    ui.dispose();
  });

  it('gates snapshots, blocks double clicks while a callback is pending, and has no hidden key action', async () => {
    const parent = document.createElement('main');
    let finish!: () => void;
    const snapshot = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const close = vi.fn();
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(),
      snapshot,
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close,
    });
    show(ui, false);
    const name = parent.querySelector('#save-library-name') as HTMLInputElement;
    const save = parent.querySelector('[data-save-snapshot]') as HTMLButtonElement;
    expect(name.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    ui.show({ entries, canSnapshot: true, canLoad: true });
    name.value = 'One snapshot';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    save.click();
    save.click();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(save.disabled).toBe(true);
    expect((parent.querySelector('[data-save-close]') as HTMLButtonElement).disabled).toBe(true);
    (parent.querySelector('[data-panel="save-library"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(close).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    ui.hide();
    (parent.querySelector('[data-panel="save-library"]') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(close).not.toHaveBeenCalled();
    ui.dispose();
  });

  it('keeps Tab focus inside the open library dialog', () => {
    const parent = document.createElement('main');
    document.body.append(parent);
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    });
    show(ui);
    const panel = parent.querySelector('[data-panel="save-library"]') as HTMLElement;
    const input = parent.querySelector('#save-library-name') as HTMLInputElement;
    const importButton = parent.querySelector('[data-save-import]') as HTMLButtonElement;
    input.focus();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(importButton);
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, shiftKey: true }),
    );
    expect(document.activeElement).toBe(input);
    ui.dispose();
  });

  it('accepts spaces typed into a snapshot name', () => {
    const parent = document.createElement('main');
    document.body.append(parent);
    const snapshot = vi.fn();
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(),
      snapshot,
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    });
    show(ui);
    const input = parent.querySelector('#save-library-name') as HTMLInputElement;
    input.focus();
    input.value = 'North';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    input.value = 'North Star';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (parent.querySelector('[data-save-snapshot]') as HTMLButtonElement).click();
    expect(snapshot).toHaveBeenCalledWith('North Star');
    ui.dispose();
  });

  it('disables every mutating control while busy and exposes storage errors accessibly', async () => {
    const parent = document.createElement('main');
    let finish!: () => void;
    const pendingLoad = new Promise<void>((resolve) => (finish = resolve));
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(() => pendingLoad),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    });
    show(ui);
    (parent.querySelector('[data-save-load="campaign:one"]') as HTMLButtonElement).click();
    expect(
      [
        ...parent.querySelectorAll<HTMLButtonElement>(
          '[data-save-load], [data-save-export], [data-save-delete], [data-save-import], [data-save-snapshot]',
        ),
      ].every((button) => button.disabled),
    ).toBe(true);
    ui.showStatus('Storage is unavailable.', true);
    const status = parent.querySelector('#save-library-status') as HTMLElement;
    expect(status.hidden).toBe(false);
    expect(status.getAttribute('role')).toBe('alert');
    expect(status.textContent).toBe('Storage is unavailable.');
    finish();
    await Promise.resolve();
    await Promise.resolve();
    ui.dispose();
  });

  it('keeps a long campaign list in the scrollable panel and focuses Close when unsafe', () => {
    const parent = document.createElement('main');
    document.body.append(parent);
    const title = document.createElement('section');
    title.tabIndex = 0;
    parent.append(title);
    const ui = new SaveLibraryUI(parent, {
      load: vi.fn(),
      snapshot: vi.fn(),
      export: vi.fn(),
      requestImport: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    });
    const longList = Array.from({ length: 48 }, (_, index) => ({
      ...entries[0]!,
      slot: `campaign:${index}`,
      name: `Run ${index}`,
    }));
    ui.show({
      entries: longList,
      canSnapshot: false,
      canLoad: true,
      snapshotReason: 'Pause at a safe point to save.',
    });
    const panel = parent.querySelector('[data-panel="save-library"]') as HTMLElement;
    expect(panel.contains(title)).toBe(false);
    expect(panel.querySelectorAll('[data-save-slot]')).toHaveLength(48);
    expect(panel.querySelector('.save-library-content')).not.toBeNull();
    expect(document.activeElement).toBe(panel.querySelector('[data-save-close]'));
    expect(parent.querySelector('#save-library-reason')?.textContent).toBe(
      'Pause at a safe point to save.',
    );
    ui.dispose();
  });
});
