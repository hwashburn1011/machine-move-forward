import type { FixedLink } from '@/enemies/NavGraph';
import type { Rng } from '@/core/math/Random';

export type BoardingSide = 'port' | 'starboard';
export interface EdgeCandidate {
  cell: { x: number; y: number; z: number };
  protected: boolean;
  instanceId?: string;
  /** Lower health/strength is the preferred breach. */ strength?: number;
  side?: BoardingSide;
}
export function pickAttachCell(
  edges: readonly EdgeCandidate[],
  side: BoardingSide,
  rng: Rng,
): { cell: EdgeCandidate['cell']; breachId: string | null; side: BoardingSide } {
  const sideEdges = edges.filter((e) => !e.side || e.side === side);
  const open = sideEdges.filter((e) => !e.protected);
  const protectedEdges = sideEdges.filter((e) => e.protected);
  const weakest = protectedEdges.length
    ? Math.min(...protectedEdges.map((e) => e.strength ?? Infinity))
    : Infinity;
  const weakProtected = protectedEdges.filter((e) => (e.strength ?? Infinity) === weakest);
  const pool = open.length ? open : weakProtected.length ? weakProtected : sideEdges;
  if (!pool.length) throw new Error('boarding attach requires an edge candidate');
  const chosen = pool[rng.int(0, pool.length - 1)]!;
  return {
    cell: { ...chosen.cell },
    breachId: chosen.protected ? (chosen.instanceId ?? null) : null,
    side,
  };
}
export function crossingSchedule(crewAlive: number, staggerSeconds = 1.5): { at: number }[] {
  return Array.from({ length: Math.max(0, crewAlive) }, (_, i) => ({ at: i * staggerSeconds }));
}
export function linkFor(cell: { x: number; y: number; z: number }, side: BoardingSide): FixedLink {
  const vehicle = { x: cell.x + (side === 'port' ? -1 : 1), y: cell.y, z: cell.z };
  return [vehicle, { ...cell }];
}
