/**
 * Item definitions (handoff section 23).
 *
 * Data only. Glyphs are single characters rather than icons because the
 * project ships no image files.
 */

export type ItemId =
  | 'scrap'
  | 'components'
  | 'fuel'
  | 'ammo-rifle'
  | 'ammo-shotgun'
  | 'repair-kit'
  | 'extended-mag';

export type ItemCategory = 'resource' | 'ammo' | 'consumable' | 'mod';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: ItemCategory;
  stackSize: number;
  /** Kilograms per unit. */
  weight: number;
  glyph: string;
  description: string;
}

export interface ItemStack {
  itemId: ItemId;
  count: number;
}

/** A quantity of assorted items — a build cost, a recipe input. */
export type ItemCost = Partial<Record<ItemId, number>>;

export const ITEMS: Record<ItemId, ItemDefinition> = {
  scrap: {
    id: 'scrap',
    name: 'Scrap Metal',
    category: 'resource',
    stackSize: 100,
    weight: 1.0,
    glyph: '▪',
    description: 'Torn plate and rebar. The wasteland runs on it.',
  },
  components: {
    id: 'components',
    name: 'Components',
    category: 'resource',
    stackSize: 50,
    weight: 2.0,
    glyph: '⬡',
    description: 'Salvaged mechanisms. Refined from scrap.',
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel',
    category: 'resource',
    stackSize: 50,
    weight: 1.5,
    glyph: '◆',
    description: 'Heavy distillate. Feed it to the generator to keep the lights on.',
  },
  'ammo-rifle': {
    id: 'ammo-rifle',
    name: 'Rifle Rounds',
    category: 'ammo',
    stackSize: 300,
    weight: 0.02,
    glyph: '▮',
    description: 'Standard rifle ammunition.',
  },
  'ammo-shotgun': {
    id: 'ammo-shotgun',
    name: 'Shotgun Shells',
    category: 'ammo',
    stackSize: 120,
    weight: 0.05,
    glyph: '▰',
    description: 'Buckshot. Effective up close.',
  },
  'repair-kit': {
    id: 'repair-kit',
    name: 'Repair Kit',
    category: 'consumable',
    stackSize: 5,
    weight: 1.0,
    glyph: '✚',
    description: 'Patches you up for 40 health.',
  },
  'extended-mag': {
    id: 'extended-mag',
    name: 'Extended Magazine',
    category: 'mod',
    stackSize: 1,
    weight: 0.5,
    glyph: '⌸',
    description: 'Raises the fitted weapon magazine by 50%.',
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Slots in the player's own inventory. */
export const PLAYER_INVENTORY_SLOTS = 20;

/**
 * What a new game starts with.
 *
 * Scrap alone. The refinery is the only source of components and is priced in
 * scrap for exactly that reason, so the first thing a player builds is the
 * thing that unlocks everything else.
 */
export const STARTING_INVENTORY: ItemCost = { scrap: 400 };

/** Compact cost label for the build row: "15▪ 2⬡". */
export function formatCostGlyphs(cost: ItemCost): string {
  return (Object.entries(cost) as [ItemId, number][])
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${n}${ITEMS[id].glyph}`)
    .join(' ');
}

/** Ammo item for a weapon's ammo type, so crafted rounds reach the right gun. */
export const AMMO_FOR_WEAPON: Record<string, ItemId> = {
  rifle: 'ammo-rifle',
  shotgun: 'ammo-shotgun',
};
