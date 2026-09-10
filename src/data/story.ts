/** Typed, authored campaign content. Runtime state lives in StoryDirector. */
export type ExpeditionId = 'wreck-one' | 'relay-foundry';
export type StoryUniqueId = 'course-gyro' | 'salvage-controller' | 'tracking-servo';
export type DestinationModelId = 'relay-wreck' | 'relay-foundry';
export interface StoryJournal {
  id: string;
  title: string;
  text: string;
}
export interface DestinationPlacement {
  root: { x: number; y: number; z: number };
  entryAnchor: { x: number; y: number; z: number };
  exitSightline: { x: number; y: number; z: number };
  gangway: { x: number; y: number; z: number };
}
export interface DestinationInteractableDefinition {
  id: string;
  label: string;
  kind: 'journal' | 'unique' | 'departure';
  anchor: string;
  fallback: { x: number; y: number; z: number };
}
export interface DestinationColliderDefinition {
  id: string;
  half: { x: number; y: number; z: number };
  at: { x: number; y: number; z: number };
}
export interface ExpeditionDefinition {
  id: ExpeditionId;
  title: string;
  modelId: DestinationModelId;
  approachDistanceM: number;
  brakingDistanceM: number;
  sanctuaryDistanceM: number;
  objective: string;
  signalText: readonly string[];
  signalStartDistanceM: number;
  signalStrongDistanceM: number;
  journals: readonly StoryJournal[];
  requiredUniques: readonly StoryUniqueId[];
  placement: DestinationPlacement;
  interactables: readonly DestinationInteractableDefinition[];
  colliders: readonly DestinationColliderDefinition[];
}
export const WRECK_CHAPTER_ID = 'wreck-one' as const;
const wreckPlacement: DestinationPlacement = {
  root: { x: 14, y: 0, z: 0 },
  entryAnchor: { x: -6.5, y: -0.08, z: 0 },
  exitSightline: { x: -6.5, y: 1, z: 0 },
  gangway: { x: -6.5, y: -0.08, z: 0 },
};
const boxes = (
  items: readonly (readonly [string, readonly number[], readonly number[]])[],
): readonly DestinationColliderDefinition[] =>
  items.map(([id, h, a]) => ({
    id,
    half: { x: h[0]!, y: h[1]!, z: h[2]! },
    at: { x: a[0]!, y: a[1]!, z: a[2]! },
  }));
