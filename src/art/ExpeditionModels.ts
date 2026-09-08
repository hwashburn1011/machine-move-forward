import * as THREE from 'three';
import type { Materials } from './Materials';
import { authoredModel } from './DefenseModels';
import { applyHeightFog } from './Fog';

function authoredWithAnchors(id: string, required: readonly string[]): THREE.Group | null {
  const source = authoredModel(id);
  if (!source || !required.every((name) => source.scene.getObjectByName(name))) return null;
  let meshCount = 0;
  let valid = true;
  source.scene.traverse((object) => {
    if (
      ![
        ...object.position.toArray(),
        ...object.quaternion.toArray(),
        ...object.scale.toArray(),
      ].every(Number.isFinite)
    )
      valid = false;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const positions = mesh.geometry?.getAttribute('position');
      if (!positions || positions.count < 3 || !Array.from(positions.array).every(Number.isFinite))
        valid = false;
      else meshCount += 1;
    }
  });
  for (const name of required) {
    const anchor = source.scene.getObjectByName(name);
    if (
      !anchor ||
      !Number.isFinite(anchor.position.x) ||
      !Number.isFinite(anchor.position.y) ||
      !Number.isFinite(anchor.position.z)
    )
      valid = false;
  }
  if (!valid || meshCount === 0) return null;
  return source.scene.clone(true);
}

