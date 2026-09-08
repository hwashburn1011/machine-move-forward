import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';

export interface SubsystemSave {
  id: string;
  health: number;
}

/**
 * How broken each part of the machine is, and what that costs.
 *
 * Pure: plain numbers in, plain numbers out, no Three.js and no Rapier, like
 * `BuildValidation` and `stepEnemyAI`. The effects are read off this by
 * whoever needs them rather than pushed out through the event bus, because
 * they are continuous — every frame wants the current value, not a
 * notification that it changed.
 *
 * Effects scale CONTINUOUSLY rather than tripping at thresholds, so a player
 * reads the machine's condition off how it moves before they read it off the
 * HUD. That is the whole reason to have five numbers rather than one.
 */
export class MachineDamage {
  private readonly hp = new Map<SubsystemId, number>();

  constructor() {
    this.reset();
  }

  reset(): void {
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      this.hp.set(id, SUBSYSTEMS[id].maxHealth);
    }
  }

  health(id: SubsystemId): number {
    return this.hp.get(id) ?? SUBSYSTEMS[id].maxHealth;
  }

  /** 0 at destroyed, 1 at whole. */
  fraction(id: SubsystemId): number {
    return this.health(id) / SUBSYSTEMS[id].maxHealth;
  }

  /** Apply a hit. Returns the damage that actually landed, after armour. */
  damage(id: SubsystemId, amount: number): number {
    const dealt = Math.max(0, amount - SUBSYSTEMS[id].armor);
    if (dealt === 0) return 0;
    this.hp.set(id, Math.max(0, this.health(id) - dealt));
    return dealt;
  }

  repair(id: SubsystemId, amount: number): void {
    this.hp.set(id, Math.min(SUBSYSTEMS[id].maxHealth, this.health(id) + Math.max(0, amount)));
  }

  /**
   * The multiplier `MachineMovement` has carried since it was written and
   * nothing has ever set.
   */
  get enginePower(): number {
    return this.fraction('engine');
  }

  /**
   * The failure state, and deliberately not a loss condition: a stopped
   * machine is repaired and driven on, never reloaded. Scrap keeps arriving
   * on the enemies still coming, so being stranded is always recoverable.
   */
  get isStopped(): boolean {
    return this.health('engine') <= 0;
  }

  /**
   * Speed lost to the legs, separately from the engine.
   *
   * Floored well above zero: four wrecked legs should be a crawl the player
   * hates, not a second way to be stranded. The engine is the only halt.
   */
  get speedScale(): number {
    const legs: SubsystemId[] = [
      'leg-front-left',
      'leg-front-right',
      'leg-rear-left',
      'leg-rear-right',
    ];
    const mean = legs.reduce((sum, id) => sum + this.fraction(id), 0) / legs.length;
    return 0.4 + 0.6 * mean;
  }

  /**
   * How far the hull lists, in radians. POSITIVE is to port.
   *
   * The sign is the gait's, not a fresh convention: `gaitPose` records that
   * "positive roll raises starboard", so a machine settling onto a hurt port
   * leg wants a positive term. Added to `pose.roll`, which is why it has to
   * agree with it — the opposite sign would list away from the broken leg,
   * which is the one reading a player would immediately call a bug.
   *
   * Feeds the lean the gait already applies, so this needs a term rather than
   * a system. Symmetric damage cancels: a machine hurt evenly sits level and
   * merely slow, which is the correct reading.
   */
  get lean(): number {
    const port = (this.fraction('leg-front-left') + this.fraction('leg-rear-left')) / 2;
    const starboard = (this.fraction('leg-front-right') + this.fraction('leg-rear-right')) / 2;
    return (starboard - port) * 0.12;
  }

  /** Everything below full health, worst first. For the HUD. */
  damaged(): { id: SubsystemId; fraction: number }[] {
    return (Object.keys(SUBSYSTEMS) as SubsystemId[])
      .map((id) => ({ id, fraction: this.fraction(id) }))
      .filter((entry) => entry.fraction < 1)
      .sort((a, b) => a.fraction - b.fraction || a.id.localeCompare(b.id));
  }

  toSave(): SubsystemSave[] {
    return (Object.keys(SUBSYSTEMS) as SubsystemId[]).map((id) => ({
      id,
      health: this.health(id),
    }));
  }

  /**
   * Absent means undamaged, which is what every save written before this
   * milestone means. An unrecognised id is skipped rather than thrown on: a
   * save from a build with a sixth subsystem must still load.
   */
  restore(saved: readonly SubsystemSave[] | undefined): void {
    this.reset();
    if (!saved) return;
    for (const entry of saved) {
      if (!(entry.id in SUBSYSTEMS)) continue;
      const id = entry.id as SubsystemId;
      const clamped = Math.max(0, Math.min(SUBSYSTEMS[id].maxHealth, entry.health));
      this.hp.set(id, clamped);
    }
  }
}
