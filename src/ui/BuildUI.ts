import { BUILD_PIECES, BUILD_PIECE_ORDER, type PieceId } from '@/data/build-pieces';
import { formatCostGlyphs, type ItemCost } from '@/data/items';
import { REASON_TEXT, type Validation } from '@/building/BuildValidation';

export interface BuildUIState {
  piece: PieceId;
  level: number;
  rotation: number;
  scrap: number;
  components: number;
  /**
   * A predicate rather than a scrap number: costs are itemised now, and the
   * panel must not have its own opinion about where materials live.
   */
  canAfford: (cost: ItemCost) => boolean;
  validation: Validation;
  roomCount: number;
  enclosedCount: number;
}

/**
 * Build-mode HUD panel.
 *
 * Same cached-write discipline as the main HUD: nothing touches the DOM unless
 * the value actually changed.
 */
export class BuildUI {
  private readonly root: HTMLDivElement;
  private readonly slots = new Map<PieceId, HTMLElement>();
  private readonly cache = new Map<string, string>();
  private readonly el: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'build-panel';
    this.root.style.display = 'none';

    const row = BUILD_PIECE_ORDER.map((id, i) => {
      const def = BUILD_PIECES[id];
      return `
        <div class="build-slot" data-piece="${id}">
          <span class="build-slot-key">${i + 1}</span>
          <span class="build-slot-name">${def.name}</span>
          <span class="build-slot-cost">${formatCostGlyphs(def.cost)}</span>
        </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="build-row">${row}</div>
      <div class="build-status">
        <span id="build-scrap">400 &#9642; &middot; 0 &#11041;</span>
        <span id="build-level">Level 0</span>
        <span id="build-rooms">rooms 0 &middot; enclosed 0</span>
      </div>
      <div id="build-reason"></div>
    `;

    parent.appendChild(this.root);

    for (const id of BUILD_PIECE_ORDER) {
      const node = this.root.querySelector<HTMLElement>(`[data-piece="${id}"]`);
      if (node) this.slots.set(id, node);
    }
    for (const id of ['build-scrap', 'build-level', 'build-rooms', 'build-reason']) {
      const node = this.root.querySelector<HTMLElement>(`#${id}`);
      if (node) this.el[id] = node;
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  update(state: BuildUIState): void {
    for (const [id, node] of this.slots) {
      const selected = id === state.piece;
      const affordable = state.canAfford(BUILD_PIECES[id].cost);
      node.classList.toggle('is-selected', selected);
      node.classList.toggle('is-poor', !affordable);
    }

    this.write(
      'scrap',
      this.el['build-scrap'],
      `${state.scrap} ▪ · ${state.components} ⬡`,
    );
    this.write('level', this.el['build-level'], `Level ${state.level}`);
    this.write(
      'rooms',
      this.el['build-rooms'],
      `rooms ${state.roomCount} · enclosed ${state.enclosedCount}`,
    );

    // Blank while valid, so the reason line is pure signal.
    const reason =
      state.validation.ok || !state.validation.reason
        ? ''
        : REASON_TEXT[state.validation.reason];
    this.write('reason', this.el['build-reason'], reason);
  }

  private write(key: string, node: HTMLElement | undefined, value: string): void {
    if (!node) return;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    node.textContent = value;
  }

  dispose(): void {
    this.root.remove();
  }
}