function box(
  parent: THREE.Object3D,
  size: number[],
  at: number[],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(at[0]!, at[1]!, at[2]!);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const axis = b.clone().sub(a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, axis.length(), 12),
    material,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Floor mounted stand, face -Z. Gameplay owns placement, power and interaction. */
export function buildRadioModel(materials: Materials): THREE.Group {
  const source = authoredModel('salvaged-radio');
  if (source) {
    const root = source.scene.clone(true);
    root.userData.authored = true;
    return root;
  }
  const root = new THREE.Group();
  root.name = 'MMF_Radio_Fallback';
  box(root, [0.58, 0.11, 0.42], [0, 0.055, 0], materials.hullDark);
  cylinder(
    root,
    new THREE.Vector3(0, 0.1, 0),
    new THREE.Vector3(0, 0.85, 0),
    0.07,
    materials.bareSteel,
  );
  box(root, [0.68, 0.4, 0.37], [0, 1.07, 0], materials.hull);
  box(root, [0.6, 0.3, 0.025], [0, 1.07, -0.19], materials.hullDark);
  box(root, [0.32, 0.07, 0.014], [-0.1, 1.13, -0.209], materials.accent);
  const lamp = box(root, [0.025, 0.025, 0.012], [0.24, 1.17, -0.223], materials.emissiveWarn);
  lamp.name = 'SignalLamp';
  cylinder(
    root,
    new THREE.Vector3(0.25, 1.27, 0.1),
    new THREE.Vector3(0.32, 1.88, 0.1),
    0.009,
    materials.bareSteel,
  );
  return root;
}

/** Original wreck and fallback share the exact authored box/door contract. */
export function buildWreckModel(materials: Materials): THREE.Group {
  const authored = authoredWithAnchors('expedition-wreck', ['Gangway', 'CourseGyro']);
  if (authored) {
    const root = authored;
    root.userData.authored = true;
    return root;
  }
  const root = new THREE.Group();
  root.name = 'MMF_Wreck_Fallback';
  box(root, [12, 0.2, 18], [0, -0.1, 0], materials.deckPlate);
  for (const x of [-5.9, 2])
    for (const z of [-5, 5]) box(root, [0.2, 2.5, 8], [x, 1.25, z], materials.hull);
  box(root, [0.2, 2.5, 18], [5.9, 1.25, 0], materials.rustedSteel);
  for (const z of [-8.9, 8.9]) box(root, [12, 2.5, 0.2], [0, 1.25, z], materials.hull);
  for (const z of [-0.78, 0.78])
    box(root, [10.8, 0.005, 0.065], [-0.2, 0.005, z], materials.accent);
  box(root, [2.2, 1.1, 2.2], [-1, 0.55, -5.8], materials.hullDark);
  box(root, [2.8, 0.8, 1.6], [-2, 0.4, 5.8], materials.hullDark);
  box(root, [0.9, 0.9, 0.9], [4.5, 0.45, 3], materials.bareSteel);
  const gyro = new THREE.Group();
  gyro.name = 'CourseGyro';
  gyro.position.set(4.5, 0.92, 3);
  root.add(gyro);
  cylinder(gyro, new THREE.Vector3(), new THREE.Vector3(0, 0.42, 0), 0.13, materials.accent);
  for (const y of [0.1, 0.25, 0.4])
    cylinder(
      gyro,
      new THREE.Vector3(0, y, 0),
      new THREE.Vector3(0, y + 0.045, 0),
      0.28,
      materials.bareSteel,
    );
  for (const [name, at] of [
    ['JournalCargo', [-1, 1.13, -5.8]],
    ['JournalCrew', [-2, 0.83, 5.8]],
  ] as const) {
    const journal = box(root, [0.38, 0.025, 0.29], [...at], materials.accent);
    journal.name = name;
  }
  const route = box(root, [0.025, 0.44, 0.32], [-5.74, 1.05, -2], materials.accent);
  route.name = 'JournalRoute';
  const gangway = box(root, [1, 0.16, 2], [-6.5, -0.08, 0], materials.bareSteel);
  gangway.name = 'Gangway';
  return root;
}

/** Relay Foundry fallback. Authored FA02 models are selected by the loader when available. */
export function buildFoundryModel(materials: Materials): THREE.Group {
  const authored = authoredWithAnchors('relay-foundry', [
    'FoundryRoot',
    'Gangway',
    'EntryAnchor',
    'ExitSightline',
    'SalvageController',
    'TrackingServo',
    'JournalLog',
    'JournalBlueprint',
  ]);
  if (authored) {
    const root = authored;
    root.userData.authored = true;
    return root;
  }
  const root = new THREE.Group();
  root.name = 'MMF_Relay_Foundry_Fallback';
  box(root, [14, 0.2, 10], [0, -0.1, 0], materials.deckPlate);
  for (const z of [-4.9, 4.9]) box(root, [11, 3, 0.2], [1.5, 1.5, z], materials.hull);
  box(root, [0.2, 3, 10], [6.9, 1.5, 0], materials.hull);
  for (const z of [-3.5, 3.5]) box(root, [0.2, 3, 3], [-6.9, 1.5, z], materials.hull);
  const gangway = box(root, [1, 0.16, 2], [-7.5, -0.08, 0], materials.bareSteel);
  gangway.name = 'Gangway';
  // Keep the fallback's visible furniture inside the same authored collision
  // envelopes, so a missing asset never produces invisible obstacles.
  box(root, [0.9, 0.9, 0.8], [-1, 0.45, 1.5], materials.hullDark);
  box(root, [0.8, 0.9, 0.6], [-2, 0.45, -2], materials.hull);
  box(root, [2.8, 1.2, 2], [1, 0.6, 2], materials.hullDark);
  box(root, [2.4, 0.8, 1.6], [3.5, 0.4, -2], materials.rustedSteel);
  for (const [name, at] of [
    ['JournalLog', [-2, 1, -2]],
    ['JournalBlueprint', [1, 1.23, 2]],
    ['SalvageController', [-1, 1, 1.5]],
    ['TrackingServo', [3, 1, -1.5]],
  ] as const) {
    const marker = new THREE.Group();
    marker.name = name;
    marker.position.set(at[0], at[1], at[2]);
    root.add(marker);
    if (name.startsWith('Journal')) {
      box(marker, [0.32, 0.025, 0.24], [0, 0, 0], materials.accent);
    } else {
      box(marker, [0.4, 0.16, 0.28], [0, 0.08, 0], materials.bareSteel);
      box(marker, [0.3, 0.08, 0.3], [0, 0.2, 0], materials.accent);
      if (name === 'TrackingServo')
        cylinder(
          marker,
          new THREE.Vector3(0, 0.22, 0),
          new THREE.Vector3(0, 0.38, 0),
          0.12,
          materials.bareSteel,
        );
    }
  }
  const rootMarker = new THREE.Group();
  rootMarker.name = 'FoundryRoot';
  root.add(rootMarker);
  const entry = new THREE.Group();
  entry.name = 'EntryAnchor';
  entry.position.set(-7, 0, 0);
  root.add(entry);
  const sight = new THREE.Group();
  sight.name = 'ExitSightline';
  sight.position.set(-5.8, 1.6, 0);
  root.add(sight);
  return root;
}

const addonMaterial = (color: number, metalness = 0.55): THREE.MeshStandardMaterial => {
  const material = new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.64 });
  applyHeightFog(material);
  return material;
};
const steel = addonMaterial(0x8c9797);
const dark = addonMaterial(0x303b40);
const ochre = addonMaterial(0xbd8b45);
const copper = addonMaterial(0x9d6946);
const teal = addonMaterial(0x446e6c);

type ActiveModules = Partial<Record<'propulsion' | 'power' | 'defense', string>>;
const machineAddons = new WeakMap<THREE.Object3D, Map<string, THREE.Group>>();
const turretAddons = new WeakMap<THREE.Object3D, Map<string, THREE.Group>>();

