export type RadioStatus = 'unarmed' | 'pending' | 'found';

export interface RadioSave {
  status: RadioStatus;
  armedAtSimTime: number | null;
  foundAtSimTime: number | null;
  foundAtDistance: number | null;
  eligibleChestsOpened: number;
}

/** Compatibility name for the additive save schema used by older callers. */
export type EarlyRadioDropSave = RadioSave;

export type RadioAward =
  | { granted: true; cache: { scrap: 12; fuel: 4 } }
  | { granted: false };

/** Pure, monotonic guarantee for the first eligible salvage chest. */
export class EarlyRadioDrop {
  private status: RadioStatus = 'unarmed';
  private armedAt: number | null = null;
  private foundAtTime: number | null = null;
  private foundAt: number | null = null;
  private opened = 0;

  get radioFound(): boolean {
    return this.status === 'found';
  }

  get isPending(): boolean {
    return this.status === 'pending';
  }

  get statusValue(): RadioStatus {
    return this.status;
  }

  get foundAtDistance(): number | null {
    return this.foundAt;
  }

  get eligibleChestsOpened(): number {
    return this.opened;
  }

  /** Arm once when the opening reaches playable deck time. */
  arm(simTime: number): boolean {
    if (this.status !== 'unarmed') return false;
    this.status = 'pending';
    this.armedAt = finiteNonNegative(simTime);
    return true;
  }

  /** Award exactly once; missed or ignored crates never change the ledger. */
  onSalvageChestOpened(simTime: number, distance: number): RadioAward {
    if (this.status !== 'pending') return { granted: false };
    this.opened++;
    this.status = 'found';
    this.foundAtTime = finiteNonNegative(simTime);
    this.foundAt = finiteNonNegative(distance);
    return { granted: true, cache: { scrap: 12, fuel: 4 } };
  }

  toSave(): RadioSave {
    return {
      status: this.status,
      armedAtSimTime: this.armedAt,
      foundAtSimTime: this.foundAtTime,
      foundAtDistance: this.foundAt,
      eligibleChestsOpened: this.opened,
    };
  }

  restore(save?: Partial<RadioSave>): void {
    if (!save) {
      this.status = 'pending';
      this.armedAt = null;
      this.foundAtTime = null;
      this.foundAt = null;
      this.opened = 0;
      return;
    }
    const status = save.status;
    this.status = status === 'found' || status === 'pending' ? status : 'unarmed';
    this.armedAt = finiteNullable(save.armedAtSimTime);
    this.foundAtTime = finiteNullable(save.foundAtSimTime);
    this.foundAt = finiteNullable(save.foundAtDistance);
    this.opened = Number.isFinite(save.eligibleChestsOpened)
      ? Math.max(0, Math.floor(save.eligibleChestsOpened as number))
      : 0;
    if (this.status === 'found') this.opened = Math.max(1, this.opened);
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteNullable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}
