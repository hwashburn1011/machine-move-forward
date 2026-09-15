import type { RouteContactKind } from '@/navigation/RouteChart';
import type { DestinationDefinition } from '@/story/Destination';

export const OPPORTUNITIES = {
  'water-cache': {
    title: 'Linekeeper water cache',
    description: 'A sealed reserve left for machines carrying civilian cargo.',
    hazard: 'Quiet salvage stop',
    model: 'route-water-cache',
  },
  'salvage-wreck': {
    title: 'Burned service tender',
    description: 'A maintenance platform with usable metal under its scorched shell.',
    hazard: 'Custodian patrol risk',
    model: 'route-salvage-wreck',
  },
  memorial: {
    title: 'Last shift transmitter',
    description: 'A small relay still broadcasting the names of its missing crew.',
    hazard: 'Quiet listening stop',
    model: 'route-memorial',
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
  const info = OPPORTUNITIES[kind];
  return {
    id: 'opportunity-' + kind,
    title: info.title,
    modelId: info.model,
    placement: {
      root: { x: 14, y: 0, z: 0 },
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
