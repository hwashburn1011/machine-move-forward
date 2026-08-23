import type { ItemCost, ItemId } from './items';

/**
 * Crafting recipes (spec section 9).
 *
 * Data only, and instant — no timers. A recipe names the station it belongs
 * to rather than the station listing its recipes, so adding a station later
 * does not mean editing every recipe that already exists.
 */

export type StationId = 'workbench' | 'refinery';

export interface Recipe {
  id: string;
  name: string;
  station: StationId;
  inputs: ItemCost;
  output: { itemId: ItemId; count: number };
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'refine-components',
    name: 'Refine Components',
    station: 'refinery',
    inputs: { scrap: 4 },
    output: { itemId: 'components', count: 1 },
  },
  {
    id: 'craft-rifle-ammo',
    name: 'Rifle Rounds',
    station: 'workbench',
    inputs: { scrap: 2, components: 1 },
    output: { itemId: 'ammo-rifle', count: 30 },
  },
  {
    id: 'craft-shotgun-ammo',
    name: 'Shotgun Shells',
    station: 'workbench',
    inputs: { scrap: 3 },
    output: { itemId: 'ammo-shotgun', count: 8 },
  },
  {
    id: 'craft-repair-kit',
    name: 'Repair Kit',
    station: 'workbench',
    inputs: { scrap: 2, components: 2 },
    output: { itemId: 'repair-kit', count: 1 },
  },
  {
    id: 'craft-extended-mag',
    name: 'Extended Magazine',
    station: 'workbench',
    inputs: { scrap: 8, components: 5 },
    output: { itemId: 'extended-mag', count: 1 },
  },
];

export function recipesFor(station: StationId): Recipe[] {
  return RECIPES.filter((recipe) => recipe.station === station);
}

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}
