import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BuildCombatGuard } from '@/building/BuildCombatGuard';
import { BuildSession } from '@/building/BuildSession';
import {
  BUILD_MAX_REACH,
  evaluateLineOfSight,
  resolveBuildTarget,
  selectAutoLevel,
} from '@/building/BuildTargeting';
import { edgeCenter } from '@/building/BuildGrid';
import { BuildPreview } from '@/building/BuildPreview';
import type { BuildSystem } from '@/building/BuildSystem';
import { DECK_HEIGHT } from '@/game/constants';

describe('building polish targeting', () => {
  it('lets relocation supply validation and poses the ghost through the build group', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.set(7, 2, -3);
    scene.add(group);
    group.updateWorldMatrix(true, false);
    const system = {
      group,
      canPlace: () => ({ ok: true }),
      createPreviewVisual: () => null,
    } as unknown as BuildSystem;
    const preview = new BuildPreview(scene);
    let validated = false;
    preview.updateTargeted(
      {
        chestWorld: new THREE.Vector3(7, DECK_HEIGHT + 0.8, -3),
        viewOrigin: new THREE.Vector3(7, 20, -3),
        viewDirection: new THREE.Vector3(0, -1, 0),
        machineTransform: group.matrixWorld,
        piece: 'floor',
        rotation: 0,
        levelMode: 'manual',
        manualLevel: 0,
      },
      system,
      () => {
        validated = true;
        return { ok: false, reason: 'occupied' };
      },
    );
    expect(validated).toBe(true);
    expect(preview.validation).toEqual({ ok: false, reason: 'occupied' });
    expect(preview.mesh.position.x).toBeCloseTo(7);
    expect(preview.mesh.position.y).toBeCloseTo(DECK_HEIGHT + 2);
    preview.dispose();
  });
  it('uses chest reach and supports negative deck levels without a fallback target', () => {
    const chest = new THREE.Vector3(0, 1, 0);
    const result = resolveBuildTarget({
      chestWorld: chest,
      viewOrigin: new THREE.Vector3(0, 20, 0),
      viewDirection: new THREE.Vector3(0, -1, -1),
      piece: 'floor',
      rotation: 0,
      levelMode: 'manual',
      manualLevel: -2,
    });
    expect(result.level).toBe(-2);
    expect(result.placement).not.toBeNull();
    expect(BUILD_MAX_REACH).toBe(12);
    const parallel = resolveBuildTarget({
      chestWorld: chest,
      viewOrigin: new THREE.Vector3(),
      viewDirection: new THREE.Vector3(1, 0, 0),
      piece: 'floor',
      rotation: 0,
      manualLevel: 0,
    });
    expect(parallel.rejection).toBe('parallel-ray');
  });

  it('checks both views to the snapped footprint and only permits terminal support', () => {
    const start = new THREE.Vector3(0, 0, 0),
      end = new THREE.Vector3(1, 0, 0);
    expect(
      evaluateLineOfSight(start, end, [{ id: 'wall', point: new THREE.Vector3(0.5, 0, 0) }]),
    ).toBe(false);
    expect(
      evaluateLineOfSight(
        start,
        end,
        [
          { id: 'floor', point: end.clone() },
          { id: 'behind', point: new THREE.Vector3(1.2, 0, 0) },
        ],
        'floor',
      ),
    ).toBe(true);
    expect(selectAutoLevel(DECK_HEIGHT - 6, -2)).toBe(-2);
  });

  it('checks edge reach and LOS against the snapped edge center', () => {
    const seen: THREE.Vector3[] = [];
    const result = resolveBuildTarget({
      chestWorld: new THREE.Vector3(0, 14.74, 0),
      viewOrigin: new THREE.Vector3(0, 20, 0),
      viewDirection: new THREE.Vector3(1, -0.5, 0.2),
      piece: 'wall',
      rotation: 0,
      levelMode: 'manual',
      manualLevel: 0,
      raycast: (_start, end) => {
        seen.push(end.clone());
        return [];
      },
    });
    expect(result.placement?.edge).toBeDefined();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(result.pointWorld);
    const expected = edgeCenter(result.placement!.edge!);
    expect(result.pointLocal).toEqual(new THREE.Vector3(expected.x, expected.y, expected.z));
  });

  it('uses a compatible wall hit before requiring a deck-plane intersection', () => {
    const wall = new THREE.Vector3(4, 15.5, 0.2);
    const result = resolveBuildTarget({
      chestWorld: new THREE.Vector3(0, 15, 0),
      viewOrigin: new THREE.Vector3(0, 15.5, 0),
      viewDirection: new THREE.Vector3(1, 0, 0),
      piece: 'lamp',
      rotation: 0,
      levelMode: 'manual',
      manualLevel: 0,
      supportHits: [{ id: 'wall-1', point: wall }],
    });
    expect(result.rejection).toBeUndefined();
    expect(result.placement?.edge).toBeDefined();
  });

  it('uses the runtime endpoint height and support identity for both LOS checks', () => {
    const endpoints: THREE.Vector3[] = [];
    const result = resolveBuildTarget({
      chestWorld: new THREE.Vector3(0, 15, 0),
      viewOrigin: new THREE.Vector3(-2, 16, 0),
      viewDirection: new THREE.Vector3(1, -0.2, 0),
      piece: 'floor',
      rotation: 0,
      levelMode: 'manual',
      manualLevel: 0,
      resolveEndpoint: (_placement, snapped) => ({
        pointLocal: snapped.setY(14.83),
        supportId: 'deck-top',
      }),
      raycast: (_start, end) => {
        endpoints.push(end.clone());
        return [{ id: 'deck-top', point: end.clone() }];
      },
    });
    expect(result.rejection).toBeUndefined();
    expect(result.pointLocal?.y).toBeCloseTo(14.83);
    expect(endpoints).toHaveLength(2);
  });

  it('keeps the current negative deck only around its actual adjacent boundary', () => {
    const boundary = DECK_HEIGHT + -1.5 * 3.6;
    expect(selectAutoLevel(boundary - 0.29, -2)).toBe(-2);
    expect(selectAutoLevel(boundary + 0.29, -2)).toBe(-2);
    expect(selectAutoLevel(boundary + 0.31, -2)).toBe(-1);
  });

  it.each([4, 8, 11])('accepts a snapped floor target at roughly %im chest reach', (reach) => {
    const result = resolveBuildTarget({
      chestWorld: new THREE.Vector3(0, 14.83, 0),
      viewOrigin: new THREE.Vector3(-3, 18, 0),
      viewDirection: new THREE.Vector3(reach + 3, -3.26, 0).normalize(),
      piece: 'floor',
      rotation: 0,
      levelMode: 'manual',
      manualLevel: 0,
      resolveEndpoint: (_placement, snapped) => ({
        pointLocal: snapped.setY(14.83),
        supportId: 'floor',
      }),
      raycast: (_start, end) => [{ id: 'floor', point: end.clone() }],
    });
    expect(result.rejection).toBeUndefined();
    expect(result.distance).toBeLessThanOrEqual(BUILD_MAX_REACH);
  });
});

