import './helm.css';

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export interface HelmMarker {
  id: string;
  label: string;
  forwardM: number;
  lateralM: number;
  kind: 'story' | 'salvage';
  state?: string;
}
export interface HelmView {
  tier: 0 | 1 | 2 | 3;
  bearingDeg: number;
  desiredDeg: number;
  throttle: number;
  powered: boolean;
  locked: boolean;
  refusal?: string | null;
  markers?: readonly HelmMarker[];
  objective: string;
  fuel?: number;
  fuelPerMinute?: number;
  opportunity?: {
    id: string;
    title: string;
    description: string;
    hazard: string;
    remainingM: number;
    bearingDeg: number;
    estimatedFuel: number;
    state: string;
    refusal?: string;
    canCommit: boolean;
  };
}
export interface HelmCallbacks {
  close(): void;
  setBearing(degrees: number): void;
  setThrottle(value: number): void;
  openLog?(): void;
  plotContact?(id: string): void;
  cancelApproach?(): void;
}
const limits = { 0: 0, 1: 12, 2: 28, 3: 45 };
const fmt = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}°`;

/** Live updates retain controls, focus and pointer capture while dragging. */
export class HelmUI {
  private readonly callbacks: HelmCallbacks;
  private readonly bearing: HTMLInputElement;
  private readonly throttle: HTMLInputElement;
  private markersKey = '';

  constructor(
    private readonly root: HTMLElement,
    callbacks: HelmCallbacks,
  ) {
    this.callbacks = callbacks;
    root.classList.add('helm');
    root.dataset.panel = 'helm';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Navigation helm');
    root.innerHTML = `<header><div><span class="helm-kicker">IRON NOMAD / COURSE CONTROL</span><h2>Navigation helm</h2></div><button type="button" data-testid="helm-close" aria-label="Close helm">×</button></header>
      <p data-testid="helm-objective"></p><p class="helm-status" data-testid="helm-status" role="status"></p>
      <label><span data-bearing-label></span><input aria-label="Desired bearing" type="range" step="0.1" data-testid="helm-bearing"></label>
      <div class="helm-steer"><button type="button" data-steer="-1">Port</button><button type="button" data-steer="0">Straight ahead</button><button type="button" data-steer="1">Starboard</button></div>
      <label><span data-throttle-label></span><input aria-label="Engine throttle" type="range" min=".35" max="1" step=".01" data-testid="helm-throttle"></label>
      <p class="helm-fuel"></p><div class="helm-chart" data-testid="helm-chart"><span class="helm-axis">AHEAD · 1 KM</span><span class="helm-ownship">▲ NOMAD</span></div>
      <div class="helm-contacts"></div><footer>Positive bearing moves starboard. Course holds when you leave the helm.<button type="button" data-log>Expedition journal</button></footer>`;
    this.bearing = this.get('[data-testid="helm-bearing"]');
    this.throttle = this.get('[data-testid="helm-throttle"]');
    this.bearing.addEventListener('input', () => callbacks.setBearing(Number(this.bearing.value)));
    this.throttle.addEventListener('input', () =>
      callbacks.setThrottle(Number(this.throttle.value)),
    );
    this.get('[data-testid="helm-close"]').addEventListener('click', () => callbacks.close());
    const log = this.get<HTMLButtonElement>('[data-log]');
    log.hidden = !callbacks.openLog;
    log.addEventListener('click', () => callbacks.openLog?.());
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-steer]'))
      button.addEventListener('click', () => {
        if (!button.disabled)
          callbacks.setBearing(Number(button.dataset.steer) * Number(this.bearing.max));
      });
  }
  private get<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector(selector) as T;
  }
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(view: HelmView): void {
    this.root.hidden = false;
    this.render(view);
  }
  close(): void {
    this.root.hidden = true;
  }
  render(view: HelmView): void {
    const limit = limits[view.tier];
    const disabled = view.locked || !view.powered || view.tier < 1 || !!view.refusal;
    this.get('[data-testid="helm-objective"]').textContent = view.objective;
    this.get('[data-testid="helm-status"]').textContent =
      view.refusal ||
      (view.locked
        ? 'Automatic approach guidance has control until departure.'
        : view.tier < 1
          ? 'Recover the Quiet Array course actuator to unlock steering.'
          : view.powered
            ? 'Course actuator online.'
            : 'Helm unpowered. Automatic course is holding.');
    this.get('[data-bearing-label]').textContent =
      `Bearing ${fmt(view.bearingDeg)} · target ${fmt(view.desiredDeg)} · limit ±${limit}°`;
    this.bearing.min = String(-limit);
    this.bearing.max = String(limit);
    if (document.activeElement !== this.bearing) this.bearing.value = String(view.desiredDeg);
    this.bearing.disabled = disabled;
    this.get('[data-throttle-label]').textContent =
      `Engine throttle ${Math.round(view.throttle * 100)}%`;
    if (document.activeElement !== this.throttle) this.throttle.value = String(view.throttle);
    this.throttle.disabled = disabled;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-steer]'))
      button.disabled = disabled;
    this.get('.helm-fuel').textContent =
      view.fuel === undefined
        ? ''
        : `Fuel ${view.fuel.toFixed(1)} · generator use ${(view.fuelPerMinute ?? 0).toFixed(1)}/min. Slower travel gives more time to salvage.`;
    const markers = (view.markers ?? []).filter(
      (m) => Number.isFinite(m.forwardM) && Number.isFinite(m.lateralM),
    );
    const key = JSON.stringify([
      markers.map((m) => [m.id, m.label, Math.round(m.forwardM), Math.round(m.lateralM), m.state]),
      view.opportunity && [
        view.opportunity.id,
        view.opportunity.state,
        Math.round(view.opportunity.remainingM),
        Math.round(view.opportunity.bearingDeg),
        view.opportunity.canCommit,
        view.opportunity.refusal,
      ],
    ]);
    if (key !== this.markersKey) {
      this.markersKey = key;
      const chart = this.get('[data-testid="helm-chart"]'),
        contacts = this.get('.helm-contacts');
      chart.querySelectorAll('.helm-marker').forEach((n) => n.remove());
      contacts.replaceChildren();
      for (const marker of markers) {
        const item = document.createElement('span');
        item.className = `helm-marker helm-${marker.kind}`;
        item.dataset.markerId = marker.id;
        item.style.left = `${Math.max(4, Math.min(96, 50 + marker.lateralM / 2))}%`;
        item.style.bottom = `${Math.max(12, Math.min(86, 12 + (marker.forwardM / 1000) * 74))}%`;
        item.textContent = marker.kind === 'story' ? '◆' : '◇';
        item.title = marker.label;
        chart.append(item);
        const row = document.createElement('p');
        row.textContent = `${marker.label} · ${Math.round(Math.abs(marker.forwardM))} m ${marker.forwardM < 0 ? 'astern' : 'ahead'} · ${Math.round(Math.abs(marker.lateralM))} m ${marker.lateralM < 0 ? 'port' : 'starboard'}${marker.state ? ' · ' + marker.state : ''}`;
        contacts.append(row);
      }
      if (!markers.length)
        contacts.textContent = 'No nearby contacts. New salvage will appear as the Nomad travels.';
      if (view.opportunity) {
        const o = view.opportunity;
        const card = document.createElement('article');
        card.className = 'helm-opportunity';
        card.dataset.testid = 'helm-opportunity';
        card.innerHTML = `<h3>${escapeHtml(o.title)}</h3><p>${escapeHtml(o.description)}</p><p>${escapeHtml(o.state)} · ${fmt(o.bearingDeg)} · ${Math.round(o.remainingM)} m · fuel ${Math.round(o.estimatedFuel)} units · hazard ${escapeHtml(o.hazard)}</p><p class="helm-window">This opportunity can be missed if the course window closes.</p>`;
        if (o.state === 'available') {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Plot approach';
          button.disabled = !o.canCommit;
          button.dataset.testid = 'helm-plot-contact';
          button.addEventListener('click', () => {
            if (o.canCommit) this.callbacks.plotContact?.(o.id);
          });
          card.append(button);
        } else if (o.state === 'plotted') {
          const state = document.createElement('strong');
          state.textContent =
            o.state === 'plotted'
              ? 'Approach plotted'
              : 'Cross gangway to recover supplies / return aboard to depart';
          card.append(state);
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.textContent = 'Cancel approach';
          cancel.dataset.testid = 'helm-cancel-approach';
          cancel.addEventListener('click', () => this.callbacks.cancelApproach?.());
          card.append(cancel);
        } else {
          const state = document.createElement('strong');
          state.textContent = 'Cross gangway to recover supplies / return aboard to depart';
          card.append(state);
        }
        if (o.refusal) {
          const refusal = document.createElement('p');
          refusal.textContent = o.refusal;
          card.append(refusal);
        }
        contacts.append(card);
      }
    }
    this.root.dataset.tier = String(view.tier);
    this.root.dataset.locked = String(view.locked);
  }
  destroy(): void {
    this.root.replaceChildren();
    this.root.classList.remove('helm');
  }
  dispose(): void {
    this.destroy();
    this.root.remove();
  }
}
