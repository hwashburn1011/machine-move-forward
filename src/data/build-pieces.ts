/**
 * Build piece definitions (handoff section 10).
 *
 * Data only. Keeping stats out of the placement and rendering code is what
 * lets later milestones add rarity, crafted variants, and damage states
 * without touching the systems that consume them.
 */

export type PieceId =
  | 'floor'
  | 'wall'
  | 'doorway'
  | 'railing'
  | 'roof'
  | 'stairs'
  | 'crate'
  | 'workbench'
  | 'refinery';

/** How a piece attaches to the grid. */
export type PieceAnchor =
  /** Fills one cell. */
  | 'cell'
  /** Sits on the boundary between two cells. */
  | 'edge'
  /** Occupies two cells: a base and a run. */
  | 'double-cell';

import type { ItemCost } from './items';

export interface BuildPieceDefinition {
  id: PieceId;
  name: string;
  anchor: PieceAnchor;
  /** Materials to place. Handoff section 10's `cost: ResourceCost[]`. */
  cost: ItemCost;
  /** Kilograms added to the machine. */
  weight: number;
  maxHealth: number;
  armor: number;
  /**
   * Whether this piece forms a room boundary. Railings are deliberately false:
   * a railed open deck should not become an interior space just because it has
   * a perimeter.
   */
  boundsRoom: boolean;
  /**
   * Whether this piece stops an enemy walking across the edge it sits on.
   *
   * Deliberately NOT the same field as `boundsRoom`, and they disagree. A
   * railing is not room-bounding — a railed platform is fenced, not enclosed —
   * but its collider is a 2m x 1.1m box against a 0.45m autostep, so a body
   * cannot cross it. This field tracks what `pieceColliders` actually builds;
   * `boundsRoom` tracks what the room model means. Reusing one for the other
   * routes enemies into barriers they cannot pass and wedges them there.
   */
  blocksNavigation: boolean;
  rotatable: boolean;
}

export const BUILD_PIECES: Record<PieceId, BuildPieceDefinition> = {
  floor: {
    id: 'floor',
    name: 'Deck Plate',
    anchor: 'cell',
    cost: { scrap: 8 },
    weight: 120,
    maxHealth: 120,
    armor: 2,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  wall: {
    id: 'wall',
    name: 'Hull Wall',
    anchor: 'edge',
    cost: { scrap: 12 },
    weight: 90,
    maxHealth: 150,
    armor: 2,
    boundsRoom: true,
    blocksNavigation: true,
    rotatable: false,
  },
  doorway: {
    id: 'doorway',
    name: 'Doorway',
    anchor: 'edge',
    cost: { scrap: 20 },
    weight: 110,
    maxHealth: 150,
    armor: 2,
    boundsRoom: true,
    blocksNavigation: false,
    rotatable: false,
  },
  railing: {
    id: 'railing',
    name: 'Railing',
    anchor: 'edge',
    cost: { scrap: 5 },
    weight: 25,
    maxHealth: 60,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: true,
    rotatable: false,
  },
  roof: {
    id: 'roof',
    name: 'Roof Panel',
    anchor: 'cell',
    cost: { scrap: 10 },
    weight: 80,
    maxHealth: 120,
    armor: 2,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  stairs: {
    id: 'stairs',
    name: 'Stairs',
    anchor: 'double-cell',
    cost: { scrap: 18 },
    weight: 160,
    maxHealth: 140,
    armor: 2,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: true,
  },
  crate: {
    id: 'crate',
    name: 'Storage Crate',
    anchor: 'cell',
    cost: { scrap: 15, components: 2 },
    weight: 140,
    maxHealth: 110,
    armor: 1,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  workbench: {
    id: 'workbench',
    name: 'Workbench',
    anchor: 'cell',
    cost: { scrap: 30, components: 4 },
    weight: 220,
    maxHealth: 130,
    armor: 1,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    anchor: 'cell',
    // Scrap alone, and deliberately: it is the only source of components, so
    // pricing it in components would make it unbuildable from a fresh start.
    // 80 is the old 45 plus the 8 components at their refining cost, rounded.
    cost: { scrap: 80 },
    weight: 380,
    maxHealth: 160,
    armor: 2,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
};

/** Pieces that sit on a floor and are interacted with rather than walked on. */
export const STATION_PIECES: readonly PieceId[] = ['crate', 'workbench', 'refinery'];

export function isStation(piece: PieceId): boolean {
  return STATION_PIECES.includes(piece);
}

/** Selection order for the number keys and the build HUD row. */
export const BUILD_PIECE_ORDER: readonly PieceId[] = [
  'floor',
  'wall',
  'doorway',
  'railing',
  'roof',
  'stairs',
  'crate',
  'workbench',
  'refinery',
];

/** Fraction of the original cost returned when demolishing. */
export const REFUND_FRACTION = 0.6;

/** Slots in a built storage crate. */
export const CRATE_SLOTS = 12;

/**
 * Does a piece on an edge stop an enemy crossing it?
 *
 * Takes `undefined` so callers can pass `grid.getEdge(...)` straight in — an
 * empty edge is the common case and should not need a guard at every call
 * site.
 */
export function blocksNavigation(piece: PieceId | undefined): boolean {
  return piece !== undefined && BUILD_PIECES[piece].blocksNavigation;
}
