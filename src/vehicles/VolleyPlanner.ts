import type { VehicleDefinition } from '@/data/vehicles';
import type { Rng } from '@/core/math/Random';

export interface VolleyTarget {
  id: string;
  kind: 'player' | 'turret' | 'structure' | 'subsystem';
  exposed: boolean;
}
export interface VolleyPlan {
  targetId: string;
  kind: VolleyTarget['kind'];
  shots: number;
}

/** Chooses a visible target once; the entity applies the delayed shots later. */
export function planVolley(
  rng: Rng,
  def: Pick<VehicleDefinition, 'weapon'>,
  candidates: readonly VolleyTarget[],
): VolleyPlan | null {
  const rank: Record<VolleyTarget['kind'], number> = {
    player: 4,
    turret: 3,
    structure: 2,
    subsystem: 1,
  };
  const viable = candidates.filter((c) => c.exposed).sort((a, b) => rank[b.kind] - rank[a.kind]);
  if (viable.length === 0) return null;
  const topRank = rank[viable[0]!.kind];
  const tied = viable.filter((c) => rank[c.kind] === topRank);
  const target = tied.length === 1 ? tied[0]! : tied[rng.int(0, tied.length - 1)]!;
  return { targetId: target.id, kind: target.kind, shots: def.weapon.volleyShots };
}
