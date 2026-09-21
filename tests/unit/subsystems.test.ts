import { describe, expect, it } from 'vitest';
import { SUBSYSTEMS, LEG_SUBSYSTEM, type SubsystemId } from '@/data/subsystems';
import { DECK_HEIGHT, DECK_SURFACE_Y } from '@/game/constants';
import { LEGS } from '@/data/gait';
import { buildIronNomad } from '@/machine/IronNomadGeometry';
import { NOMAD_LEG_GAME_ANCHORS } from '@/data/nomad-leg-contract';

const ALL = Object.keys(SUBSYSTEMS) as SubsystemId[];

describe('machine subsystems', () => {
  it('has the engine and one entry per leg', () => {
    expect(ALL).toHaveLength(5);
    expect(ALL).toContain('engine');
    for (const leg of LEGS) expect(LEG_SUBSYSTEM[leg.id]).toBeDefined();
  });

  it('puts every repair point on the deck, where a player can actually stand', () => {
    // The whole reason repairAt exists. V3 leg hips are below the lowest deck
    // plane. A design that repaired a
    // subsystem at its hitbox would be unreachable for four of the five.
    for (const id of ALL) {
      const at = SUBSYSTEMS[id].repairAt;
      expect(Math.abs(at.x), `${id} x`).toBeLessThanOrEqual(11);
      expect(Math.abs(at.z), `${id} z`).toBeLessThanOrEqual(13);
      expect(at.y, `${id} y`).toBe(DECK_HEIGHT);
    }
  });

  it('keeps engine damage and repair anchors on the v3 aft machinery', () => {
    const engine = SUBSYSTEMS.engine;
    expect(engine.hitbox).toEqual({
      half: { x: 1.4, y: 0.9, z: 1.3 },
      center: { x: 0, y: DECK_SURFACE_Y + 0.9, z: 9 },
    });
    expect(engine.repairAt).toEqual({ x: 0, y: DECK_HEIGHT, z: 7.4 });

    const runtime = buildIronNomad({} as never);
    expect(
      runtime.colliders.some(
        (collider) =>
          collider.center.x === engine.hitbox.center.x &&
          collider.center.y === engine.hitbox.center.y &&
          collider.center.z === engine.hitbox.center.z &&
          collider.half.x === engine.hitbox.half.x &&
          collider.half.y === engine.hitbox.half.y &&
          collider.half.z === engine.hitbox.half.z,
      ),
    ).toBe(true);
  });

  it("puts each leg's repair point on that leg's own side and end", () => {
    for (const leg of LEGS) {
      const at = SUBSYSTEMS[LEG_SUBSYSTEM[leg.id]].repairAt;
      expect(Math.sign(at.x), leg.id).toBe(Math.sign(leg.hip.x));
      expect(Math.sign(at.z), leg.id).toBe(Math.sign(leg.hip.z));
    }
  });

  it('keeps leg damage and service anchors on the measured v3 leg contract', () => {
    for (const id of ALL.filter((entry) => entry !== 'engine')) {
      const subsystem = SUBSYSTEMS[id];
      expect(Math.abs(subsystem.hitbox.center.x)).toBe(NOMAD_LEG_GAME_ANCHORS.hipAbs.x);
      expect(Math.abs(subsystem.hitbox.center.z)).toBe(NOMAD_LEG_GAME_ANCHORS.hipAbs.z);
      expect(Math.abs(subsystem.repairAt.x)).toBe(NOMAD_LEG_GAME_ANCHORS.repairAbs.x);
      expect(Math.abs(subsystem.repairAt.z)).toBe(NOMAD_LEG_GAME_ANCHORS.repairAbs.z);
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
