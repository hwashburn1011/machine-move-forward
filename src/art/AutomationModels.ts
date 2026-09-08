import * as THREE from 'three';
import { disposeLoadedModel, loadModel, type LoadedModel } from './ModelLoader';
import { applyHeightFog } from './Fog';
import type { Materials } from './Materials';

const models = new Map<string, LoadedModel>();
export const AUTOMATION_TEXTURE_CLONE_STATS = { clones: 0 };

export interface AutomaticCollectorVisual {
  root: THREE.Group;
  drum: THREE.Object3D;
  guide: THREE.Object3D;
  hookExit: THREE.Object3D;
  interact: THREE.Object3D;
  bufferLamp: THREE.Object3D | null;
}
export interface AutomaticTurretVisual {
  root: THREE.Group;
  yaw: THREE.Object3D;
  pitch: THREE.Object3D;
  muzzle: THREE.Object3D;
  tracker: THREE.Object3D;
}

export async function loadAutomationModels(enabled = true): Promise<void> {
  for (const model of models.values()) disposeLoadedModel(model);
  models.clear();
  if (!enabled) return;
  await Promise.all(
    ['automatic-collector', 'automatic-turret'].map(async (id) => {
      const loaded = await loadModel(`models/authored/${id}.glb`);
      if (!loaded) return;
      loaded.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) applyHeightFog(material);
      });
      models.set(id, loaded);
    }),
  );
}

export function disposeAutomationModels(): void {
  for (const model of models.values()) disposeLoadedModel(model);
  models.clear();
}

function finiteObject(object: THREE.Object3D | undefined): object is THREE.Object3D {
  return (
    !!object &&
    [
      object.position.x,
      object.position.y,
      object.position.z,
      object.rotation.x,
      object.rotation.y,
      object.rotation.z,
      object.scale.x,
      object.scale.y,
      object.scale.z,
    ].every(Number.isFinite)
  );
}

function authoredMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const values = mesh.geometry.attributes.position.array;
    if (mesh.geometry.attributes.position.count > 0 && Array.from(values).every(Number.isFinite))
      found = true;
  });
  return found;
}

function semanticRoot(wrapper: THREE.Object3D, name: string): THREE.Object3D | null {
  return wrapper.name === name ? wrapper : (wrapper.getObjectByName(name) ?? null);
}

function bounded(root: THREE.Object3D, maxX: number, maxY: number, maxZ: number): boolean {
  const box = new THREE.Box3().setFromObject(root);
  if (!box.min.toArray().every(Number.isFinite) || !box.max.toArray().every(Number.isFinite))
    return false;
  const size = box.getSize(new THREE.Vector3());
  return size.x <= maxX && size.y <= maxY && size.z <= maxZ;
}

function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`validated automation model missing ${name}`);
  return found;
}

/** Factories own their returned scene; cached GLB resources remain disposable. */
function cloneOwned(source: THREE.Object3D): THREE.Group {
  const clone = source.clone(true) as THREE.Group;
  const textures = new Map<THREE.Texture, THREE.Texture>();
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => cloneMaterialOwned(material, textures))
      : cloneMaterialOwned(mesh.material, textures);
  });
  return clone;
}

function cloneMaterialOwned(
  material: THREE.Material,
  textures: Map<THREE.Texture, THREE.Texture>,
): THREE.Material {
  const clone = material.clone();
  for (const [key, value] of Object.entries(clone)) {
    const candidate = value as { isTexture?: boolean; clone?: () => THREE.Texture } | null;
    if (candidate?.isTexture && candidate.clone) {
      const sourceTexture = value as THREE.Texture;
      let texture = textures.get(sourceTexture);
      if (!texture) {
        texture = sourceTexture.clone();
        textures.set(sourceTexture, texture);
        AUTOMATION_TEXTURE_CLONE_STATS.clones++;
      }
      (clone as unknown as Record<string, unknown>)[key] = texture;
    }
  }
  applyHeightFog(clone);
  return clone;
}

export function validateAutomaticTurretModel(root: THREE.Object3D): boolean {
  const semantic = semanticRoot(root, 'AutoTurretRoot');
  if (!semantic) return false;
  const yaw = semantic.getObjectByName('TurretYaw');
  const pitch = semantic.getObjectByName('TurretPitch');
  const muzzle = semantic.getObjectByName('Muzzle');
  const tracker = semantic.getObjectByName('TrackerHead');
  return (
    authoredMesh(semantic) &&
    finiteObject(yaw) &&
    finiteObject(pitch) &&
    finiteObject(muzzle) &&
    finiteObject(tracker) &&
    yaw.parent === semantic &&
    pitch.parent === yaw &&
    muzzle.parent === pitch &&
    Math.abs(muzzle.position.z) < 2 &&
    finiteObject(semantic.getObjectByName('ServoInstalled')) &&
    finiteObject(semantic.getObjectByName('PowerLamp')) &&
    bounded(semantic, 1.4, 1.6, 1.4)
  );
}

