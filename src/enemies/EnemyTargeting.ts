import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { EnemyDefinition } from '@/data/enemies';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * How far outside its own box a subsystem can still be struck.
 *
 * The hitbox is the part's real geometry, and an enemy that has walked up to
 * the engine is standing beside it rather than inside it. Without this margin
 * a strict containment test would mean the engine could never be hit at all —
 * which is the sort of thing that ships looking like "raiders ignore the
 * engine" rather than like an off-by-a-body-width.
 */
const REACH_MARGIN = 1.0;

export function subsystemTargetFor(def: EnemyDefinition): SubsystemId | null {
  return def.targetPriority === 'engine' ? 'engine' : null;
}

export function hitboxContains(id: SubsystemId, point: Vec3Like): boolean {
  const { half, center } = SUBSYSTEMS[id].hitbox;
  return (
    Math.abs(point.x - center.x) <= half.x + REACH_MARGIN &&
    Math.abs(point.y - center.y) <= half.y + REACH_MARGIN &&
    Math.abs(point.z - center.z) <= half.z + REACH_MARGIN
  );
}
