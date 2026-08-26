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
  | 'refinery'
  | 'generator'
  | 'lamp'
  | 'stove'
  | 'condenser'
  | 'planter'
  | 'chair'
  | 'table'
  | 'rug'
  | 'shelf';

/**
 * What kind of thing a piece is, for grouping and for colliders.
 *
 * `structure` is the shell you walk on and through; `station` is a machine you
 * stand at; `decor` is furniture that is looked at and nothing else. Phase 5
 * adds `defense` to this union for the hardpoints and turrets, and the build
 * HUD's grouping is already category-driven by then.
 *
 * This is not decoration on the data. `decor` is the flag that says a piece
 * builds NO COLLIDER, which is the whole reason the category exists: the
 * standing constraint keeps collider-bearing pieces procedural because their
 * colliders derive from their geometry, and a piece with no collider is exempt
 * from it.
 */
export type PieceCategory = 'structure' | 'station' | 'decor';

/** Every category, in the order the build HUD pages through them. */
export const PIECE_CATEGORIES: readonly PieceCategory[] = ['structure', 'station', 'decor'];

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
  /** See `PieceCategory` — grouping in the build HUD, and colliders or not. */
  category: PieceCategory;
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
    category: 'structure',
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
    category: 'structure',
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
    category: 'structure',
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
    category: 'structure',
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
    category: 'structure',
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
    category: 'structure',
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
    category: 'station',
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
    category: 'station',
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
    category: 'station',
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
  generator: {
    id: 'generator',
    name: 'Generator',
    category: 'station',
    anchor: 'cell',
    // Components, unlike the refinery: by the time a player is building a
    // SECOND generator they have the refinery that makes them, and this is the
    // one machine on the deck that should feel like a real investment.
    cost: { scrap: 60, components: 6 },
    weight: 320,
    maxHealth: 170,
    armor: 2,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  lamp: {
    id: 'lamp',
    name: 'Deck Lamp',
    category: 'structure',
    anchor: 'edge',
    cost: { scrap: 6, components: 1 },
    weight: 8,
    maxHealth: 40,
    armor: 0,
    // Neither, and deliberately: a lamp hangs on a wall that is already both.
    // Claiming either would make a lit corridor read as two rooms, or wall off
    // a doorway with the light above it.
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  stove: {
    id: 'stove',
    name: 'Stove',
    category: 'station',
    anchor: 'cell',
    // The cheapest station on the deck after the crate, and deliberately: it
    // is the one a player builds because they want a kitchen rather than
    // because a system demands it.
    cost: { scrap: 25, components: 2 },
    weight: 180,
    maxHealth: 120,
    armor: 1,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  condenser: {
    id: 'condenser',
    name: 'Water Condenser',
    category: 'station',
    anchor: 'cell',
    // Components, like the generator: this is the piece that makes the power
    // system worth having beyond the lamps, and it should feel bought.
    cost: { scrap: 40, components: 5 },
    weight: 260,
    maxHealth: 130,
    armor: 1,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },
  planter: {
    id: 'planter',
    name: 'Planter Box',
    category: 'station',
    anchor: 'cell',
    // Scrap alone, and cheap. It needs no power and no components: it is the
    // first thing a player can build toward feeding themselves, and gating it
    // behind the refinery would put food behind fuel.
    cost: { scrap: 20 },
    weight: 150,
    maxHealth: 90,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: false,
  },

  // --- Decoration ---------------------------------------------------------
  // Four pieces that do nothing. No collider, no room boundary, no navigation
  // block, and a weight the machine cannot feel — so a player can furnish the
  // whole deck without paying for it in speed. They are rotatable because the
  // only thing a chair has to get right is which way it faces.
  chair: {
    id: 'chair',
    name: 'Chair',
    category: 'decor',
    anchor: 'cell',
    cost: { scrap: 4 },
    weight: 9,
    maxHealth: 30,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: true,
  },
  table: {
    id: 'table',
    name: 'Table',
    category: 'decor',
    anchor: 'cell',
    cost: { scrap: 6 },
    weight: 18,
    maxHealth: 40,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: true,
  },
  rug: {
    id: 'rug',
    name: 'Woven Rug',
    category: 'decor',
    anchor: 'cell',
    cost: { scrap: 3 },
    weight: 4,
    maxHealth: 20,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: true,
  },
  shelf: {
    id: 'shelf',
    name: 'Shelf',
    category: 'decor',
    anchor: 'cell',
    cost: { scrap: 5 },
    weight: 14,
    maxHealth: 35,
    armor: 0,
    boundsRoom: false,
    blocksNavigation: false,
    rotatable: true,
  },
};

/** Every piece in one category, in selection order. */
export function piecesInCategory(category: PieceCategory): PieceId[] {
  return BUILD_PIECE_ORDER.filter((id) => BUILD_PIECES[id].category === category);
}

/**
 * Pieces that sit on a floor and are interacted with rather than walked on.
 *
 * Derived from the category rather than listed twice: a station added to the
 * table and forgotten here would place into the wrong grid layer and be
 * demolished by whatever else happened to own its cell.
 */
export const STATION_PIECES: readonly PieceId[] = (
  Object.keys(BUILD_PIECES) as PieceId[]
).filter((id) => BUILD_PIECES[id].category === 'station');

export function isStation(piece: PieceId): boolean {
  return BUILD_PIECES[piece].category === 'station';
}

/**
 * Pieces that stand on a floor, are looked at, and do nothing else.
 *
 * Their own grid layer, for exactly the reason stations have one over floors:
 * a rug under a workbench is two things in one cell, and sharing a map would
 * mean placing one silently OVERWROTE the other's owner entry.
 */
export const DECOR_PIECES: readonly PieceId[] = (
  Object.keys(BUILD_PIECES) as PieceId[]
).filter((id) => BUILD_PIECES[id].category === 'decor');

export function isDecor(piece: PieceId): boolean {
  return BUILD_PIECES[piece].category === 'decor';
}

/**
 * Does this piece get a physics collider at all?
 *
 * The one question the decor category exists to answer, and it is asked in
 * exactly two places: `BuildSystem.createColliders`, which skips the whole
 * pass, and `pieceColliders`, which returns nothing. A chair the player can
 * trip over is a chair that has to be modelled to match its collider, and the
 * point of decoration is that it does not.
 */
export function buildsColliders(piece: PieceId): boolean {
  return BUILD_PIECES[piece].category !== 'decor';
}

/**
 * Pieces that hang ON an edge piece rather than filling the edge themselves.
 *
 * Their own grid layer, for exactly the reason stations have one over floors:
 * a lamp sharing the edge map with the wall it is mounted to would OVERWRITE
 * that wall, and demolishing the lamp afterwards would delete a wall still
 * standing in the scene.
 */
export const FIXTURE_PIECES: readonly PieceId[] = ['lamp'];

export function isFixture(piece: PieceId): boolean {
  return FIXTURE_PIECES.includes(piece);
}

/** What a fixture is allowed to hang on. A railing is a handrail, not a wall. */
export function canHoldFixture(piece: PieceId | undefined): boolean {
  return piece === 'wall' || piece === 'doorway';
}

/**
 * A placement the game makes on the player's behalf.
 *
 * Structurally a `Placement`, spelled out here rather than imported so this
 * file stays data-only and free of a cycle through `BuildValidation`.
 */
export interface StartingPiece {
  piece: PieceId;
  cell: { x: number; y: number; z: number };
  rotation: number;
}

/**
 * What a new game already has built (handoff section 49).
 *
 * The starting generator, on its own deck plate, on the starboard side abeam
 * of the engine — the one cell aft of the fuel tank that the machine's own
 * equipment leaves free. It is placed through the ORDINARY placement path, so
 * it saves, demolishes, refunds, and takes Phase 1 damage exactly like one the
 * player built. A player who scraps it has lights out until they build another,
 * which is a legible consequence rather than a bug.
 *
 * The plate comes first: a station needs a floor in its own cell, and the bare
 * hull deck is not one.
 */
export const STARTING_STRUCTURES: readonly StartingPiece[] = [
  { piece: 'floor', cell: { x: 2, y: 0, z: 3 }, rotation: 0 },
  { piece: 'generator', cell: { x: 2, y: 0, z: 3 }, rotation: 0 },
];

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
  'generator',
  'stove',
  'condenser',
  'planter',
  'lamp',
  'chair',
  'table',
  'rug',
  'shelf',
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
