import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel, type LoadedModel } from './ModelLoader';
import type { Materials } from './Materials';
import { applyHeightFog } from './Fog';
import { TextureFactory } from './TextureFactory';
import { buildHook } from '@/salvage/HookModel';

/** Original Blender-authored art, with code geometry when asset loading is disabled. */
const models = new Map<string, LoadedModel>();
const crewAnimations = new WeakMap<
  THREE.Group,
  {
    mixer: THREE.AnimationMixer;
    idle: THREE.AnimationAction;
    climb: THREE.AnimationAction;
    crossing: boolean;
  }
>();
const wornPaint = TextureFactory.paintedMetal(128, 37, [0.94, 0.94, 0.93]);
const wornNormal = TextureFactory.noiseNormal(128, 37, 7, 0.5);

export const SKIFF_CREW_SEATS = [
  new THREE.Vector3(-0.59, 1.2, 0.35),
  new THREE.Vector3(0.59, 1.2, 0.35),
] as const;
export const SKIFF_PILOT_SEAT = new THREE.Vector3(0, 1.2, -1.45);

/** Keep material-authored identification colors and add only neutral surface wear. */
export function prepareAuthoredModel(model: LoadedModel): void {
  model.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial || standard.userData.mmfPrepared) continue;
      standard.userData.mmfPrepared = true;
      if (/Paint|Steel|Rust/.test(standard.name)) {
        // Exported GLBs own their maps and scalar intent. Procedural wear is a
        // fallback for the old palette-only assets, never a replacement for an
        // authored albedo, normal or ORM map.
        if (!standard.map) standard.map = wornPaint;
        if (!standard.normalMap) {
          standard.normalMap = wornNormal;
          standard.normalScale.set(0.22, 0.22);
        }
      }
      applyHeightFog(standard);
      standard.needsUpdate = true;
    }
  });
}

/** Loaded once at boot. A missing asset is a fallback, never a rejected game boot. */
export async function loadDefenseModels(enabled = true): Promise<void> {
  models.clear();
  if (!enabled) return;
  const ids = [
    'manual-turret',
    'raider-skiff',
    'raider-gunboat',
    'scavenger',
    'raider',
    'bastion',
    'revenant',
    'warden',
    'sovereign',
    'salvaged-radio',
    'expedition-wreck',
    'relay-foundry',
    'navigation-helm',
    'player',
  ];
  await Promise.all(
    ids.map(async (id) => {
      const model =
        id === 'player'
          ? ((await loadModel('models/authored/s07-player.glb')) ??
            (await loadModel('models/authored/player.glb')))
          : await loadModel(`models/authored/${id}.glb`);
      if (!model) return;
      prepareAuthoredModel(model);
      models.set(id, model);
    }),
  );
}

export function authoredEnemyModel(id: string): LoadedModel | null {
  return models.get(id) ?? null;
}

/** Original models share one boot cache, including station and player artwork. */
export const authoredModel = authoredEnemyModel;

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  at: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
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

export interface TurretVisual {
  root: THREE.Group;
  yaw: THREE.Object3D;
  pitch: THREE.Object3D;
  muzzle: THREE.Object3D;
}

/** Base at Y=0, aiming forward -Z; yaw and pitch are independent live pivots. */
export function buildTurretModel(materials: Materials): TurretVisual {
  const source = models.get('manual-turret');
  if (source) {
    const root = source.scene.clone(true);
    const yaw = root.getObjectByName('TurretYaw');
    const pitch = root.getObjectByName('TurretPitch');
    const muzzle = root.getObjectByName('Muzzle');
    if (yaw && pitch && muzzle) {
      root.userData.authored = true;
      return { root, yaw, pitch, muzzle };
    }
  }
  const root = new THREE.Group();
  root.name = 'MMF_Turret_Fallback';
  cylinder(root, 0.7, 0.16, [0, 0.08, 0], materials.bareSteel);
  cylinder(root, 0.25, 0.68, [0, 0.5, 0], materials.hull);
  for (const side of [-1, 1]) box(root, [0.32, 0.15, 1.4], [side * 0.55, 0.1, 0], materials.hull);
  const yaw = new THREE.Group();
  yaw.name = 'TurretYaw';
  yaw.position.y = 0.85;
  root.add(yaw);
  cylinder(yaw, 0.38, 0.15, [0, 0.05, 0], materials.accent);
  const pitch = new THREE.Group();
  pitch.name = 'TurretPitch';
  pitch.position.y = 0.35;
  yaw.add(pitch);
  box(pitch, [0.5, 0.33, 0.65], [0, 0, -0.1], materials.hullDark);
  const barrel = cylinder(pitch, 0.07, 0.95, [0, 0, -0.83], materials.bareSteel);
  barrel.rotation.x = Math.PI / 2;
  for (const side of [-1, 1])
    box(pitch, [0.34, 0.62, 0.08], [side * 0.46, 0.07, -0.4], materials.hull);
  const drum = cylinder(pitch, 0.23, 0.25, [0.42, 0, 0], materials.accent);
  drum.rotation.z = Math.PI / 2;
  const muzzle = new THREE.Object3D();
  muzzle.name = 'Muzzle';
  muzzle.position.z = -1.4;
  pitch.add(muzzle);
  return { root, yaw, pitch, muzzle };
}

