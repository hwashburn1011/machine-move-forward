import type { TurretDefinition } from '@/data/turrets';

export interface TurretAim {
  yaw: number;
  pitch: number;
}
export function clampTurretAim(aim: TurretAim, def: TurretDefinition): TurretAim {
  const yaw = Math.max(def.traverse.yawMin, Math.min(def.traverse.yawMax, aim.yaw));
  const pitch = Math.max(def.traverse.pitchMin, Math.min(def.traverse.pitchMax, aim.pitch));
  return { yaw, pitch };
}
export function angleToTurret(
  origin: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): TurretAim {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
