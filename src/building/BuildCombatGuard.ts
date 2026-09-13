export type ThreatSource =
  | 'hostile-aboard'
  | 'approach-attack'
  | 'grapple'
  | 'projectile'
  | 'player-damage'
  | 'construction-damage'
  | 'machine-damage';
export interface ThreatProjection {
  sources: readonly ThreatSource[];
  hostileActors?: number;
  restoredEncounterActive?: boolean;
}
export interface ThreatSnapshot {
  active: boolean;
  clearSeconds: number;
  sources: readonly ThreatSource[];
  reason?: ThreatSource;
}
export class BuildCombatGuard {
  static readonly CLEAR_REQUIRED_SECONDS = 2;
  private clearSeconds = BuildCombatGuard.CLEAR_REQUIRED_SECONDS;
  private snapshot: ThreatSnapshot = {
    active: false,
    clearSeconds: BuildCombatGuard.CLEAR_REQUIRED_SECONDS,
    sources: [],
  };
  update(dtSeconds: number, projection: ThreatProjection): ThreatSnapshot {
    const sources = [...new Set(projection.sources)];
    const active =
      sources.length > 0 ||
      (projection.hostileActors ?? 0) > 0 ||
      !!projection.restoredEncounterActive;
    this.clearSeconds = active
      ? 0
      : Math.min(
          BuildCombatGuard.CLEAR_REQUIRED_SECONDS,
          this.clearSeconds + Math.max(0, dtSeconds),
        );
    this.snapshot = { active, clearSeconds: this.clearSeconds, sources, reason: sources[0] };
    return this.snapshot;
  }
  get current(): ThreatSnapshot {
    return { ...this.snapshot, sources: [...this.snapshot.sources] };
  }
  canEnter(): boolean {
    return !this.snapshot.active && this.clearSeconds >= BuildCombatGuard.CLEAR_REQUIRED_SECONDS;
  }
  shouldInterrupt(): boolean {
    return this.snapshot.active;
  }
  reset(): void {
    this.clearSeconds = BuildCombatGuard.CLEAR_REQUIRED_SECONDS;
    this.snapshot = {
      active: false,
      clearSeconds: BuildCombatGuard.CLEAR_REQUIRED_SECONDS,
      sources: [],
    };
  }
}
