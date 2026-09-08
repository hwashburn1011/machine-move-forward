import { expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeLoadedModel, type LoadedModel } from '@/art/ModelLoader';

it('deduplicates and idempotently disposes caller-owned model resources', () => {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const model: LoadedModel = { scene, clips: [] };
  let geometryDisposed = 0;
  let materialDisposed = 0;
  let textureDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  material.addEventListener('dispose', () => materialDisposed++);
  texture.addEventListener('dispose', () => textureDisposed++);

  disposeLoadedModel(model);
  disposeLoadedModel(model);

  expect(geometryDisposed).toBe(1);
  expect(materialDisposed).toBe(1);
  expect(textureDisposed).toBe(1);
});
