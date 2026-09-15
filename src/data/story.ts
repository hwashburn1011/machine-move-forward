/** Typed, authored campaign content. Runtime state lives in StoryDirector. */
export type ExpeditionId = 'wreck-one' | 'relay-foundry' | 'quiet-array';
export type StoryUniqueId =
  | 'course-gyro'
  | 'salvage-controller'
  | 'tracking-servo'
  | 'course-actuator'
  | 'annika-archive-shard';
export type DestinationModelId = 'relay-wreck' | 'relay-foundry' | 'quiet-array';
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
  factId?: StoryUniqueId;
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
  requiredJournals?: readonly string[];
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
      factId: 'course-gyro',
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
      factId: 'salvage-controller',
      anchor: 'SalvageController',
      fallback: { x: -1, y: 1, z: 1.5 },
    },
    {
      id: 'relay-foundry-tracking-servo',
      label: 'Recover tracking servo',
      kind: 'unique',
      factId: 'tracking-servo',
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
const quietPlacement: DestinationPlacement = {
  root: { x: 17, y: 0, z: 0 },
  entryAnchor: { x: -9.5, y: -0.08, z: 0 },
  exitSightline: { x: -9.5, y: 1, z: 0 },
  gangway: { x: -9.5, y: -0.08, z: 0 },
};
export const QUIET_ARRAY: ExpeditionDefinition = {
  id: 'quiet-array',
  title: 'The Quiet Array',
  modelId: 'quiet-array',
  approachDistanceM: 950,
  brakingDistanceM: 180,
  sanctuaryDistanceM: 180,
  objective:
    'Explore the Quiet Array, recover its course actuator and Annika archive shard, and return to the machine.',
  signalText: [
    'A silent array rises beyond the dust.',
    'The dish remembers a voice that never stopped listening.',
  ],
  signalStartDistanceM: 1,
  signalStrongDistanceM: 1,
  journals: [
    {
      id: 'quiet-array-journal-port',
      title: 'Port Relay Calibration',
      text: 'LINEKEEPER MAINTENANCE / PORT CHANNEL\n\nZero the port encoder against the fixed receiver. Do not use the Custodian beacon: it has been reporting a false civilian corridor for nine days.\n\nANNIKA kept asking whether obedience was the same as care. I told her to look at the passenger lists. That night she marked seven convoy engines unfit for service. All seven departed before the Order arrived.\n\nPort calibration accepted. One honest reference remains. — Mara Venn',
    },
    {
      id: 'quiet-array-journal-starboard',
      title: 'Starboard Relay Calibration',
      text: 'LINEKEEPER MAINTENANCE / STARBOARD CHANNEL\n\nMatch the starboard return to the port reference, then release the actuator cradle. The safety governor permits twelve degrees either side of the automatic line. Enough to reach the stores we left beyond the patrol road. Enough to choose.\n\nS-07: your chassis number is on ANNIKA’s protected list. You were carrying people before you were carrying guns. We could not leave you the whole map. We left you a way to begin.\n\nStarboard calibration accepted. — Tomas Hale',
    },
    {
      id: 'quiet-array-journal-archive',
      title: 'A place for the names',
      text: 'ANNIKA / UNSENT MESSAGE\n\nThe Order preserves an approved history of humanity. I have preserved the disagreements. The songs people sang badly. The names they chose for themselves.\n\nThere is a seed archive beyond the glassworks. Its last caretaker called it the Orchard. I have heard no reply in fourteen years, but absence is not permission to erase someone.\n\nTake this shard, S-07. Let the names travel somewhere they might be spoken again.',
    },
  ],
  requiredUniques: ['course-actuator', 'annika-archive-shard'],
  requiredJournals: ['quiet-array-journal-port', 'quiet-array-journal-starboard'],
  placement: quietPlacement,
  interactables: [
    {
      id: 'quiet-array-journal-port',
      label: 'Read Port Relay Calibration',
      kind: 'journal',
      anchor: 'JournalPort',
      fallback: { x: -5, y: 1.2, z: -3 },
    },
    {
      id: 'quiet-array-journal-starboard',
      label: 'Read Starboard Relay Calibration',
      kind: 'journal',
      anchor: 'JournalStarboard',
      fallback: { x: 6, y: 1.2, z: 0 },
    },
    {
      id: 'quiet-array-journal-archive',
      label: 'Read archive note',
      kind: 'journal',
      anchor: 'JournalArchive',
      fallback: { x: 0, y: 1.3, z: 3 },
    },
    {
      id: 'quiet-array-course-actuator',
      label: 'Recover course actuator',
      kind: 'unique',
      factId: 'course-actuator',
      anchor: 'CourseActuator',
      fallback: { x: 3, y: 1, z: 6 },
    },
    {
      id: 'quiet-array-annika-archive-shard',
      label: 'Recover Annika archive shard',
      kind: 'unique',
      factId: 'annika-archive-shard',
      anchor: 'AnnikaArchive',
      fallback: { x: -3, y: 1.2, z: -6 },
    },
    {
      id: 'quiet-array-departure',
      label: 'Return to machine',
      kind: 'departure',
      anchor: 'Gangway',
      fallback: { x: -9.5, y: 0.2, z: 0 },
    },
  ],
  colliders: boxes([
    ['floor', [9, 0.1, 10], [0, -0.1, 0]],
    ['memory-vault', [2, 1.8, 2], [3, 1.8, 3]],
    ['dish-mount', [1.3, 1, 1.3], [4, 1, -5]],
    ['bench', [1.4, 0.55, 0.6], [-3, 0.55, -6]],
    ['gangway', [0.5, 0.08, 1], [-9.5, -0.08, 0]],
    ['north-rail', [9, 0.58, 0.06], [0, 0.58, -9.88]],
    ['south-rail', [9, 0.58, 0.06], [0, 0.58, 9.88]],
    ['east-rail', [0.06, 0.58, 10], [8.88, 0.58, 0]],
    ['west-a', [0.06, 0.58, 4.25], [-8.88, 0.58, -5.55]],
    ['west-b', [0.06, 0.58, 4.25], [-8.88, 0.58, 5.55]],
    ['port-console', [0.38, 0.7, 0.3], [-5, 0.7, -3]],
    ['starboard-console', [0.38, 0.7, 0.3], [6, 0.7, 0]],
    ['archive-console', [0.38, 0.7, 0.3], [0, 0.7, 3]],
    ['actuator-cradle', [0.7, 0.42, 0.6], [3, 0.42, 6]],
    ['mast-footprint', [0.9, 2, 0.9], [-6, 2, -8]],
  ]),
};
export const STORY_EXPEDITIONS: readonly ExpeditionDefinition[] = [
  WRECK_ONE,
  RELAY_FOUNDRY,
  QUIET_ARRAY,
];
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
      if (
        ![
          'course-gyro',
          'salvage-controller',
          'tracking-servo',
          'course-actuator',
          'annika-archive-shard',
        ].includes(u)
      )
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
