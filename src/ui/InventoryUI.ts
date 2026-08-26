import type { Container } from '@/items/Container';
import { ITEMS, type ItemId } from '@/data/items';
import { recipesFor, type Recipe, type StationId } from '@/data/recipes';

export type PanelMode = 'closed' | 'inventory' | 'transfer' | 'crafting';

export interface PanelContext {
  /** Shown in the header. */
  title?: string;
  /** Transfer mode: the other side of the exchange. */
  crate?: Container;
  /** Crafting mode: whose recipe list to show. */
  station?: StationId;
}

export interface InventoryUIState {
  /** Available inputs, counted across the inventory and crates in reach. */
  countOf: (itemId: ItemId) => number;
  canCraft: (recipe: Recipe) => boolean;
  /**
   * A banner over the recipe list — 'NO POWER' at a shed refinery.
   *
   * Separate from `canCraft` because a greyed-out Craft button with no reason
   * beside it is how a player concludes the game is broken rather than that
   * their generator is.
   */
  stationNote?: string | null;
}

export interface InventoryUICallbacks {
  /** Player slot -> crate. `all` is a whole stack, otherwise one unit. */
  moveToCrate: (slotIndex: number, all: boolean) => void;
  moveToPlayer: (slotIndex: number, all: boolean) => void;
  /** Use or fit whatever is in a player slot. */
  useSlot: (slotIndex: number) => void;
  craft: (recipeId: string) => void;
  close: () => void;
}

/**
 * Inventory, transfer, and crafting panels.
 *
 * One class rather than three: they share a slot grid, a header, and the
 * pointer-lock handshake, and splitting them would mean three copies of all of
 * it. Plain DOM, in keeping with the rest of the HUD.
 */
export class InventoryUI {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly heading: HTMLElement;

  private mode: PanelMode = 'closed';
  private context: PanelContext = {};
  private inventory: Container;
  /** Last rendered signature. The DOM is rebuilt only when it changes. */
  private signature = '';

