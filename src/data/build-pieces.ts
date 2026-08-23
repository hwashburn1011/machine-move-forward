/**
 * Build piece definitions (handoff section 10).
 *
 * Data only. Keeping stats out of the placement and rendering code is what
 * lets later milestones add rarity, crafted variants, and damage states
 * without touching the systems that consume them.
 */

export type PieceId = 'floor' | 'wall' | 'doorway' | 'railing' | 'roof' | 'stairs';

/** How a piece attaches to the grid. */
export type PieceAnchor =
  /** Fills one cell. */
  | 'cell'
  /** Sits on the boundary between two cells. */
  | 'edge'
  /** Occupies two cells: a base and a run. */
  | 'double-cell';

export interface BuildPieceDefinition {
  id: PieceId;
  name: string;
  anchor: PieceAnchor;
  /** Scrap to place. */
  cost: number;
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
  rotatable: boolean;
}

export const BUILD_PIECES: Record<PieceId, BuildPieceDefinition> = {
  floor: {
    id: 'floor',
    name: 'Deck Plate',
    anchor: 'cell',
    cost: 8,
    weight: 120,
    maxHealth: 120,
    armor: 2,
    boundsRoom: false,
    rotatable: false,
  },
  wall: {
    id: 'wall',
    name: 'Hull Wall',
    anchor: 'edge',
    cost: 12,
    weight: 90,
    maxHealth: 150,
    armor: 2,
    boundsRoom: true,
    rotatable: false,
  },
  doorway: {
    id: 'doorway',
    name: 'Doorway',
    anchor: 'edge',
    cost: 20,
    weight: 110,
    maxHealth: 150,
    armor: 2,
    boundsRoom: true,
    rotatable: false,
  },
  railing: {
    id: 'railing',
    name: 'Railing',
    anchor: 'edge',
    cost: 5,
    weight: 25,
    maxHealth: 60,
    armor: 0,
    boundsRoom: false,
    rotatable: false,
  },
  roof: {
    id: 'roof',
    name: 'Roof Panel',
    anchor: 'cell',
    cost: 10,
    weight: 80,
    maxHealth: 120,
    armor: 2,
    boundsRoom: false,
    rotatable: false,
  },
  stairs: {
    id: 'stairs',
    name: 'Stairs',
    anchor: 'double-cell',
    cost: 18,
    weight: 160,
    maxHealth: 140,
    armor: 2,
    boundsRoom: false,
    rotatable: true,
  },
};

/** Selection order for the 1-6 keys and the build HUD row. */
export const BUILD_PIECE_ORDER: readonly PieceId[] = [
  'floor',
  'wall',
  'doorway',
  'railing',
  'roof',
  'stairs',
];

/** Fraction of the original cost returned when demolishing. */
export const REFUND_FRACTION = 0.6;

export const STARTING_SCRAP = 400;
