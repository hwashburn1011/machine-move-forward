import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DECK_SURFACE_Y } from '@/game/constants';
import { LAST_GARDEN_MERIDIAN } from '@/data/story';
import { Destination } from '@/story/Destination';

describe('Meridian destination fallback geometry', () => {
  it('keeps every authored interaction reachable in the fallback deck bounds', () => {
    const destination = new Destination({
      scene: new THREE.Scene(),
      definition: LAST_GARDEN_MERIDIAN,
      arrivalDistance: 1250,
    });
    destination.setActive(true);
    destination.setDocked(true);

    expect(destination.interactables).toHaveLength(LAST_GARDEN_MERIDIAN.interactables.length);
    for (const definition of LAST_GARDEN_MERIDIAN.interactables) {
      const item = destination.interactables.find((entry) => entry.id === definition.id);
      expect(item).toBeDefined();
      expect(item!.position.x).toBeCloseTo(
        LAST_GARDEN_MERIDIAN.placement.root.x + definition.fallback.x,
        8,
      );
      expect(item!.position.y).toBeCloseTo(DECK_SURFACE_Y + definition.fallback.y, 8);
      expect(item!.position.z).toBeCloseTo(definition.fallback.z, 8);
      expect(destination.containsPlayer(item!.position)).toBe(true);
    }
    destination.dispose();
  });

  it('moves fallback physics and interactions together across repeated lateral placements', () => {
    const destination = new Destination({
      scene: new THREE.Scene(),
      definition: LAST_GARDEN_MERIDIAN,
      arrivalDistance: 1250,
    });
    destination.setActive(true);
    destination.setDocked(true);
    const local = LAST_GARDEN_MERIDIAN.interactables[0]!.fallback;

    for (const rootX of [17, -240, 1_000_000, 17]) {
      destination.setLateralRoot(rootX);
      const item = destination.interactables[0]!;
      expect(item.position.x).toBeCloseTo(rootX + local.x, 8);
      expect(item.position.z).toBeCloseTo(local.z, 8);
      expect(destination.containsPlayer(item.position)).toBe(true);
    }
    destination.dispose();
  });
});
