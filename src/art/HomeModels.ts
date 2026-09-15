import type * as THREE from 'three';
import { authoredModel } from './DefenseModels';
import type { PieceId } from '@/data/build-pieces';

const NODES: Partial<Record<PieceId, string>> = {
  chair: 'HomeChair',
  table: 'HomeTable',
  rug: 'HomeRug',
  shelf: 'HomeShelf',
};

/** Borrow immutable geometry/materials from the kit; each piece owns its transforms. */
export function homeModel(piece: PieceId): THREE.Object3D | null {
  const name = NODES[piece];
  const source = name ? authoredModel('home-furnishings')?.scene.getObjectByName(name) : null;
  if (!source) return null;
  const root = source.clone(true);
  root.position.set(0, 0, 0);
  const display = root.getObjectByName('KeepsakeLit');
  if (display) display.visible = false;
  return root;
}
