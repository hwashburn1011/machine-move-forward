import {
  DEFAULT_UPGRADE_MODIFIERS,
  UPGRADE_IDS,
  UPGRADES,
  type UpgradeBranch,
  type UpgradeDefinition,
  type UpgradeId,
  type UpgradeModifiers,
} from '@/data/upgrades';
import type { ItemCost } from '@/data/items';

export interface UpgradePurse {
  canAfford(cost: ItemCost): boolean;
  consume(cost: ItemCost): boolean;
}

/** Resource adapter name used by Game integration. */
export type ResourceAccess = UpgradePurse;

export interface UpgradeSave {
  researched: UpgradeId[];
  active: Partial<Record<UpgradeBranch, UpgradeId>>;
}

export type ResearchResult =
  | { ok: true; id: UpgradeId }
  | { ok: false; reason: 'unknown' | 'already-researched' | 'cannot-afford' };

export type SetActiveResult =
  | { ok: true; branch: UpgradeBranch; id: UpgradeId | null }
  | { ok: false; reason: 'unknown' | 'not-researched' | 'wrong-branch' };

const BRANCHES: readonly UpgradeBranch[] = ['propulsion', 'power', 'defense'];

/** Permanent research with one free active socket per branch. */
export class UpgradeSystem {
  private readonly researched = new Set<UpgradeId>();
  private readonly activeByBranch = new Map<UpgradeBranch, UpgradeId>();

  constructor(save?: Partial<UpgradeSave>) {
    this.restore(save);
  }

  get researchedIds(): readonly UpgradeId[] {
    return UPGRADE_IDS.filter((id) => this.researched.has(id));
  }

  get activeIds(): readonly UpgradeId[] {
    return BRANCHES.flatMap((branch) => {
      const id = this.activeByBranch.get(branch);
      return id ? [id] : [];
    });
  }

  definition(id: string): UpgradeDefinition | undefined {
    return UPGRADES[id as UpgradeId];
  }

  hasResearched(id: string): boolean {
    return this.researched.has(id as UpgradeId);
  }

  active(branch: UpgradeBranch): UpgradeId | null {
    return this.activeByBranch.get(branch) ?? null;
  }

  isActive(id: string): boolean {
    const def = this.definition(id);
    return !!def && this.activeByBranch.get(def.branch) === def.id;
  }

  canResearch(id: string, purse: UpgradePurse): boolean {
    const def = this.definition(id);
    return !!def && !this.researched.has(def.id) && purse.canAfford(def.researchCost);
  }

  /** Charge exactly once and keep the research permanently. */
  research(id: string, purse: UpgradePurse): ResearchResult {
    const def = this.definition(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.researched.has(def.id)) return { ok: false, reason: 'already-researched' };
    if (!purse.canAfford(def.researchCost) || !purse.consume(def.researchCost))
      return { ok: false, reason: 'cannot-afford' };
    this.researched.add(def.id);
    return { ok: true, id: def.id };
  }

  /** Set a socket after Game validates powered-radio and stable-state rules. */
  setActive(branch: UpgradeBranch, id: UpgradeId | null): SetActiveResult {
    if (!BRANCHES.includes(branch)) return { ok: false, reason: 'unknown' };
    if (id === null) {
      this.activeByBranch.delete(branch);
      return { ok: true, branch, id: null };
    }
    const def = this.definition(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (def.branch !== branch) return { ok: false, reason: 'wrong-branch' };
    if (!this.researched.has(def.id)) return { ok: false, reason: 'not-researched' };
    this.activeByBranch.set(branch, def.id);
    return { ok: true, branch, id: def.id };
  }

  activate(id: string): boolean {
    const def = this.definition(id);
    return !!def && this.setActive(def.branch, def.id).ok;
  }

  swap(id: string): boolean {
    return this.activate(id);
  }

  modifiers(): UpgradeModifiers {
    const out = { ...DEFAULT_UPGRADE_MODIFIERS };
    for (const id of this.activeIds) {
      const modifiers = UPGRADES[id].modifiers;
      for (const key of Object.keys(modifiers) as (keyof UpgradeModifiers)[]) {
        const value = modifiers[key];
        if (value === undefined) continue;
        if (key === 'generationBonus' || key === 'turretPowerBonus') out[key] += value;
        else out[key] *= value;
      }
    }
    return out;
  }

  getModifiers(): UpgradeModifiers {
    return this.modifiers();
  }

  toSave(): UpgradeSave {
    const active: Partial<Record<UpgradeBranch, UpgradeId>> = {};
    for (const branch of BRANCHES) {
      const id = this.activeByBranch.get(branch);
      if (id) active[branch] = id;
    }
    return { researched: [...this.researchedIds], active };
  }

  restore(save?: Partial<UpgradeSave>): void {
    this.researched.clear();
    this.activeByBranch.clear();
    const researched = Array.isArray(save?.researched) ? save.researched : [];
    for (const id of researched) {
      if (typeof id === 'string' && UPGRADE_IDS.includes(id as UpgradeId)) {
        this.researched.add(id as UpgradeId);
      }
    }
    const active = save?.active && typeof save.active === 'object' && !Array.isArray(save.active)
      ? save.active
      : {};
    for (const branch of BRANCHES) {
      const id = active[branch];
      const def = typeof id === 'string' ? UPGRADES[id as UpgradeId] : undefined;
      if (!def || def.branch !== branch || !this.researched.has(def.id)) continue;
      this.activeByBranch.set(branch, def.id);
    }
  }
}