describe('build session and combat guard', () => {
  it('cancels every active session state on threat', () => {
    const session = new BuildSession();
    expect(session.enter('rifle')).toBe(true);
    expect(session.selectPiece('crate')).toBe(true);
    session.cancel('threat');
    expect(session.state).toBe('closed');
    expect(session.current.equippedWeaponId).toBeUndefined();
  });

  it('clears mutually exclusive selection ids on state changes', () => {
    const session = new BuildSession();
    session.enter('rifle');
    session.selectPiece('crate');
    session.beginRelocation('bp-1');
    expect(session.current.selectedPieceId).toBeUndefined();
    expect(session.current.selectedInstanceId).toBe('bp-1');
    expect(session.canAccept('place')).toBe(false);
    expect(session.canAccept('relocate')).toBe(true);
    session.openCatalog();
    expect(session.current.selectedInstanceId).toBeUndefined();
  });

  it('requires two simulated safe seconds after a live source clears', () => {
    const guard = new BuildCombatGuard();
    guard.update(0, { sources: ['projectile'] });
    expect(guard.canEnter()).toBe(false);
    guard.update(1.9, { sources: [] });
    expect(guard.canEnter()).toBe(false);
    guard.update(0.1, { sources: [] });
    expect(guard.canEnter()).toBe(true);
    guard.update(0, { sources: [], restoredEncounterActive: true });
    expect(guard.shouldInterrupt()).toBe(true);
  });
});
