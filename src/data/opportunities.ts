import { OPTIONAL_DOCK_ROOT_X } from './nomad-docking';
import type { RouteContactKind } from '@/navigation/RouteChart';
import type { DestinationDefinition } from '@/story/Destination';

export type DesertOpportunityId = 'collapsed-service-depot' | 'wrecked-convoy' | 'damaged-relay';
export type DesertOperationStep = 'service' | 'retrieval';

export interface DesertOpportunityDefinition {
  id: DesertOpportunityId;
  contactKind: RouteContactKind;
  title: string;
  modelId: string;
  description: string;
  hazard: 'calm' | 'uncertain' | 'hostile';
  placement: DestinationDefinition['placement'];
  colliders: DestinationDefinition['colliders'];
  /** The two physical interactions the Game maps to Destination interactables. */
  interactions: {
    service: { id: string; label: string; fallback: { x: number; y: number; z: number } };
    retrieval: { id: string; label: string; fallback: { x: number; y: number; z: number } };
  };
}

const commonPlacement: DestinationDefinition['placement'] = {
  root: { x: OPTIONAL_DOCK_ROOT_X, y: 0, z: 0 },
  entryAnchor: { x: -6.5, y: 0, z: 0 },
  exitSightline: { x: -6.5, y: 1, z: 0 },
  gangway: { x: -6.5, y: -0.08, z: 0 },
};
const commonColliders: DestinationDefinition['colliders'] = [
  { id: 'floor', half: { x: 6, y: 0.12, z: 5 }, at: { x: 0, y: -0.12, z: 0 } },
  { id: 'gangway', half: { x: 0.5, y: 0.08, z: 1 }, at: { x: -6.5, y: -0.08, z: 0 } },
  { id: 'north', half: { x: 6, y: 0.6, z: 0.07 }, at: { x: 0, y: 0.6, z: -4.9 } },
  { id: 'south', half: { x: 6, y: 0.6, z: 0.07 }, at: { x: 0, y: 0.6, z: 4.9 } },
  { id: 'east', half: { x: 0.07, y: 0.6, z: 5 }, at: { x: 5.9, y: 0.6, z: 0 } },
  ...[-3.1, 3.1].map((z) => ({
    id: `west-${z}`,
    half: { x: 0.07, y: 0.6, z: 1.9 },
    at: { x: -5.9, y: 0.6, z },
  })),
];

const op = (
  id: DesertOpportunityId,
  contactKind: RouteContactKind,
  title: string,
  description: string,
  hazard: DesertOpportunityDefinition['hazard'],
  modelId: string,
  service: DesertOpportunityDefinition['interactions']['service'],
  retrieval: DesertOpportunityDefinition['interactions']['retrieval'],
  extra: DestinationDefinition['colliders'],
): DesertOpportunityDefinition => ({
  id,
  contactKind,
  title,
  description,
  hazard,
  modelId,
  placement: commonPlacement,
  colliders: [...commonColliders, ...extra],
  interactions: { service, retrieval },
});

/** Optional physical task layouts. Base RouteChart rewards remain authoritative. */
export const DESERT_OPPORTUNITIES: Readonly<
  Record<DesertOpportunityId, DesertOpportunityDefinition>