/** Root on terrain, deck at Y=1.2; model is 3.1m across by 5.6m long. */
export function buildSkiffModel(materials: Materials): THREE.Group {
  const source = models.get('raider-skiff');
  if (source) {
    const root = source.scene.clone(true);
    root.userData.authored = true;
    return root;
  }
  const root = new THREE.Group();
  root.name = 'MMF_Skiff_Fallback';
  box(root, [1.95, 0.65, 5.5], [0, 0.78, -0.1], materials.rustedSteel);
  box(root, [1.8, 0.08, 4.5], [0, 1.15, 0], materials.deckPlate);
  for (const side of [-1, 1]) {
    box(root, [0.55, 0.8, 4.7], [side * 1.2, 0.48, 0], materials.rubber);
    box(root, [0.62, 0.12, 4.9], [side * 1.2, 0.94, 0], materials.rustedSteel);
    for (let i = -2; i <= 2; i++) {
      const wheel = cylinder(root, 0.27, 0.07, [side * 1.49, 0.49, i * 0.9], materials.bareSteel);
      wheel.rotation.z = Math.PI / 2;
    }
    box(root, [0.035, 0.035, 2.2], [side * 0.9, 1.7, 0.6], materials.bareSteel);
    for (const z of [-0.5, 0.6, 1.7])
      cylinder(root, 0.03, 0.5, [side * 0.9, 1.45, z], materials.bareSteel);
    box(root, [0.21, 0.15, 0.04], [side * 0.6, 1.1, -2.87], materials.emissiveWarn);
  }
  box(root, [1.6, 0.6, 0.9], [0, 1.45, 2], materials.hullDark);
  box(root, [0.6, 0.6, 0.15], [0, 1.5, -1.1], materials.rubber);
  cylinder(root, 0.07, 0.8, [0.62, 2.05, 2.25], materials.hullDark);
  cylinder(root, 0.018, 1.5, [-0.72, 2.3, 2.2], materials.bareSteel);
  const gunYaw = new THREE.Group();
  gunYaw.name = 'SkiffGunYaw';
  gunYaw.position.set(0, 2.04, -1.95);
  root.add(gunYaw);
  const gunPitch = new THREE.Group();
  gunPitch.name = 'SkiffGunPitch';
  gunYaw.add(gunPitch);
  box(gunPitch, [0.31, 0.23, 0.5], [0, 0, -0.04], materials.hullDark);
  box(gunPitch, [0.34, 0.06, 0.5], [0, 0.13, -0.04], materials.accent);
  const gunBarrel = cylinder(gunPitch, 0.056, 0.83, [0, 0, -0.67], materials.bareSteel);
  gunBarrel.rotation.x = Math.PI / 2;
  const gunMuzzle = new THREE.Object3D();
  gunMuzzle.name = 'SkiffMuzzle';
  gunMuzzle.position.z = -1.1;
  gunPitch.add(gunMuzzle);
  return root;
}

export interface GunboatVisual {
  root: THREE.Group;
  yaw: THREE.Object3D;
  pitch: THREE.Object3D;
  muzzle: THREE.Object3D;
  weaponTarget: THREE.Object3D;
  engineTarget: THREE.Object3D;
  engineExhaust: THREE.Object3D | null;
  weaponDisabled: THREE.Object3D | null;
  engineDisabled: THREE.Object3D | null;
}

