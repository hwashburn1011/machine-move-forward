import { UPGRADES, UPGRADE_IDS, type UpgradeBranch, type UpgradeId } from '@/data/upgrades';

export interface ResearchUIState {
  researched: readonly string[];
  active: Partial<Record<UpgradeBranch, string>>;
  radioPowered: boolean;
  stable: boolean;
  resources: (id: string) => number;
  canResearch?: (id: UpgradeId) => boolean;
  canActivate?: (id: UpgradeId) => boolean;
}

export interface ResearchUICallbacks {
  research: (id: UpgradeId) => void;
  activate: (id: UpgradeId) => void;
  deactivate: (branch: UpgradeBranch) => void;
  close: () => void;
}

/** Research and installation panel. It exposes costs and tradeoffs in text. */
export class ResearchUI {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private renderedKey = '';
  private state: ResearchUIState = {
    researched: [], active: {}, radioPowered: false, stable: false, resources: () => 0,
  };

  constructor(parent: HTMLElement, private readonly callbacks: ResearchUICallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'research-panel';
    this.root.dataset.panel = 'research';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="research-panel-head"><span>Machine Research</span><button type="button" data-research-close>Close</button></div><div class="research-panel-body"></div>';
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.research-panel-body') as HTMLDivElement;
    this.root.addEventListener('click', this.onClick);
  }

  get isOpen(): boolean { return !this.root.hidden; }
  open(state?: ResearchUIState): void { this.root.hidden = false; if (state) this.setState(state); else this.render(); }
  close(): void { this.root.hidden = true; }
  setState(state: ResearchUIState): void {
    this.state = state;
    if (this.isOpen && this.renderedKey !== stateKey(state)) this.render();
  }

  private render(): void {
    const s = this.state;
    const researched = new Set(s.researched);
    const rows = UPGRADE_IDS.map((id) => {
      const d = UPGRADES[id];
      const active = s.active[d.branch] === id;
      const known = researched.has(id);
      const cost = Object.entries(d.researchCost).map(([key, value]) => `${value} ${key} (${s.resources(key)})`).join(' + ');
      const tradeoff = formatModifiers(d.modifiers);
      let reason = '';
      let action: string;
      if (active) {
        // This is the escape hatch from a shed-radio state: the player must be
        // able to remove the active module while stable even when the module
        // itself is what pushed station draw over capacity.
        if (!s.stable) reason = 'Available when machine is stable';
        else if (!s.radioPowered) reason = 'Radio unpowered. Uninstall hardware to restore capacity.';
        action = `<button type="button" data-deactivate-branch="${d.branch}" ${!s.stable ? 'disabled' : ''}>Uninstall</button>`;
      } else {
        if (!s.radioPowered) reason = 'Requires powered radio';
        else if (!s.stable) reason = 'Available when machine is stable';
        else if (!known && s.canResearch && !s.canResearch(id)) reason = `Need ${cost}`;
        action = !known
          ? `<button type="button" data-research-id="${id}" ${reason || !s.radioPowered || !s.stable ? 'disabled' : ''}>Research</button>`
          : `<button type="button" data-activate-id="${id}" ${reason || !s.radioPowered || !s.stable || (s.canActivate && !s.canActivate(id)) ? 'disabled' : ''}>Install</button>`;
      }
      return `<article class="research-row" data-branch="${d.branch}" data-upgrade="${id}">
        <div class="research-name">${escapeHtml(d.name)}</div><div class="research-branch">${d.branch}</div>
        <div class="research-cost">Cost: ${cost}</div><div class="research-effect">${tradeoff}</div>
        <div class="research-action">${action}${reason ? `<span data-research-reason>${escapeHtml(reason)}</span>` : ''}</div>
      </article>`;
    }).join('');
    this.body.innerHTML = `<div data-research-status>${s.radioPowered ? 'Radio powered' : 'Radio unpowered'} · ${s.stable ? 'Stable' : 'Wait for a stable world'} · Scrap ${s.resources('scrap')} · Components ${s.resources('components')}</div>${rows}`;
    this.renderedKey = stateKey(s);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-research-close]')) return this.callbacks.close();
    const research = target.closest<HTMLElement>('[data-research-id]')?.dataset.researchId;
    if (research && UPGRADE_IDS.includes(research as UpgradeId)) return this.callbacks.research(research as UpgradeId);
    const activate = target.closest<HTMLElement>('[data-activate-id]')?.dataset.activateId;
    if (activate && UPGRADE_IDS.includes(activate as UpgradeId)) return this.callbacks.activate(activate as UpgradeId);
    const branch = target.closest<HTMLElement>('[data-deactivate-branch]')?.dataset.deactivateBranch;
    if (branch && ['propulsion', 'power', 'defense'].includes(branch)) this.callbacks.deactivate(branch as UpgradeBranch);
  };

  dispose(): void { this.root.removeEventListener('click', this.onClick); this.root.remove(); }
}

function formatModifiers(modifiers: Record<string, number | undefined>): string {
  const names: Record<string, string> = {
    speedMultiplier: 'max speed', fuelBurnMultiplier: 'fuel burn', effectiveWeightMultiplier: 'payload mass',
    accelerationMultiplier: 'acceleration', generationBonus: 'generation', turretDamageMultiplier: 'turret damage',
    turretRateMultiplier: 'fire rate', turretPowerBonus: 'power draw',
  };
  return Object.entries(modifiers).filter(([, v]) => v !== undefined).map(([key, value]) => {
    const n = value!;
    if (key.endsWith('Multiplier')) {
      const percent = Math.round((n - 1) * 100);
      const shown = `${percent >= 0 ? '+' : ''}${percent}%`;
      return `${shown} ${names[key] ?? key}`;
    }
    const shown = `${n > 0 ? '+' : ''}${n}`;
    return `${shown} ${names[key] ?? key}`;
  }).join(' · ');
}

function stateKey(state: ResearchUIState): string {
  const resources = new Set<string>(['scrap', 'components']);
  for (const id of UPGRADE_IDS) for (const key of Object.keys(UPGRADES[id].researchCost)) resources.add(key);
  return JSON.stringify({
    researched: [...state.researched].sort(),
    active: state.active,
    radioPowered: state.radioPowered,
    stable: state.stable,
    resources: [...resources].sort().map((id) => [id, state.resources(id)]),
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
