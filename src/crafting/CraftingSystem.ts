import type { EventBus } from '@/core/events/EventBus';
import type { ResourceAccess } from '@/items/ResourceAccess';
import { recipeById, type Recipe } from '@/data/recipes';

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
  ) {}

  /** Inputs available AND somewhere to put the output. */
  canCraft(recipe: Recipe): boolean {
    if (!this.resources.canAfford(recipe.inputs)) return false;
    return this.hasRoomForOutput(recipe);
  }

  /**
   * Run a recipe. Returns false, changing nothing, if it cannot complete.
   *
   * Order matters: affordability, then storage, then consume, then deposit.
   * Consuming before confirming the output fits is how materials get eaten
   * into nothing.
   */
  craft(recipeId: string): boolean {
    const recipe = recipeById(recipeId);
    if (!recipe) return false;
    if (!this.canCraft(recipe)) return false;

    if (!this.resources.consume(recipe.inputs)) return false;
    this.resources.deposit(recipe.output.itemId, recipe.output.count);

    this.bus.emit('craft:completed', { recipeId: recipe.id });
    return true;
  }

  /**
   * Room for the output BEFORE the inputs are spent.
   *
   * Deliberately conservative: emptying the input slots would often free the
   * space, but checking afterwards would mean discovering the problem with the
   * materials already gone.
   */
  private hasRoomForOutput(recipe: Recipe): boolean {
    return this.resources.roomFor(recipe.output.itemId) >= recipe.output.count;
  }
}
