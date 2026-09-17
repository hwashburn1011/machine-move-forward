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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onNewGame).toHaveBeenCalledWith('survival', true);
    ui.dispose();
  });

  it('checks for a current run before starting and focuses the safe default', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    let checks = 0;
    const onNewGame = vi.fn();
    const ui = new TitleScreen(root, {
      onNewGame,
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings: vi.fn(),
      hasSave: vi.fn(async () => checks++ > 0),
    });
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="new-game"]') as HTMLButtonElement).click();
    (root.querySelector('[data-profile="story"]') as HTMLButtonElement).click();
    expect((root.querySelector('#title-campaign-preserve') as HTMLElement).hidden).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const preserve = root.querySelector('[data-campaign-preserve]') as HTMLButtonElement;
    expect((root.querySelector('#title-campaign-preserve') as HTMLElement).hidden).toBe(false);
    expect(document.activeElement).toBe(preserve);
    expect(root.textContent).toContain('Preserve & Start');
    preserve.click();
    expect(onNewGame).toHaveBeenCalledWith('story', true);
    ui.dispose();
  });

  it('backs out of the preservation dialog and allows an explicit replacement', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    let checks = 0;
    const onNewGame = vi.fn();
    const ui = new TitleScreen(root, {
      onNewGame,
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings: vi.fn(),
      hasSave: vi.fn(async () => checks++ > 0),
    });
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="new-game"]') as HTMLButtonElement).click();
    (root.querySelector('[data-profile="story"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect((root.querySelector('#title-campaign-preserve') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('#title-profile') as HTMLElement).hidden).toBe(false);
    (root.querySelector('[data-profile="survival"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-campaign-replace]') as HTMLButtonElement).click();
    expect(onNewGame).toHaveBeenCalledWith('survival', false);
    ui.dispose();
  });

  it('keeps the preservation dialog retryable while the root reports a failed operation', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    let checks = 0;
    const holder: { ui?: TitleScreen } = {};
    const onNewGame = vi.fn(() => holder.ui?.setCampaignBusy(true));
    const ui = new TitleScreen(root, {
      onNewGame,
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings: vi.fn(),
      hasSave: vi.fn(async () => checks++ > 0),
    });
    holder.ui = ui;
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="new-game"]') as HTMLButtonElement).click();
    (root.querySelector('[data-profile="story"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const preserve = root.querySelector('[data-campaign-preserve]') as HTMLButtonElement;
    preserve.click();
    expect(onNewGame).toHaveBeenCalledWith('story', true);
    expect(preserve.disabled).toBe(true);
    ui.showStatus('Unable to preserve the previous campaign.', true);
    ui.setCampaignBusy(false);
    expect((root.querySelector('#title-campaign-preserve') as HTMLElement).hidden).toBe(false);
    expect(preserve.disabled).toBe(false);
    expect(root.querySelector('[data-campaign-back]')).not.toBeNull();
    ui.dispose();
  });

  it('routes Campaigns from boot and pause and disables campaign choices while busy', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const onCampaigns = vi.fn();
    const ui = new TitleScreen(root, {
      onNewGame: vi.fn(),
      onContinue: vi.fn(),
      onResume: vi.fn(),
      onQuitToTitle: vi.fn(),
      onSave: vi.fn(),
      onSaveAndQuit: vi.fn(),
      onSettings: vi.fn(),
      onCampaigns,
      hasSave: async () => false,
    });
    ui.show('boot');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="campaigns"]') as HTMLButtonElement).click();
    expect(onCampaigns).toHaveBeenCalledWith('boot');
    ui.show('pause');
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector('[data-id="campaigns"]') as HTMLButtonElement).click();
    expect(onCampaigns).toHaveBeenCalledWith('pause');
    ui.setCampaignBusy(true);
    expect(
      [...root.querySelectorAll<HTMLButtonElement>('#title-menu .title-item')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    ui.setCampaignBusy(false);
    ui.dispose();
  });
});