/** Original mesh addons are cached once per machine and selected by loadout. */
export function applyUpgradeVisuals(machineGroup: THREE.Object3D, active: ActiveModules): void {
  let addons = machineAddons.get(machineGroup);
  if (!addons) {
    addons = new Map();
    for (const id of ['longstride-rams', 'torque-clutch', 'overwound-dynamo', 'lean-governor']) {
      const root = new THREE.Group();
      root.name = `Upgrade_${id}`;
      machineGroup.add(root);
      addons.set(id, root);
      if (id === 'longstride-rams') {
        for (const side of [-1, 1])
          for (const z of [-4.5, 4.5]) {
            cylinder(
              root,
              new THREE.Vector3(side * 4.1, 2.8, z),
              new THREE.Vector3(side * 5.15, 1.8, z),
              0.11,
              steel,
            );
            cylinder(
              root,
              new THREE.Vector3(side * 4.1, 2.8, z),
              new THREE.Vector3(side * 4.7, 2.23, z),
              0.19,
              teal,
            );
            box(root, [0.32, 0.38, 0.5], [side * 4.13, 2.85, z], dark);
          }
      } else if (id === 'torque-clutch') {
        for (const side of [-1, 1]) {
          box(root, [0.42, 0.9, 1.75], [side * 4.85, 2.05, -0.5], dark);
          cylinder(
            root,
            new THREE.Vector3(side * 4.8, 2.05, -0.5),
            new THREE.Vector3(side * 5.16, 2.05, -0.5),
            0.6,
            ochre,
          );
          cylinder(
            root,
            new THREE.Vector3(side * 5.16, 2.05, -0.5),
            new THREE.Vector3(side * 5.19, 2.05, -0.5),
            0.24,
            steel,
          );
        }
      } else if (id === 'overwound-dynamo') {
        for (const x of [-0.9, 0, 0.9]) {
          box(root, [0.75, 0.12, 0.8], [x, 2.38, 8.15], dark);
          cylinder(
            root,
            new THREE.Vector3(x, 2.4, 8.15),
            new THREE.Vector3(x, 3.2, 8.15),
            0.18,
            steel,
          );
          for (let y = 2.45; y < 3.15; y += 0.085)
            cylinder(
              root,
              new THREE.Vector3(x, y, 8.15),
              new THREE.Vector3(x, y + 0.05, 8.15),
              0.3,
              copper,
            );
        }
      } else {
        box(root, [1.65, 0.65, 0.65], [0, 2.75, 8.15], teal);
        for (let x = -0.6; x <= 0.6; x += 0.2) box(root, [0.06, 0.5, 0.025], [x, 2.8, 7.81], dark);
        cylinder(
          root,
          new THREE.Vector3(0, 2.8, 7.8),
          new THREE.Vector3(0, 2.8, 7.69),
          0.24,
          ochre,
        );
      }
    }
    machineAddons.set(machineGroup, addons);
  }
  for (const [id, group] of addons) group.visible = active.propulsion === id || active.power === id;
}

/** Accessories follow the barrel's real pitch pivot, preserving muzzle position. */
export function applyTurretUpgradeVisual(
  turretRoot: THREE.Object3D,
  activeDefense?: string | null,
): void {
  let addons = turretAddons.get(turretRoot);
  if (!addons) {
    const pitch = turretRoot.getObjectByName('TurretPitch');
    if (!pitch) return;
    addons = new Map();
    for (const id of ['heavy-breech', 'cycler-feed']) {
      const root = new THREE.Group();
      root.name = `Upgrade_${id}`;
      pitch.add(root);
      addons.set(id, root);
      if (id === 'heavy-breech') {
        box(root, [0.5, 0.35, 0.4], [0, 0, 0.48], dark);
        for (const x of [-0.19, 0.19])
          cylinder(
            root,
            new THREE.Vector3(x, 0.18, 0.1),
            new THREE.Vector3(x, 0.18, 0.64),
            0.06,
            steel,
          );
        box(root, [0.32, 0.1, 0.4], [0, 0.24, 0.24], ochre);
      } else {
        cylinder(
          root,
          new THREE.Vector3(-0.3, -0.02, 0),
          new THREE.Vector3(-0.62, -0.02, 0),
          0.33,
          teal,
        );
        box(root, [0.25, 0.36, 0.4], [-0.36, 0.3, 0.05], dark);
        for (const z of [-0.08, 0.02, 0.12])
          box(root, [0.26, 0.035, 0.055], [-0.36, 0.49, z], ochre);
      }
    }
    turretAddons.set(turretRoot, addons);
  }
  for (const [id, group] of addons) group.visible = id === activeDefense;
}
