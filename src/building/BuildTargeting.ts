import * as THREE from 'three';
import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { GRID_LEVELS, GRID_MIN_LEVEL, LEVEL_HEIGHT, DECK_HEIGHT } from '@/game/constants';
import {
  canonicalEdge,
  cellCenter,
  edgeCenter,
  worldToCell,
  type BuildGrid,
  type Cell,
  type Side,
} from './BuildGrid';
import type { Placement } from './BuildValidation';
import { stairsCells } from './BuildValidation';

export const BUILD_MAX_REACH = 12;
export type BuildLevelMode = 'auto' | 'manual';
export type TargetRejection =
  'out-of-reach' | 'no-plane-intersection' | 'parallel-ray' | 'blocked-los' | 'invalid-target';
export const TARGET_REJECTION_TEXT: Record<TargetRejection, string> = {
  'out-of-reach': 'Target is out of reach',
  'no-plane-intersection': 'Aim toward the selected deck',
  'parallel-ray': 'Aim toward a deck or compatible wall',
  'blocked-los': 'Something blocks the target',
  'invalid-target': 'No valid build target',
};
export interface BuildSupportHit {
  id: string;
  point: THREE.Vector3;
  normal?: THREE.Vector3;
  compatible?: boolean;
}
export interface BuildRaycastHit {
  id?: string;
  point: THREE.Vector3;
  distance?: number;
}
export interface BuildTargetInput {
  viewOrigin: THREE.Vector3;
  viewDirection: THREE.Vector3;
  chestWorld: THREE.Vector3;
  machineTransform?: THREE.Matrix4;
  piece: PieceId;
  rotation: number;
  grid?: BuildGrid<PieceId>;
  levelMode?: BuildLevelMode;
  manualLevel?: number;
  autoLevel?: number;
  ignoreIds?: ReadonlySet<string>;
  supportHits?: readonly BuildSupportHit[];
  supportRaycast?: (
    start: THREE.Vector3,
    end: THREE.Vector3,
    ignoreIds?: ReadonlySet<string>,
  ) => readonly BuildSupportHit[];
  /** Runtime physics query. It must return only hits between start and end. */
  raycast?: (
    start: THREE.Vector3,
    end: THREE.Vector3,
    ignoreIds?: ReadonlySet<string>,
  ) => readonly BuildRaycastHit[];
  los?: (
    start: THREE.Vector3,
    end: THREE.Vector3,
    tolerance: number,
    ignoreIds?: ReadonlySet<string>,
  ) => boolean;
  cameraLos?: (
    start: THREE.Vector3,
    end: THREE.Vector3,
    tolerance: number,
    ignoreIds?: ReadonlySet<string>,
  ) => boolean;
  /** Resolve the oriented snapped footprint to its real support surface. */
  resolveEndpoint?: (
    placement: Placement,
    snappedLocal: THREE.Vector3,
  ) => { pointLocal: THREE.Vector3; supportId?: string } | null;
}
export interface BuildTargetResult {
  placement: Placement | null;
  pointLocal: THREE.Vector3 | null;
  pointWorld: THREE.Vector3 | null;
  level: number;
  distance: number;
  rejection?: TargetRejection;
}

export function levelInEnvelope(level: number): boolean {
  return Number.isInteger(level) && level >= GRID_MIN_LEVEL && level < GRID_LEVELS;
}

export function intersectDeckPlane(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  level: number,
  machineTransform = new THREE.Matrix4(),
): THREE.Vector3 | null {
  if (!levelInEnvelope(level)) return null;
  const inverse = machineTransform.clone().invert();
  const o = origin.clone().applyMatrix4(inverse),
    d = direction.clone().transformDirection(inverse);
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (DECK_HEIGHT + level * LEVEL_HEIGHT - o.y) / d.y;
  if (t < 0) return null;
  return o.addScaledVector(d, t);
}

export function evaluateLineOfSight(
  start: THREE.Vector3,
  end: THREE.Vector3,
  blocked: readonly { point: THREE.Vector3; id?: string }[] = [],
  terminalSupportId?: string,
  ignoreIds: ReadonlySet<string> = new Set(),
  tolerance = 0.02,
): boolean {
  const length = start.distanceTo(end);
  if (!Number.isFinite(length) || length <= 1e-8) return false;
  for (const hit of blocked) {
    if (hit.id && ignoreIds.has(hit.id)) continue;
    const along =
      hit.point.clone().sub(start).dot(end.clone().sub(start)) / Math.max(length * length, 1e-9);
    if (along < 0 || along > 1) continue;
    const closest = start.clone().lerp(end, along);
    if (closest.distanceTo(hit.point) <= tolerance) {
      const terminal = along >= 1 - tolerance / length && hit.id === terminalSupportId;
      if (!terminal) return false;
    }
  }
  return true;
}

