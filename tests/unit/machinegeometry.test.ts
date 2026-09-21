import { describe, expect, it } from 'vitest';
import { buildIronNomad, overNomadStairwell } from '@/machine/IronNomadGeometry';
import { DECK_SURFACE_Y, LEVEL_HEIGHT, NOMAD_WALKABLE_HALF_WIDTH } from '@/game/constants';
describe('Iron Nomad three-deck support', () => {
  const build = buildIronNomad({} as never);
  it('puts all three deck surfaces on the shared build grid', () => {
    for (const level of [-2, -1, 0]) {
      const floors = build.colliders.filter(
        (c) =>
          c.half.y === 0.09 &&
          Math.abs(c.center.y + c.half.y - (DECK_SURFACE_Y + level * LEVEL_HEIGHT)) < 0.001,
      );
      expect(floors.length).toBeGreaterThanOrEqual(8);
      expect(floors.length).toBeLessThanOrEqual(12);
      const perimeter = floors.filter(
        (floor) => Math.abs(floor.center.x) > 7 || Math.abs(floor.center.z) > 9,
      );
      expect(perimeter.length).toBeGreaterThanOrEqual(4);
      const expectedMinWidth = level === 0 ? -13 : -15;
      const expectedMaxWidth = level === 0 ? 12 : 13;
      const expectedMinLength = level === 0 ? -14 : -15;
      const expectedMaxLength = level === 0 ? 14 : 15;
      expect(Math.min(...perimeter.map((floor) => floor.center.x - floor.half.x))).toBe(
        expectedMinWidth,
      );
      expect(Math.max(...perimeter.map((floor) => floor.center.x + floor.half.x))).toBe(
        expectedMaxWidth,
      );
      expect(Math.min(...perimeter.map((floor) => floor.center.z - floor.half.z))).toBe(
        expectedMinLength,
      );
      expect(Math.max(...perimeter.map((floor) => floor.center.z + floor.half.z))).toBe(
        expectedMaxLength,
      );
    }
  });
  it('leaves two open wells and supplies traversable ramps', () => {
    expect(overNomadStairwell({ x: -1, y: 0, z: 0 })).toBe(true);
    expect(overNomadStairwell({ x: -1, y: -2, z: 0 })).toBe(false);
    const ramps = build.colliders.filter((c) => c.rotX !== undefined && c.half.x > 0.5);
    expect(ramps).toHaveLength(4);
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
    expect(build.group.getObjectByName('ExpeditionGate')?.position.x).toBe(
      NOMAD_WALKABLE_HALF_WIDTH,
    );
    expect(build.colliders.find((collider) => collider.expeditionGate)?.center.x).toBe(
      NOMAD_WALKABLE_HALF_WIDTH,
    );
  });
});
