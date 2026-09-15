/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { TitleScreen } from '@/ui/TitleScreen';

describe('TitleScreen campaign profiles', () => {
  it('requires an explicit profile and supports cancellation', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const onNewGame = vi.fn();
    const ui = new TitleScreen(root, {
      onNewGame,
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings: vi.fn(),
      hasSave: async () => false,
    });
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="new-game"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-profile="story"]')).not.toBeNull();
    (root.querySelector('[data-profile-cancel]') as HTMLButtonElement).click();
    expect(onNewGame).not.toHaveBeenCalled();
    (root.querySelector('[data-id="new-game"]') as HTMLButtonElement).click();
    (root.querySelector('[data-profile="survival"]') as HTMLButtonElement).click();
    expect(onNewGame).toHaveBeenCalledWith('survival');
  });
});