export function validGunboatModel(wrapper: THREE.Object3D): boolean {
  const root = wrapper.getObjectByName('GunboatRoot');
  if (!root) return false;
  const names = [
    'GunboatGunYaw',
    'GunboatGunPitch',
    'GunboatMuzzle',
    'WeaponDamageAnchor',
    'EngineDamageAnchor',
    'EngineExhaust',
    'WeaponDisabled',
    'EngineDisabled',
  ];
  if (names.some((name) => !root.getObjectByName(name))) return false;
  const yaw = root.getObjectByName('GunboatGunYaw')!;
  const pitch = root.getObjectByName('GunboatGunPitch')!;
  const muzzle = root.getObjectByName('GunboatMuzzle')!;
  if (yaw.parent !== root || pitch.parent !== yaw || muzzle.parent !== pitch) return false;
  let meshes = 0,
    valid = true;
  root.traverse((object) => {
    if (
      ![
        ...object.position.toArray(),
        ...object.quaternion.toArray(),
        ...object.scale.toArray(),
      ].every(Number.isFinite)
    )
      valid = false;
    if ((object as THREE.Mesh).isMesh) {
      const positions = (object as THREE.Mesh).geometry.getAttribute('position');
      if (!positions || positions.count < 3 || !Array.from(positions.array).every(Number.isFinite))
        valid = false;
      else meshes++;
    }
  });
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return valid && meshes > 0 && size.x <= 3.6 && size.y <= 4.1 && size.z <= 9.2;
}

/** Authored gunboat contract with a complete procedural fallback. */
export function buildGunboatModel(materials: Materials): GunboatVisual {
  const source = models.get('raider-gunboat');
  if (source && validGunboatModel(source.scene)) {
    const root = source.scene.clone(true) as THREE.Group;
    const yaw = root.getObjectByName('GunboatGunYaw');
    const pitch = root.getObjectByName('GunboatGunPitch');
    const muzzle = root.getObjectByName('GunboatMuzzle');
    const weaponTarget = root.getObjectByName('WeaponDamageAnchor');
    const engineTarget = root.getObjectByName('EngineDamageAnchor');
    if (yaw && pitch && muzzle && weaponTarget && engineTarget) {
      root.name = 'GunboatRoot';
      root.userData.authored = true;
      return {
        root,
        yaw,
        pitch,
        muzzle,
        weaponTarget,
        engineTarget,
        engineExhaust: root.getObjectByName('EngineExhaust') ?? null,
        weaponDisabled: root.getObjectByName('WeaponDisabled') ?? null,
        engineDisabled: root.getObjectByName('EngineDisabled') ?? null,
      };
    }
  }

  const root = new THREE.Group();
  root.name = 'GunboatRoot';
  box(root, [3.4, 2.8, 9], [0, 1.7, 0], materials.rustedSteel);
  box(root, [2.6, 1.2, 3.6], [0, 3.0, -0.2], materials.hullDark);
  const weaponTarget = box(root, [1.2, 1.2, 1.4], [0, 3.4, -1.7], materials.hullDark);
  weaponTarget.name = 'WeaponDamageAnchor';
  const engineTarget = box(root, [1.7, 1.3, 2.0], [0, 3.2, 2.8], materials.hull);
  engineTarget.name = 'EngineDamageAnchor';
  const yaw = new THREE.Group();
  yaw.name = 'GunboatGunYaw';
  yaw.position.set(0, 3.2, -1.7);
  root.add(yaw);
  const pitch = new THREE.Group();
  pitch.name = 'GunboatGunPitch';
  pitch.position.y = 0.4;
  yaw.add(pitch);
  box(pitch, [0.6, 0.6, 0.7], [0, 0, 0], materials.hullDark);
  const barrel = cylinder(pitch, 0.12, 1.65, [0, 0, -0.975], materials.bareSteel);
  barrel.rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D();
  muzzle.name = 'GunboatMuzzle';
  muzzle.position.set(0, 0, -1.8);
  pitch.add(muzzle);
  const exhaust = new THREE.Object3D();
  exhaust.name = 'EngineExhaust';
  exhaust.position.set(0, 3.2, 3.8);
  root.add(exhaust);
  const weaponDisabled = new THREE.Object3D();
  weaponDisabled.name = 'WeaponDisabled';
  weaponDisabled.visible = false;
  root.add(weaponDisabled);
  const engineDisabled = new THREE.Object3D();
  engineDisabled.name = 'EngineDisabled';
  engineDisabled.visible = false;
  root.add(engineDisabled);
  return {
    root,
    yaw,
    pitch,
    muzzle,
    weaponTarget,
    engineTarget,
    engineExhaust: exhaust,
    weaponDisabled,
    engineDisabled,
  };
}

