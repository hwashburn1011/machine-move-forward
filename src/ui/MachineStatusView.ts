import type { SubsystemId } from '@/data/subsystems';
import type { RecoveryHint, RecoveryTopic } from '@/game/RecoveryGuide';

export interface MachineStatusSnapshot {
  fuel: { current: number; capacity: number; crawling?: boolean };
  power: { capacity: number; demand: number; shed: readonly string[] };
  condition: readonly { id: SubsystemId; fraction: number; failed?: boolean }[];
  serviceDecks: readonly {
    name: string;
    subsystem: SubsystemId;
    repairScrap: number;
    repairMaterials?: readonly { name: string; count: number }[];
    available?: boolean;
  }[];
  recovery?: readonly RecoveryHint[];
  controlsHint?: string;
  weather?: { label: string; detail: string };
}

/** Readonly presentation of maintenance state. It deliberately has no repair controls. */
export class MachineStatusView {
  readonly root: HTMLDivElement;
  private signature = '';
  private readonly dismissRecovery?: (topic: RecoveryTopic) => void;
  private readonly onRecoveryClick = (event: Event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-recovery-dismiss]')
        : null;
    const topic = button?.dataset.recoveryDismiss as RecoveryTopic | undefined;
    if (topic) this.dismissRecovery?.(topic);
  };
  constructor(
    parent: HTMLElement,
    callbacks: { dismissRecovery?: (topic: RecoveryTopic) => void } = {},
  ) {
    this.root = document.createElement('div');
    this.root.className = 'machine-status-view';
    this.dismissRecovery = callbacks.dismissRecovery;
    this.root.addEventListener('click', this.onRecoveryClick);
    (parent.querySelector('.hud-machine-stack') ?? parent).appendChild(this.root);
  }
  update(snapshot: MachineStatusSnapshot): void {
    const display = normalizeSnapshot(snapshot);
    const sig = JSON.stringify(display);
    if (sig === this.signature) return;
    this.signature = sig;
    snapshot = display;
    const fuelPct =
      snapshot.fuel.capacity > 0
        ? Math.round((snapshot.fuel.current / snapshot.fuel.capacity) * 100)
        : 0;
    const power =
      snapshot.power.capacity > 0 ? `${snapshot.power.demand}/${snapshot.power.capacity}` : 'OFF';
    const issues = snapshot.condition
      .filter((s) => s.fraction < 1)
      .map((s) => `${subsystemName(s.id)}:${Math.floor(s.fraction * 100)}%`);
    const attention =
      issues.length > 0 ||
      snapshot.fuel.crawling === true ||
      snapshot.power.shed.length > 0 ||
      (snapshot.recovery ?? []).some((hint) => hint.severity !== 'info');
    this.root.classList.toggle('is-attention', attention);
    const shed = snapshot.power.shed.length
      ? `Shed: ${snapshot.power.shed.join(', ')}`
      : 'No devices shed';
    const decks = snapshot.serviceDecks
      .map((d) => {
        const materials =
          d.repairMaterials?.map((m) => `${m.count} ${m.name}`).join(', ') ??
          `${d.repairScrap} scrap`;
        return `<li class="machine-service${d.available === false ? ' is-unavailable' : ''}"><span>${d.name}</span> · ${subsystemName(d.subsystem)} · ${materials}</li>`;
      })
      .join('');
    const details = this.root.querySelector('[data-service-details]') as HTMLDetailsElement | null;
    const recoveryDetails = this.root.querySelector(
      '[data-recovery-details]',
    ) as HTMLDetailsElement | null;
    const wasOpen = details?.open ?? false;
    const recoveryWasOpen = recoveryDetails?.open ?? false;
    const focused =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? document.activeElement.dataset.focusKey
        : undefined;
    this.root.innerHTML = `<div class="machine-status-title">Machine status</div><div class="machine-status-row"><span>Fuel</span><span>${snapshot.fuel.current}/${snapshot.fuel.capacity} · ${fuelPct}%${snapshot.fuel.crawling ? ' · CRAWL' : ''}</span></div><div class="machine-status-row"><span>Power</span><span>${power}</span></div><div class="machine-status-note">${shed}</div><div class="machine-status-condition${issues.length ? ' is-damaged' : ''}">${issues.length ? issues.join(' · ') : 'All subsystems sound'}</div><details data-service-details><summary data-focus-key="service-summary">Service decks</summary><ul>${decks || '<li>No repairs needed</li>'}</ul></details>`;
    const nextDetails = this.root.querySelector(
      '[data-service-details]',
    ) as HTMLDetailsElement | null;
    if (nextDetails) nextDetails.open = wasOpen;
    if (snapshot.weather) {
      const weather = document.createElement('p');
      weather.dataset.weatherStatus = '';
      weather.textContent = `${snapshot.weather.label} · ${snapshot.weather.detail}`;
      this.root.append(weather);
    }
    this.renderRecovery(snapshot.recovery ?? [], snapshot.controlsHint, recoveryWasOpen);
    if (focused)
      (this.root.querySelector(`[data-focus-key="${focused}"]`) as HTMLElement | null)?.focus();
  }
  dispose(): void {
    this.root.removeEventListener('click', this.onRecoveryClick);
    this.root.remove();
  }

  private renderRecovery(
    hints: readonly RecoveryHint[],
    controlsHint: string | undefined,
    wasOpen: boolean,
  ): void {
    if (hints.length === 0 && !controlsHint) return;
    const details = document.createElement('details');
    details.dataset.recoveryDetails = '';
    const priority = { blocked: 0, warning: 1, info: 2 } as const;
    const highest = [...hints].sort((a, b) => priority[a.severity] - priority[b.severity])[0];
    const summary = document.createElement('summary');
    summary.dataset.focusKey = 'recovery-summary';
    summary.textContent = highest ? `Care & forecasts · ${highest.title}` : 'Care & forecasts';
    details.append(summary);
    const list = document.createElement('div');
    list.className = 'machine-recovery-details';
    for (const hint of hints) {
      const card = document.createElement('article');
      card.className = `machine-recovery-card is-${hint.severity}`;
      const title = document.createElement('strong');
      title.textContent = hint.title;
      const detail = document.createElement('p');
      detail.textContent = hint.detail;
      card.append(title, detail);
      if (hint.metric) {
        const metric = document.createElement('span');
        metric.className = 'machine-recovery-metric';
        metric.textContent = hint.metric;
        card.append(metric);
      }
      if (hint.severity !== 'blocked' && this.dismissRecovery) {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.dataset.recoveryDismiss = hint.topic;
        dismiss.textContent = 'Dismiss';
        card.append(dismiss);
      }
      list.append(card);
    }
    if (controlsHint) {
      const controls = document.createElement('p');
      controls.className = 'machine-recovery-controls';
      controls.textContent = controlsHint;
      list.append(controls);
    }
    details.append(list);
    details.open = wasOpen;
    this.root.append(details);
  }
}

