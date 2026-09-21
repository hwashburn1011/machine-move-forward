import {
  DESERT_FLOOR_Y,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '@/game/constants';

/** A small vector shape shared with the physics and player seams. */
export interface BoundaryPoint {
  x: number;
  y: number;
  z: number;
}

/** The moving root to which a safe point is local. */
export type SafeSpace = 'machine' | 'destination' | 'rooftop';

export interface SafeSupport {
  space: SafeSpace;
  /** Machine/destination identity. Rooftops use the opening instance. */
  rootId?: string;
  local: BoundaryPoint;
}

export interface SafeAnchor extends SafeSupport {
  /** World pose at the time the support was observed, useful for diagnostics. */
  world: BoundaryPoint;
}

export interface GroundBoundarySample {
  center: BoundaryPoint;
  /** Feet height from the capsule bottom, in world coordinates. */
  feetY?: number;
  supported: boolean;
  support?: SafeSupport;
  /** True only while the opening director is in its rooftop phase. */
  openingRooftop: boolean;
}

export type BoundaryResult =
  | { kind: 'safe'; anchor: SafeAnchor }
  | { kind: 'waiting'; reason: 'falling' | 'unsupported-above-boundary' }
  | { kind: 'recover'; reason: 'radioactive-ground' | 'invalid-support'; anchor: SafeAnchor }
  | { kind: 'blocked'; reason: 'no-safe-anchor' };

/**
 * The controller deliberately fires before a capsule can touch the rendered
 * sand. Physics remains responsible for deciding whether a surface is valid;
 * this value is only the precontact safety edge.
 */
export const RADIOACTIVE_PRECONTACT_MARGIN_M = 0.25;
export const RADIOACTIVE_BOUNDARY_FEET_Y = DESERT_FLOOR_Y + RADIOACTIVE_PRECONTACT_MARGIN_M;

const EPSILON = 1e-6;

function finitePoint(p: BoundaryPoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function copyPoint(p: BoundaryPoint): BoundaryPoint {
  return { x: p.x, y: p.y, z: p.z };
}

function copyAnchor(anchor: SafeAnchor): SafeAnchor {
  return {
    space: anchor.space,
    ...(anchor.rootId === undefined ? {} : { rootId: anchor.rootId }),
    local: copyPoint(anchor.local),
    world: copyPoint(anchor.world),
  };
}

/**
 * Keeps the last support that can actually carry the player. The controller
 * stores local coordinates so a moving machine or destination can be moved by
 * the runtime without leaving a stale world-space respawn point behind.
 */
export class RadioactiveGroundBoundary {
  private machineAnchor: SafeAnchor | null = null;
  private destinationAnchor: SafeAnchor | null = null;
  private rooftopAnchor: SafeAnchor | null = null;
  private machineObservedAt = 0;
  private destinationObservedAt = 0;
  private rooftopObservedAt = 0;
  private observation = 0;

  get lastSafeAnchor(): SafeAnchor | null {
    const anchor = [
      { anchor: this.machineAnchor, observedAt: this.machineObservedAt },
      { anchor: this.destinationAnchor, observedAt: this.destinationObservedAt },
      { anchor: this.rooftopAnchor, observedAt: this.rooftopObservedAt },
    ].reduce<{ anchor: SafeAnchor | null; observedAt: number }>(
      (latest, candidate) =>
        candidate.anchor && candidate.observedAt > latest.observedAt ? candidate : latest,
      { anchor: null, observedAt: 0 },
    ).anchor;
    return anchor ? copyAnchor(anchor) : null;
  }

  /** The opening is over; a rooftop point must never become a general respawn. */
  clearRooftopAnchor(): void {
    this.rooftopAnchor = null;
    this.rooftopObservedAt = 0;
  }

  /** Drop a departed site anchor so recovery cannot target a disabled root. */
  clearDestinationAnchor(rootId?: string): void {
    if (!rootId || this.destinationAnchor?.rootId === rootId) {
      this.destinationAnchor = null;
      this.destinationObservedAt = 0;
    }
  }

  clear(): void {
    this.machineAnchor = null;
    this.destinationAnchor = null;
    this.rooftopAnchor = null;
    this.machineObservedAt = 0;
    this.destinationObservedAt = 0;
    this.rooftopObservedAt = 0;
    this.observation = 0;
  }

  /** Record a support only after the physics layer has confirmed it. */
  recordSafe(sample: GroundBoundarySample): SafeAnchor | null {
    const support = sample.support;
    if (!sample.supported || !support || !finitePoint(sample.center) || !finitePoint(support.local))
      return null;
    if (support.space === 'rooftop' && !sample.openingRooftop) return null;
    const feetY = this.feetY(sample);
    if (!Number.isFinite(feetY) || feetY <= RADIOACTIVE_BOUNDARY_FEET_Y + EPSILON) return null;
    const anchor: SafeAnchor = {
      ...support,
      local: copyPoint(support.local),
      world: copyPoint(sample.center),
    };
    const observedAt = ++this.observation;
    if (support.space === 'rooftop') {
      this.rooftopAnchor = anchor;
      this.rooftopObservedAt = observedAt;
    } else if (support.space === 'destination') {
      this.destinationAnchor = anchor;
      this.destinationObservedAt = observedAt;
    } else {
      this.machineAnchor = anchor;
      this.machineObservedAt = observedAt;
    }
    return copyAnchor(anchor);
  }

  observe(sample: GroundBoundarySample): BoundaryResult {
    if (sample.openingRooftop === false) this.rooftopAnchor = null;
    const feetY = this.feetY(sample);
    const unsafeHeight = !Number.isFinite(feetY) || feetY <= RADIOACTIVE_BOUNDARY_FEET_Y;
    const supportIsAllowed =
      sample.supported &&
      !!sample.support &&
      (sample.support.space !== 'rooftop' || sample.openingRooftop);

    if (supportIsAllowed && this.recordSafe(sample))
      return { kind: 'safe', anchor: this.lastSafeAnchor! };

    if (!unsafeHeight)
      return {
        kind: 'waiting',
        reason: sample.supported ? 'unsupported-above-boundary' : 'falling',
      };

    const anchor = this.lastSafeAnchor;
    if (!anchor) return { kind: 'blocked', reason: 'no-safe-anchor' };
    return {
      kind: 'recover',
      reason: sample.supported ? 'invalid-support' : 'radioactive-ground',
      anchor,
    };
  }

  private feetY(sample: GroundBoundarySample): number {
    return sample.feetY ?? sample.center.y - PLAYER_CAPSULE_HALF_HEIGHT - PLAYER_CAPSULE_RADIUS;
  }
}
