import { describe, expect, it } from 'vitest';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { EventBus } from '@/core/events/EventBus';
import { CraftingSystem } from '@/crafting/CraftingSystem';
import { ITEMS, ITEM_IDS, type ItemId } from '@/data/items';
import { RECIPES, recipeById, recipesFor, type StationId } from '@/data/recipes';
import { BUILD_PIECES, isFixture, isStation } from '@/data/build-pieces';
import { powerRoleOf } from '@/data/power';

const origin = { x: 0, y: 0, z: 0 };

function make(capacity = 20) {
  const bus = new EventBus();
  const inventory = new Container(capacity);
  const access = new ResourceAccess(inventory, () => [], () => origin, bus);
  return { bus, inventory, crafting: new CraftingSystem(access, bus) };
}

const COOK = 'cook-rations';

describe('the three new items', () => {
  it('adds water, greens and rations and nothing else', () => {
    // The roadmap's constraint is a SMALL economy. Three items is the budget
    // for the whole survival layer, and this is the line that spends it.
    expect(ITEM_IDS).toContain('water');
    expect(ITEM_IDS).toContain('greens');
    expect(ITEM_IDS).toContain('rations');
    expect(ITEM_IDS).toHaveLength(10);
  });

  it('makes water and rations consumable and greens an ingredient', () => {
    expect(ITEMS.water.category).toBe('consumable');
    expect(ITEMS.rations.category).toBe('consumable');
    // Greens are not edible raw: they are what the stove is for.
    expect(ITEMS.greens.category).toBe('resource');
  });

  it('gives each of them a sane stack size and weight', () => {
    for (const id of ['water', 'greens', 'rations'] as ItemId[]) {
      const def = ITEMS[id];
      expect(def.id, id).toBe(id);
      expect(def.stackSize, id).toBeGreaterThan(1);
      expect(def.weight, id).toBeGreaterThan(0);
      // Nothing in this game weighs more than the scrap it is made of.
      expect(def.weight, id).toBeLessThanOrEqual(ITEMS.scrap.weight * 2);
      expect(def.glyph.length, id).toBeGreaterThan(0);
    }
  });

  it('gives every item a distinct glyph, so the panel stays readable', () => {
    const glyphs = ITEM_IDS.map((id) => ITEMS[id].glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('the stove', () => {
  it('is a station standing on a floor, priced in scrap and components', () => {
    const stove = BUILD_PIECES.stove;
    expect(stove.anchor).toBe('cell');
    expect(isStation('stove')).toBe(true);
    expect(isFixture('stove')).toBe(false);
    expect(stove.cost).toEqual({ scrap: 25, components: 2 });
    expect(stove.boundsRoom).toBe(false);
    expect(stove.blocksNavigation).toBe(false);
  });

  it('draws no power, so a dark machine can still cook', () => {
    // The refinery is the ONE gated station, deliberately. A player whose
    // generator has shed must still be able to feed themselves.
    expect(powerRoleOf('stove')).toBeNull();
  });

  it('is a crafting station like any other', () => {
    const stations = RECIPES.map((r) => r.station);
    expect(stations).toContain('stove' as StationId);
    expect(recipesFor('stove').every((r) => r.station === 'stove')).toBe(true);
    expect(recipesFor('workbench').some((r) => r.station === 'stove')).toBe(false);
  });
});

describe('cooking', () => {
  it('turns greens and water into rations', () => {
    const recipe = recipeById(COOK);
    expect(recipe).toBeDefined();
    expect(recipe?.station).toBe('stove');
    expect(recipe?.inputs).toEqual({ greens: 1, water: 1 });
    expect(recipe?.output).toEqual({ itemId: 'rations', count: 1 });
  });

  it('runs at the stove and spends exactly its inputs', () => {
    const { inventory, crafting } = make();
    inventory.add('greens', 2);
    inventory.add('water', 2);

    expect(crafting.craft(COOK)).toBe(true);
    expect(inventory.count('rations')).toBe(1);
    expect(inventory.count('greens')).toBe(1);
    expect(inventory.count('water')).toBe(1);
  });

  it('is refused with greens but no water, and spends nothing', () => {
    const { inventory, crafting } = make();
    inventory.add('greens', 5);

    expect(crafting.craft(COOK)).toBe(false);
    expect(inventory.count('greens')).toBe(5);
    expect(inventory.count('rations')).toBe(0);
  });

  it('never gates on power, however dark the machine', () => {
    const bus = new EventBus();
    const inventory = new Container(20);
    const access = new ResourceAccess(inventory, () => [], () => origin, bus);
    const crafting = new CraftingSystem(access, bus, () => false);
    inventory.add('greens', 1);
    inventory.add('water', 1);

    expect(crafting.craftBlock(recipeById(COOK)!)).toBeNull();
    expect(crafting.craft(COOK)).toBe(true);
  });

  it('is the whole of the new economy: one recipe, not a tech tree', () => {
    expect(recipesFor('stove')).toHaveLength(1);
  });
});
