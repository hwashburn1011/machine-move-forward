import {
  BUILD_PIECES,
  PIECE_CATEGORIES,
  piecesInCategory,
  requiredUnlockOf,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';
import { formatCostGlyphs, type ItemCost } from '@/data/items';
import { REASON_TEXT, type Validation } from '@/building/BuildValidation';

export interface BuildUIState {
  piece: PieceId;
  /** Which group the number keys are addressing right now. */
  category: PieceCategory;
  level: number;
  rotation: number;
  scrap: number;
  components: number;
  /**
   * A predicate rather than a scrap number: costs are itemised now, and the
   * panel must not have its own opinion about where materials live.
   */
  canAfford: (cost: ItemCost) => boolean;
  canBuild?: (piece: PieceId) => boolean;
  validation: Validation;
  roomCount: number;
  enclosedCount: number;
}

/** What each group is called on the panel. */
const CATEGORY_LABEL: Record<PieceCategory, string> = {
  structure: 'Structure',
  station: 'Stations',
  automation: 'Automation',
  decor: 'Comforts',
};

/**
 * Build-mode HUD panel.
 *
 * Same cached-write discipline as the main HUD: nothing touches the DOM unless
 * the value actually changed.
 *
 * **Grouped, and the grouping is load-bearing rather than cosmetic.**
 * `InputManager` binds `slot1`..`slot9` and no more, and the piece table is
 * eighteen pieces now. A flat row would have left the last nine unselectable
 * — a bug that reads as the pieces never having been implemented. So the
 * number keys address the ACTIVE group and `G` pages between them; every
 * group is held inside nine pieces by a test in `decor.test.ts`.
 */
export class BuildUI {
  private readonly root: HTMLDivElement;
  private readonly slots = new Map<PieceId, HTMLElement>();
  private readonly groups = new Map<PieceCategory, HTMLElement>();
  private readonly cache = new Map<string, string>();
  private readonly el: Record<string, HTMLElement> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'build-panel';
    this.root.style.display = 'none';

    const groups = PIECE_CATEGORIES.map((category) => {
      const row = piecesInCategory(category)
        .map((id, i) => {
          const def = BUILD_PIECES[id];
          return `
            <div class="build-slot" data-piece="${id}">
              <span class="build-slot-key">${i + 1}</span>
              <span class="build-slot-name">${def.name}</span>
              <span class="build-slot-cost">${formatCostGlyphs(def.cost)}</span>
            </div>`;
        })
        .join('');
      return `
        <div class="build-group" data-category="${category}">
          <span class="build-group-label">${CATEGORY_LABEL[category]}</span>
          <div class="build-row">${row}</div>
        </div>`;
    }).join('');

    this.root.innerHTML = `
      ${groups}
      <div class="build-status">
        <span id="build-scrap">400 &#9642; &middot; 0 &#11041;</span>
        <span id="build-level">Level 0</span>
        <span id="build-rooms">rooms 0 &middot; enclosed 0</span>
        <span id="build-group-hint">[G] group</span>
      </div>
      <div id="build-reason"></div>
    `;

    parent.appendChild(this.root);

    for (const id of Object.keys(BUILD_PIECES) as PieceId[]) {
      const node = this.root.querySelector<HTMLElement>(`[data-piece="${id}"]`);
      if (node) this.slots.set(id, node);
    }
    for (const category of PIECE_CATEGORIES) {
      const node = this.root.querySelector<HTMLElement>(`[data-category="${category}"]`);
      if (node) this.groups.set(category, node);
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
      const unlocked = state.canBuild?.(id) ?? true;
      node.classList.toggle('is-selected', selected);
      node.classList.toggle('is-poor', !affordable || !unlocked);
      node.classList.toggle('is-locked', !unlocked);
      const required = requiredUnlockOf(id);
      const names: Record<string, string> = {
        'manual-turret': 'Manual turret blueprint',
        'automatic-salvage-collector': 'Salvage Controller',
        'automatic-defense-turret': 'Tracking Servo',
      };
      node.title =
        !unlocked && required ? `Requires ${names[required] ?? required}` : BUILD_PIECES[id].name;
    }

    // Only the active group's number keys do anything, so only the active
    // group is drawn as though they might.
    for (const [category, node] of this.groups) {
      node.classList.toggle('is-active', category === state.category);
    }

    this.write('scrap', this.el['build-scrap'], `${state.scrap} ▪ · ${state.components} ⬡`);
    this.write('level', this.el['build-level'], `Level ${state.level}`);
    this.write(
      'rooms',
      this.el['build-rooms'],
      `rooms ${state.roomCount} · enclosed ${state.enclosedCount}`,
    );

    // Blank while valid, so the reason line is pure signal.
    const reason =
      state.validation.ok || !state.validation.reason ? '' : REASON_TEXT[state.validation.reason];
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
