import { hashSeed, Rng } from '@/core/math/Random';

export type RaidObjective = 'assault' | 'sabotage' | 'theft';
export type RaidCargoItem = 'scrap' | 'components' | 'fuel';
export interface RaidCargo {
  itemId: RaidCargoItem;
  count: number;
}
export interface RaidObjectiveSnapshot {
  objective: RaidObjective;
  carrierId: string;
  targetId: string;
  entry: { x: number; y: number; z: number };
  state: 'intent' | 'carrying' | 'escaped' | 'recovered' | 'cancelled';
  cargo: RaidCargo | null;
}
export interface RaidObjectiveSave {
  active?: RaidObjectiveSnapshot;
  recovered?: RaidCargo[];
}
/** Must remove cargo atomically and return null when the source cannot supply a bounded stack. */
export type PickupSource = (sourceId: string) => RaidCargo | null;
export type RecoverySink = (cargo: RaidCargo) => RaidCargo | null;
type EntryPoint = { x: number; y: number; z: number };

export function pickRaidObjective(seed: number | string, wave: number): RaidObjective {
  if (!Number.isSafeInteger(wave) || wave <= 0) return 'assault';
  if (wave === 1) return 'assault';
  const bag: RaidObjective[] = ['assault', 'sabotage', 'theft'];
  const offset = wave - 2;
  const rng = new Rng(hashSeed(seed, 'raid-objectives', Math.floor(offset / 3)));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag[offset % bag.length]!;
}

export class RaidObjectiveController {
  private active: RaidObjectiveSnapshot | null = null;
  private recovered: RaidCargo[] = [];
  get snapshot(): RaidObjectiveSnapshot | null {
    return this.active ? cloneSnapshot(this.active) : null;
  }
  get recoveredLedger(): readonly RaidCargo[] {
    return this.recovered.map((c) => ({ ...c }));
  }
  get recoveredCount(): number {
    return this.recovered.reduce((sum, cargo) => sum + cargo.count, 0);
  }
  assign(
    objective: RaidObjective,
    carrierId: string,
    targetId: string,
    entry: EntryPoint,
  ): boolean {
    if (this.active && !['escaped', 'recovered', 'cancelled'].includes(this.active.state))
      return false;
    if (
      !isObjective(objective) ||
      !carrierId ||
      !targetId ||
      !entry ||
      !Number.isFinite(entry.x) ||
      !Number.isFinite(entry.y) ||
      !Number.isFinite(entry.z)
    )
      return false;
    this.active = {
      objective,
      carrierId,
      targetId,
      entry: { ...entry },
      state: 'intent',
      cargo: null,
    };
    return true;
  }
  pickup(sourceId: string, source: PickupSource): RaidCargo | null {
    if (
      !this.active ||
      this.active.state !== 'intent' ||
      !sourceId ||
      sourceId !== this.active.targetId
    )
      return null;
    const cargo = source(sourceId);
    if (!validCargo(cargo)) return null;
    this.active.cargo = { ...cargo };
    this.active.state = 'carrying';
    return { ...cargo };
  }
  takeCargoOnKill(enemyId: string, sink?: RecoverySink): RaidCargo | null {
    if (
      !this.active ||
      this.active.carrierId !== enemyId ||
      this.active.state !== 'carrying' ||
      !this.active.cargo
    )
      return null;
    const cargo = { ...this.active.cargo };
    this.active.state = 'recovered';
    this.active.cargo = null;
    // A sink returns only what it could not accept. A null result means the
    // whole cargo was recovered successfully; with no sink, retain it here.
    const leftover = sink ? sink(cargo) : cargo;
    if (leftover && leftover.count > 0) this.recovered.push({ ...leftover });
    return cargo;
  }
  escape(enemyId: string): RaidCargo | null {
    if (!this.active || this.active.carrierId !== enemyId || this.active.state !== 'carrying')
      return null;
    const cargo = this.active.cargo ? { ...this.active.cargo } : null;
    this.active.state = 'escaped';
    this.active.cargo = null;
    return cargo;
  }
  reset(): void {
    this.active = null;
  }
  /** Collect recovered leftovers; the sink returns only an unaccepted remainder. */
  collectRecovered(sink: RecoverySink): RaidCargo[] {
    const accepted: RaidCargo[] = [];
    const remainder: RaidCargo[] = [];
    for (const cargo of this.recovered) {
      const leftover = sink({ ...cargo });
      if (
        leftover &&
        validCargo(leftover) &&
        leftover.itemId === cargo.itemId &&
        leftover.count <= cargo.count
      ) {
        remainder.push({ ...leftover });
        const moved = cargo.count - leftover.count;
        if (moved > 0) accepted.push({ itemId: cargo.itemId, count: moved });
      } else if (leftover) {
        // Invalid sink output cannot be treated as accepted: preserve source.
        remainder.push({ ...cargo });
      } else accepted.push({ ...cargo });
    }
    this.recovered = remainder;
    return accepted;
  }
  // Active encounters are runtime-only. Persist only durable recovered cargo.
  toSave(): RaidObjectiveSave {
    return { recovered: this.recovered.map((c) => ({ ...c })) };
  }
  restore(save?: Partial<RaidObjectiveSave>): void {
    this.active = null;
    this.recovered = Array.isArray(save?.recovered)
      ? save!.recovered.filter(validCargo).map((c) => ({ ...c }))
      : [];
  }
}

function validCargo(cargo: RaidCargo | null): cargo is RaidCargo {
  return (
    !!cargo &&
    ['scrap', 'components', 'fuel'].includes(cargo.itemId) &&
    Number.isSafeInteger(cargo.count) &&
    cargo.count > 0 &&
    cargo.count <=
      ({ scrap: 6, components: 2, fuel: 2 } as Record<RaidCargoItem, number>)[cargo.itemId]
  );
}
function isObjective(value: unknown): value is RaidObjective {
  return value === 'assault' || value === 'sabotage' || value === 'theft';
}
function cloneSnapshot(snapshot: RaidObjectiveSnapshot): RaidObjectiveSnapshot {
  return {
    ...snapshot,
    entry: { ...snapshot.entry },
    cargo: snapshot.cargo ? { ...snapshot.cargo } : null,
  };
}
