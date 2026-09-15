import type * as THREE from 'three';
import { authoredModel } from './DefenseModels';
import type { AttachmentId } from '@/data/weapon-loadouts';

const ATTACHMENTS: Record<AttachmentId, string> = {
  'rifle-stabilizer': 'RifleStabilizer',
  'rifle-burst-cam': 'RifleBurstCam',
  'shotgun-choke': 'ShotgunChoke',
  'shotgun-scatter-brake': 'ShotgunScatterBrake',
};
let cachedScene: THREE.Group | undefined;
const parts = new Map<string, THREE.Object3D>();

/** Borrow cache-owned geometry; callers clone transforms and never dispose the source. */
export function fieldworkPart(name: string): THREE.Object3D | null {
  const scene = authoredModel('fieldwork-kit')?.scene;
  if (scene !== cachedScene) {
    cachedScene = scene;
    parts.clear();
    scene?.traverse((node) => parts.set(node.name, node));
  }
  return parts.get(name) ?? null;
}

export function attachmentModel(id: AttachmentId | null): THREE.Object3D | null {
  return id ? fieldworkPart(ATTACHMENTS[id]) : null;
}

const poses = new WeakMap<THREE.Group, { head?: THREE.Object3D; arms: THREE.Object3D[] }>();
export function animateCaretaker(
  root: THREE.Group,
  time: number,
  servicing: boolean,
  dt: number,
): void {
  let pose = poses.get(root);
  if (!pose) {
    pose = { head: root.getObjectByName('L12Sensor'), arms: [] };
    for (const name of ['L12ArmLeft', 'L12ArmRight']) {
      const arm = root.getObjectByName(name);
      if (arm) pose.arms.push(arm);
    }
    poses.set(root, pose);
  }
  const blend = 1 - Math.exp(-6 * dt);
  if (pose.head) {
    pose.head.rotation.y += (Math.sin(time * 0.65) * 0.16 - pose.head.rotation.y) * blend;
    pose.head.rotation.x += ((servicing ? 0.2 : 0.02) - pose.head.rotation.x) * blend;
  }
  for (const arm of pose.arms) arm.rotation.x += ((servicing ? -0.35 : 0) - arm.rotation.x) * blend;
}
