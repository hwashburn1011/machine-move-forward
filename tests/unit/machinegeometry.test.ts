import { describe, expect, it } from 'vitest';
import { buildIronNomad, overNomadStairwell } from '@/machine/IronNomadGeometry';
import { DECK_SURFACE_Y } from '@/game/constants';
describe('Iron Nomad three-deck support', () => {
  const build = buildIronNomad({} as never);
  it('puts all three deck surfaces on the shared build grid', () => {
    for (const level of [-2, -1, 0]) {
      const floors = build.colliders.filter(
        (c) =>
          c.half.y === 0.09 &&
          Math.abs(c.center.y + c.half.y - (DECK_SURFACE_Y + level * 3)) < 0.001,
      );
      expect(floors.length).toBe(level === -2 ? 1 : 4);
    }
  });
  it('leaves two open wells and supplies traversable ramps', () => {
    expect(overNomadStairwell({ x: -1, y: 0, z: 0 })).toBe(true);
    expect(overNomadStairwell({ x: -1, y: -2, z: 0 })).toBe(false);
    const ramps = build.colliders.filter((c) => c.rotX !== undefined);
    expect(ramps).toHaveLength(2);
    for (const ramp of ramps) {
      expect(Math.abs(ramp.rotX!)).toBeLessThan((40 * Math.PI) / 180);
      expect(ramp.half.x * 2).toBeGreaterThan(1.8);
    }
  });
  it('keeps the helm and retractable gate as named interaction objects', () => {
    for (const name of [
      'HelmRoot',
      'HelmInteract',
      'GyroInstalled',
      'HelmPowerLamp',
      'ExpeditionGate',
    ]) {
      expect(build.group.getObjectByName(name)).toBeDefined();
    }
  });
});
