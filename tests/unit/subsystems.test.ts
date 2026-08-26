import { describe, expect, it } from 'vitest';
import { SUBSYSTEMS, LEG_SUBSYSTEM, type SubsystemId } from '@/data/subsystems';
import { DECK_HEIGHT } from '@/game/constants';
import { LEGS } from '@/data/gait';

const ALL = Object.keys(SUBSYSTEMS) as SubsystemId[];

describe('machine subsystems', () => {
  it('has the engine and one entry per leg', () => {
    expect(ALL).toHaveLength(5);
    expect(ALL).toContain('engine');
    for (const leg of LEGS) expect(LEG_SUBSYSTEM[leg.id]).toBeDefined();
  });

  it('puts every repair point on the deck, where a player can actually stand', () => {
    // The whole reason repairAt exists. Leg hips are at x = +/-6.0, y = 3.1 --
    // outboard of a 10m deck and BELOW its plane. A design that repaired a
    // subsystem at its hitbox would be unreachable for four of the five.
    for (const id of ALL) {
      const at = SUBSYSTEMS[id].repairAt;
      expect(Math.abs(at.x), `${id} x`).toBeLessThanOrEqual(5);
      expect(Math.abs(at.z), `${id} z`).toBeLessThanOrEqual(8);
      expect(at.y, `${id} y`).toBe(DECK_HEIGHT);
    }
  });

  it("puts each leg's repair point on that leg's own side and end", () => {
    for (const leg of LEGS) {
      const at = SUBSYSTEMS[LEG_SUBSYSTEM[leg.id]].repairAt;
      expect(Math.sign(at.x), leg.id).toBe(Math.sign(leg.hip.x));
      expect(Math.sign(at.z), leg.id).toBe(Math.sign(leg.hip.z));
    }
  });

  it('prices every repair, and gives everything health and armour', () => {
    for (const id of ALL) {
      expect(SUBSYSTEMS[id].maxHealth).toBeGreaterThan(0);
      expect(SUBSYSTEMS[id].repairScrap).toBeGreaterThan(0);
      expect(SUBSYSTEMS[id].armor).toBeGreaterThanOrEqual(0);
    }
  });
});