> = {
  'collapsed-service-depot': op(
    'collapsed-service-depot',
    'water-cache',
    'Collapsed service depot',
    'A fallen service bay still has one reachable bench and a deeper locker.',
    'calm',
    'opportunity-service-depot',
    {
      id: 'service-bench',
      label: 'Stabilize service bench',
      fallback: { x: -2.8, y: 0.8, z: -1.8 },
    },
    {
      id: 'service-locker',
      label: 'Recover the deep service locker',
      fallback: { x: 2, y: 0.9, z: 2.8 },
    },
    [
      { id: 'collapsed-roof', half: { x: 1.8, y: 0.45, z: 1.2 }, at: { x: 1, y: 1.6, z: -2.5 } },
      { id: 'locker', half: { x: 0.8, y: 0.9, z: 0.65 }, at: { x: 3.2, y: 0.9, z: 2.8 } },
    ],
  ),
  'wrecked-convoy': op(
    'wrecked-convoy',
    'salvage-wreck',
    'Wrecked convoy',
    'A disabled convoy offers an exposed crate before its buried cargo bay.',
    'hostile',
    'opportunity-wrecked-convoy',
    { id: 'convoy-service', label: 'Cut the convoy seal', fallback: { x: -2.5, y: 0.7, z: -1.6 } },
    {
      id: 'convoy-retrieval',
      label: 'Retrieve the buried cargo',
      fallback: { x: 0.7, y: 0.65, z: 2.6 },
    },
    [
      { id: 'front-wreck', half: { x: 2.1, y: 0.7, z: 0.75 }, at: { x: 0.2, y: 0.7, z: -2.1 } },
      { id: 'rear-wreck', half: { x: 1.4, y: 0.55, z: 0.8 }, at: { x: 2.4, y: 0.55, z: 2.3 } },
    ],
  ),
  'damaged-relay': op(
    'damaged-relay',
    'memorial',
    'Damaged relay',
    'A cracked relay can be serviced from the aisle; a sheltered reserve sits behind it.',
    'uncertain',
    'opportunity-damaged-relay',
    { id: 'relay-service', label: 'Restore relay power', fallback: { x: -2.4, y: 0.8, z: 1.2 } },
    {
      id: 'relay-reserve',
      label: 'Recover the relay reserve',
      fallback: { x: 2, y: 0.8, z: -2.8 },
    },
    [
      { id: 'relay-shell', half: { x: 1.3, y: 1.25, z: 0.8 }, at: { x: 0.4, y: 1.25, z: 0.2 } },
      { id: 'relay-cabinet', half: { x: 0.7, y: 0.8, z: 0.65 }, at: { x: 3.1, y: 0.8, z: -2.8 } },
    ],
  ),
};

export function desertOpportunityForContact(
  kind: RouteContactKind,
): DesertOpportunityDefinition | null {
  return Object.values(DESERT_OPPORTUNITIES).find((entry) => entry.contactKind === kind) ?? null;
}

/** Adapt the data-only operation layout to Destination's existing interactable contract. */
export function desertDestinationDefinition(id: DesertOpportunityId): DestinationDefinition {
  const entry = DESERT_OPPORTUNITIES[id];
  return {
    id: `opportunity-${id}`,
    title: entry.title,
    modelId: entry.modelId,
    placement: entry.placement,
    colliders: entry.colliders,
    interactables: [
      {
        id: 'opportunity-reward',
        label:
          entry.contactKind === 'memorial'
            ? 'Read the relay record'
            : 'Recover accessible supplies',
        // Route rewards are dispatched by Game's opportunity handler; using
        // an always-visible interaction kind avoids story-journal filtering.
        kind: 'departure',
        anchor: 'Reward',
        fallback: { x: 0, y: 0.8, z: 0 },
      },
      {
        id: entry.interactions.service.id,
        label: entry.interactions.service.label,
        kind: 'departure',
        anchor: entry.interactions.service.id,
        fallback: entry.interactions.service.fallback,
      },
      {
        id: entry.interactions.retrieval.id,
        label: entry.interactions.retrieval.label,
        kind: 'departure',
        anchor: entry.interactions.retrieval.id,
        fallback: entry.interactions.retrieval.fallback,
      },
      {
        id: `${id}-departure`,
        label: 'Depart — leave the remaining supplies behind',
        kind: 'departure',
        anchor: 'Gangway',
        fallback: entry.placement.gangway,
      },
    ],
  };
}

export const OPPORTUNITIES = {
  'water-cache': {
    title: 'Linekeeper water cache',
    description: 'A sealed reserve left for machines carrying civilian cargo.',
    hazard: 'Quiet salvage stop',
    model: 'opportunity-service-depot',
  },
  'salvage-wreck': {
    title: 'Burned service tender',
    description: 'A maintenance platform with usable metal under its scorched shell.',
    hazard: 'Custodian patrol risk',
    model: 'opportunity-wrecked-convoy',
  },
  memorial: {
    title: 'Last shift transmitter',
    description: 'A small relay still broadcasting the names of its missing crew.',
    hazard: 'Quiet listening stop',
    model: 'opportunity-damaged-relay',
  },
  'repair-depot': {
    title: 'Linekeeper repair depot',
    description:
      'A calm depot preserving machines and the benevolent intelligence that kept them moving.',
    hazard: 'Calm approach',
    model: 'route-repair-depot',
  },
} as const;
export const MEMORIAL_MESSAGE =
  'ANNIKA / LINEKEEPER RECORD 06\n\nMara kept the pump running. Tomas checked every passenger twice. When the order came to seal the doors, Unit S-04 reported a failed lock. There was no failed lock.\n\nIf you can hear this, leave the relay open. Someone may still be listening.';