  constructor(
    parent: HTMLElement,
    inventory: Container,
    private readonly callbacks: InventoryUICallbacks,
  ) {
    this.inventory = inventory;

    this.root = document.createElement('div');
    this.root.id = 'inv-panel';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="inv-head">
        <span class="inv-title">Inventory</span>
        <span class="inv-hint" data-close="1">[Tab] or [Esc] to close &times;</span>
      </div>
      <div class="inv-body"></div>
    `;
    parent.appendChild(this.root);

    this.heading = this.root.querySelector('.inv-title') as HTMLElement;
    this.body = this.root.querySelector('.inv-body') as HTMLDivElement;

    this.root.addEventListener('click', this.onClick);
    // Shift-click is a click too, but the browser also selects text on it.
    this.root.addEventListener('mousedown', (e) => e.preventDefault());
  }

  get isOpen(): boolean {
    return this.mode !== 'closed';
  }

  get currentMode(): PanelMode {
    return this.mode;
  }

  /** The crate on the other side of a transfer, if one is open. */
  get currentCrate(): Container | null {
    return this.context.crate ?? null;
  }

  setInventory(inventory: Container): void {
    this.inventory = inventory;
    this.signature = '';
  }

  setMode(mode: PanelMode, context: PanelContext = {}): void {
    this.mode = mode;
    this.context = context;
    this.signature = '';
    this.root.style.display = mode === 'closed' ? 'none' : 'block';
    this.heading.textContent = context.title ?? 'Inventory';
  }

  /** Rebuilds only when something the panel shows has actually changed. */
  update(state: InventoryUIState): void {
    if (this.mode === 'closed') return;

    const signature = this.signatureFor(state);
    if (signature === this.signature) return;
    this.signature = signature;

    this.body.innerHTML =
      this.mode === 'crafting' ? this.craftingHtml(state) : this.slotsHtml();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private slotsHtml(): string {
    const player = `
      <div class="inv-side">
        <div class="inv-side-label">Carried &middot; ${this.inventory.totalWeight().toFixed(1)} kg</div>
        ${this.gridHtml(this.inventory, 'player')}
      </div>`;

    if (this.mode !== 'transfer' || !this.context.crate) {
      return `${player}<div class="inv-foot">Click a kit or a mod to use it.</div>`;
    }

    return `
      <div class="inv-panes">
        ${player}
        <div class="inv-side">
          <div class="inv-side-label">Crate</div>
          ${this.gridHtml(this.context.crate, 'crate')}
        </div>
      </div>
      <div class="inv-foot">Click moves a stack &middot; shift-click moves one.</div>`;
  }

  private gridHtml(container: Container, side: 'player' | 'crate'): string {
    const cells = container.slots
      .map((slot, i) => {
        if (!slot) return `<div class="inv-slot is-empty" data-side="${side}" data-slot="${i}"></div>`;
        const def = ITEMS[slot.itemId];
        return `
        <div class="inv-slot" data-side="${side}" data-slot="${i}" title="${def.description}">
          <span class="inv-glyph">${def.glyph}</span>
          <span class="inv-name">${def.name}</span>
          <span class="inv-count">${slot.count}</span>
        </div>`;
      })
      .join('');
    // The crate is narrower than the 20-slot player grid, so the pair fits
    // side by side without the panel running off the screen.
    return `<div class="inv-grid is-${side}">${cells}</div>`;
  }

  private craftingHtml(state: InventoryUIState): string {
    const station = this.context.station ?? 'workbench';
    const rows = recipesFor(station)
      .map((recipe) => {
        const can = state.canCraft(recipe);
        const inputs = (Object.entries(recipe.inputs) as [ItemId, number][])
          .map(([id, n]) => {
            const short = state.countOf(id) < n;
            return `<span class="inv-in${short ? ' is-short' : ''}">${n}${ITEMS[id].glyph} ${ITEMS[id].name}</span>`;
          })
          .join('<span class="inv-plus">+</span>');
        const out = ITEMS[recipe.output.itemId];
        return `
        <div class="inv-recipe${can ? '' : ' is-blocked'}">
          <div class="inv-recipe-main">
            <span class="inv-recipe-name">${recipe.name}</span>
            <span class="inv-recipe-io">${inputs}<span class="inv-arrow">&rarr;</span><span class="inv-out">${recipe.output.count}${out.glyph} ${out.name}</span></span>
          </div>
          <button class="inv-craft" data-recipe="${recipe.id}" ${can ? '' : 'disabled'}>Craft</button>
        </div>`;
      })
      .join('');

    const note = state.stationNote
      ? `<div class="inv-note">${state.stationNote}</div>`
      : '';
    return `${note}<div class="inv-recipes">${rows}</div>`;
  }

  /**
   * Everything the rendered DOM depends on, flattened.
   *
   * Cheaper than diffing and far cheaper than rebuilding the grid every frame
   * while the panel sits open.
   */
  private signatureFor(state: InventoryUIState): string {
    const parts: string[] = [
      this.mode,
      this.context.station ?? '',
      this.context.title ?? '',
      state.stationNote ?? '',
    ];

    const slots = (c: Container) =>
      c.slots.map((s) => (s ? `${s.itemId}:${s.count}` : '-')).join(',');

    parts.push(slots(this.inventory));
    if (this.context.crate) parts.push(slots(this.context.crate));
    if (this.mode === 'crafting') {
      const station = this.context.station ?? 'workbench';
      for (const recipe of recipesFor(station)) {
        parts.push(`${recipe.id}:${state.canCraft(recipe) ? 1 : 0}`);
        for (const id of Object.keys(recipe.inputs) as ItemId[]) {
          parts.push(`${id}=${state.countOf(id)}`);
        }
      }
    }
    return parts.join('|');
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-close]')) {
      this.callbacks.close();
      return;
    }

    const craftButton = target.closest<HTMLElement>('[data-recipe]');
    if (craftButton) {
      const id = craftButton.dataset.recipe;
      if (id) this.callbacks.craft(id);
      return;
    }

    const slot = target.closest<HTMLElement>('[data-slot]');
    if (!slot) return;

    const index = Number(slot.dataset.slot);
    if (!Number.isInteger(index)) return;
    const side = slot.dataset.side;
    // Shift moves a single unit; a plain click moves the whole stack.
    const all = !event.shiftKey;

    if (this.mode === 'transfer') {
      if (side === 'player') this.callbacks.moveToCrate(index, all);
      else this.callbacks.moveToPlayer(index, all);
      return;
    }

    if (side === 'player') this.callbacks.useSlot(index);
  };

  dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}
