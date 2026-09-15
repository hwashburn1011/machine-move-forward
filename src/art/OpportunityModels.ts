import * as THREE from 'three';
import type { Materials } from './Materials';
import { authoredModel } from './DefenseModels';
import type { RouteContactKind } from '@/navigation/RouteChart';
import { OPPORTUNITIES, opportunityDefinition } from '@/data/opportunities';

export function buildOpportunityModel(kind: RouteContactKind, materials: Materials): THREE.Group {
  const source = authoredModel(OPPORTUNITIES[kind].model);
  if (source?.scene.getObjectByName('Reward') && source.scene.getObjectByName('Gangway')) {
    const model = source.scene.clone(true);
    model.userData.authored = true;
    return model;
  }
  const root = new THREE.Group();
  const def = opportunityDefinition(kind);
  for (const part of def.colliders) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.half.x * 2, part.half.y * 2, part.half.z * 2),
      part.id === 'equipment' ? materials.rustedSteel : materials.bareSteel,
    );
    mesh.position.set(part.at.x, part.at.y, part.at.z);
    mesh.castShadow = mesh.receiveShadow = true;
    if (part.id === 'gangway') mesh.name = 'Gangway';
    root.add(mesh);
  }
  const reward = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.35), materials.accent);
  reward.name = 'Reward';
  reward.position.set(-2, 1.2, 1.5);
  root.add(reward);
  return root;
}
