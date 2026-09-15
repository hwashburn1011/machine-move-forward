import { STORY_EXPEDITIONS, type ExpeditionId, type StoryUniqueId } from '@/data/story';
import type { RouteContact } from '@/navigation/RouteChart';
import type { RouteId } from '@/data/routes';
import type { EndingPhase } from './EndingDirector';

const KNOWN_JOURNALS = new Map<string, string>();
const UNIQUE_LABELS = new Map<StoryUniqueId, string>();
for (const expedition of STORY_EXPEDITIONS) {
  for (const journal of expedition.journals) KNOWN_JOURNALS.set(journal.id, journal.title);
  for (const item of expedition.interactables) {
    if (item.kind === 'unique' && item.factId) UNIQUE_LABELS.set(item.factId, item.label);
  }
}

export interface CampaignSummaryInput {
  completedExpeditions: readonly ExpeditionId[];
  recoveredUniques: readonly StoryUniqueId[];
  journalArchive: readonly string[];
  activeRouteId: RouteId | null;
  endingPhase: EndingPhase;
  chart: {
    contact: RouteContact | null;
    visitedIds: readonly string[];
    missedIds: readonly string[];
  };
  firstRunComplete: boolean;
  navigationTier: number;
  gardenCount: number;
  automation: { collectors: number; turrets: number };
}

export interface CampaignRecord {
  chapters: readonly { id: ExpeditionId; title: string; completed: boolean }[];
  recordsRead: number;
  discoveries: { visited: number; missed: number };
  preserved: readonly string[];
  endingComplete: boolean;
  keepWalking: readonly KeepWalkingGuidance[];
}

export interface KeepWalkingGuidance {
  id: 'answer-signal' | 'tend-garden' | 'automate-home' | 'fortify-home' | 'read-archive';
  label: string;
  completeNow: boolean;
}

export function projectCampaignRecord(input: CampaignSummaryInput): CampaignRecord {
  const completed = new Set(input.completedExpeditions);
  const recovered = new Set(input.recoveredUniques);
  const readRecords = [...new Set(input.journalArchive)].filter((id) => KNOWN_JOURNALS.has(id));
  const preserved = [
    ...[...recovered]
      .map((id) => UNIQUE_LABELS.get(id))
      .map((label) => (label ? presentationUniqueLabel(label) : undefined))
      .filter((label): label is string => label !== undefined),
    ...readRecords.map((id) => KNOWN_JOURNALS.get(id)!),
  ];
  const visited = new Set(input.chart.visitedIds).size;
  const missed = new Set(input.chart.missedIds).size;
  const endingComplete = input.endingPhase === 'complete';
  const safeCount = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);
  return {
    chapters: STORY_EXPEDITIONS.map((expedition) => ({
      id: expedition.id,
      title: expedition.title,
      completed: completed.has(expedition.id),
    })),
    recordsRead: readRecords.length,
    discoveries: { visited, missed },
    preserved,
    endingComplete,
    keepWalking: [
      {
        id: 'answer-signal',
        label:
          input.chart.contact && input.chart.contact.state !== 'visited'
            ? 'Visit the next chart contact'
            : 'Find another signal',
        completeNow: input.chart.contact?.state === 'visited',
      },
      {
        id: 'tend-garden',
        label: 'Tend the Seed Garden',
        completeNow: safeCount(input.gardenCount) > 0,
      },
      {
        id: 'automate-home',
        label: 'Automate the Nomad',
        completeNow: safeCount(input.automation.collectors) > 0,
      },
      {
        id: 'fortify-home',
        label: 'Fortify the Nomad',
        completeNow: safeCount(input.automation.turrets) > 0,
      },
      {
        id: 'read-archive',
        label: 'Read the campaign archive',
        completeNow: readRecords.length > 0,
      },
    ],
  };
}

function presentationUniqueLabel(label: string): string {
  return label.replace(/^(Recover|Read)\s+/i, '');
}
