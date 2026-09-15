/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { HomeLifeUI, type HomeLifeView } from '@/ui/HomeLifeUI';

const salvage: HomeLifeView = {
  mode: 'salvage',
  title: 'Broadcast choice',
  description: 'A drifting cache answers.',
  status: 'undecided',
  canBroadcast: true,
  remaining: '20 seconds',
};

describe('HomeLifeUI', () => {
  it('owns a child panel and close is side-effect free', () => {
    const parent = document.createElement('section');
    const callbacks = { close: vi.fn(), selectKeepsake: vi.fn(), chooseSalvage: vi.fn() };
    const ui = new HomeLifeUI(parent, callbacks);
    ui.open(salvage);
    expect(parent.hidden).toBe(false);
    ui.close();
    expect(callbacks.close).not.toHaveBeenCalled();
    (parent.querySelector('[data-home-life-close]') as HTMLButtonElement | null)?.click();
    expect(callbacks.close).toHaveBeenCalledTimes(1);
  });

  it('renders keepsakes with a safe clear-selection action', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const callbacks = { close: vi.fn(), selectKeepsake: vi.fn(), chooseSalvage: vi.fn() };
    const ui = new HomeLifeUI(root, callbacks);
    ui.open({
      mode: 'shelf',
      title: 'Keepsake shelf',
      choices: [{ id: 'record', title: 'Record', text: '<private>' }],
      selectedId: 'record',
    });
    expect(root.textContent).toContain('Record');
    (root.querySelector('[data-keepsake-id="record"]') as HTMLButtonElement).click();
    (root.querySelector('button:last-child') as HTMLButtonElement).click();
    expect(callbacks.selectKeepsake).toHaveBeenNthCalledWith(1, 'record');
    expect(callbacks.selectKeepsake).toHaveBeenNthCalledWith(2, null);
  });

  it('requires explicit confirmation before broadcasting', () => {
    const root = document.createElement('section');
    const callbacks = { close: vi.fn(), selectKeepsake: vi.fn(), chooseSalvage: vi.fn() };
    const ui = new HomeLifeUI(root, callbacks);
    ui.open(salvage);
    const button = () => root.querySelectorAll('button')[1] as HTMLButtonElement;
    button().click();
    expect(callbacks.chooseSalvage).not.toHaveBeenCalled();
    expect(button().textContent).toContain('Confirm');
    button().click();
    expect(callbacks.chooseSalvage).toHaveBeenCalledWith('broadcast');
  });

  it('keeps focus and confirmation when a live view changes', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const callbacks = { close: vi.fn(), selectKeepsake: vi.fn(), chooseSalvage: vi.fn() };
    const ui = new HomeLifeUI(root, callbacks);
    ui.open(salvage);
    const broadcast = () => root.querySelectorAll('button')[1] as HTMLButtonElement;
    broadcast().click();
    ui.setView({ ...salvage, remaining: '19 seconds' });
    expect(broadcast().textContent).toContain('Confirm');
    broadcast().focus();
    ui.setView({ ...salvage, remaining: '18 seconds' });
    expect(document.activeElement).toBe(broadcast());
  });

  it('guards unavailable broadcast and escapes authored text through textContent', () => {
    const root = document.createElement('section');
    const callbacks = { close: vi.fn(), selectKeepsake: vi.fn(), chooseSalvage: vi.fn() };
    const ui = new HomeLifeUI(root, callbacks);
    ui.open({ ...salvage, title: '<danger>', canBroadcast: false });
    expect(root.querySelector('h3')?.textContent).toBe('<danger>');
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.find((b) => b.textContent === 'Broadcast for patrol')?.disabled).toBe(true);
  });
});
