import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { bevelledBox } from '@/machine/MachineGeometry';

/**
 * The enemy's collider, and the procedural body drawn inside it.
 *
 * Split out of `Enemy` so `EnemyVisual` can reach both without importing
 * `Enemy` — which imports `EnemyVisual` in turn. A circular ES import there
 * resolves to a partially-initialised binding and fails at runtime as an
 * undefined constant rather than at compile time, so the two live here
 * instead, below both.
 */

export const CAPSULE_RADIUS = 0.36;
export const CAPSULE_HALF_HEIGHT = 0.6;

/** Distance from the capsule's centre down to the ground it stands on. */
export const CAPSULE_FOOT_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

/**
 * Deliberately different in proportion from the player — taller, narrower,
 * hunched — so the two are distinguishable at a glance and in silhouette.
 */
export function buildEnemyMesh(materials: Materials): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  add(bevelledBox(0.44, 0.72, 0.3, 0.05), materials.rustedSteel, 1.16); // torso
  add(bevelledBox(0.56, 0.16, 0.32, 0.04), materials.hullDark, 1.5); // shoulders
  add(bevelledBox(0.22, 0.22, 0.24, 0.04), materials.hullDark, 1.66); // head
  add(bevelledBox(0.14, 0.56, 0.14, 0.03), materials.rustedSteel, 1.1, -0.3);
  add(bevelledBox(0.14, 0.56, 0.14, 0.03), materials.rustedSteel, 1.1, 0.3);
  add(bevelledBox(0.17, 0.6, 0.17, 0.03), materials.hullDark, 0.5, -0.12);
  add(bevelledBox(0.17, 0.6, 0.17, 0.03), materials.hullDark, 0.5, 0.12);
  // Hostile red eye slit — reads instantly as a threat, even at distance.
  add(bevelledBox(0.16, 0.05, 0.03, 0.01), materials.emissiveWarn, 1.68, 0, 0.13);

  return g;
}
