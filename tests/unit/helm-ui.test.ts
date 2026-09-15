/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { HelmUI, type HelmView } from '@/ui/HelmUI';
import { ExpeditionUI, type ExpeditionView } from '@/ui/ExpeditionUI';

const view: HelmView = {
  tier: 1,
  bearingDeg: 2,
  desiredDeg: 4,
  throttle: 0.8,
  powered: true,
  locked: false,
  objective: 'Reach the relay.',
  markers: [{ id: 'relay', label: 'Relay', forwardM: 20, lateralM: -1, kind: 'story' }],
};

describe('HelmUI', () => {
  it('renders live objective, marker, and accessible controls', () => {
    const root = document.createElement('section');
    document.body.append(root);
    new HelmUI(root, { close: vi.fn(), setBearing: vi.fn(), setThrottle: vi.fn() }).render(view);
    expect(root.dataset.tier).toBe('1');
    expect(root.querySelector('[data-testid="helm-objective"]')?.textContent).toBe(
      'Reach the relay.',
    );
    expect(root.querySelector('[data-marker-id="relay"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="helm-bearing"]')).not.toBeNull();
  });

  it('disables commands truthfully while locked or unpowered and reports refusal', () => {
    const root = document.createElement('section');
    new HelmUI(root, { close: vi.fn(), setBearing: vi.fn(), setThrottle: vi.fn() }).render({
      ...view,
      powered: false,
      locked: true,
      refusal: 'locked',
    });
    expect((root.querySelector('[data-testid="helm-bearing"]') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(root.querySelector('[data-testid="helm-status"]')?.textContent).toBe('locked');
  });

  it('calls plotContact once only for an enabled opportunity', () => {
    const root = document.createElement('section');
    const plot = vi.fn();
    new HelmUI(root, {
      close: vi.fn(),
      setBearing: vi.fn(),
      setThrottle: vi.fn(),
      plotContact: plot,
    }).render({
      ...view,
      opportunity: {
        id: 'o1',
        title: 'Relay',
        description: 'Signal',
        hazard: 'Raiders',
        remainingM: 20,
        bearingDeg: 3,
        estimatedFuel: 4,
        state: 'available',
        canCommit: true,
      },
    });
    (root.querySelector('[data-testid="helm-plot-contact"]') as HTMLButtonElement).click();
    expect(plot).toHaveBeenCalledOnce();
    expect(plot).toHaveBeenCalledWith('o1');
  });

  it('preserves bearing range identity and focus across live renders', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const helm = new HelmUI(root, { close: vi.fn(), setBearing: vi.fn(), setThrottle: vi.fn() });
    helm.render(view);
    const range = root.querySelector('[data-testid="helm-bearing"]') as HTMLInputElement;
    range.focus();
    helm.render({ ...view, bearingDeg: 8, desiredDeg: 9 });
    expect(root.querySelector('[data-testid="helm-bearing"]')).toBe(range);
    expect(document.activeElement).toBe(range);
  });

  it('renders plotted cancellation and fuel units without percent notation', () => {
    const root = document.createElement('section');
    const cancel = vi.fn();
    new HelmUI(root, {
      close: vi.fn(),
      setBearing: vi.fn(),
      setThrottle: vi.fn(),
      cancelApproach: cancel,
    }).render({
      ...view,
      opportunity: {
        id: 'o2',
        title: 'Wreck',
        description: 'Cargo',
        hazard: 'Sand',
        remainingM: 31,
        bearingDeg: -2,
        estimatedFuel: 7,
        state: 'plotted',
        canCommit: false,
      },
    });
    (root.querySelector('[data-testid="helm-cancel-approach"]') as HTMLButtonElement).click();
    expect(cancel).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-testid="helm-opportunity"]')?.textContent).toContain(
      'fuel 7 units',
    );
    expect(root.querySelector('[data-testid="helm-opportunity"]')?.textContent).not.toContain(
      'fuel 7%',
    );
  });

  it('requires a second confirmation click before committing the Meridian bearing', () => {
    const root = document.createElement('section');
    const commit = vi.fn();
    const helm = new HelmUI(root, {
      close: vi.fn(),
      setBearing: vi.fn(),
      setThrottle: vi.fn(),
      commitEnding: commit,
    });
    helm.render({ ...view, ending: { available: true, busy: false } });
    const button = root.querySelector('[data-testid="helm-commit-ending"]') as HTMLButtonElement;
    button.click();
    expect(commit).not.toHaveBeenCalled();
    expect(root.textContent).toContain('400 m');
    button.click();
    expect(commit).toHaveBeenCalledOnce();
    helm.render({ ...view, ending: { available: false, busy: false } });
    expect(root.querySelector('[data-testid="helm-commit-ending"]')).toBeNull();
    helm.dispose();
  });

  it('names tier-three Meridian authority in the live status', () => {
    const root = document.createElement('section');
    const helm = new HelmUI(root, { close: vi.fn(), setBearing: vi.fn(), setThrottle: vi.fn() });
    helm.render({ ...view, tier: 3 });
    expect(root.querySelector('[data-testid="helm-status"]')?.textContent).toBe(
      'Meridian authority online.',
    );
    helm.dispose();
  });

  it('renders external journals and updates them with the next view', () => {
    const root = document.createElement('section');
    const panel = new ExpeditionUI(root, { close: vi.fn() });
    const base: ExpeditionView = {
      phase: 'locked',
      objective: 'Explore',
      strength: 0,
      remainingM: null,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: true,
    };
    panel.open({
      ...base,
      extraJournals: [{ id: 'memorial', title: 'Memorial', text: 'First record' }],
    });
    expect(root.textContent).toContain('First record');
    panel.setView({
      ...base,
      extraJournals: [{ id: 'memorial', title: 'Memorial', text: 'Updated record' }],
    });
    expect(root.textContent).toContain('Updated record');
    expect(root.textContent).not.toContain('First record');
    panel.dispose();
  });

  it('generalizes orchard journals, uniques, and objectives without a gyro hint', () => {
    const root = document.createElement('section');
    const panel = new ExpeditionUI(root, { close: vi.fn() });
    panel.open({
      phase: 'docked',
      objective: 'Stabilize the orchard.',
      strength: 1,
      remainingM: 0,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: false,
      expeditionId: 'glass-orchard',
      availableJournalIds: [],
      completedObjectives: ['orchard-port-isolator'],
    });
    expect(root.textContent).toContain('Unavailable on this route');
    expect(root.textContent).toContain('Human Seed Bank: pending');
    expect(root.textContent).toContain('Orchard Port Isolator: complete');
    expect(root.textContent).not.toContain('Course Gyro');
    panel.dispose();
  });

  it('drops a pending route when that route is no longer offered', () => {
    const root = document.createElement('section');
    const selectRoute = vi.fn();
    const panel = new ExpeditionUI(root, { close: vi.fn(), selectRoute });
    const base: ExpeditionView = {
      phase: 'route-selection',
      objective: 'Choose',
      strength: 1,
      remainingM: 100,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: true,
      routes: ['foundry-direct'],
    };
    panel.open(base);
    (root.querySelector('[data-route="foundry-direct"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-route-confirm="foundry-direct"]')).not.toBeNull();
    panel.setView({ ...base, routes: ['foundry-detour'] });
    expect(root.querySelector('[data-route-confirm="foundry-direct"]')).toBeNull();
    (root.querySelector('[data-route="foundry-detour"]') as HTMLButtonElement).click();
    (root.querySelector('[data-route-confirm="foundry-detour"]') as HTMLButtonElement).click();
    expect(selectRoute).toHaveBeenCalledWith('foundry-detour');
    expect(selectRoute).not.toHaveBeenCalledWith('foundry-direct');
    panel.dispose();
  });

  it('shows only Orchard routes with authored names and confirms the selected ID', () => {
    const root = document.createElement('section');
    const selectRoute = vi.fn();
    const panel = new ExpeditionUI(root, { close: vi.fn(), selectRoute });
    panel.open({
      phase: 'route-selection',
      objective: 'Choose an Orchard approach.',
      strength: 1,
      remainingM: 100,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: true,
      expeditionId: 'glass-orchard',
      routes: ['orchard-caretaker', 'orchard-cold-vault'],
    });
    expect(root.querySelectorAll('[data-route-card]')).toHaveLength(2);
    expect(root.textContent).toContain('Caretaker Approach');
    expect(root.textContent).toContain('Cold Vault');
    expect(root.textContent).not.toContain('Direct');
    (root.querySelector('[data-route="orchard-caretaker"]') as HTMLButtonElement).click();
    (root.querySelector('[data-route-confirm="orchard-caretaker"]') as HTMLButtonElement).click();
    expect(selectRoute).toHaveBeenCalledOnce();
    expect(selectRoute).toHaveBeenCalledWith('orchard-caretaker');
    panel.dispose();
  });

  it('keeps read Orchard testimony visible while marking an alternate record unavailable', () => {
    const root = document.createElement('section');
    const panel = new ExpeditionUI(root, { close: vi.fn() });
    panel.open({
      phase: 'docked',
      objective: 'Restore the Orchard.',
      strength: 1,
      remainingM: 0,
      journalsRead: ['orchard-evacuation-record'],
      uniqueCollected: false,
      playerOnMachine: false,
      expeditionId: 'glass-orchard',
      availableJournalIds: ['orchard-caretaker-record'],
      completedObjectives: [],
    });
    expect(root.querySelectorAll('[data-expedition-unique]')).toHaveLength(3);
    expect(root.querySelectorAll('[data-expedition-objective-id]')).toHaveLength(2);
    expect(root.textContent).toContain('Unavailable on this route');
    expect(root.textContent).toContain('ORCHARD TRANSIT DESK');
    expect(root.textContent).toContain('Caretaker testimony');
    expect(root.textContent).not.toContain('Course Gyro');
    panel.dispose();
  });

  it('labels Meridian routes and uses its chapter title while docked', () => {
    const root = document.createElement('section');
    const panel = new ExpeditionUI(root, { close: vi.fn() });
    panel.open({
      phase: 'docked',
      objective: 'Restore Meridian.',
      strength: 1,
      remainingM: 0,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: false,
      expeditionId: 'last-garden-meridian',
      routes: ['meridian-quiet-line', 'meridian-cordon-gap'],
    });
    expect(root.querySelector('[data-expedition-phase]')?.textContent).toBe('Last Garden Meridian');
    expect(root.textContent).toContain('Quiet Line');
    expect(root.textContent).toContain('Cordon Gap');
    panel.dispose();
  });

  it('renders escaped, deduplicated read archive records grouped by chapter', () => {
    const root = document.createElement('section');
    const panel = new ExpeditionUI(root, { close: vi.fn() });
    const base: ExpeditionView = {
      phase: 'docked',
      objective: 'Remember.',
      strength: 1,
      remainingM: 0,
      journalsRead: [],
      uniqueCollected: false,
      playerOnMachine: false,
      expeditionId: 'last-garden-meridian',
      journalArchive: [
        { id: 'old-1', title: 'Old <record>', text: 'A & B', chapter: 'Orchard' },
        { id: 'old-1', title: 'Duplicate', text: 'Should not render', chapter: 'Orchard' },
        { id: 'old-2', title: 'Meridian note', text: 'Signed record', chapter: 'Meridian' },
      ],
    };
    panel.open(base);
    expect(root.querySelectorAll('[data-archive-id="old-1"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-archive-chapter]')).toHaveLength(2);
    expect(root.textContent).toContain('Old <record>');
    expect(root.textContent).not.toContain('Should not render');
    expect(root.querySelector('[data-archive-id="old-1"]')?.innerHTML).toContain('&amp;');
    panel.dispose();
  });
});
