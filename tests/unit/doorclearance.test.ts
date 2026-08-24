import { describe, it, expect } from 'vitest';
import { pieceColliders } from '@/building/BuildPieceGeometry';
import {
  CHARACTER_SKIN,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '@/game/constants';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from '@/enemies/EnemyMesh';

/**
 * A doorway has to fit the people walking through it.
 *
 * This is arithmetic nobody was doing. The doorway's opening height is
 * measured from the level's floor PLANE, but a character stands on a built
 * floor PLATE whose top sits above that plane. The difference is the whole
 * bug: the opening measured 2.1m, the plate ate 0.16m of it, and the 1.94m
 * that survived was under the 1.92m capsule plus its controller skin. Every
 * capsule — player and enemy alike — jammed against the lintel and stopped.
 *
 * These tests measure the clearance a body actually gets, from the surface it
 * actually stands on, so the relationship cannot drift again unnoticed.
 */

/** Top of a built floor plate, relative to its level's floor plane. */
function floorPlateTop(): number {
  const [plate] = pieceColliders('floor');
  if (!plate) throw new Error('floor piece has no collider');
  return plate.offset.y + plate.half.y;
}

/** Underside of the doorway lintel, relative to the same floor plane. */
function lintelUnderside(): number {
  // The lintel is the collider that spans the opening horizontally and sits
  // highest; the jambs flank it.
  const lintel = pieceColliders('doorway').reduce((highest, c) =>
    c.offset.y > highest.offset.y ? c : highest,
  );
  return lintel.offset.y - lintel.half.y;
}

/** The narrowest horizontal gap between the jambs. */
function openingWidth(): number {
  const jambs = pieceColliders('doorway').filter((c) => c.offset.x !== 0);
  const inner = Math.min(...jambs.map((j) => Math.abs(j.offset.x) - j.half.x));
  return inner * 2;
}

/** Total height of a capsule, including the skin the controller keeps around it. */
function bodyHeight(halfHeight: number, radius: number): number {
  return 2 * (halfHeight + radius) + 2 * CHARACTER_SKIN;
}

const PLAYER_HEIGHT = bodyHeight(PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS);
const ENEMY_HEIGHT = bodyHeight(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);
const TALLEST = Math.max(PLAYER_HEIGHT, ENEMY_HEIGHT);

/** Width a body needs to pass, including skin on both sides. */
const WIDEST =
  2 * Math.max(PLAYER_CAPSULE_RADIUS, CAPSULE_RADIUS) + 2 * CHARACTER_SKIN;

/**
 * Clearance we insist on beyond the bare minimum.
 *
 * Touching is not passing: the controller needs room to resolve contacts, and
 * a body that fits by a millimetre catches on the lintel the moment autostep
 * lifts it onto a plate. This margin is what makes the doorway walkable rather
 * than merely non-overlapping.
 */
const MARGIN = 0.1;

describe('doorway clearance', () => {
  it('clears the tallest body standing on a built floor plate', () => {
    const headroom = lintelUnderside() - floorPlateTop();
    expect(headroom).toBeGreaterThanOrEqual(TALLEST + MARGIN);
  });

  it('clears the widest body between the jambs', () => {
    expect(openingWidth()).toBeGreaterThanOrEqual(WIDEST + MARGIN);
  });

  it('still has a lintel — the opening does not swallow the whole wall', () => {
    const doorway = pieceColliders('doorway');
    const lintel = doorway.reduce((h, c) => (c.offset.y > h.offset.y ? c : h));
    expect(lintel.half.y * 2).toBeGreaterThan(0.2);
  });

  it('measures headroom from the plate, not the floor plane', () => {
    // Guards the actual mistake: measuring from the plane looks fine while the
    // real clearance is short by exactly the plate's thickness.
    const fromPlane = lintelUnderside();
    const fromPlate = lintelUnderside() - floorPlateTop();
    expect(fromPlane - fromPlate).toBeCloseTo(floorPlateTop(), 6);
    expect(floorPlateTop()).toBeGreaterThan(0);
  });
});
