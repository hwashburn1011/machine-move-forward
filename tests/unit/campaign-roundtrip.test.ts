import { describe, expect, it } from 'vitest';
import { StoryDirector, type CampaignSave } from '@/story/StoryDirector';

const routeContext = {
  poweredHelm: true,
  playerOnMachine: true,
  stable: true,
  encounterActive: false,
  currentDistance: 300,
};

describe('campaign save round trips', () => {
  it('writes exact format 2 authority for route selection and every active safe phase', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'complete',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: true,
      nextSignal: true,
    });
    const selection = director.toSave();
    expect(Object.keys(selection).sort()).toEqual([
      'active',
      'completed',
      'format',
      'recoveredUniques',
    ]);
    expect(selection).toEqual({
      format: 2,
      completed: ['wreck-one'],
      recoveredUniques: ['course-gyro'],
      active: null,
    });
    director.selectRoute('foundry-detour', routeContext);
    const approach = director.toSave();
    expect(approach.active?.phase).toBe('approach');
    const restored = new StoryDirector();
    restored.restore(approach);
    expect(restored.snapshot(300).phase).toBe('approach');
    expect(restored.snapshot(300).remainingM).toBe(1150);
  });

  it('round trips docked Foundry progress and completed Foundry authority', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'complete',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: true,
      nextSignal: true,
    });
    director.selectRoute('foundry-detour', routeContext);
    director.update({
      distance: 1450,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 0,
      playerOnMachine: true,
    });
    expect(director.currentPhase).toBe('docked');
    director.collectUnique('salvage-controller');
    director.collectUnique('tracking-servo');
    const docked = director.toSave();
    const copy = new StoryDirector();
    copy.restore(docked);
    expect(copy.snapshot(1450).phase).toBe('docked');
    expect(copy.snapshot(1450).recoveredUniques).toEqual([
      'course-gyro',
      'salvage-controller',
      'tracking-servo',
    ]);
    expect(copy.requestDepart(true)).not.toEqual([]);
    copy.update({
      distance: 1463,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 1,
      playerOnMachine: true,
    });
    const complete = copy.toSave() as CampaignSave;
    expect(complete.completed).toContain('relay-foundry');
    expect(complete.active).toBeNull();
    const final = new StoryDirector();
    final.restore(complete);
    expect(final.currentPhase).toBe('complete');
  });

  it('repairs completed legacy and campaign Wreck saves with the gyro invariant', () => {
    for (const save of [
      {
        chapterId: 'wreck-one',
        phase: 'complete',
        arrivalDistance: 700,
        journalsRead: [],
        uniqueCollected: false,
        nextSignal: true,
      },
      { format: 2, completed: ['wreck-one'], recoveredUniques: [], active: null },
    ]) {
      const director = new StoryDirector();
      director.restore(save as never);
      expect(director.snapshot(700).recoveredUniques).toContain('course-gyro');
      expect(director.selectRoute('foundry-direct', routeContext).ok).toBe(true);
    }
  });

  it('rejects malformed active phases, routes, negative distances, and contradictory completion', () => {
    const cases = [
      {
        format: 2,
        completed: [],
        recoveredUniques: [],
        active: {
          expeditionId: 'wreck-one',
          routeId: 'foundry-direct',
          phase: 'docked',
          arrivalDistance: 20,
          journalsRead: [],
          scriptedEncounter: 'not-due',
        },
      },
      {
        format: 2,
        completed: [],
        recoveredUniques: [],
        active: {
          expeditionId: 'relay-foundry',
          routeId: 'foundry-direct',
          phase: 'signal',
          arrivalDistance: null,
          journalsRead: [],
          scriptedEncounter: 'not-due',
        },
      },
      {
        format: 2,
        completed: [],
        recoveredUniques: [],
        active: {
          expeditionId: 'relay-foundry',
          routeId: 'foundry-direct',
          phase: 'approach',
          arrivalDistance: -1,
          journalsRead: [],
          scriptedEncounter: 'queued',
        },
      },
      {
        format: 2,
        completed: ['relay-foundry'],
        recoveredUniques: [],
        active: {
          expeditionId: 'relay-foundry',
          routeId: 'foundry-direct',
          phase: 'docked',
          arrivalDistance: 900,
          journalsRead: [],
          scriptedEncounter: 'not-due',
        },
      },
    ];
    for (const save of cases) {
      const director = new StoryDirector();
      director.restore(save as never);
      expect(['route-selection', 'complete']).toContain(director.currentPhase);
    }
    const completed = new StoryDirector();
    completed.restore(cases[3] as never);
    expect(completed.snapshot(900).recoveredUniques).toContain('course-gyro');
  });

  it('round trips a signal save whose arrival is intentionally null', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'signal',
      arrivalDistance: null,
      journalsRead: [],
      uniqueCollected: false,
      nextSignal: false,
    });
    const save = director.toSave();
    expect(save.active).toMatchObject({
      expeditionId: 'wreck-one',
      phase: 'signal',
      arrivalDistance: null,
    });
    const copy = new StoryDirector();
    copy.restore(save);
    expect(copy.currentPhase).toBe('signal');
  });

  it('holds a detour at 220m during an ordinary encounter and resumes sanctuary after clearance', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'complete',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: true,
      nextSignal: true,
    });
    director.selectRoute('foundry-detour', routeContext);
    const held = director.update({
      distance: 1230,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 2,
      playerOnMachine: true,
      encounterActive: true,
    });
    expect(held).toContainEqual({ type: 'hold-destination', remainingM: 220 });
    expect(held).not.toContainEqual({ type: 'request-sanctuary', active: true });
    const stillHeld = director.update({
      distance: 1270,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 2,
      playerOnMachine: true,
      encounterActive: true,
    });
    expect(stillHeld).not.toContainEqual({ type: 'deploy-gangway' });
    const clear = director.update({
      distance: 1310,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 2,
      playerOnMachine: true,
      encounterActive: false,
    });
    expect(clear).toContainEqual({ type: 'request-sanctuary', active: true });
    expect(clear).not.toContainEqual({ type: 'deploy-gangway' });
  });
});
