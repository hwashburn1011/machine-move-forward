import * as THREE from 'three';
import { cellKey, type Cell } from '@/building/BuildGrid';
import type { FixedLink } from '@/enemies/NavGraph';
import { DECK_SURFACE_Y, LEVEL_HEIGHT } from '@/game/constants';

export type CaretakerWaypoint = THREE.Vector3 & {
  portalId?: string;
  portalExit?: boolean;
  precise?: boolean;
};
export interface CaretakerPortal {
  readonly from: Cell;
  readonly to: Cell;
  readonly samples: readonly CaretakerWaypoint[];
}
export function cloneCaretakerWaypoint(point: THREE.Vector3): CaretakerWaypoint {
  const source = point as CaretakerWaypoint;
  const result: CaretakerWaypoint = point.clone();
  if (source.portalId) result.portalId = source.portalId;
  if (source.portalExit) result.portalExit = true;
  if (source.precise) result.precise = true;
  return result;
}

/** Measured Nomad passages only; arbitrary vertical graph links are not ramps. */
export function caretakerPortalFor(
  link: FixedLink,
  from: Cell,
  to: Cell,
  localToWorld: (point: THREE.Vector3) => THREE.Vector3,
): CaretakerPortal | null {
  const low = link[0].y < link[1].y ? link[0] : link[1];
  const high = low === link[0] ? link[1] : link[0];
  const ascending = cellKey(from) === cellKey(low) && cellKey(to) === cellKey(high);
  const descending = cellKey(from) === cellKey(high) && cellKey(to) === cellKey(low);
  if (
    (!ascending && !descending) ||
    low.x !== -1 ||
    high.x !== -1 ||
    low.z !== -2 ||
    high.z !== 2 ||
    high.y !== low.y + 1 ||
    (low.y !== -2 && low.y !== -1)
  )
    return null;
  const y = DECK_SURFACE_Y + low.y * LEVEL_HEIGHT;
  // The -4m landing cell centre grazes an authored workstation's clearance
  // margin. These 3.4m landing points stay in the same cells and clear its lip.
  const samples = [
    new THREE.Vector3(-2, y, -3.4),
    new THREE.Vector3(-2, y, -2),
    new THREE.Vector3(-2, y + 0.75, -1),
    new THREE.Vector3(-2, y + 1.5, 0),
    new THREE.Vector3(-2, y + 2.25, 1),
    new THREE.Vector3(-2, y + 3, 2),
    new THREE.Vector3(-2, y + 3, 3.4),
  ];
  if (descending) samples.reverse();
  const id = `nomad:${low.y}:${ascending ? 'up' : 'down'}`;
  return {
    from: { ...from },
    to: { ...to },
    samples: samples.map((point, index) => {
      const world: CaretakerWaypoint = localToWorld(point);
      world.portalId = id;
      if (index === samples.length - 1) world.portalExit = true;
      return world;
    }),
  };
}
