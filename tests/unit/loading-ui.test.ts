/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { LoadingUI } from '@/ui/LoadingUI';

describe('LoadingUI', () => {
  it('renders honest counts and the fallback notice without inventing a percentage', () => {
    const root = document.createElement('div');
    const ui = new LoadingUI(root, { retry: vi.fn(), simpler: vi.fn() });
    ui.show();
    ui.update({
      label: 'Loading <critical>',
      completed: 2,
      total: 0,
      fallbackCount: 1,
      detail: 'Preparing',
    });
    expect(root.textContent).toContain('Loading <critical>');
    expect(root.textContent).toContain('Preparing playable systems');
    expect(root.textContent).toContain('Some visual details are unavailable');
    expect(root.textContent).not.toContain('%');
    expect(root.innerHTML).toContain('Loading &lt;critical&gt;');
    ui.dispose();
  });

  it('exposes simpler visuals after a slow load and resets on hide/show', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const simpler = vi.fn();
    const ui = new LoadingUI(root, { retry: vi.fn(), simpler });
    ui.show('Critical art');
    expect((root.querySelector('[data-loading-simpler]') as HTMLButtonElement).hidden).toBe(true);
    vi.advanceTimersByTime(15_000);
    const button = root.querySelector('[data-loading-simpler]') as HTMLButtonElement;
    expect(button.hidden).toBe(false);
    ui.update({ label: 'Still loading', completed: 3, total: 10, fallbackCount: 0 });
    expect(button.hidden).toBe(false);
    button.click();
    button.click();
    expect(simpler).toHaveBeenCalledOnce();
    ui.hide();
    ui.show();
    expect((root.querySelector('[data-loading-simpler]') as HTMLButtonElement).hidden).toBe(true);
    ui.dispose();
    vi.useRealTimers();
  });

  it('shows escaped fatal errors with independently guarded retry and simpler actions', () => {
    const root = document.createElement('div');
    const retry = vi.fn();
    const simpler = vi.fn();
    const ui = new LoadingUI(root, { retry, simpler });
    ui.fail('Request <failed>');
    expect(root.textContent).toContain('Request <failed>');
    expect(root.textContent).not.toContain('%');
    const buttons = root.querySelectorAll<HTMLButtonElement>('.loading-actions button');
    buttons[0]!.click();
    buttons[0]!.click();
    expect(retry).toHaveBeenCalledOnce();
    ui.dispose();
  });

  it('suppresses late and fatal recovery actions when simpler visuals are disallowed', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const retry = vi.fn();
    const simpler = vi.fn();
    const ui = new LoadingUI(root, { retry, simpler });
    ui.show('Background art', false);
    ui.update({ label: 'Background progress', completed: 1, total: 3, fallbackCount: 0 });
    vi.advanceTimersByTime(15_000);
    const simplerButton = root.querySelector('[data-loading-simpler]') as HTMLButtonElement;
    expect(simplerButton.hidden).toBe(true);
    simplerButton.click();
    ui.fail('Late fallback');
    expect((root.querySelector('[data-loading-retry]') as HTMLButtonElement).hidden).toBe(true);
    expect((root.querySelector('[data-loading-simpler]') as HTMLButtonElement).hidden).toBe(true);
    simplerButton.click();
    expect(retry).not.toHaveBeenCalled();
    expect(simpler).not.toHaveBeenCalled();
    ui.hide();
    ui.dispose();
    vi.useRealTimers();
  });
});
