import type { SubsystemId } from '@/data/subsystems';

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
}

/** Readonly presentation of maintenance state. It deliberately has no repair controls. */
export class MachineStatusView {
  readonly root: HTMLDivElement;
  private signature = '';
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'machine-status-view';
    parent.appendChild(this.root);
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
    const details = this.root.querySelector('details') as HTMLDetailsElement | null;
    const wasOpen = details?.open ?? false;
    const focused =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? document.activeElement.dataset.focusKey
        : undefined;
    this.root.innerHTML = `<div class="machine-status-title">Machine status</div><div class="machine-status-row"><span>Fuel</span><span>${snapshot.fuel.current}/${snapshot.fuel.capacity} · ${fuelPct}%${snapshot.fuel.crawling ? ' · CRAWL' : ''}</span></div><div class="machine-status-row"><span>Power</span><span>${power}</span></div><div class="machine-status-note">${shed}</div><div class="machine-status-condition${issues.length ? ' is-damaged' : ''}">${issues.length ? issues.join(' · ') : 'All subsystems sound'}</div><details><summary data-focus-key="service-summary">Service decks</summary><ul>${decks || '<li>No repairs needed</li>'}</ul></details>`;
    const nextDetails = this.root.querySelector('details') as HTMLDetailsElement | null;
    if (nextDetails) nextDetails.open = wasOpen;
    if (focused)
      (this.root.querySelector(`[data-focus-key="${focused}"]`) as HTMLElement | null)?.focus();
  }
  dispose(): void {
    this.root.remove();
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
