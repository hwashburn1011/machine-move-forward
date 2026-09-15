import { describe, expect, it } from 'vitest';
import { StoryDirector, type CampaignSave } from '@/story/StoryDirector';

const safe = {
  currentDistance: 5000,
  playerOnMachine: true,
  stable: true,
  encounterActive: false,
  poweredHelm: true,
};

const completedOrchard: CampaignSave = {
  format: 2,
  completed: ['glass-orchard'],
  recoveredUniques: [
    'course-gyro',
    'salvage-controller',
    'tracking-servo',
    'course-actuator',
    'annika-archive-shard',
    'human-seed-bank',
    'vector-governor',
    'orchard-memory-core',
  ],
  active: null,
};

const docked = (routeId: 'meridian-quiet-line' | 'meridian-cordon-gap') => {
  const story = new StoryDirector();
  story.restore({
    ...completedOrchard,
    active: {
      expeditionId: 'last-garden-meridian',
      routeId,
      phase: 'docked',
      arrivalDistance: 6200,
      journalsRead: [],
      scriptedEncounter: 'resolved',
    },
  });
  return story;
};

describe('Last Garden at Meridian story progression', () => {
  it('offers a persisted route choice after Orchard and validates destination routes', () => {
    const story = new StoryDirector();
    story.restore(completedOrchard);
    expect(story.snapshot(5000).nextExpedition?.id).toBe('last-garden-meridian');
    expect(story.beginNextExpedition(safe)).toEqual({
      ok: true,
      effects: [
        {
          type: 'route-available',
          routes: ['meridian-quiet-line', 'meridian-cordon-gap'],
        },
      ],
    });
    expect(story.toSave().active).toMatchObject({
      expeditionId: 'last-garden-meridian',
      phase: 'route-selection',
      routeId: null,
      arrivalDistance: null,
    });
    expect(story.selectRoute('orchard-caretaker', safe)).toEqual({
      ok: false,
      reason: 'invalid-route',
    });
    expect(story.selectRoute('meridian-quiet-line', safe).ok).toBe(true);
    expect(story.snapshot(5000).remainingM).toBe(1250);
  });

  it.each([
    ['meridian-quiet-line', 'meridian-civilian-record', 'meridian-defense-record'],
    ['meridian-cordon-gap', 'meridian-defense-record', 'meridian-civilian-record'],
  ] as const)(
    'requires both objectives and the common plus selected record on %s',
    (route, selected, excluded) => {
      const story = docked(route);
      expect(story.canReadJournal(selected)).toBe(true);
      expect(story.canReadJournal(excluded)).toBe(false);
      expect(story.collectUnique('meridian-solution')).toBe(false);
      expect(story.completeObjective('meridian-transmitter-online')).toBe(true);
      expect(story.completeObjective('meridian-archive-installed')).toBe(true);
      expect(story.readJournal(selected)).toBe(true);
      expect(story.collectUnique('meridian-solution')).toBe(false);
      expect(story.readJournal('meridian-common-record')).toBe(true);
      expect(story.collectUnique('meridian-solution')).toBe(true);
      expect(story.canDepart(true)).toBe(true);
    },
  );

  it('archives first reads across chapters and migrates only proven legacy records', () => {
    const active = docked('meridian-quiet-line');
    active.readJournal('meridian-civilian-record');
    active.readJournal('meridian-common-record');
    const saved = active.toSave();
    expect(saved.journalArchive).toEqual(
      expect.arrayContaining(['meridian-civilian-record', 'meridian-common-record']),
    );

    const restored = new StoryDirector();
    restored.restore({
      ...completedOrchard,
      recoveredUniques: [...completedOrchard.recoveredUniques, 'meridian-solution'],
      journalArchive: ['unknown-record'],
    });
    expect(restored.journalArchive).toEqual(
      expect.arrayContaining([
        'quiet-array-journal-port',
        'quiet-array-journal-starboard',
        'orchard-memory-record',
        'meridian-common-record',
      ]),
    );
    expect(restored.journalArchive).not.toContain('orchard-caretaker-record');
    expect(restored.journalArchive).not.toContain('orchard-evacuation-record');
    expect(restored.journalArchive).not.toContain('unknown-record');
  });

  it('normalizes an invalid active Meridian record to its route choice without completion', () => {
    const story = new StoryDirector();
    story.restore({
      ...completedOrchard,
      active: {
        expeditionId: 'last-garden-meridian',
        routeId: 'orchard-caretaker',
        phase: 'docked',
        arrivalDistance: 6000,
        journalsRead: ['meridian-defense-record'],
        scriptedEncounter: 'resolved',
      },
    });
    expect(story.snapshot(0)).toMatchObject({
      expeditionId: 'last-garden-meridian',
      phase: 'route-selection',
      routeId: null,
    });
    expect(story.completedExpeditions).not.toContain('last-garden-meridian');
  });

  it('completes Meridian once and leaves no further story offer', () => {
    const story = docked('meridian-quiet-line');
    story.completeObjective('meridian-transmitter-online');
    story.completeObjective('meridian-archive-installed');
    story.readJournal('meridian-civilian-record');
    story.readJournal('meridian-common-record');
    story.collectUnique('meridian-solution');
    expect(story.requestDepart(true)).not.toEqual([]);
    expect(
      story.update({
        distance: 6213,
        speed: 2,
        radioFound: true,
        firstRunComplete: true,
        stable: true,
        playerOnMachine: true,
      }),
    ).toContainEqual({
      type: 'expedition-complete',
      expeditionId: 'last-garden-meridian',
    });
    expect(story.snapshot(6213).nextExpedition).toBeNull();
    expect(story.beginNextExpedition(safe)).toEqual({ ok: false, reason: 'already-active' });
  });
});
