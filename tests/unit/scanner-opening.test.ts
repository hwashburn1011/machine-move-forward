import { describe, expect, it } from 'vitest';
import { FirstRunDirector } from '@/game/FirstRunDirector';
import { recipeById } from '@/data/recipes';
import { StoryDirector } from '@/story/StoryDirector';

describe('scanner opening integration seams', () => {
  it('keeps the seven-step guide while exposing workshop scanner guidance', () => {
    const first = new FirstRunDirector();
    first.observe({ type: 'build-placed', definitionId: 'workbench' });
    expect(first.workshopReady).toBe(true);
    expect(first.scannerInstruction('awaiting-module')?.detail).toContain('4 scrap');
    expect(first.current).toBe('salvage');
  });

  it('shows restored scanner progress instead of an old salvage objective without guide counters', () => {
    const first = new FirstRunDirector();
    expect(first.scannerInstruction('awaiting-module')).toBeNull();
    expect(first.scannerInstruction('installed')?.title).toBe('Start the scanner');
    expect(first.scannerInstruction('scanning')?.title).toBe('Let the scanner run');
    expect(first.scannerInstruction('contact-ready')?.title).toBe('Contact acquired');
    expect(first.current).toBe('salvage');
  });

  it('defines the exact workbench recipe and observes scanner facts without completing defense', () => {
    expect(recipeById('craft-scanner-replacement-module')).toMatchObject({
      station: 'workbench',
      inputs: { scrap: 4, components: 4 },
      output: { itemId: 'scanner-replacement-module', count: 1 },
    });
    const first = new FirstRunDirector();
    first.observe({ type: 'scanner-module-crafted' });
    first.observe({ type: 'scanner-installed' });
    first.observe({ type: 'scanner-started' });
    expect(first.isComplete).toBe(false);
    first.observe({ type: 'snapshot', snapshot: { componentsRefined: 12 } });
    expect(first.completedSteps).toContain('refine-components');
  });

  it('lets Story consume a scanner-ready contact without requiring the old guide completion', () => {
    const story = new StoryDirector();
    story.update({
      distance: 0,
      radioFound: true,
      firstRunComplete: false,
      stable: true,
      speed: 0,
      playerOnMachine: true,
    });
    expect(story.currentPhase).toBe('signal');
    expect(
      story.consumeScannerContact({
        ready: true,
        stable: true,
        playerOnMachine: true,
        encounterActive: false,
      }),
    ).toEqual([{ type: 'begin-signal-battle' }]);
    expect(story.currentPhase).toBe('crossfire');
  });

  it('does not let an off-machine or active-encounter readiness flag start the reveal', () => {
    const story = new StoryDirector();
    story.update({
      distance: 0,
      radioFound: true,
      firstRunComplete: false,
      stable: true,
      speed: 0,
      playerOnMachine: true,
    });
    expect(
      story.update({
        distance: 0,
        radioFound: true,
        firstRunComplete: false,
        stable: true,
        speed: 0,
        playerOnMachine: false,
        scannerContactReady: true,
      }),
    ).toEqual([]);
    expect(
      story.update({
        distance: 0,
        radioFound: true,
        firstRunComplete: false,
        stable: true,
        speed: 0,
        playerOnMachine: true,
        encounterActive: true,
        scannerContactReady: true,
      }),
    ).toEqual([]);
    const legacy = new StoryDirector();
    legacy.update({
      distance: 0,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 0,
      playerOnMachine: true,
    });
    expect(
      legacy.update({
        distance: 10_000,
        radioFound: true,
        firstRunComplete: true,
        stable: true,
        speed: 0,
        playerOnMachine: true,
        scannerContactReady: false,
      }),
    ).toEqual([]);
    expect(legacy.currentPhase).toBe('signal');
  });
});
