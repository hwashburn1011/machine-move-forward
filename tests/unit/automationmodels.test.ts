import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildAutomaticCollectorModel,
  buildAutomaticTurretModel,
  validateAutomaticCollectorModel,
  validateAutomaticTurretModel,
} from '@/art/AutomationModels';

const materials = {
  stationMetal: new THREE.MeshBasicMaterial(),
  bareSteel: new THREE.MeshBasicMaterial(),
  hull: new THREE.MeshBasicMaterial(),
  hullDark: new THREE.MeshBasicMaterial(),
} as never;

describe('automation model contracts', () => {
  it('builds fallback markers at authored coordinates', () => {
    const collector = buildAutomaticCollectorModel(materials);
    const turret = buildAutomaticTurretModel(materials);
    collector.root.updateMatrixWorld(true);
    turret.root.updateMatrixWorld(true);
    expect(collector.hookExit.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([
      0, 1.03, -0.77,
    ]);
    expect(collector.interact.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([
      0, 0.7, 0.86,
    ]);
    expect(turret.muzzle.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0, 1.17, -0.67]);
    expect(turret.root.getObjectByName('ServoInstalled')).toBeTruthy();
    expect(turret.root.getObjectByName('PowerLamp')).toBeTruthy();
  });

  it('rejects null-like, empty, missing-marker and incorrect-hierarchy models', () => {
    const empty = new THREE.Group();
    expect(validateAutomaticCollectorModel(empty)).toBe(false);
    expect(validateAutomaticTurretModel(empty)).toBe(false);
    const bad = new THREE.Group();
    bad.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const collectorRoot = new THREE.Group();
    collectorRoot.name = 'CollectorRoot';
    bad.add(collectorRoot);
    for (const name of [
      'DrumPivot',
      'GuidePivot',
      'HookExit',
      'CollectorInteract',
      'ControllerInstalled',
      'BufferLamp',
    ]) {
      const marker = new THREE.Object3D();
      marker.name = name;
      collectorRoot.add(marker);
    }
    collectorRoot.getObjectByName('HookExit')!.position.z = 3;
    expect(validateAutomaticCollectorModel(bad)).toBe(false);
  });

  it('accepts a complete authored hierarchy only when pivots are parented correctly', () => {
    const wrapper = new THREE.Group();
    const root = new THREE.Group();
    root.name = 'AutoTurretRoot';
    wrapper.add(root);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const yaw = new THREE.Group();
    yaw.name = 'TurretYaw';
    root.add(yaw);
    const pitch = new THREE.Group();
    pitch.name = 'TurretPitch';
    yaw.add(pitch);
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    pitch.add(muzzle);
    for (const name of ['TrackerHead', 'ServoInstalled', 'PowerLamp']) {
      const marker = new THREE.Object3D();
      marker.name = name;
      pitch.add(marker);
    }
    expect(validateAutomaticTurretModel(wrapper)).toBe(true);
    yaw.remove(pitch);
    expect(validateAutomaticTurretModel(wrapper)).toBe(false);
  });

  it('accepts semantic roots beneath a GLTF wrapper scene', () => {
    const wrapper = new THREE.Group();
    const root = new THREE.Group();
    root.name = 'CollectorRoot';
    wrapper.add(root);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial()));
    for (const [name, position] of [
      ['DrumPivot', [0, 0.75, 0]],
      ['GuidePivot', [0, 1.05, -0.45]],
      ['HookExit', [0, 1.03, -0.77]],
      ['CollectorInteract', [0, 0.7, 0.86]],
      ['ControllerInstalled', [0, 0.8, 0]],
      ['BufferLamp', [0, 1.4, 0]],
    ] as const) {
      const marker = new THREE.Object3D();
      marker.name = name;
      marker.position.set(position[0], position[1], position[2]);
      root.add(marker);
    }
    expect(validateAutomaticCollectorModel(wrapper)).toBe(true);
  });
});
