import { describe, expect, it } from 'vitest';
import { projectCampaignRecord, type CampaignSummaryInput } from '@/story/CampaignRecord';

const empty = (): CampaignSummaryInput => ({
  completedExpeditions: [],
  recoveredUniques: [],
  journalArchive: [],
  activeRouteId: null,
  endingPhase: 'available',
  chart: { contact: null, visitedIds: [], missedIds: [] },
  firstRunComplete: false,
  navigationTier: 0,
  gardenCount: 0,
  automation: { collectors: 0, turrets: 0 },
});

describe('campaign record projection', () => {
  it('lists all authored chapters in stable order without inventing progress', () => {
    const record = projectCampaignRecord(empty());
    expect(record.chapters.map((chapter) => chapter.id)).toEqual([
      'wreck-one',
      'relay-foundry',
      'quiet-array',
      'glass-orchard',
      'last-garden-meridian',
    ]);
    expect(record.chapters.every((chapter) => !chapter.completed)).toBe(true);
    expect(record.preserved).toEqual([]);
    expect(record.endingComplete).toBe(false);
  });

  it('counts distinct persisted history and known archive records only', () => {
    const input = empty();
    input.completedExpeditions = ['glass-orchard', 'last-garden-meridian'];
    input.recoveredUniques = ['meridian-solution', 'course-gyro'];
    input.journalArchive = ['meridian-common-record', 'meridian-common-record', 'unknown'];
    input.chart = {
      contact: null,
      visitedIds: ['route-contact-1', 'route-contact-1'],
      missedIds: ['route-contact-2'],
    };
    input.endingPhase = 'complete';
    const record = projectCampaignRecord(input);
    expect(record.recordsRead).toBe(1);
    expect(record.discoveries).toEqual({ visited: 1, missed: 1 });
    expect(record.preserved).toEqual(['Meridian solution', 'course gyro', 'Common refuge record']);
    expect(record.keepWalking[0]).toMatchObject({
      id: 'answer-signal',
      label: 'Find another signal',
      completeNow: false,
    });
    expect(record.keepWalking[4]).toMatchObject({ id: 'read-archive', completeNow: true });
  });

  it('derives rewardless Keep Walking guidance from current state', () => {
    const input = empty();
    input.gardenCount = 1;
    input.automation = { collectors: 2, turrets: 3 };
    const record = projectCampaignRecord(input);
    expect(record.keepWalking.map((row) => row.completeNow)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('tracks the current contact independently from ending completion', () => {
    const input = empty();
    input.endingPhase = 'complete';
    input.chart = {
      contact: {
        id: 'route-contact-1',
        slot: 1,
        kind: 'memorial',
        atDistanceM: 100,
        worldX: 2,
        confidence: 1,
        hazard: 'calm',
        detectedAtM: 0,
        expiresAtM: 200,
        state: 'detected',
        rewards: [],
      },
      visitedIds: [],
      missedIds: [],
    };
    const row = projectCampaignRecord(input).keepWalking[0]!;
    expect(row.label).toBe('Visit the next chart contact');
    expect(row.completeNow).toBe(false);
  });
});
