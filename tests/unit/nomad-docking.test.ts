import { describe, expect, it } from 'vitest';
import profile from '@/data/iron-nomad.json';
import { nomadDockRoot, OPTIONAL_DOCK_ROOT_X } from '@/data/nomad-docking';
import { DESERT_OPPORTUNITIES, opportunityDefinition } from '@/data/opportunities';
import { STORY_EXPEDITIONS } from '@/data/story';
import type { DestinationDefinition } from '@/story/Destination';

function expectDockedOutsideNomad(definition: DestinationDefinition): void {
  const { root, gangway } = definition.placement;
  const gangwayCollider = definition.colliders.find((collider) => collider.id === 'gangway');
  const floor = definition.colliders.find((collider) => collider.id === 'floor');
  expect(gangwayCollider, `${definition.id} gangway collider`).toBeDefined();
  expect(floor, `${definition.id} floor collider`).toBeDefined();

  const halfWidth = gangwayCollider!.half.x;
  expect(root.x).toBe(nomadDockRoot(gangway.x, halfWidth));
  expect(root.x + gangway.x - halfWidth).toBe(profile.walkable.upper.halfWidth);
  expect(gangwayCollider!.at).toEqual(gangway);

  const floorNearEdge = root.x + floor!.at.x - floor!.half.x;
  expect(floorNearEdge).toBeGreaterThan(profile.walkable.upper.halfWidth);
}

describe('expanded Nomad docking contract', () => {
  it('derives every story destination from the upper gate and keeps its floor outside the hull', () => {
    for (const definition of STORY_EXPEDITIONS) expectDockedOutsideNomad(definition);
  });

  it('derives every optional destination from the same gate and keeps its floor outside the hull', () => {
    for (const opportunity of Object.values(DESERT_OPPORTUNITIES)) {
      expectDockedOutsideNomad(opportunityDefinition(opportunity.contactKind));
    }
    expectDockedOutsideNomad(opportunityDefinition('repair-depot'));
    expect(OPTIONAL_DOCK_ROOT_X).toBe(19);
  });
});