export function resolveBuildTarget(input: BuildTargetInput): BuildTargetResult {
  const level =
    input.levelMode === 'manual' ? (input.manualLevel ?? 0) : (input.autoLevel ?? GRID_MIN_LEVEL);
  const inverse = (input.machineTransform ?? new THREE.Matrix4()).clone().invert();
  const localDirection = input.viewDirection.clone().transformDirection(inverse);
  const def = BUILD_PIECES[input.piece];
  const support = (
    input.supportRaycast?.(
      input.viewOrigin,
      worldPointFor(input.viewOrigin, input.viewDirection),
      input.ignoreIds,
    ) ?? input.supportHits
  )?.find((hit) => hit.compatible !== false);
  const local =
    defAnchorIsEdge(input.piece) && support
      ? support.point.clone().applyMatrix4(inverse)
      : intersectDeckPlane(input.viewOrigin, input.viewDirection, level, input.machineTransform);
  if (!local)
    return {
      placement: null,
      pointLocal: null,
      pointWorld: null,
      level,
      distance: Infinity,
      rejection: Math.abs(localDirection.y) < 1e-6 ? 'parallel-ray' : 'no-plane-intersection',
    };
  // Fixtures and edge pieces may target a compatible wall/rail hit rather
  // than the deck plane. The support query remains owned by runtime physics.
  const cell = worldToCell(local.x, local.z, level);
  const side = nearestSide(local, cell);
  const placement: Placement =
    def.anchor === 'edge'
      ? { piece: input.piece, cell, edge: canonicalEdge(cell, side), rotation: input.rotation }
      : { piece: input.piece, cell, rotation: input.rotation };
  // The footprint centre is authoritative for range and LOS, never the raw
  // plane intersection (which can be on the edge of a neighbouring cell).
  const snapped = fallbackEndpoint(placement);
  const endpoint = input.resolveEndpoint?.(placement, snapped.clone());
  const finalLocal = endpoint?.pointLocal.clone() ?? snapped;
  const finalWorld = finalLocal.clone().applyMatrix4(input.machineTransform ?? new THREE.Matrix4());
  const distance = input.chestWorld.distanceTo(finalWorld);
  if (distance > BUILD_MAX_REACH)
    return {
      placement,
      pointLocal: finalLocal,
      pointWorld: finalWorld,
      level,
      distance,
      rejection: 'out-of-reach',
    };
  const terminalSupportId = endpoint?.supportId ?? support?.id;
  if (input.raycast) {
    const hits = input.raycast(input.chestWorld, finalWorld, input.ignoreIds);
    if (
      !evaluateLineOfSight(input.chestWorld, finalWorld, hits, terminalSupportId, input.ignoreIds)
    )
      return {
        placement,
        pointLocal: finalLocal,
        pointWorld: finalWorld,
        level,
        distance,
        rejection: 'blocked-los',
      };
    const cameraHits = input.raycast(input.viewOrigin, finalWorld, input.ignoreIds);
    if (
      !evaluateLineOfSight(
        input.viewOrigin,
        finalWorld,
        cameraHits,
        terminalSupportId,
        input.ignoreIds,
      )
    )
      return {
        placement,
        pointLocal: finalLocal,
        pointWorld: finalWorld,
        level,
        distance,
        rejection: 'blocked-los',
      };
  } else if (
    (input.los && !input.los(input.chestWorld, finalWorld, 0.02, input.ignoreIds)) ||
    (input.cameraLos && !input.cameraLos(input.viewOrigin, finalWorld, 0.02, input.ignoreIds))
  ) {
    return {
      placement,
      pointLocal: finalLocal,
      pointWorld: finalWorld,
      level,
      distance,
      rejection: 'blocked-los',
    };
  }
  return { placement, pointLocal: finalLocal, pointWorld: finalWorld, level, distance };
}

function defAnchorIsEdge(piece: PieceId): boolean {
  return BUILD_PIECES[piece].anchor === 'edge';
}

function worldPointFor(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 {
  // Origin/direction are already world-space; transform is used only for the
  // deck-plane calculation and must not be applied twice to this query.
  return origin.clone().addScaledVector(direction.clone().normalize(), BUILD_MAX_REACH);
}

/** Hysteretic auto deck selection: retain the current deck inside this band. */
export function selectAutoLevel(height: number, currentLevel: number, hysteresis = 0.3): number {
  const raw = Math.round((height - DECK_HEIGHT) / LEVEL_HEIGHT);
  if (!levelInEnvelope(raw))
    return Math.max(GRID_MIN_LEVEL, Math.min(GRID_LEVELS - 1, currentLevel));
  const boundary = DECK_HEIGHT + (currentLevel + (raw > currentLevel ? 0.5 : -0.5)) * LEVEL_HEIGHT;
  if (Math.abs(height - boundary) <= hysteresis)
    return Math.max(GRID_MIN_LEVEL, Math.min(GRID_LEVELS - 1, currentLevel));
  return raw;
}

function fallbackEndpoint(placement: Placement): THREE.Vector3 {
  if (placement.edge) {
    const point = edgeCenter(placement.edge);
    return new THREE.Vector3(point.x, point.y, point.z);
  }
  if (placement.piece === 'stairs') {
    const { base, run } = stairsCells(placement.cell, placement.rotation);
    const a = cellCenter(base),
      b = cellCenter(run);
    return new THREE.Vector3((a.x + b.x) / 2, a.y, (a.z + b.z) / 2);
  }
  const point = cellCenter(placement.cell);
  return new THREE.Vector3(point.x, point.y, point.z);
}

function nearestSide(point: THREE.Vector3, cell: Cell): Side {
  const center = cellCenter(cell),
    dx = point.x - center.x,
    dz = point.z - center.z;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
}
