import * as THREE from 'three';
import type { Materials } from './Materials';
import { authoredModel } from './DefenseModels';
import type { SeedGardenSave } from '@/building/SeedGarden';

export interface SeedGardenVisual {
  root: THREE.Group;
  update(state: Readonly<SeedGardenSave>): void;
  dispose(): void;
}

/** Shared authored meshes; growth changes only this instance's stage transforms. */
export function buildSeedGardenModel(materials: Materials): SeedGardenVisual {
  const source = authoredModel('seed-garden');
  const valid = source?.scene.getObjectByName('Growing') && source.scene.getObjectByName('Ready');
  const root = valid ? source!.scene.clone(true) : new THREE.Group();
  const ownedGeometry: THREE.BufferGeometry[] = [];
  if (!valid) {
    const part = (
      name: string,
      size: [number, number, number],
      y: number,
      material: THREE.Material,
    ) => {
      const geometry = new THREE.BoxGeometry(...size);
      ownedGeometry.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };
    part('GardenTray', [1.65, 0.6, 1.65], 0.3, materials.rustedSteel);
    part('Growing', [1.35, 0.15, 1.35], 0.77, materials.accent);
    part('Ready', [1.4, 0.4, 1.4], 0.89, materials.accent);
  }
  const growing = root.getObjectByName('Growing')!;
  const ready = root.getObjectByName('Ready')!;
  return {
    root,
    update(state) {
      ready.visible = state.greens > 0;
      growing.visible = !ready.visible && (state.water > 0 || state.progressS > 0);
      if (valid) {
        const scale = 0.45 + 0.55 * Math.min(1, state.progressS / 180);
        growing.scale.y = scale;
        growing.position.y = 0.69 * (1 - scale);
      }
    },
    dispose() {
      for (const geometry of ownedGeometry) geometry.dispose();
      root.removeFromParent();
    },
  };
}
