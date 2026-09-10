import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { DECK_SURFACE_Y, GRID_TILE } from '@/game/constants';
import type { Cell } from '@/building/BuildGrid';
import { bevelledBox, type MachineBuild } from './MachineGeometry';
import profile from '@/data/iron-nomad.json';
import obstacles from '@/data/iron-nomad-obstacles.json';

export function overNomadStairwell(c: Cell): boolean {
  const w = profile.stairwell;
  return (
    c.y > -2 &&
    c.y <= 0 &&
    c.x * GRID_TILE + 1 > w.minX &&
    c.x * GRID_TILE - 1 < w.maxX &&
    c.z * GRID_TILE + 1 > w.minZ &&
    c.z * GRID_TILE - 1 < w.maxZ
  );
}

export function nomadEquipmentCells(): Cell[] {
  const result = new Map<string, Cell>();
  for (const o of obstacles) {
    for (let x = Math.ceil((o.minX - 0.65) / 2); x <= Math.floor((o.maxX + 0.65) / 2); x++) {
      for (let z = Math.ceil((o.minZ - 0.65) / 2); z <= Math.floor((o.maxZ + 0.65) / 2); z++) {
        const c = { x, y: o.level, z };
        result.set(`${x},${o.level},${z}`, c);
      }
    }
  }
  // Reserved stair airspace remains unbuildable even though it has no floor.
  for (const y of [-1, 0]) for (const z of [-1, 0, 1]) result.set(`-1,${y},${z}`, { x: -1, y, z });
  return [...result.values()];
}

/** Gameplay support surfaces are shared by the authored and fallback paths. */
export function buildIronNomad(materials: Materials): MachineBuild {
  const group = new THREE.Group();
  group.name = 'IronNomad_PlayableMachine';
  const colliders: MachineBuild['colliders'] = [];
  function box(
    name: string,
    at: number[],
    size: number[],
    material: THREE.Material,
    fallback = false,
    collision = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(bevelledBox(size[0]!, size[1]!, size[2]!, 0.025), material);
    mesh.name = name;
    mesh.position.set(at[0]!, at[1]!, at[2]!);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.nomadFallback = fallback;
    group.add(mesh);
    if (collision)
      colliders.push({
        half: new THREE.Vector3(size[0]! / 2, size[1]! / 2, size[2]! / 2),
        center: mesh.position.clone(),
        blocksBuild: !fallback,
      });
    return mesh;
  }
  const w = profile.deckHalfWidth,
    l = profile.deckHalfLength;
  for (const level of [-2, -1, 0]) {
    const y = DECK_SURFACE_Y + 3 * level;
    const rects =
      level === -2
        ? [[-w, w, -l, l]]
        : [
            [-w, -3, -l, l],
            [-1, w, -l, l],
            [-3, -1, -l, -2],
            [-3, -1, 2, l],
          ];
    for (const [x0, x1, z0, z1] of rects)
      box(
        `Nomad floor ${level}`,
        [(x0! + x1!) / 2, y - 0.09, (z0! + z1!) / 2],
        [x1! - x0!, 0.18, z1! - z0!],
        materials.deckPlate,
        true,
      );
    if (level < 0) {
      // A smooth collision ramp lies just below the authored 15cm treads.
      const rotX = -Math.atan2(3, 4);
      colliders.push({
        center: new THREE.Vector3(-2, y + 1.47, 0),
        half: new THREE.Vector3(0.96, 0.06, 2.5),
        rotX,
        blocksBuild: false,
      });
      const ramp = box(
        `Nomad access ramp ${level}`,
        [-2, y + 1.47, 0],
        [1.92, 0.12, 5],
        materials.bareSteel,
        true,
        false,
      );
      ramp.rotation.x = rotX;
    }
    if (level > -2)
      for (const x of [-3.05, -0.95]) {
        // Coaming collider prevents walking sideways into the stairwell.
        colliders.push({
          center: new THREE.Vector3(x, y + 0.52, 0),
          half: new THREE.Vector3(0.035, 0.52, 2),
          blocksBuild: false,
        });
      }
  }
  // Interactive stations retain their established names and service locations.
  box('engine', [0, DECK_SURFACE_Y + 0.9, 6], [2.8, 1.8, 2.6], materials.hullDark);
  const helm = new THREE.Group();
  helm.name = 'HelmRoot';
  helm.position.set(-1.8, DECK_SURFACE_Y, -5.6);
  group.add(helm);
  const console = new THREE.Mesh(bevelledBox(1.2, 1.35, 0.75, 0.06), materials.hull);
  console.position.y = 0.675;
  helm.add(console);
  for (const name of ['GyroInstalled', 'HelmPowerLamp', 'HelmInteract']) {
    const node = new THREE.Group();
    node.name = name;
    if (name === 'HelmInteract') node.position.set(0, 0.85, 0.48);
    helm.add(node);
  }
  colliders.push({
    half: new THREE.Vector3(0.6, 0.675, 0.375),
    center: new THREE.Vector3(-1.8, DECK_SURFACE_Y + 0.675, -5.6),
  });
  const gate = box(
    'ExpeditionGate',
    [w, DECK_SURFACE_Y + 0.55, 0],
    [0.07, 1.1, 2.3],
    materials.hazard,
    false,
    false,
  );
  colliders.push({
    half: new THREE.Vector3(0.08, 0.55, 1.15),
    center: gate.position.clone(),
    blocksBuild: false,
    expeditionGate: true,
  });
  return { group, colliders };
}
