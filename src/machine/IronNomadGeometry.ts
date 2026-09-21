import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import {
  DECK_SURFACE_Y,
  GRID_TILE,
  LEVEL_HEIGHT,
  NOMAD_WALKABLE_HALF_LENGTH,
  NOMAD_WALKABLE_HALF_WIDTH,
  NOMAD_WRAPAROUND_HALF_LENGTH,
  NOMAD_WRAPAROUND_HALF_WIDTH,
  NOMAD_STAIR_RUN,
  NOMAD_STAIR_WIDTH,
} from '@/game/constants';
import type { Cell } from '@/building/BuildGrid';
import { bevelledBox, type MachineBuild } from './MachineGeometry';
import profile from '@/data/iron-nomad.json';
import obstacles from '@/data/iron-nomad-obstacles.json';
import sharedSolids from '@/data/iron-nomad-shared-solids.json';
import sideStairs from '@/data/iron-nomad-side-stairs.json';

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
  const stairMinZ = profile.stairwell.minZ;
  const stairMaxZ = profile.stairwell.maxZ;
  const stairLength = Math.hypot(stairMaxZ - stairMinZ, LEVEL_HEIGHT);
  for (const level of [-2, -1, 0]) {
    const y = DECK_SURFACE_Y + LEVEL_HEIGHT * level;
    const rects =
      level === -2
        ? [[-w, w, -l, l]]
        : [
            [-w, -3, -l, l],
            [-1, w, -l, l],
            [-3, -1, -l, stairMinZ],
            [-3, -1, stairMaxZ, l],
          ];
    for (const [x0, x1, z0, z1] of rects)
      box(
        `Nomad floor ${level}`,
        [(x0! + x1!) / 2, y - 0.09, (z0! + z1!) / 2],
        [x1! - x0!, 0.18, z1! - z0!],
        materials.deckPlate,
        true,
      );
    // Four persistent strips complete the authored 16x20m walking ledge around
    // the 14x18m build/nav core. The authored collision export deliberately
    // omits Gameplay_Decks_And_Access, so these procedural boxes remain the
    // support authority even while their fallback meshes are hidden.
    const perimeterHalfWidth =
      level === 0 ? NOMAD_WALKABLE_HALF_WIDTH : NOMAD_WRAPAROUND_HALF_WIDTH;
    const perimeterHalfLength =
      level === 0 ? NOMAD_WALKABLE_HALF_LENGTH : NOMAD_WRAPAROUND_HALF_LENGTH;
    const perimeter: readonly [string, number, number, number, number][] = [
      ['port', -perimeterHalfWidth, -w, -perimeterHalfLength, perimeterHalfLength],
      ['starboard', w, perimeterHalfWidth, -perimeterHalfLength, perimeterHalfLength],
      ['fore', -w, w, -perimeterHalfLength, -l],
      ['aft', -w, w, l, perimeterHalfLength],
    ];
    for (const [edge, x0, x1, z0, z1] of perimeter) {
      const segments: readonly [number, number][] =
        edge === 'port' && level === -1
          ? [
              [z0, -sideStairs.openingHalfLength],
              [sideStairs.openingHalfLength, z1],
            ]
          : edge === 'port' && level === 0
            ? [
                [z0, -sideStairs.openingHalfLength],
                [sideStairs.upperExtension.zMax, z1],
              ]
            : [[z0, z1]];
      for (const [segmentMin, segmentMax] of segments) {
        if (segmentMax <= segmentMin) continue;
        box(
          `Nomad perimeter floor ${level} ${edge}`,
          [(x0 + x1) / 2, y - 0.09, (segmentMin + segmentMax) / 2],
          [x1 - x0, 0.18, segmentMax - segmentMin],
          materials.deckPlate,
          true,
        );
      }
    }
    if (level === 0) {
      const landing = sideStairs.upperExtension;
      box(
        'Nomad upper side stair landing',
        [(landing.xMin + landing.xMax) / 2, y - 0.09, (landing.zMin + landing.zMax) / 2],
        [landing.xMax - landing.xMin, 0.18, landing.zMax - landing.zMin],
        materials.deckPlate,
        true,
        true,
      );
    }
    if (level <= -1) {
      const bypass = sideStairs.flatBypass;
      const bypassParts = [
        [bypass.xMin, bypass.xMax, bypass.zMin, bypass.zMax],
        ...bypass.connectors.map((connector) => [
          connector.xMin,
          connector.xMax,
          connector.zMin,
          connector.zMax,
        ]),
      ] as const;
      for (const [x0, x1, z0, z1] of bypassParts) {
        box(
          `Nomad side stair bypass ${level}`,
          [(x0 + x1) / 2, y - 0.09, (z0 + z1) / 2],
          [x1 - x0, 0.18, z1 - z0],
          materials.deckPlate,
          true,
          true,
        );
      }
    }
    if (level < 0) {
      // A smooth collision ramp lies just below the authored 15cm treads.
      const rotX = -Math.atan2(LEVEL_HEIGHT, NOMAD_STAIR_RUN);
      colliders.push({
        center: new THREE.Vector3(-2, y + LEVEL_HEIGHT / 2, 0),
        half: new THREE.Vector3(NOMAD_STAIR_WIDTH / 2, 0.06, stairLength / 2),
        rotX,
        blocksBuild: false,
      });
      const ramp = box(
        `Nomad access ramp ${level}`,
        [-2, y + LEVEL_HEIGHT / 2, 0],
        [NOMAD_STAIR_WIDTH, 0.12, stairLength],
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
  const sideStairLength = Math.hypot(sideStairs.run, sideStairs.rise);
  const sideStairAngle = Math.atan2(sideStairs.rise, sideStairs.run);
  const sideRailHeight = 1.04;
  for (const [name, level, angle] of [
    ['lower-middle', -2, -sideStairAngle],
    ['middle-upper', -1, -sideStairAngle],
  ] as const) {
    const y = DECK_SURFACE_Y + LEVEL_HEIGHT * level;
    colliders.push({
      center: new THREE.Vector3(sideStairs.x, y + sideStairs.rise / 2, 0),
      half: new THREE.Vector3(sideStairs.width / 2, 0.06, sideStairLength / 2),
      rotX: angle,
      blocksBuild: false,
    });
    const ramp = box(
      `Nomad side stair ${name}`,
      [sideStairs.x, y + sideStairs.rise / 2, 0],
      [sideStairs.width, 0.12, sideStairLength],
      materials.bareSteel,
      true,
      false,
    );
    ramp.rotation.x = angle;
    for (const railX of [
      sideStairs.x - sideStairs.width / 2,
      sideStairs.x + sideStairs.width / 2,
    ]) {
      const rail = box(
        `Nomad side stair rail ${name}`,
        [railX, y + sideStairs.rise / 2 + sideRailHeight / 2, 0],
        [0.08, sideRailHeight, sideStairLength],
        materials.hazard,
        true,
        false,
      );
      rail.rotation.x = angle;
      colliders.push({
        center: rail.position.clone(),
        half: new THREE.Vector3(0.04, sideRailHeight / 2, sideStairLength / 2),
        rotX: angle,
        blocksBuild: false,
      });
    }
  }
  // Low, runtime-owned outer guards keep the widened wraps readable without
  // sealing the fishing bays or the side-stair landings.
  for (const level of [-2, -1, 0] as const) {
    const y = DECK_SURFACE_Y + LEVEL_HEIGHT * level;
    const height = 1.04;
    const foreHeight = level === -2 ? 0.65 : height;
    const edgeW = level === 0 ? NOMAD_WALKABLE_HALF_WIDTH : NOMAD_WRAPAROUND_HALF_WIDTH;
    const edgeL = level === 0 ? NOMAD_WALKABLE_HALF_LENGTH : NOMAD_WRAPAROUND_HALF_LENGTH;
    const guard = (center: THREE.Vector3, half: THREE.Vector3) =>
      colliders.push({ center, half, blocksBuild: false });
    const starboardSegments: readonly [number, number][] =
      level === 0
        ? [
            [-edgeL, -1.15],
            [1.15, edgeL],
          ]
        : [[-edgeL, edgeL]];
    for (const [z0, z1] of starboardSegments)
      guard(
        new THREE.Vector3(edgeW + 0.08, y + height / 2, (z0 + z1) / 2),
        new THREE.Vector3(0.04, height / 2, (z1 - z0) / 2),
      );
    guard(
      new THREE.Vector3(0, y + height / 2, edgeL + 0.08),
      new THREE.Vector3(edgeW, height / 2, 0.04),
    );
    guard(
      new THREE.Vector3(0, y + foreHeight / 2, -edgeL - 0.08),
      new THREE.Vector3(edgeW, foreHeight / 2, 0.04),
    );
    const portX =
      level === 0 ? -NOMAD_WALKABLE_HALF_WIDTH - 0.08 : -NOMAD_WRAPAROUND_HALF_WIDTH - 0.08;
    const portSegments: readonly [number, number][] =
      level === 0
        ? [
            [-edgeL, -sideStairs.openingHalfLength],
            [sideStairs.upperExtension.zMax, edgeL],
          ]
        : [
            [-edgeL, -5],
            [5, edgeL],
          ];
    for (const [z0, z1] of portSegments)
      guard(
        new THREE.Vector3(portX, y + height / 2, (z0 + z1) / 2),
        new THREE.Vector3(0.04, height / 2, (z1 - z0) / 2),
      );
    if (level <= -1) {
      const bypass = sideStairs.flatBypass;
      guard(
        new THREE.Vector3(bypass.xMin - 0.08, y + height / 2, (bypass.zMin + bypass.zMax) / 2),
        new THREE.Vector3(0.04, height / 2, (bypass.zMax - bypass.zMin) / 2),
      );
      for (const z of [bypass.zMin, bypass.zMax] as const)
        guard(
          new THREE.Vector3((bypass.xMin + bypass.xMax) / 2, y + height / 2, z),
          new THREE.Vector3((bypass.xMax - bypass.xMin) / 2, height / 2, 0.04),
        );
    }
    if (level === 0)
      guard(
        new THREE.Vector3(
          (sideStairs.upperExtension.xMin + sideStairs.upperExtension.xMax) / 2,
          y + height / 2,
          sideStairs.upperExtension.zMax + 0.08,
        ),
        new THREE.Vector3(
          (sideStairs.upperExtension.xMax - sideStairs.upperExtension.xMin) / 2,
          height / 2,
          0.04,
        ),
      );
  }
  // These solid authored housings must also block movement without the optional
  // artwork. The Blender collision exporter omits their duplicate surfaces and
  // checks these bounds against the source mesh before exporting.
  for (const solid of sharedSolids) {
    box(
      solid.sourceObject,
      solid.min.map((low, axis) => (low + solid.max[axis]!) / 2),
      solid.min.map((low, axis) => solid.max[axis]! - low),
      materials.hullDark,
      true,
    );
  }
  // Interactive stations retain their established names and service locations.
  box('engine', [0, DECK_SURFACE_Y + 0.9, 9], [2.8, 1.8, 2.6], materials.hullDark);
  const helm = new THREE.Group();
  helm.name = 'HelmRoot';
  helm.position.set(-3, DECK_SURFACE_Y, -9);
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
    center: new THREE.Vector3(-3, DECK_SURFACE_Y + 0.675, -9),
  });
  const gate = box(
    'ExpeditionGate',
    [NOMAD_WALKABLE_HALF_WIDTH, DECK_SURFACE_Y + 0.55, 0],
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
