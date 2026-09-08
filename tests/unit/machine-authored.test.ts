import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { Machine } from '@/machine/Machine';

function stubMaterials(): Materials {
  const material = new THREE.MeshStandardMaterial();
  return {
    hull: material,
    hullDark: material,
    bareSteel: material,
    rustedSteel: material,
    rubber: material,
    accent: material,
    hazard: material,
  } as unknown as Materials;
}

function modelWith(...roots: string[]): LoadedModel {
  const scene = new THREE.Group();
  for (const name of roots) {
    const root = new THREE.Group();
    root.name = name;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial()));
    scene.add(root);
  }
  return { scene, clips: [] };
}

function addHipModule(model: LoadedModel): void {
  const module = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshBasicMaterial());
  module.name = 'MMF_WalkerLeg_front-left_Hip';
  model.scene.add(module);
}

function countNamed(root: THREE.Object3D, name: string): number {
  let count = 0;
  root.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
}

function emptyModel(...roots: string[]): LoadedModel {
  const scene = new THREE.Group();
  for (const name of roots) {
    const root = new THREE.Group();
    root.name = name;
    scene.add(root);
  }
  return { scene, clips: [] };
}

describe('authored machine skin replacement', () => {
  it('clones sources and restores procedural skins across reapply, partial, and null models', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const scene = new THREE.Scene();
    const materials = stubMaterials();
    const machine = new Machine(scene, physics, materials);
    const full = modelWith(
      'MMF_EngineSkin',
      'MMF_Equipment_generator',
      'MMF_Equipment_fuel-tank',
      'MMF_Equipment_workbench',
      'MMF_Equipment_crate-a',
      'MMF_Equipment_crate-b',
      'MMF_Equipment_collector',
    );
    addHipModule(full);
    const partial = modelWith('MMF_Equipment_generator');
    const empty = emptyModel('MMF_Equipment_generator');

    machine.applyAuthoredDetailModel(full);
    expect(full.scene.getObjectByName('MMF_WalkerLeg_front-left_Hip')).toBeDefined();
    expect(machine.group.getObjectByName('engine')?.visible).toBe(false);
    for (const name of ['generator', 'fuel-tank', 'workbench', 'crate-a', 'crate-b', 'collector']) {
      expect(machine.group.getObjectByName(name)?.visible, name).toBe(false);
    }
    expect(countNamed(machine.group, 'MMF_WalkerLeg_front-left_Hip-runtime')).toBe(1);

    machine.applyAuthoredDetailModel(full);
    expect(full.scene.getObjectByName('MMF_WalkerLeg_front-left_Hip')).toBeDefined();
    expect(countNamed(machine.group, 'MMF_WalkerLeg_front-left_Hip-runtime')).toBe(1);

    machine.applyAuthoredDetailModel(partial);
    expect(machine.group.getObjectByName('engine')?.visible).toBe(true);
    expect(machine.group.getObjectByName('generator')?.visible).toBe(false);
    for (const name of ['fuel-tank', 'workbench', 'crate-a', 'crate-b', 'collector']) {
      expect(machine.group.getObjectByName(name)?.visible, name).toBe(true);
    }

    machine.applyAuthoredDetailModel(empty);
    expect(machine.group.getObjectByName('generator')?.visible).toBe(true);

    machine.applyAuthoredDetailModel(null);
    expect(machine.group.getObjectByName('engine')?.visible).toBe(true);
    expect(machine.group.getObjectByName('generator')?.visible).toBe(true);
    expect(machine.group.getObjectByName('authored-machine-details')).toBeUndefined();

    physics.dispose();
    for (const material of Object.values(materials)) material?.dispose();
  });

  it('disposes procedural geometry without disposing loader-owned source geometry', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const scene = new THREE.Scene();
    const materials = stubMaterials();
    const machine = new Machine(scene, physics, materials);
    const model = modelWith('MMF_EngineSkin');
    const sourceMesh = model.scene.getObjectByName('MMF_EngineSkin')?.children[0] as THREE.Mesh;
    let sourceDisposed = 0;
    sourceMesh.geometry.addEventListener('dispose', () => sourceDisposed++);
    const fallback = machine.group.getObjectByName('engine') as THREE.Mesh;
    let fallbackDisposed = 0;
    fallback.geometry.addEventListener('dispose', () => fallbackDisposed++);

    machine.applyAuthoredDetailModel(model);
    machine.dispose();
    machine.dispose();

    expect(sourceDisposed).toBe(0);
    expect(fallbackDisposed).toBe(1);
    expect(scene.getObjectById(machine.group.id)).toBeUndefined();

    physics.dispose();
    for (const material of Object.values(materials)) material?.dispose();
  });
});
