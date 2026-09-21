/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { TitleScreen } from '@/ui/TitleScreen';

describe('settings accessibility controls', () => {
  it('persists terminal scale and reduced motion through the settings UI', async () => {
    const root = document.createElement('div');
    const onSettings = vi.fn();
    const ui = new TitleScreen(root, {
      onNewGame: vi.fn(),
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings,
      hasSave: async () => false,
    });
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="settings"]') as HTMLButtonElement).click();
    const scale = root.querySelector('#title-terminal-scale') as HTMLInputElement;
    scale.value = '1.4';
    scale.dispatchEvent(new Event('input', { bubbles: true }));
    const reduced = root.querySelector('#title-reduced-motion') as HTMLInputElement;
    reduced.checked = true;
    reduced.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ terminalTextScale: 1.4, reducedMotion: true }),
    );
    ui.dispose();
  });
});
