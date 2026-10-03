import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StaticMeshOcclusion } from '@/core/math/StaticMeshOcclusion';

describe('rigid cloth triangle acceleration', () => {
  it.each([THREE.FrontSide, THREE.BackSide, THREE.DoubleSide])(
    'matches exact mesh hits, including holes, transformed scale and short rays (side %i)',
    (side) => {
      const shape = new THREE.Shape();
      shape.moveTo(-2, -2);
      shape.lineTo(2, -2);
      shape.lineTo(2, 2);
      shape.lineTo(-2, 2);
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.8, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geometry = new THREE.ShapeGeometry(shape, 32);
      const material = new THREE.MeshBasicMaterial({ side });
      const mesh = new THREE.Mesh(geometry, material);
      const parent = new THREE.Group();
      parent.add(mesh);
      parent.position.set(1, 3, -2);
      parent.rotation.set(0.2, -0.4, 0.1);
      mesh.scale.set(1.6, 0.7, 1.2);
      parent.updateMatrixWorld(true);
      const index = StaticMeshOcclusion.create(mesh)!;
      const ray = new THREE.Raycaster();
      for (const direction of [-1, 1])
        for (const length of [0.8, 4]) {
          for (let x = -2.5; x <= 2.5; x += 0.25)
            for (let y = -2.5; y <= 2.5; y += 0.25) {
              const from = new THREE.Vector3(x, y, direction * 2).applyMatrix4(mesh.matrixWorld);
              const to = new THREE.Vector3(x, y, direction * (2 - length)).applyMatrix4(
                mesh.matrixWorld,
              );
              ray.set(from, to.clone().sub(from).normalize());
              ray.far = from.distanceTo(to);
              const hits: THREE.Intersection[] = [];
              mesh.raycast(ray, hits);
              expect(
                index.intersects(from, to),
                JSON.stringify({ side, direction, length, x, y }),
              ).toBe(hits.length > 0);
            }
        }
      geometry.dispose();
      material.dispose();
    },
  );

  it('falls back after geometry edits and for skinned meshes', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const index = StaticMeshOcclusion.create(mesh)!;
    mesh.geometry.attributes.position!.needsUpdate = true;
    expect(index.intersects(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1))).toBeNull();
    expect(StaticMeshOcclusion.create(new THREE.SkinnedMesh())).toBeNull();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
