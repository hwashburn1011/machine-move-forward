import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EnemyVisual } from '@/enemies/EnemyVisual';
import type { Materials } from '@/art/Materials';

it('shares one material within an enemy while preserving independent flashes and disposal', () => {
  const scene = new THREE.Group();
  scene.userData.authoredPalette = true;
  const material = new THREE.MeshStandardMaterial({ color: 0x345678, emissive: 0x112233 });
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.name = `body${i}`;
    mesh.position.y = i;
    scene.add(mesh);
  }
  const model = { scene, clips: [] };
  const a = new EnemyVisual(model, {} as Materials);
  const b = new EnemyVisual(model, {} as Materials);
  const own = (v: EnemyVisual, name: string) =>
    (v.object3D.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
  expect(own(a, 'body0')).toBe(own(a, 'body1'));
  expect(own(a, 'body0')).not.toBe(own(b, 'body0'));
  expect(own(a, 'body0')).not.toBe(material);
  const unchanged = own(b, 'body0').color.clone();
  a.flash();
  expect(own(a, 'body0').color.equals(unchanged)).toBe(false);
  expect(own(b, 'body0').color.equals(unchanged)).toBe(true);
  const dispose = vi.spyOn(own(a, 'body0'), 'dispose');
  a.dispose();
  a.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  b.dispose();
});

it('also releases non-flashing basic materials without disposing borrowed textures', () => {
  const texture = new THREE.Texture();
  const source = new THREE.MeshBasicMaterial({ map: texture });
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
  mesh.name = 'lens';
  scene.add(mesh);
  const visual = new EnemyVisual({ scene, clips: [] }, {} as Materials);
  const owned = (visual.object3D.getObjectByName('lens') as THREE.Mesh).material as THREE.Material;
  const dispose = vi.spyOn(owned, 'dispose');
  const borrowed = vi.spyOn(texture, 'dispose');
  visual.dispose();
  visual.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(borrowed).not.toHaveBeenCalled();
});
