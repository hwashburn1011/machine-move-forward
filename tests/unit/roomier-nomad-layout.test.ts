import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildIronNomad } from '@/machine/IronNomadGeometry';
import { caretakerPortalFor } from '@/companion/CaretakerPortals';
import type { Cell } from '@/building/BuildGrid';
import {
  DECK_SURFACE_Y,
  LEVEL_HEIGHT,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
  NOMAD_STAIR_RUN,
  NOMAD_STAIR_WIDTH,
} from '@/game/constants';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

describe('roomier Nomad layout contract', () => {
  it('keeps the two metre grid while exposing the measured core and deck heights', () => {
    expect([MACHINE_TILES_X * 2, MACHINE_TILES_Z * 2]).toEqual([22, 26]);
    expect(DECK_SURFACE_Y).toBeCloseTo(16.03, 6);
    expect(DECK_SURFACE_Y - LEVEL_HEIGHT * 2).toBeCloseTo(8.83, 6);
    expect(DECK_SURFACE_Y - LEVEL_HEIGHT).toBeCloseTo(12.43, 6);
  });

  it('uses the measured stair run and width in fallback collision', () => {
    const build = buildIronNomad({} as never);
    const ramps = build.colliders.filter(
      (collider) => collider.rotX !== undefined && collider.half.x > 0.5,
    );
    expect(ramps).toHaveLength(4);
    for (const ramp of ramps) {
      expect(ramp.half.x * 2).toBeGreaterThanOrEqual(NOMAD_STAIR_WIDTH);
      expect(ramp.half.x * 2).toBeLessThanOrEqual(2);
      expect(ramp.half.z * 2).toBeGreaterThan(4.8);
      expect(Math.abs(ramp.rotX!)).toBeLessThan(Math.PI / 4);
    }
  });

  it('derives caretaker portal endpoints from the same stair contract', () => {
    const group = new THREE.Group();
    const lower = c(-1, -1, -2);
    const upper = c(-1, 0, 2);
    const portal = caretakerPortalFor([upper, lower], upper, lower, (point) =>
      group.localToWorld(point),
    );
    expect(portal).not.toBeNull();
    const local = portal!.samples.map((point) => group.worldToLocal(point.clone()));
    expect(local[0]!.z).toBeCloseTo(2, 6);
    expect(local.at(-1)!.z).toBeCloseTo(-2, 6);
    expect(Math.max(...local.map((point) => point.z))).toBeCloseTo(NOMAD_STAIR_RUN / 2, 6);
    expect(Math.min(...local.map((point) => point.z))).toBeCloseTo(-NOMAD_STAIR_RUN / 2, 6);
    expect(local.map((point) => point.y)).toContainEqual(expect.closeTo(DECK_SURFACE_Y, 6));
  });
});
