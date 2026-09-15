/** Minimal vector shape so restore placement remains independent of Three. */
export interface RestorePoint {
  x: number;
  y: number;
  z: number;
}

export interface RestorePlacementOptions {
  position: RestorePoint;
  /** Immediate capsule query against the current physics world. */
  capsuleFits: (point: RestorePoint) => boolean;
  /** Must perform a downward support query, including deck/terrain validity. */
  hasDownwardSupport: (point: RestorePoint) => boolean;
  /** Optional final gate for deck bounds, holes, and build obstacles. */
  isAllowed?: (point: RestorePoint) => boolean;
  /** Horizontal search radius; bounded to keep malformed saves harmless. */
  maxHorizontalDistance?: number;
  /** Candidate spacing. Smaller values improve fit at bounded query cost. */
  step?: number;
}

const EPSILON = 1e-6;

function finitePoint(point: RestorePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function allowed(options: RestorePlacementOptions, point: RestorePoint): boolean {
  return finitePoint(point) && (options.isAllowed?.(point) ?? true);
}

/**
 * Preserve a valid saved pose, otherwise find the nearest valid point on the
 * same deck in a deterministic bounded horizontal spiral.
 */
export function resolveRestorePlacement(options: RestorePlacementOptions): RestorePoint | null {
  const { position } = options;
  if (!finitePoint(position)) return null;
  // A saved pose that is clear is authoritative even if it is airborne.
  if (allowed(options, position) && options.capsuleFits(position))
    return { x: position.x, y: position.y, z: position.z };

  const maxDistance = Number.isFinite(options.maxHorizontalDistance)
    ? Math.max(0, Math.min(2, options.maxHorizontalDistance!))
    : 2;
  const step = Number.isFinite(options.step) ? Math.max(0.1, Math.min(0.5, options.step!)) : 0.25;
  const rings = Math.floor(maxDistance / step + EPSILON);
  const candidates: RestorePoint[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    for (let ix = -ring; ix <= ring; ix++) {
      for (let iz = -ring; iz <= ring; iz++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        if (Math.hypot(ix * step, iz * step) > maxDistance + EPSILON) continue;
        candidates.push({ x: position.x + ix * step, y: position.y, z: position.z + iz * step });
      }
    }
  }
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x - position.x, a.z - position.z);
    const db = Math.hypot(b.x - position.x, b.z - position.z);
    return da - db || a.x - b.x || a.z - b.z;
  });
  for (const candidate of candidates)
    if (
      allowed(options, candidate) &&
      options.capsuleFits(candidate) &&
      options.hasDownwardSupport(candidate)
    )
      return candidate;
  return null;
}