function normalizeSnapshot(snapshot: MachineStatusSnapshot): MachineStatusSnapshot {
  const oneDecimal = (value: number) => Math.round(value * 10) / 10;
  return {
    fuel: {
      current: oneDecimal(snapshot.fuel.current),
      capacity: oneDecimal(snapshot.fuel.capacity),
      crawling: snapshot.fuel.crawling,
    },
    power: {
      capacity: oneDecimal(snapshot.power.capacity),
      demand: oneDecimal(snapshot.power.demand),
      shed: [...snapshot.power.shed],
    },
    condition: snapshot.condition.map((s) => ({
      ...s,
      fraction: Math.round(s.fraction * 100) / 100,
    })),
    serviceDecks: snapshot.serviceDecks.map((d) => ({
      ...d,
      repairMaterials: d.repairMaterials?.map((m) => ({ ...m, count: Math.round(m.count) })),
    })),
    recovery: snapshot.recovery?.map((hint) => ({ ...hint })),
    controlsHint: snapshot.controlsHint,
    weather: snapshot.weather,
  };
}

const SUBSYSTEM_NAMES: Record<string, string> = {
  engine: 'Engine',
  legs: 'Legs',
  hull: 'Hull',
  fuel: 'Fuel system',
  power: 'Power system',
  mobility: 'Mobility',
};
function subsystemName(id: SubsystemId): string {
  return SUBSYSTEM_NAMES[id] ?? id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
