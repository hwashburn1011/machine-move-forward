import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { bevelledBox } from '@/machine/MachineGeometry';

/**
 * The player's procedural body, and the fallback when no model is present.
 *
 * Lives apart from `Player` so `PlayerVisual` can build it without importing
 * `Player`, which imports `PlayerVisual` in turn. A circular ES import there
 * resolves to a partially-initialised binding and fails at runtime rather than
 * at compile time -- the same trap the enemy visual had to be pulled out of.
 */
/**
 * A blocky scavenger figure. Deliberately simple, but with a distinct
 * silhouette — the player sees this from behind for the entire game, so its
 * shape matters more than its detail.
 */
export function buildPlayerMesh(materials: Materials): THREE.Group {
  const g = new THREE.Group();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  add(bevelledBox(0.52, 0.62, 0.34, 0.06), materials.hull, 1.18); // torso
  add(bevelledBox(0.62, 0.22, 0.4, 0.05), materials.hullDark, 1.44); // shoulders/pack
  add(bevelledBox(0.26, 0.26, 0.26, 0.05), materials.deckPlate, 1.68); // head
  add(bevelledBox(0.18, 0.5, 0.18, 0.04), materials.hullDark, 1.12, -0.34); // arms
  add(bevelledBox(0.18, 0.5, 0.18, 0.04), materials.hullDark, 1.12, 0.34);
  add(bevelledBox(0.2, 0.62, 0.2, 0.04), materials.hullDark, 0.56, -0.14); // legs
  add(bevelledBox(0.2, 0.62, 0.2, 0.04), materials.hullDark, 0.56, 0.14);
  // A single accent so the player reads instantly against the deck.
  add(bevelledBox(0.3, 0.1, 0.36, 0.03), materials.accent, 1.35);

  return g;
}
