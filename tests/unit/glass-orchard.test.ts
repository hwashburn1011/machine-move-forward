import { describe, expect, it } from 'vitest';
import { StoryDirector, type CampaignSave } from '@/story/StoryDirector';
import { GLASS_ORCHARD } from '@/data/story';

const safe = { currentDistance: 2000, playerOnMachine: true, stable: true, encounterActive: false };
const inherited = [
  'course-gyro',
  'salvage-controller',
  'tracking-servo',
  'course-actuator',
  'annika-archive-shard',
] as const;

const ready = (): StoryDirector => {
  const story = new StoryDirector();
  story.restore({
    format: 2,
    completed: ['relay-foundry', 'quiet-array'],
    recoveredUniques: [...inherited],
    active: null,
  });
  return story;
};

const docked = (routeId: 'orchard-caretaker' | 'orchard-cold-vault'): StoryDirector => {
  const story = new StoryDirector();
  story.restore({
    format: 2,
    completed: ['relay-foundry', 'quiet-array'],
    recoveredUniques: [...inherited],
    active: {
      expeditionId: 'glass-orchard',
      routeId,
      phase: 'docked',
      arrivalDistance: 3000,
      journalsRead: [],
      scriptedEncounter: 'resolved',
    },
  });
  return story;
};

describe('Glass Orchard campaign state', () => {
  it('keeps the greenhouse entrance clear for a walking player capsule', () => {
    const radius = 0.34;
    const playerHeight = 1.96;
    const corridorX = -5;
    const corridorStartZ = 0;
    const corridorEndZ = 3;
    const overlaps = (collider: (typeof GLASS_ORCHARD.colliders)[number]): boolean => {
      if (collider.id === 'floor') return false;
      const horizontalX =
        Math.max(0, Math.abs(corridorX - collider.at.x) - collider.half.x) <= radius;
      const horizontalZ =
        collider.at.z + collider.half.z >= corridorStartZ - radius &&
        collider.at.z - collider.half.z <= corridorEndZ + radius;
      const vertical =
        collider.at.y + collider.half.y >= 0 && collider.at.y - collider.half.y <= playerHeight;
      return horizontalX && horizontalZ && vertical;
    };

    const authoredCabinet = GLASS_ORCHARD.colliders.find(
      (collider) => collider.id === 'port-isolator',
    );
    expect(authoredCabinet).toBeDefined();
    const oldCabinet = { ...authoredCabinet!, at: { ...authoredCabinet!.at, x: -5 } };
    expect(overlaps(oldCabinet)).toBe(true);

    // Inspect the actual destination, including the cabinet. Substituting a
    // hypothetical corrected cabinet would let the original defect pass.
    expect(GLASS_ORCHARD.colliders.filter(overlaps).map((collider) => collider.id)).toEqual([]);
  });

  it('offers one shared persisted route selection after Quiet Array', () => {
    const story = ready();
    expect(story.snapshot(0).nextExpedition?.id).toBe('glass-orchard');
    expect(story.beginNextExpedition(safe)).toEqual({
      ok: true,
      effects: [{ type: 'route-available', routes: ['orchard-caretaker', 'orchard-cold-vault'] }],
    });
    expect(story.currentPhase).toBe('route-selection');
    const saved = story.toSave();
    expect(saved.active).toMatchObject({
      expeditionId: 'glass-orchard',
      routeId: null,
      phase: 'route-selection',
      arrivalDistance: null,
    });
    const copy = new StoryDirector();
    copy.restore(saved);
    expect(copy.snapshot(0)).toMatchObject({
      expeditionId: 'glass-orchard',
      phase: 'route-selection',
      routeId: null,
    });
    expect(copy.selectRoute('foundry-direct', { ...safe, poweredHelm: true })).toEqual({
      ok: false,
      reason: 'invalid-route',
    });
  });

  it.each([
    ['orchard-caretaker', 900, 'skiff', 420, 'orchard-port-isolator'],
    ['orchard-cold-vault', 1100, 'gunboat', 500, 'orchard-starboard-isolator'],
  ] as const)(
    'commits %s, queues its encounter, and holds at 220m',
    (routeId, distanceM, vehicle, due, initial) => {
      const story = ready();
      story.beginNextExpedition(safe);
      expect(story.selectRoute(routeId, { ...safe, poweredHelm: true }).ok).toBe(true);
      expect(story.snapshot(2000).remainingM).toBe(distanceM);
      const queued = story.update({
        distance: 2000 + distanceM - due,
        speed: 4,
        radioFound: true,
        firstRunComplete: true,
        stable: true,
        playerOnMachine: true,
      });
      expect(queued).toContainEqual({ type: 'scripted-vehicle-due', vehicle, routeId });
      const held = story.update({
        distance: 2000 + distanceM - 220,
        speed: 2,
        radioFound: true,
        firstRunComplete: true,
        stable: true,
        playerOnMachine: true,
        encounterActive: true,
      });
      expect(held).toContainEqual({ type: 'hold-destination', remainingM: 220 });
      story.resolveScriptedEncounter();
      expect(
        story.update({
          distance: 2000 + distanceM - 220,
          speed: 2,
          radioFound: true,
          firstRunComplete: true,
          stable: true,
          playerOnMachine: true,
          encounterActive: true,
        }),
      ).toContainEqual({ type: 'hold-destination', remainingM: 220 });
      expect(story.snapshot(0).completedObjectives).toContain(initial);
    },
  );

  it('filters route records and enforces physical recovery gates', () => {
    const story = docked('orchard-caretaker');
    expect(story.canReadJournal('orchard-caretaker-record')).toBe(true);
    expect(story.canReadJournal('orchard-evacuation-record')).toBe(false);
    expect(story.readJournal('orchard-evacuation-record')).toBe(false);
    expect(story.canDepart(true)).toBe(false);
    expect(story.collectUnique('human-seed-bank')).toBe(true);
    expect(story.collectUnique('orchard-memory-core')).toBe(false);
    expect(story.completeObjective('orchard-starboard-isolator')).toBe(true);
    expect(story.completeObjective('orchard-starboard-isolator')).toBe(false);
    expect(story.collectUnique('orchard-memory-core')).toBe(true);
    expect(story.collectUnique('vector-governor')).toBe(false);
    expect(story.readJournal('orchard-caretaker-record')).toBe(true);
    expect(story.readJournal('orchard-memory-record')).toBe(true);
    expect(story.collectUnique('vector-governor')).toBe(true);
    expect(story.canDepart(false)).toBe(false);
    expect(story.canDepart(true)).toBe(true);
    expect(story.requestDepart(true)).not.toEqual([]);
  });

  it('round trips objectives, rejects injected alternate records, and completes once', () => {
    const story = docked('orchard-cold-vault');
    story.completeObjective('orchard-port-isolator');
    story.readJournal('orchard-evacuation-record');
    story.readJournal('orchard-memory-record');
    story.collectUnique('human-seed-bank');
    story.collectUnique('orchard-memory-core');
    story.collectUnique('vector-governor');
    const save = story.toSave() as CampaignSave;
    save.active!.journalsRead.push('orchard-caretaker-record');
    const copy = new StoryDirector();
    copy.restore(save);
    expect(copy.canReadJournal('orchard-caretaker-record')).toBe(false);
    expect(copy.snapshot(0).completedObjectives).toEqual(
      expect.arrayContaining(['orchard-port-isolator', 'orchard-starboard-isolator']),
    );
    expect(copy.requestDepart(true)).not.toEqual([]);
    const completed = copy.update({
      distance: 3013,
      speed: 2,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      playerOnMachine: true,
    });
    expect(completed).toContainEqual({
      type: 'expedition-complete',
      expeditionId: 'glass-orchard',
    });
    expect(copy.snapshot(3013).nextExpedition?.id).toBe('last-garden-meridian');
    expect(copy.beginNextExpedition(safe).ok).toBe(true);
    expect(
      copy.update({
        distance: 3020,
        speed: 2,
        radioFound: true,
        firstRunComplete: true,
        stable: true,
        playerOnMachine: true,
      }),
    ).toEqual([]);
  });
});