/** Aim the skiff's visible light gun at its chosen volley target. */
export function aimSkiffWeapon(skiff: THREE.Group, target: THREE.Vector3): THREE.Vector3 {
  const yaw = skiff.getObjectByName('SkiffGunYaw');
  const pitch = skiff.getObjectByName('SkiffGunPitch');
  const muzzle = skiff.getObjectByName('SkiffMuzzle');
  if (!yaw || !pitch || !muzzle)
    return skiff.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.7, 0));
  const local = skiff.worldToLocal(target.clone()).sub(yaw.position);
  yaw.rotation.y = Math.atan2(-local.x, -local.z);
  pitch.rotation.x = Math.atan2(local.y, Math.hypot(local.x, local.z));
  skiff.updateMatrixWorld(true);
  return muzzle.getWorldPosition(new THREE.Vector3());
}

export function buildBoardingHookModel(materials: Materials): THREE.Group {
  const root = buildHook(materials.bareSteel);
  root.scale.setScalar(1.4);
  return root;
}

/** Crewmember visuals also retain the original character asset palette. */
export function buildSkiffCrewModel(materials: Materials): THREE.Group {
  const source = models.get('raider');
  const root = new THREE.Group();
  if (source) {
    root.add(cloneSkinned(source.scene));
    root.userData.authored = true;
    const idleClip = source.clips.find((clip) => clip.name === 'Idle');
    const climbClip = source.clips.find((clip) => clip.name === 'Climb');
    if (idleClip && climbClip) {
      const mixer = new THREE.AnimationMixer(root);
      const idle = mixer.clipAction(idleClip).play();
      const climb = mixer.clipAction(climbClip);
      crewAnimations.set(root, { mixer, idle, climb, crossing: false });
      mixer.update(0);
    }
    return root;
  }
  root.name = 'MMF_Raider_Fallback';
  box(root, [0.45, 0.57, 0.31], [0, 1.24, 0], materials.rustedSteel);
  box(root, [0.3, 0.31, 0.28], [0, 1.71, 0.02], materials.hullDark);
  box(root, [0.22, 0.045, 0.04], [0, 1.74, 0.17], materials.emissiveWarn);
  for (const side of [-1, 1]) {
    box(root, [0.19, 0.88, 0.2], [side * 0.16, 0.5, 0], materials.hullDark);
    box(root, [0.14, 0.61, 0.19], [side * 0.34, 1.2, 0], materials.hullDark);
  }
  return root;
}

/** Animate the independent crew rig; positioning and facing remain with the scene. */
export function updateSkiffCrewModel(model: THREE.Group, dt: number, crossing: boolean): void {
  const animation = crewAnimations.get(model);
  if (!animation) return;
  if (animation.crossing !== crossing) {
    const next = crossing ? animation.climb : animation.idle;
    const previous = crossing ? animation.idle : animation.climb;
    previous.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    animation.crossing = crossing;
  }
  animation.mixer.update(Math.max(0, dt));
}

/** Match the climbing hands to the cable, then mantle onto the deck at the end. */
export function placeSkiffCrewOnCable(
  model: THREE.Group,
  launcher: THREE.Vector3,
  landingFeet: THREE.Vector3,
  seat: THREE.Vector3,
  progress: number,
): void {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const forward = landingFeet.clone().sub(launcher);
  model.rotation.y = Math.atan2(forward.x, forward.z);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const left = model.getObjectByName('HandL') ?? model.getObjectByName('Hand.L');
  const right = model.getObjectByName('HandR') ?? model.getObjectByName('Hand.R');
  const grip =
    left && right
      ? left
          .getWorldPosition(new THREE.Vector3())
          .add(right.getWorldPosition(new THREE.Vector3()))
          .multiplyScalar(0.5)
      : new THREE.Vector3(0, 1.7, 0);
  const cablePoint = launcher.clone().lerp(landingFeet, t);
  cablePoint.y -= Math.sin(t * Math.PI) * Math.min(0.45, forward.length() * 0.035);
  const hanging = cablePoint.sub(grip);
  // Step off the skiff and grab the line, then pull the torso over the deck edge.
  model.position.copy(seat).lerp(hanging, THREE.MathUtils.smoothstep(t, 0, 0.18));
  model.position.lerp(landingFeet, THREE.MathUtils.smoothstep(t, 0.72, 1));
}
