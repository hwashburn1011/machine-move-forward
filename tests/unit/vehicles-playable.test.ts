import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/math/Random';
import { VEHICLES } from '@/data/vehicles';
import { crossingSchedule, linkFor, pickAttachCell } from '@/vehicles/BoardingPlan';
import { planVolley } from '@/vehicles/VolleyPlanner';

describe('skiff encounter', () => {
  it('plans exposed counterplay targets and a deterministic crossing', () => {
    const plan = planVolley(new Rng(3), VEHICLES.skiff, [
      { id: 'wall', kind: 'structure', exposed: true },
      { id: 'turret', kind: 'turret', exposed: true },
      { id: 'player', kind: 'player', exposed: true },
    ]);
    expect(plan?.targetId).toBe('player');
    expect(crossingSchedule(2)).toEqual([{ at: 0 }, { at: 1.5 }]);
    expect(linkFor({ x: 4, y: 0, z: 2 }, 'port')[0]).toEqual({ x: 3, y: 0, z: 2 });
    expect(pickAttachCell([{ cell: { x: 4, y: 0, z: 2 }, protected: false }], 'port', new Rng(1)).breachId).toBeNull();
  });

});
