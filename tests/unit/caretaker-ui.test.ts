/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { CaretakerUI } from '@/ui/CaretakerUI';

describe('CaretakerUI', () => {
  it('owns a child panel and renders known conversation text safely', () => {
    const parent = document.createElement('main');
    const callbacks = { close: vi.fn(), setMode: vi.fn(), recruit: vi.fn() };
    const ui = new CaretakerUI(parent, callbacks);
    ui.open({
      panel: 'companion',
      title: '<title>',
      fact: 'Known caretaker record',
      mode: 'companion',
      status: 'Ready',
    });
    expect(parent.children).toHaveLength(1);
    expect(parent.textContent).toContain('<title>');
    expect(parent.querySelector('[data-panel="caretaker"]')).not.toBeNull();
  });
  it('does not call close callback when closed programmatically', () => {
    const parent = document.createElement('main');
    const callbacks = { close: vi.fn(), setMode: vi.fn(), recruit: vi.fn() };
    const ui = new CaretakerUI(parent, callbacks);
    ui.open({
      panel: 'recruitment',
      title: 'Depot',
      description: 'Repair',
      cost: 6,
      canRecruit: false,
      refusal: 'Need components',
    });
    ui.close();
    expect(callbacks.close).not.toHaveBeenCalled();
  });
  it('disables mode changes when gated and explains both modes', () => {
    const parent = document.createElement('main');
    const callbacks = { close: vi.fn(), setMode: vi.fn(), recruit: vi.fn() };
    const ui = new CaretakerUI(parent, callbacks);
    ui.open({
      panel: 'companion',
      title: 'L-12',
      fact: 'A known record',
      mode: 'companion',
      status: 'Waiting',
      canChangeMode: false,
    });
    expect(parent.textContent).toContain('Steward stores completed output');
    expect(parent.textContent).toContain('between decks using the internal stairs');
    expect(
      [...parent.querySelectorAll('[data-mode]')].every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);
  });
});
