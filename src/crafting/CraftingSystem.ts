import type { EventBus } from '@/core/events/EventBus';
import type { ResourceAccess } from '@/items/ResourceAccess';
import { recipeById, type Recipe, type StationId } from '@/data/recipes';
import { powerRoleOf } from '@/data/power';

/**
 * Why a craft will not run, or null if it will.
 *
 * A boolean was enough while every refusal meant "you are short"; a powered
 * station adds a refusal the player cannot see in their own inventory, and
 * "Craft is greyed out" with no reason is the worst possible way to learn that
 * the generator has shed.
 */
export type CraftBlock = 'no-power' | 'cannot-afford' | 'no-room' | 'unavailable' | null;

/**
 * Recipe evaluation and execution (spec section 9).
 *
 * Pure apart from the bus: it knows about a `ResourceAccess` and nothing else,
 * so the same code serves the player's inventory, a crate within reach, or
 * whatever later milestones bolt on.
 */
export class CraftingSystem {
  constructor(
    private readonly resources: ResourceAccess,
    private readonly bus: EventBus,
    /**
     * Whether a station has the power to run.
     *
     * Injected rather than reached for, so this class still knows about a
     * `ResourceAccess` and nothing else. Defaults to "yes" — the workbench and
     * every test written before power existed are unaffected, and only the
     * stations `powerRoleOf` registers as consumers can ever answer no.
     */
    private readonly stationPowered: (station: StationId) => boolean = () => true,
    private readonly recipeAllowed: (recipe: Recipe) => boolean = () => true,
  ) {}

  /** Inputs available, somewhere to put the output, AND the lights on. */
  canCraft(recipe: Recipe): boolean {
    return this.craftBlock(recipe) === null;
  }

  /**
   * Why this recipe will not run.
   *
   * Power comes FIRST. A player at a dark refinery with an empty bag needs to
   * be told about the power: the missing scrap is a problem they can already
   * see in their own inventory, and the dead generator is not.
   */
  craftBlock(recipe: Recipe): CraftBlock {
    if (!this.recipeAllowed(recipe)) return 'unavailable';
    // Asked only of stations that actually draw. The workbench is a bench with
    // hand tools on it and is never gated, however dark the machine — one
    // powered station proves the chain from fuel to components without leaving
    // a player with a dead generator no way back.
    if (powerRoleOf(recipe.station)?.kind === 'consumer' && !this.stationPowered(recipe.station)) {
      return 'no-power';
    }
    if (!this.resources.canAfford(recipe.inputs)) return 'cannot-afford';
    if (
      !this.resources.canExchange(recipe.inputs, {
        [recipe.output.itemId]: recipe.output.count,
      })
    )
      return 'no-room';
    return null;
  }

  /**
   * Run a recipe. Returns false, changing nothing, if it cannot complete.
   *
   * ResourceAccess plans removal and output placement on clones, then commits
   * both sides together. This permits an ingredient slot to become the output
   * slot without exposing a partial spend.
   */
  craft(recipeId: string): boolean {
    const recipe = recipeById(recipeId);
    if (!recipe) return false;
    if (!this.canCraft(recipe)) return false;

    if (
      !this.resources.exchange(recipe.inputs, {
        [recipe.output.itemId]: recipe.output.count,
      })
    )
      return false;

    const event: { recipeId: string; outputs: { id: string; count: number }[] } = {
      recipeId: recipe.id,
      outputs: [{ id: recipe.output.itemId, count: recipe.output.count }],
    };
    this.bus.emit('craft:completed', event);
    return true;
  }
}
