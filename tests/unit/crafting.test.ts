import { describe, it, expect, vi } from 'vitest';
import { Container } from '@/items/Container';
import { ResourceAccess } from '@/items/ResourceAccess';
import { EventBus } from '@/core/events/EventBus';
import { CraftingSystem } from '@/crafting/CraftingSystem';
import { RECIPES, recipeById, recipesFor, type StationId } from '@/data/recipes';
import { Weapon } from '@/combat/Weapon';
import { WEAPONS } from '@/data/weapons';
import { PlayerStats } from '@/player/PlayerStats';

const origin = { x: 0, y: 0, z: 0 };

function make(capacity = 20, powered: (station: StationId) => boolean = () => true) {
  const bus = new EventBus();
  const inventory = new Container(capacity);
  const access = new ResourceAccess(inventory, () => [], () => origin, bus);
  return { bus, inventory, crafting: new CraftingSystem(access, bus, powered) };
}

const REFINE = 'refine-components';
const RIFLE_AMMO = 'craft-rifle-ammo';
const EXT_MAG = 'craft-extended-mag';

describe('recipe data', () => {
  it('gives every recipe a unique id', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('filters by station', () => {
    const refinery = recipesFor('refinery');
    expect(refinery.length).toBeGreaterThan(0);
    expect(refinery.every((r) => r.station === 'refinery')).toBe(true);
    expect(recipesFor('workbench').some((r) => r.station === 'refinery')).toBe(false);
  });

  it('resolves a recipe by id and returns undefined for a stranger', () => {
    expect(recipeById(REFINE)?.id).toBe(REFINE);
    expect(recipeById('no-such-recipe')).toBeUndefined();
  });
});

describe('canCraft', () => {
  it('is true with exactly the inputs', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 8);
    expect(crafting.canCraft(recipeById(REFINE)!)).toBe(true);
  });

  it('is false one short', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 7);
    expect(crafting.canCraft(recipeById(REFINE)!)).toBe(false);
  });

  it('is false when only the second input is short', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 99);
    expect(crafting.canCraft(recipeById(RIFLE_AMMO)!)).toBe(false);
  });
});

describe('craft', () => {
  it('consumes exactly the inputs and deposits the output', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 10);

    expect(crafting.craft(REFINE)).toBe(true);
    expect(inventory.count('scrap')).toBe(2);
    expect(inventory.count('components')).toBe(2);
  });

  it('consumes nothing when the inputs are short', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 7);

    expect(crafting.craft(REFINE)).toBe(false);
    expect(inventory.count('scrap')).toBe(7);
    expect(inventory.count('components')).toBe(0);
  });

  it('leaves a multi-input craft entirely untouched when one input is short', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 50);

    expect(crafting.craft(RIFLE_AMMO)).toBe(false);
    // The scrap is still there: a partial spend that produced nothing would be
    // strictly worse than a refusal.
    expect(inventory.count('scrap')).toBe(50);
  });

  it('refuses when the output cannot be stored, leaving the inputs intact', () => {
    // One slot, already holding the scrap the recipe wants. Components have
    // nowhere to go, so the craft must not run.
    const { inventory, crafting } = make(1);
    inventory.add('scrap', 8);

    expect(crafting.craft(REFINE)).toBe(false);
    expect(inventory.count('scrap')).toBe(8);
    expect(inventory.count('components')).toBe(0);
  });

  it('rejects an unknown recipe id', () => {
    const { crafting } = make();
    expect(crafting.craft('no-such-recipe')).toBe(false);
  });

  it('emits craft:completed on success only', () => {
    const { bus, inventory, crafting } = make();
    const seen = vi.fn();
    bus.on('craft:completed', seen);

    inventory.add('scrap', 8);
    expect(crafting.craft(REFINE)).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toEqual({
      recipeId: REFINE,
      outputs: [{ id: 'components', count: 2 }],
    });

    // Now broke: the second attempt must be silent.
    expect(crafting.craft(REFINE)).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('crafts the extended magazine from scrap and components', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 8);
    inventory.add('components', 5);

    expect(crafting.craft(EXT_MAG)).toBe(true);
    expect(inventory.count('extended-mag')).toBe(1);
    expect(inventory.count('scrap')).toBe(0);
    expect(inventory.count('components')).toBe(0);
  });
});