const wreckColliders = boxes([
  ['floor', [6, 0.1, 9], [0, -0.1, 0]],
  ['west-north', [0.1, 1.25, 4], [-5.9, 1.25, -5]],
  ['west-south', [0.1, 1.25, 4], [-5.9, 1.25, 5]],
  ['east', [0.1, 1.25, 9], [5.9, 1.25, 0]],
  ['north', [6, 1.25, 0.1], [0, 1.25, -8.9]],
  ['south', [6, 1.25, 0.1], [0, 1.25, 8.9]],
  ['inner-north', [0.1, 1.25, 4], [2, 1.25, -5]],
  ['inner-south', [0.1, 1.25, 4], [2, 1.25, 5]],
  ['gyro', [0.45, 0.45, 0.45], [4.5, 0.45, 3]],
  ['cargo', [1.1, 0.55, 1.1], [-1, 0.55, -5.8]],
  ['engine', [1.4, 0.4, 0.8], [-2, 0.4, 5.8]],
  ['gangway', [0.5, 0.08, 1], [-6.5, -0.08, 0]],
]);
export const WRECK_ONE: ExpeditionDefinition = {
  id: 'wreck-one',
  title: 'The Wake',
  modelId: 'relay-wreck',
  approachDistanceM: 700,
  brakingDistanceM: 180,
  sanctuaryDistanceM: 180,
  signalText: [
    '…static… a caravan voice repeats beneath the hiss.',
    'ANNIKA relay: route marker ahead. Something still remembers.',
  ],
  signalStartDistanceM: 2200,
  signalStrongDistanceM: 100,
  journals: [
    {
      id: 'wreck-one-journal-cargo',
      title: 'Cargo manifest',
      text: 'The cities sealed their wells, then stopped answering. ANNIKA kept the line open until the last wheel failed.',
    },
    {
      id: 'wreck-one-journal-crew',
      title: 'Night watch',
      text: 'Maintenance drones still patrol the old road. They call every living traveller an obstruction.',
    },
    {
      id: 'wreck-one-journal-route',
      title: 'Relay note',
      text: 'A live relay tower blinks beyond the route. Follow its bearing if your walker can leave the line.',
    },
  ],
  requiredUniques: ['course-gyro'],
  objective: 'Explore the wreck, recover its course gyro, and return to the machine.',
  placement: wreckPlacement,
  interactables: [
    {
      id: 'wreck-one-journal-cargo',
      label: 'Read cargo journal',
      kind: 'journal',
      anchor: 'JournalCargo',
      fallback: { x: -1, y: 1.115, z: -5.8 },
    },
    {
      id: 'wreck-one-journal-crew',
      label: 'Read crew journal',
      kind: 'journal',
      anchor: 'JournalCrew',
      fallback: { x: -2, y: 0.815, z: 5.8 },
    },
    {
      id: 'wreck-one-journal-route',
      label: 'Read route journal',
      kind: 'journal',
      anchor: 'JournalRoute',
      fallback: { x: -5.74, y: 1.05, z: -2 },
    },
    {
      id: 'wreck-one-course-gyro',
      label: 'Recover course gyro',
      kind: 'unique',
      anchor: 'CourseGyro',
      fallback: { x: 4.5, y: 0.92, z: 3 },
    },
  ],
  colliders: wreckColliders,
};
const foundryPlacement: DestinationPlacement = {
  root: { x: 15, y: 0, z: 0 },
  entryAnchor: { x: -7, y: 0, z: 0 },
  exitSightline: { x: -5.8, y: 1.6, z: 0 },
  gangway: { x: -7.5, y: -0.08, z: 0 },
};
export const RELAY_FOUNDRY: ExpeditionDefinition = {
  id: 'relay-foundry',
  title: 'Relay Foundry',
  modelId: 'relay-foundry',
  approachDistanceM: 0,
  brakingDistanceM: 180,
  sanctuaryDistanceM: 180,
  signalText: [
    'A relay mast cuts through the dust.',
    'The Foundry beacon answers with a steady green pulse.',
  ],
  signalStartDistanceM: 1,
  signalStrongDistanceM: 1,
  journals: [
    {
      id: 'relay-foundry-journal-log',
      title: 'Foundry log',
      text: 'The relay workers built machines to outlast the roads. Their last instruction is still intact.',
    },
    {
      id: 'relay-foundry-journal-blueprint',
      title: 'Maintenance blueprint',
      text: 'Two specialist stations remain serviceable if their control cores can be recovered.',
    },
  ],
  requiredUniques: ['salvage-controller', 'tracking-servo'],
  objective:
    'Explore the Relay Foundry, recover both specialist components, and return to the machine.',
  placement: foundryPlacement,
  interactables: [
    {
      id: 'relay-foundry-journal-log',
      label: 'Read foundry log',
      kind: 'journal',
      anchor: 'JournalLog',
      fallback: { x: -2, y: 1, z: -2 },
    },
    {
      id: 'relay-foundry-journal-blueprint',
      label: 'Read maintenance blueprint',
      kind: 'journal',
      anchor: 'JournalBlueprint',
      fallback: { x: 1, y: 1.23, z: 2 },
    },
    {
      id: 'relay-foundry-salvage-controller',
      label: 'Recover salvage controller',
      kind: 'unique',
      anchor: 'SalvageController',
      fallback: { x: -1, y: 1, z: 1.5 },
    },
    {
      id: 'relay-foundry-tracking-servo',
      label: 'Recover tracking servo',
      kind: 'unique',
      anchor: 'TrackingServo',
      fallback: { x: 3, y: 1, z: -1.5 },
    },
    {
      id: 'relay-foundry-departure',
      label: 'Return to machine',
      kind: 'departure',
      anchor: 'Gangway',
      fallback: { x: -7.5, y: 0.2, z: 0 },
    },
  ],
  colliders: boxes([
    ['floor', [7, 0.1, 5], [0, -0.1, 0]],
    ['east-wall', [0.1, 1.5, 5], [6.9, 1.5, 0]],
    ['north-wall', [5.5, 1.5, 0.1], [1.5, 1.5, -4.9]],
    ['south-wall', [5.5, 1.5, 0.1], [1.5, 1.5, 4.9]],
    ['west-north', [0.1, 1.5, 1.5], [-6.9, 1.5, -3.5]],
    ['west-south', [0.1, 1.5, 1.5], [-6.9, 1.5, 3.5]],
    ['machine-shop', [1.4, 0.6, 1], [1, 0.6, 2]],
    ['alcove', [1.2, 0.4, 0.8], [3.5, 0.4, -2]],
    ['gangway', [0.5, 0.08, 1], [-7.5, -0.08, 0]],
    ['controller', [0.45, 0.45, 0.4], [-1, 0.45, 1.5]],
    ['log-console', [0.4, 0.45, 0.3], [-2, 0.45, -2]],
  ]),
};
export const STORY_EXPEDITIONS: readonly ExpeditionDefinition[] = [WRECK_ONE, RELAY_FOUNDRY];
export const STORY_CHAPTERS = STORY_EXPEDITIONS;
export function storyExpedition(id: string): ExpeditionDefinition | undefined {
  return STORY_EXPEDITIONS.find((x) => x.id === id);
}
export const storyChapter = storyExpedition;
export function validateStoryData(
  expeditions: readonly ExpeditionDefinition[] = STORY_EXPEDITIONS,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const interactions = new Set<string>();
  for (const e of expeditions) {
    if (ids.has(e.id)) errors.push(`duplicate expedition ${e.id}`);
    ids.add(e.id);
    if (!(
      Number.isFinite(e.approachDistanceM) &&
      (e.approachDistanceM > 0 || e.id === 'relay-foundry')
    ))
      errors.push(`invalid approach ${e.id}`);
    if (!(
      Number.isFinite(e.brakingDistanceM) &&
      Number.isFinite(e.sanctuaryDistanceM) &&
      e.brakingDistanceM > 0 &&
      e.sanctuaryDistanceM > 0
    ))
      errors.push(`invalid stop ${e.id}`);
    const expeditionUniques = new Set<string>();
    for (const u of e.requiredUniques) {
      if (!['course-gyro', 'salvage-controller', 'tracking-servo'].includes(u))
        errors.push(`unknown unique ${u}`);
      if (expeditionUniques.has(u)) errors.push(`duplicate unique ${u}`);
      expeditionUniques.add(u);
    }
    for (const i of e.interactables) {
      if (interactions.has(i.id)) errors.push(`duplicate interaction ${i.id}`);
      interactions.add(i.id);
    }
  }
  return errors;
}
