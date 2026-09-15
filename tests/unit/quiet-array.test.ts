import { describe, expect, it } from 'vitest';
import { StoryDirector } from '@/story/StoryDirector';

const safe = { currentDistance: 100, playerOnMachine: true, stable: true, encounterActive: false };

describe('Quiet Array expedition', () => {
  it('is offered only after Foundry completion and starts at a 950m approach', () => {
    const story = new StoryDirector();
    expect(story.snapshot(0).nextExpedition).toBeNull();
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: null,
    });
    expect(story.snapshot(0).nextExpedition?.id).toBe('quiet-array');
    const result = story.beginNextExpedition(safe);
    expect(result.ok).toBe(true);
    expect(story.currentPhase).toBe('approach');
    expect(result.ok && result.effects[0]).toEqual({
      type: 'begin-approach',
      arrivalDistance: 1050,
    });
    expect(story.beginNextExpedition(safe)).toEqual({ ok: false, reason: 'already-active' });
  });

  it('requires both calibration journals before the actuator can be collected', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: null,
    });
    story.beginNextExpedition(safe);
    // A restored docked Quiet Array is a valid focused fixture.
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: {
        expeditionId: 'quiet-array',
        routeId: null,
        phase: 'docked',
        arrivalDistance: 1050,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    expect(story.collectUnique('course-actuator')).toBe(false);
    expect(story.unmetRequirement('course-actuator')).toContain('Port Relay Calibration');
    expect(story.readJournal('quiet-array-journal-port')).toBe(true);
    expect(story.readJournal('quiet-array-journal-starboard')).toBe(true);
    expect(story.collectUnique('course-actuator')).toBe(true);
  });

  it('allows the archive shard before calibration journals', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: {
        expeditionId: 'quiet-array',
        routeId: null,
        phase: 'docked',
        arrivalDistance: 1050,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    expect(story.collectUnique('annika-archive-shard')).toBe(true);
  });

  it('emits Quiet completion without replaying the chapter milestone', () => {
    const story = new StoryDirector();
    story.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: [
        'course-gyro',
        'salvage-controller',
        'tracking-servo',
        'course-actuator',
        'annika-archive-shard',
      ],
      active: {
        expeditionId: 'quiet-array',
        routeId: null,
        phase: 'departing',
        arrivalDistance: 100,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    const effects = story.update({
      distance: 120,
      speed: 2,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      playerOnMachine: true,
    });
    expect(effects).toContainEqual({ type: 'expedition-complete', expeditionId: 'quiet-array' });
    expect(effects.some((effect) => effect.type === 'chapter-complete')).toBe(false);
    expect(story.snapshot(120).nextExpedition?.id).toBe('glass-orchard');
  });
});
