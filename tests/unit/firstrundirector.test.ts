import { describe, expect, it } from 'vitest';
import { FirstRunDirector } from '@/game/FirstRunDirector';

describe('FirstRunDirector', () => {
  it('counts facts taken out of order and derives the next action', () => {
    const d = new FirstRunDirector();
    d.observe({ type: 'build-placed', definitionId: 'workbench' });
    for (let i = 0; i < 8; i++)
      d.observe({ type: 'craft-completed', recipeId: 'refine-components' });
    d.observe({ type: 'build-placed', definitionId: 'refinery' });
    d.observe({ type: 'salvage-collected', count: 1, source: 'Salvage crate' });

    expect(d.completedSteps).toEqual([
      'salvage',
      'build-refinery',
      'refine-components',
      'build-workbench',
    ]);
    expect(d.current).toBe('build-defense');
  });

  it('persists only monotonic facts and restores the derived active step', () => {
    const a = new FirstRunDirector();
    a.observe({ type: 'salvage-collected', count: 2, source: 'Salvage crate' });
    a.observe({ type: 'repair-completed' });

    const b = new FirstRunDirector();
    b.restore(a.toSave());
    expect(b.completedSteps).toEqual(['salvage']);
    expect(b.current).toBe('build-refinery');
  });

  it('finishes from a later boarding and repair even when no step was active', () => {
    const d = new FirstRunDirector();
    d.observe({
      type: 'snapshot',
      snapshot: {
        salvageCollected: 1,
        refineryBuilt: true,
        componentsRefined: 8,
        workbenchBuilt: true,
        defenseBuilt: 1,
        defenseCrewed: 1,
      },
    });
    d.observe({ type: 'boarding-ended', needsRepair: true });
    const change = d.observe({ type: 'repair-completed' });
    expect(change?.current).toBe('complete');
    expect(d.isComplete).toBe(true);
  });

  it('does not let a repair before boarding satisfy the post-fight repair', () => {
    const d = new FirstRunDirector();
    d.observe({ type: 'repair-completed' });
    expect(d.completedSteps).not.toContain('repair');
    d.observe({ type: 'boarding-ended', needsRepair: true });
    expect(d.completedSteps).not.toContain('repair');
    d.observe({ type: 'repair-completed' });
    expect(d.completedSteps).toContain('repair');
  });

  it('skips repair after a boarding that leaves the machine sound', () => {
    const d = new FirstRunDirector();
    d.observe({
      type: 'snapshot',
      snapshot: {
        salvageCollected: 1,
        refineryBuilt: true,
        componentsRefined: 8,
        workbenchBuilt: true,
        defenseBuilt: 1,
        defenseCrewed: 1,
      },
    });
    d.observe({ type: 'boarding-ended', needsRepair: false });
    expect(d.isComplete).toBe(true);
  });

  it('ignores non-salvage loot for the salvage objective', () => {
    const d = new FirstRunDirector();
    expect(d.observe({ type: 'salvage-collected', count: 1, source: 'Scavenger' })).toBeNull();
    expect(d.current).toBe('salvage');
  });

  it('counts component output units when a recipe emits more than one', () => {
    const d = new FirstRunDirector();
    for (let i = 0; i < 4; i++)
      d.observe({ type: 'craft-completed', recipeId: 'refine-components', outputCount: 2 });
    expect(d.completedSteps).toContain('refine-components');
  });

  it('exposes a tutorial arm edge when defense was completed early', () => {
    const d = new FirstRunDirector();
    d.observe({ type: 'salvage-collected', count: 1, source: 'Salvage crate' });
    d.observe({ type: 'build-placed', definitionId: 'refinery' });
    d.observe({ type: 'snapshot', snapshot: { componentsAvailable: 8 } });
    d.observe({ type: 'build-placed', definitionId: 'workbench' });
    d.observe({ type: 'build-placed', definitionId: 'turret-manual' });
    d.observe({ type: 'defense-crewed' });
    expect(d.current).toBe('survive-boarding');
    expect(d.needsTutorialEncounter).toBe(true);
  });
});
