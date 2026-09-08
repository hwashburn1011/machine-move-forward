/** The small set of actions that teaches the first playable loop. */
export const FIRST_RUN_STEPS = [
  'salvage',
  'build-refinery',
  'refine-components',
  'build-workbench',
  'build-defense',
  'survive-boarding',
  'repair',
] as const;

export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

export interface FirstRunSave {
  /** Completed steps only. The active step is always derived from this list. */
  completed: FirstRunStep[];
  /** Monotonic facts that may have happened out of order. */
  counters: Record<string, number>;
}

export interface FirstRunSnapshot {
  salvageCollected?: number;
  refineryBuilt?: boolean;
  componentsRefined?: number;
  componentsAvailable?: number;
  workbenchBuilt?: boolean;
  defenseBuilt?: number;
  defenseCrewed?: number;
  boardingSurvived?: number;
  repairsCompleted?: number;
  /** A perfect defense can skip the repair step after the encounter ends. */
  machineNeedsRepair?: boolean;
}

export type FirstRunFact =
  | { type: 'salvage-collected'; count: number; source?: string }
  | { type: 'build-placed'; definitionId: string }
  | { type: 'craft-completed'; recipeId: string; outputCount?: number }
  | { type: 'defense-built'; count?: number }
  | { type: 'defense-crewed' }
  | { type: 'boarding-survived' }
  | { type: 'boarding-ended'; needsRepair: boolean }
  | { type: 'repair-completed' }
  | { type: 'snapshot'; snapshot: FirstRunSnapshot };

export interface FirstRunChange {
  completed: FirstRunStep[];
  current: FirstRunStep | 'complete';
  newlyCompleted: FirstRunStep[];
}

export interface FirstRunInstruction {
  step: FirstRunStep | 'complete';
  title: string;
  detail: string;
  control: string;
}

const INSTRUCTIONS: Record<FirstRunStep | 'complete', FirstRunInstruction> = {
  salvage: {
    step: 'salvage',
    title: 'Recover salvage',
    detail: 'Reel in a drifting salvage crate and collect its contents.',
    control: '[F] Fire salvage reel (opens automatically)',
  },
  'build-refinery': {
    step: 'build-refinery',
    title: 'Build a refinery',
    detail: 'Use the scrap from the desert to place a refinery on the deck.',
    control: '[B] Build · [G] Stations · select Refinery',
  },
  'refine-components': {
    step: 'refine-components',
    title: 'Refine components',
    detail: 'Refine 8 components: 4 for the workbench and 4 for the deck gun.',
    control: '[E] Open refinery · Refine Components',
  },
  'build-workbench': {
    step: 'build-workbench',
    title: 'Build a workbench',
    detail: 'Spend components on a useful workbench for the next threat.',
    control: '[B] Build · [G] Stations · select Workbench',
  },
  'build-defense': {
    step: 'build-defense',
    title: 'Prepare a defense',
    detail: 'Build and crew the Manual Deck Gun (4 components · 3 power · ±120° arc).',
    control: '[B] Build · [G] Stations · place turret · [E] crew',
  },
  'survive-boarding': {
    step: 'survive-boarding',
    title: 'Survive boarding',
    detail: 'Keep the machine moving and survive the next boarding action.',
    control: 'Watch the deck and hold your ground',
  },
  repair: {
    step: 'repair',
    title: 'Repair the machine',
    detail: 'Service a damaged machine subsystem before it stops you.',
    control: '[Hold E] Repair at the access panel',
  },
  complete: {
    step: 'complete',
    title: 'Keep moving',
    detail: 'The first loop is yours. Explore, build, and survive.',
    control: '',
  },
};

/**
 * Pure onboarding state. It records facts rather than assuming an intended
 * order, so a player who experiments first still gets credit later. The game
 * owns the event wiring and supplies facts from its live snapshot.
 */
export class FirstRunDirector {
  private readonly completed = new Set<FirstRunStep>();
  private readonly counters = new Map<string, number>();

  get current(): FirstRunStep | 'complete' {
    return FIRST_RUN_STEPS.find((step) => !this.completed.has(step)) ?? 'complete';
  }

  get instruction(): FirstRunInstruction {
    return INSTRUCTIONS[this.current];
  }

  get completedSteps(): FirstRunStep[] {
    return FIRST_RUN_STEPS.filter((step) => this.completed.has(step));
  }

  get isComplete(): boolean {
    return this.current === 'complete';
  }

  /** True when a previously crewed defense is ready for the tutorial encounter. */
  get defenseHasBeenCrewed(): boolean {
    return this.value('defenseCrewed') > 0;
  }