export function validateAutomaticCollectorModel(root: THREE.Object3D): boolean {
  const semantic = semanticRoot(root, 'CollectorRoot');
  if (!semantic) return false;
  const required = [
    'DrumPivot',
    'GuidePivot',
    'HookExit',
    'CollectorInteract',
    'ControllerInstalled',
    'BufferLamp',
  ];
  return (
    authoredMesh(semantic) &&
    required.every((name) => finiteObject(semantic.getObjectByName(name))) &&
    Math.abs(semantic.getObjectByName('HookExit')!.position.z) < 2 &&
    bounded(semantic, 1.6, 1.6, 1.6)
  );
}
function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  at: [number, number, number],
  material: THREE.Material,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
}
function cylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  at: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material);
  mesh.position.set(...at);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildAutomaticCollectorModel(materials: Materials): AutomaticCollectorVisual {
  const source = models.get('automatic-collector');
  const root =
    source && validateAutomaticCollectorModel(source.scene)
      ? cloneOwned(source.scene)
      : new THREE.Group();
  if (!source || !validateAutomaticCollectorModel(source.scene)) {
    root.name = 'AutoCollectorFallback';
    box(root, [1.45, 1.05, 1.2], [0, 0.55, 0], materials.stationMetal);
    const drumPivot = new THREE.Group();
    drumPivot.name = 'DrumPivot';
    drumPivot.position.set(0, 0.75, 0);
    root.add(drumPivot);
    const drum = cylinder(drumPivot, 0.34, 0.2, [0, 0, 0], materials.bareSteel);
    drum.rotation.z = Math.PI / 2;
    const guidePivot = new THREE.Group();
    guidePivot.name = 'GuidePivot';
    guidePivot.position.set(0, 1.05, -0.45);
    root.add(guidePivot);
    box(guidePivot, [0.2, 0.3, 0.75], [0, 0, 0], materials.hullDark);
    const hookExit = new THREE.Object3D();
    hookExit.name = 'HookExit';
    hookExit.position.set(0, 1.03, -0.77);
    root.add(hookExit);
    const interact = new THREE.Object3D();
    interact.name = 'CollectorInteract';
    interact.position.set(0, 0.7, 0.86);
    root.add(interact);
    const installed = new THREE.Object3D();
    installed.name = 'ControllerInstalled';
    installed.position.set(0, 0.8, 0);
    root.add(installed);
    const lamp = new THREE.Object3D();
    lamp.name = 'BufferLamp';
    lamp.position.set(0, 1.45, 0);
    root.add(lamp);
  } else {
    root.userData.authored = true;
  }
  return {
    root,
    drum: node(root, 'DrumPivot'),
    guide: node(root, 'GuidePivot'),
    hookExit: node(root, 'HookExit'),
    interact: node(root, 'CollectorInteract'),
    bufferLamp: root.getObjectByName('BufferLamp') ?? null,
  };
}

export function buildAutomaticTurretModel(materials: Materials): AutomaticTurretVisual {
  const source = models.get('automatic-turret');
  const root =
    source && validateAutomaticTurretModel(source.scene)
      ? cloneOwned(source.scene)
      : new THREE.Group();
  if (!source || !validateAutomaticTurretModel(source.scene)) {
    root.name = 'AutoTurretFallback';
    cylinder(root, 0.62, 0.16, [0, 0.08, 0], materials.bareSteel);
    box(root, [0.75, 0.55, 0.75], [0, 0.38, 0], materials.hull);
    const yaw = new THREE.Group();
    yaw.name = 'TurretYaw';
    yaw.position.set(0, 0.78, 0);
    root.add(yaw);
    const pitch = new THREE.Group();
    pitch.name = 'TurretPitch';
    pitch.position.set(0, 0.37, 0);
    yaw.add(pitch);
    box(pitch, [0.42, 0.3, 0.5], [0, 0, -0.1], materials.hullDark);
    const barrel = cylinder(pitch, 0.055, 0.67, [0, 0, -0.335], materials.bareSteel);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    muzzle.position.set(0, 0.02, -0.67);
    pitch.add(muzzle);
    const tracker = new THREE.Object3D();
    tracker.name = 'TrackerHead';
    tracker.position.set(0.3, 0.1, -0.1);
    pitch.add(tracker);
    const servo = new THREE.Object3D();
    servo.name = 'ServoInstalled';
    servo.position.set(0, 0.25, 0);
    root.add(servo);
    const lamp = new THREE.Object3D();
    lamp.name = 'PowerLamp';
    lamp.position.set(0, 0.98, 0);
    root.add(lamp);
  } else {
    root.userData.authored = true;
  }
  return {
    root,
    yaw: node(root, 'TurretYaw'),
    pitch: node(root, 'TurretPitch'),
    muzzle: node(root, 'Muzzle'),
    tracker: node(root, 'TrackerHead'),
  };
}