describe('the powered refinery', () => {
  /** Nothing on the machine has power. */
  const DARK = () => false;

  it('refuses to run with the reason a player can act on', () => {
    const { inventory, crafting } = make(20, DARK);
    inventory.add('scrap', 10);

    expect(crafting.craftBlock(recipeById(REFINE)!)).toBe('no-power');
    expect(crafting.canCraft(recipeById(REFINE)!)).toBe(false);
    expect(crafting.craft(REFINE)).toBe(false);
    // And spends nothing doing it.
    expect(inventory.count('scrap')).toBe(10);
    expect(inventory.count('components')).toBe(0);
  });

  it('runs again the moment the power is back', () => {
    const { inventory, crafting } = make();
    inventory.add('scrap', 10);
    expect(crafting.craftBlock(recipeById(REFINE)!)).toBeNull();
    expect(crafting.craft(REFINE)).toBe(true);
    expect(inventory.count('components')).toBe(2);
  });

  it('never gates the workbench, however dark the machine', () => {
    // The whole point of gating ONE station: basic crafting must survive a
    // dead generator, or a player with no power has no way back.
    const { inventory, crafting } = make(20, DARK);
    inventory.add('scrap', 8);
    inventory.add('components', 5);
    expect(crafting.craftBlock(recipeById(EXT_MAG)!)).toBeNull();
    expect(crafting.craft(EXT_MAG)).toBe(true);
  });

  it('asks about the recipe station, not about the panel that is open', () => {
    const asked: StationId[] = [];
    const { inventory, crafting } = make(20, (station) => {
      asked.push(station);
      return true;
    });
    inventory.add('scrap', 8);
    crafting.craft(REFINE);
    expect(asked).toContain('refinery');
    expect(asked).not.toContain('workbench');
  });

  it('reports being broke and having nowhere to put it, distinctly', () => {
    const broke = make();
    expect(broke.crafting.craftBlock(recipeById(REFINE)!)).toBe('cannot-afford');

    const full = make(1);
    full.inventory.add('scrap', 8);
    expect(full.crafting.craftBlock(recipeById(REFINE)!)).toBe('no-room');
  });

  it('names no power ahead of being broke', () => {
    // The player standing at a dark refinery with an empty bag needs to be
    // told about the power: the scrap is the problem they can already see.
    const { crafting } = make(20, DARK);
    expect(crafting.craftBlock(recipeById(REFINE)!)).toBe('no-power');
  });
});

describe('weapon magazine mod', () => {
  const rifle = () => new Weapon(WEAPONS.rifle!);

  it('reports the base size when no bonus is applied', () => {
    const w = rifle();
    expect(w.magazineBonus).toBe(0);
    expect(w.effectiveMagazineSize).toBe(WEAPONS.rifle!.magazineSize);
  });

  it('raises the magazine by 50 percent, floored', () => {
    const w = rifle();
    expect(w.applyMagazineMod()).toBe(true);
    // 30 -> 45.
    expect(w.effectiveMagazineSize).toBe(45);
  });

  it('floors the bonus on an odd magazine', () => {
    const w = new Weapon({ ...WEAPONS.rifle!, magazineSize: 7 });
    w.applyMagazineMod();
    expect(w.effectiveMagazineSize).toBe(10); // 7 + floor(3.5)
  });

  it('refuses a second application', () => {
    const w = rifle();
    expect(w.applyMagazineMod()).toBe(true);
    expect(w.applyMagazineMod()).toBe(false);
    expect(w.effectiveMagazineSize).toBe(45);
  });

  it('reloads up to the modded size', () => {
    const w = rifle();
    // Finite reserve, so the draw-down is what is being measured. The game runs
    // with unlimited ammunition; the mod still has to fill the larger magazine.
    w.infiniteReserve = false;
    w.applyMagazineMod();
    w.ammoInMag = 0;
    w.reserveAmmo = 100;
    w.startReload(0);
    w.fixedUpdate(WEAPONS.rifle!.reloadTime + 0.01);
    expect(w.ammoInMag).toBe(45);
    expect(w.reserveAmmo).toBe(55);
  });

  it('survives serialise and restore', () => {
    const w = rifle();
    w.applyMagazineMod();
    w.ammoInMag = 12;
    w.reserveAmmo = 90;

    const restored = rifle();
    restored.restore(w.serialise());

    expect(restored.magazineBonus).toBe(15);
    expect(restored.effectiveMagazineSize).toBe(45);
    expect(restored.ammoInMag).toBe(12);
    expect(restored.reserveAmmo).toBe(90);
  });
});

describe('repair kit', () => {
  const stats = () => new PlayerStats(new EventBus());

  it('heals 40', () => {
    const s = stats();
    s.damage(60, 'test');
    expect(s.useRepairKit()).toBe(true);
    expect(s.health).toBe(80);
  });

  it('never overheals past the cap', () => {
    const s = stats();
    s.damage(10, 'test');
    expect(s.useRepairKit()).toBe(true);
    expect(s.health).toBe(s.maxHealth);
  });

  it('is refused at full health so it cannot be wasted', () => {
    const s = stats();
    expect(s.useRepairKit()).toBe(false);
    expect(s.health).toBe(s.maxHealth);
  });

  it('is refused when dead', () => {
    const s = stats();
    s.damage(200, 'test');
    expect(s.alive).toBe(false);
    expect(s.useRepairKit()).toBe(false);
    expect(s.health).toBe(0);
  });
});
