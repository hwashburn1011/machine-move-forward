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
});