export const DEPOT_MESSAGE =
  'LINEKEEPER / SERVICE LOG 41\n\nThe last convoy used our spare actuator. They left a drawing of the coast and a promise to return it. I have kept the bay clear.\n\nA Custodian patrol asked why an empty depot still draws power. I reported a welded relay. It seemed kinder than explaining that keeping a promise can take a very long time.\n\nTake the repair kit if you need it. Leave the bench ready for the next traveller. — Depot unit L-12';
export function opportunityDefinition(kind: RouteContactKind): DestinationDefinition {
  const desert = desertOpportunityForContact(kind);
  if (desert) return desertDestinationDefinition(desert.id);
  const info = OPPORTUNITIES[kind];
  return {
    id: 'opportunity-' + kind,
    title: info.title,
    modelId: info.model,
    placement: {
      root: { x: OPTIONAL_DOCK_ROOT_X, y: 0, z: 0 },
      entryAnchor: { x: -6.5, y: 0, z: 0 },
      exitSightline: { x: -6.5, y: 1, z: 0 },
      gangway: { x: -6.5, y: -0.08, z: 0 },
    },
    colliders: [
      { id: 'floor', half: { x: 6, y: 0.12, z: 5 }, at: { x: 0, y: -0.12, z: 0 } },
      { id: 'gangway', half: { x: 0.5, y: 0.08, z: 1 }, at: { x: -6.5, y: -0.08, z: 0 } },
      { id: 'north', half: { x: 6, y: 0.6, z: 0.07 }, at: { x: 0, y: 0.6, z: -4.9 } },
      { id: 'south', half: { x: 6, y: 0.6, z: 0.07 }, at: { x: 0, y: 0.6, z: 4.9 } },
      { id: 'east', half: { x: 0.07, y: 0.6, z: 5 }, at: { x: 5.9, y: 0.6, z: 0 } },
      ...[-3.1, 3.1].map((z) => ({
        id: 'west-' + z,
        half: { x: 0.07, y: 0.6, z: 1.9 },
        at: { x: -5.9, y: 0.6, z },
      })),
      ...(kind === 'repair-depot'
        ? [
            { id: 'locker', half: { x: 1, y: 1, z: 0.75 }, at: { x: -3, y: 1, z: -2.6 } },
            { id: 'workbench', half: { x: 1.8, y: 0.56, z: 1.1 }, at: { x: -3, y: 0.56, z: 3.2 } },
            {
              id: 'hanging-actuator',
              half: { x: 0.4, y: 1.5, z: 0.4 },
              at: { x: 1.3, y: 1.8, z: 2.8 },
            },
            ...[-4.7, 4.7].map((x) => ({
              id: 'gantry-' + x,
              half: { x: 0.21, y: 2.75, z: 0.21 },
              at: { x, y: 2.75, z: 2.8 },
            })),
            ...[3, 4.5].map((x) => ({
              id: 'bottle-' + x,
              half: { x: 0.28, y: 1, z: 0.28 },
              at: { x, y: 1, z: -2.7 },
            })),
          ]
        : [{ id: 'equipment', half: { x: 1.8, y: 1.2, z: 1.3 }, at: { x: 1.5, y: 1.2, z: 0 } }]),
      { id: 'console', half: { x: 0.45, y: 0.55, z: 0.35 }, at: { x: -2, y: 0.55, z: 1.5 } },
    ],
    interactables: [
      {
        id: 'opportunity-reward',
        label: kind === 'memorial' ? 'Read last shift recording' : 'Recover cached supplies',
        kind: kind === 'memorial' ? 'journal' : 'unique',
        anchor: 'Reward',
        fallback: { x: -2, y: 1.2, z: 1.5 },
      },
      {
        id: 'opportunity-departure',
        label: 'Depart — leave unclaimed supplies behind',
        kind: 'departure',
        anchor: 'Gangway',
        fallback: { x: -6.5, y: 0.2, z: 0 },
      },
    ],
  };
}
