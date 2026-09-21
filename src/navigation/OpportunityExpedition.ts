import {
  desertOpportunityForContact,
  type DesertOpportunityDefinition,
  type DesertOpportunityId,
} from '@/data/opportunities';
import type { RouteContact, RouteContactKind } from '@/navigation/RouteChart';

export type OpportunityVariantId = DesertOpportunityId;
export type OpportunityTaskId =
  'restore-cistern-bypass' | 'retrieve-convoy-transponder' | 'align-relay-coupler';
export type OpportunityTaskStep = 'task-ready' | 'service-done' | 'task-complete';
export interface RouteExpeditionSave {
  format: 1;
  step: OpportunityTaskStep;
}
export interface OpportunityTaskDefinition {
  id: OpportunityTaskId;
  label: string;
  anchor: string;
  fallback: { x: number; y: number; z: number };
  holdS: number;
}
export interface OpportunityExpeditionDefinition {
  variant: OpportunityVariantId;
  contactKind: 'water-cache' | 'salvage-wreck' | 'memorial';
  title: string;
  summary: string;
  safeOutcome: string;
  deepOutcome: string;
  riskLabel: 'calm traversal' | 'exposed traversal' | 'hostile patrol';
  task: OpportunityTaskDefinition;
  retrieval: DesertOpportunityDefinition['interactions']['retrieval'];
}
export interface OpportunityExpeditionView {
  readonly definition: OpportunityExpeditionDefinition;
  readonly step: OpportunityTaskStep;
  readonly canWork: boolean;
  readonly rewardUnlocked: boolean;
  readonly salvageChoiceUnlocked: boolean;
  readonly service: DesertOpportunityDefinition['interactions']['service'];
  readonly retrieval: DesertOpportunityDefinition['interactions']['retrieval'];
}
const taskIds: Record<OpportunityVariantId, OpportunityTaskId> = {
  'collapsed-service-depot': 'restore-cistern-bypass',
  'wrecked-convoy': 'retrieve-convoy-transponder',
  'damaged-relay': 'align-relay-coupler',
};
const riskLabels: Record<OpportunityVariantId, OpportunityExpeditionDefinition['riskLabel']> = {
  'collapsed-service-depot': 'calm traversal',
  'wrecked-convoy': 'hostile patrol',
  'damaged-relay': 'exposed traversal',
};
export function expeditionDefinition(
  kind: RouteContactKind,
): OpportunityExpeditionDefinition | null {
  const entry = desertOpportunityForContact(kind);
  if (!entry) return null;
  if (
    entry.contactKind !== 'water-cache' &&
    entry.contactKind !== 'salvage-wreck' &&
    entry.contactKind !== 'memorial'
  )
    return null;
  return {
    variant: entry.id,
    contactKind: entry.contactKind,
    title: entry.title,
    summary: entry.description,
    safeOutcome:
      entry.contactKind === 'salvage-wreck'
        ? 'Secure recovery remains 24 scrap and 2 components.'
        : entry.contactKind === 'water-cache'
          ? 'The existing cache can provide up to 4 water after the task.'
          : 'The existing memorial record becomes readable after the task.',
    deepOutcome:
      entry.contactKind === 'salvage-wreck'
        ? 'Broadcast recovery keeps the existing hostile patrol and 48 scrap / 6 components cap.'
        : 'The deeper point reveals the existing site reward; it adds no new resource rule.',
    riskLabel: riskLabels[entry.id],
    task: {
      id: taskIds[entry.id],
      label: entry.interactions.service.label,
      anchor: entry.interactions.service.id,
      fallback: entry.interactions.service.fallback,
      holdS: 1.2,
    },
    retrieval: entry.interactions.retrieval,
  };
}
export function projectOpportunityExpedition(
  contact: Readonly<RouteContact>,
): OpportunityExpeditionView | null {
  const definition = expeditionDefinition(contact.kind);
  if (!definition) return null;
  const step = contact.expedition?.step ?? 'task-ready';
  return {
    definition,
    step,
    canWork: contact.state === 'docked' && step !== 'task-complete',
    rewardUnlocked: step === 'task-complete',
    salvageChoiceUnlocked: contact.kind === 'salvage-wreck' && step === 'task-complete',
    service: {
      id: definition.task.anchor,
      label: definition.task.label,
      fallback: definition.task.fallback,
    },
    retrieval: definition.retrieval,
  };
}
export const projectExpedition = projectOpportunityExpedition;
export function completeProjectedTask(contact: RouteContact): RouteContact {
  if (!expeditionDefinition(contact.kind))
    return { ...contact, rewards: contact.rewards.map((reward) => ({ ...reward })) };
  return {
    ...contact,
    rewards: contact.rewards.map((reward) => ({ ...reward })),
    expedition: { format: 1, step: 'task-complete' },
  };
}
