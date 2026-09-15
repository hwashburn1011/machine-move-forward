/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { CampaignLogUI, type CampaignLogView } from '@/ui/CampaignLogUI';
import { projectCampaignRecord } from '@/story/CampaignRecord';

const record = projectCampaignRecord({
  completedExpeditions: ['relay-foundry'],
  recoveredUniques: [],
  journalArchive: [],
  activeRouteId: null,
  endingPhase: 'available',
  chart: { contact: null, visitedIds: ['route-contact-1'], missedIds: [] },
  firstRunComplete: true,
  navigationTier: 1,
  gardenCount: 0,
  automation: { collectors: 0, turrets: 0 },
});

describe('CampaignLogUI', () => {
  it('renders chapters, discovery totals, and guidance from the supplied record', () => {
    const root = document.createElement('section');
    const ui = new CampaignLogUI(root, { close: vi.fn() });
    ui.open({
      record,
      contact: { id: 'c1', label: 'Water cache', remainingM: 80, bearingDeg: -3 },
    });
    expect(root.textContent).toContain('Relay Foundry · complete');
    expect(root.textContent).toContain('1 visited · 0 missed');
    expect(root.textContent).toContain('Current contact: Water cache');
    expect(root.textContent).toContain('Tend the Seed Garden');
    ui.dispose();
  });

  it('deduplicates archive IDs and renders supplied text as text content', () => {
    const root = document.createElement('section');
    const ui = new CampaignLogUI(root, { close: vi.fn() });
    const view: CampaignLogView = {
      record,
      archive: [
        { id: 'a', title: 'Old <record>', text: 'A & B', chapter: 'Foundry' },
        { id: 'a', title: 'Duplicate', text: 'hidden', chapter: 'Foundry' },
      ],
    };
    ui.open(view);
    expect(root.querySelectorAll('[data-archive-id="a"]')).toHaveLength(1);
    expect(root.textContent).toContain('Old <record>');
    expect(root.textContent).not.toContain('hidden');
    expect(root.querySelector('[data-archive-id="a"]')?.innerHTML).toContain('&amp;');
    ui.dispose();
  });

  it('delegates close and updates the read-only view without global listeners', () => {
    const root = document.createElement('section');
    const close = vi.fn();
    const ui = new CampaignLogUI(root, { close });
    ui.open({ record });
    (root.querySelector('[data-campaign-log-close]') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledOnce();
    ui.close();
    expect(ui.isOpen).toBe(false);
    ui.dispose();
  });
});