  /**
   * A player may build and crew the gun before the rail reaches that step.
   * Game uses this edge to arm the one tutorial encounter after the rail catches
   * up, avoiding a permanent survive-boarding objective deadlock.
   */
  get needsTutorialEncounter(): boolean {
    return this.current === 'survive-boarding' && this.defenseHasBeenCrewed && this.value('boardingSurvived') <= 0;
  }

  /** Observe one event or a current state snapshot. Returns null if unchanged. */
  observe(fact: FirstRunFact): FirstRunChange | null {
    const before = this.completedSteps;
    this.applyFact(fact);
    this.evaluate();
    const after = this.completedSteps;
    const newlyCompleted = after.filter((step) => !before.includes(step));
    if (newlyCompleted.length === 0) return null;
    return { completed: after, current: this.current, newlyCompleted };
  }

  toSave(): FirstRunSave {
    return {
      completed: this.completedSteps,
      counters: Object.fromEntries(this.counters),
    };
  }

  restore(save: FirstRunSave | undefined): void {
    this.completed.clear();
    this.counters.clear();
    if (!save) return;
    for (const step of save.completed ?? []) {
      if ((FIRST_RUN_STEPS as readonly string[]).includes(step)) this.completed.add(step);
    }
    for (const [key, value] of Object.entries(save.counters ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        this.counters.set(key, value);
      }
    }
    this.evaluate();
  }

  private applyFact(fact: FirstRunFact): void {
    if (fact.type === 'snapshot') {
      const s = fact.snapshot;
      this.max('salvage', s.salvageCollected ?? 0);
      this.max('components', s.componentsRefined ?? 0);
      this.max('componentsAvailable', s.componentsAvailable ?? 0);
      if (s.refineryBuilt) this.max('refineryBuilt', 1);
      if (s.workbenchBuilt) this.max('workbenchBuilt', 1);
      this.max('defense', s.defenseBuilt ?? 0);
      this.max('defenseCrewed', s.defenseCrewed ?? 0);
      this.max('boardingSurvived', s.boardingSurvived ?? 0);
      this.max('repairs', s.repairsCompleted ?? 0);
      return;
    }

    switch (fact.type) {
      case 'salvage-collected':
        if (fact.source === undefined || fact.source.toLowerCase().includes('salvage')) {
          this.add('salvage', Math.max(0, fact.count));
        }
        break;
      case 'build-placed':
        if (fact.definitionId === 'refinery') this.max('refineryBuilt', 1);
        if (fact.definitionId === 'workbench') this.max('workbenchBuilt', 1);
        if (fact.definitionId === 'turret-manual') this.max('defense', 1);
        break;
      case 'craft-completed':
        if (fact.recipeId === 'refine-components') this.add('components', Math.max(1, fact.outputCount ?? 1));
        break;
      case 'defense-built':
        this.add('defense', Math.max(1, fact.count ?? 1));
        break;
      case 'defense-crewed':
        this.add('defenseCrewed', 1);
        break;
      case 'boarding-survived':
        this.add('boardingSurvived', 1);
        break;
      case 'boarding-ended':
        this.add('boardingSurvived', 1);
        this.max('boardingEnded', 1);
        if (!fact.needsRepair) this.max('repairsAfterBoarding', 1);
        break;
      case 'repair-completed':
        this.add('repairs', 1);
        if (this.value('boardingEnded') > 0) this.add('repairsAfterBoarding', 1);
        break;
    }
  }

  private evaluate(): void {
    if (this.value('salvage') > 0) this.completed.add('salvage');
    if (this.value('refineryBuilt') > 0) this.completed.add('build-refinery');
    // The workbench and manual deck gun each consume four components. Keep
    // this objective at the amount needed to complete both builds so the
    // guided loop cannot advance into a resource shortfall.
    if (this.value('components') >= 8 || this.value('componentsAvailable') >= 8) {
      this.completed.add('refine-components');
    }
    if (this.value('workbenchBuilt') > 0) this.completed.add('build-workbench');
    if (this.value('defense') > 0 && this.value('defenseCrewed') > 0) {
      this.completed.add('build-defense');
    }
    if (this.value('boardingSurvived') > 0) this.completed.add('survive-boarding');
    if (this.value('repairsAfterBoarding') > 0) this.completed.add('repair');
  }

  private value(key: string): number {
    return this.counters.get(key) ?? 0;
  }

  private add(key: string, amount: number): void {
    if (amount > 0) this.counters.set(key, this.value(key) + amount);
  }

  private max(key: string, amount: number): void {
    if (amount > this.value(key)) this.counters.set(key, amount);
  }
}
