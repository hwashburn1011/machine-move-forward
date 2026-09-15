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
} as const;
export const MEMORIAL_MESSAGE =
  'ANNIKA / LINEKEEPER RECORD 06\n\nMara kept the pump running. Tomas checked every passenger twice. When the order came to seal the doors, Unit S-04 reported a failed lock. There was no failed lock.\n\nIf you can hear this, leave the relay open. Someone may still be listening.';
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
      { id: 'equipment', half: { x: 1.8, y: 1.2, z: 1.3 }, at: { x: 1.5, y: 1.2, z: 0 } },
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
