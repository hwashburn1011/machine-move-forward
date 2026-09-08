import { TURRET_BLUEPRINT_ID } from '@/data/turrets';
import type { UnlockId } from '@/data/automation';
import { UpgradeSystem, type UpgradeSave } from './UpgradeSystem';
import { EarlyRadioDrop, type RadioSave } from './EarlyRadioDrop';

export interface ProgressionSave {
  unlocks: string[];
  turretBlueprintProgress: number;
  upgrades?: UpgradeSave;
  radio?: RadioSave;
  /** Read old saves written by the pre-contract ledger. */
  radioDrop?: RadioSave;
}

export interface ProgressionSnapshot {
  unlocks: readonly string[];
  turretBlueprintProgress: number;
  turretBlueprintReady: boolean;
}

/**
 * Small, deterministic unlock ledger. The first completed hostile encounter
 * always awards the manual turret blueprint; progress is also tracked so the
 * HUD can show why it has not arrived yet and saves never lose partial work.
 */
export class Progression {
  private readonly unlocked = new Set<string>();
  private turretProgress = 0;
  readonly upgrades = new UpgradeSystem();
  readonly earlyRadioDrop = new EarlyRadioDrop();

  constructor(save?: Partial<ProgressionSave>) {
    this.restore(save);
  }

  restore(save?: Partial<ProgressionSave>): void {
    this.unlocked.clear();
    for (const id of save?.unlocks ?? []) this.unlocked.add(id);
    this.turretProgress = Math.max(0, Math.min(1, save?.turretBlueprintProgress ?? 0));
    if (this.unlocked.has(TURRET_BLUEPRINT_ID)) this.turretProgress = 1;
    this.upgrades.restore(save?.upgrades);
    this.earlyRadioDrop.restore(save?.radio ?? save?.radioDrop);
  }

  get turretBlueprintReady(): boolean {
    return this.unlocked.has(TURRET_BLUEPRINT_ID);
  }

  get automaticSalvageCollectorReady(): boolean {
    return this.has('automatic-salvage-collector');
  }
  get automaticDefenseTurretReady(): boolean {
    return this.has('automatic-defense-turret');
  }

  /** Grants a specialist blueprint exactly once and emits no side effects. */
  grantBlueprint(id: UnlockId): boolean {
    return this.grant(id);
  }

  has(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Shared integration contract: true only on the first grant. */
  grant(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    if (id === TURRET_BLUEPRINT_ID) this.turretProgress = 1;
    return true;
  }

  get snapshot(): ProgressionSnapshot {
    return {
      unlocks: [...this.unlocked],
      turretBlueprintProgress: this.turretProgress,
      turretBlueprintReady: this.turretBlueprintReady,
    };
  }

  /** Add progress from a meaningful milestone. Returns true on the unlock edge. */
  addTurretBlueprintProgress(amount: number): boolean {
    if (this.turretBlueprintReady) return false;
    this.turretProgress = Math.max(0, Math.min(1, this.turretProgress + Math.max(0, amount)));
    if (this.turretProgress < 1) return false;
    return this.grant(TURRET_BLUEPRINT_ID);
  }

  /** The first successfully collected salvage crate is the guaranteed reward. */
  recordSalvageCollected(): boolean {
    return this.grant(TURRET_BLUEPRINT_ID);
  }

  toSave(): ProgressionSave {
    return {
      unlocks: [...this.unlocked],
      turretBlueprintProgress: this.turretProgress,
      upgrades: this.upgrades.toSave(),
      radio: this.earlyRadioDrop.toSave(),
    };
  }
}
