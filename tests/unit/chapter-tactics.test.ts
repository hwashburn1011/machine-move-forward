import { describe, expect, it } from 'vitest';
import { StoryDirector } from '@/story/StoryDirector';

describe('optional Wreck One trace', () => {
  it('offers only after a Game-confirmed resolved raid and persists readiness', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'raids',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    expect(story.snapshot(10).radioTraceOffer).toBe(false);
    expect(story.recordRadioRaidVictory()).toBe(true);
    expect(story.recordRadioRaidVictory()).toBe(false);
    expect(story.snapshot(10).radioTraceOffer).toBe(true);
    const save = story.toSave();
    const restored = new StoryDirector();
    restored.restore(save);
    expect(restored.snapshot(10).radioTraceReady).toBe(true);
  });
  it('commits existing Wreck approach only with safe context', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'raids',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    story.recordRadioRaidVictory();
    expect(
      story.beginWreckExpedition({
        currentDistance: 100,
        playerOnMachine: false,
        stable: true,
        encounterActive: false,
      }),
    ).toEqual({ ok: false, reason: 'off-machine' });
    const result = story.beginWreckExpedition({
      currentDistance: 100,
      playerOnMachine: true,
      stable: true,
      encounterActive: false,
    });
    expect(result.ok).toBe(true);
    expect(story.currentPhase).toBe('approach');
  });

  it('migrates a completed Foundry save and keeps raids permitted', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['salvage-controller', 'tracking-servo'],
      active: null,
    });
    const view = story.snapshot(0);
    expect(view.chapterComplete).toBe(true);
    expect(story.permitsRadioRaids).toBe(true);
    expect(view.objective).toContain('chapter complete');
    const roundTrip = new StoryDirector();
    roundTrip.restore(story.toSave());
    expect(roundTrip.snapshot(0).chapterComplete).toBe(true);
  });

  it('does not replay crossfire or start a trace during an active queued encounter', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'crossfire',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    expect(story.recordRadioRaidVictory()).toBe(false);
    expect(story.currentPhase).toBe('crossfire');
    story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'raids',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'queued',
      },
    });
    story.recordRadioRaidVictory();
    expect(
      story.beginWreckExpedition({
        currentDistance: 1,
        playerOnMachine: true,
        stable: true,
        encounterActive: true,
      }),
    ).toEqual({ ok: false, reason: 'encounter-active' });
  });

  it('does not trust an orphaned completion bit during an active expedition', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      chapterComplete: true,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'approach',
        arrivalDistance: 5,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    expect(story.permitsRadioRaids).toBe(false);
    expect(story.snapshot(0).chapterComplete).toBe(false);
  });

  it('normalizes a completed Foundry route over a stale active record', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      chapterComplete: false,
      completed: ['relay-foundry'],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'crossfire',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'queued',
      },
    });
    expect(story.currentPhase).toBe('complete');
    expect(story.permitsRadioRaids).toBe(true);
  });
});
