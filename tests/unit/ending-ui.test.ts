/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { EndingUI } from '@/ui/EndingUI';

describe('EndingUI', () => {
  it('renders committed distance and gates skip by phase', () => {
    const root = document.createElement('section');
    const skip = vi.fn();
    const ui = new EndingUI(root, { skip, keepWalking: vi.fn() });
    ui.setView({ phase: 'committed', remainingM: 399.6, caption: '<signal>', paused: false });
    expect(root.textContent).toContain('400 m to Meridian');
    expect(root.textContent).toContain('<signal>');
    (root.querySelector('[data-ending-skip]') as HTMLButtonElement).click();
    expect(skip).toHaveBeenCalledOnce();
    ui.setView({ phase: null, remainingM: 0, caption: '', paused: false });
    expect(root.querySelector('.ending-overlay')?.hasAttribute('hidden')).toBe(true);
    ui.dispose();
  });

  it('keeps a paused phase hidden and shows credits keep-walking action', () => {
    const root = document.createElement('section');
    const keepWalking = vi.fn();
    const ui = new EndingUI(root, { skip: vi.fn(), keepWalking });
    ui.setView({ phase: 'arrival', remainingM: 0, caption: 'Arrival', paused: true });
    expect(root.querySelector('.ending-overlay')?.hasAttribute('hidden')).toBe(true);
    ui.setView({ phase: 'credits', remainingM: 0, caption: 'Credits', paused: false });
    expect(root.textContent).toContain('Machine Move Forward');
    (root.querySelector('[data-ending-keep]') as HTMLButtonElement).click();
    expect(keepWalking).toHaveBeenCalledOnce();
    ui.dispose();
  });
});
