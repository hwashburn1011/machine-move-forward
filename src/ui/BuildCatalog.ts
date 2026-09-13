import {
  BUILD_PIECES,
  PIECE_CATEGORIES,
  piecesInCategory,
  requiredUnlockOf,
  type PieceCategory,
  type PieceId,
} from '@/data/build-pieces';
import { formatCostGlyphs, type ItemCost } from '@/data/items';

export interface BuildCatalogState {
  category: PieceCategory;
  selected: PieceId;
  query?: string;
  canAfford: (cost: ItemCost) => boolean;
  canBuild?: (piece: PieceId) => boolean;
  actionLabel?: (action: string, fallback: string) => string;
}

export interface BuildCatalogCallbacks {
  select: (piece: PieceId) => void;
  category?: (category: PieceCategory) => void;
  close?: () => void;
}

const labels: Record<PieceCategory, string> = {
  structure: 'Structure',
  station: 'Stations',
  automation: 'Automation',
  decor: 'Comforts',
};
const unlockNames: Record<string, string> = {
  'manual-turret': 'Manual turret blueprint',
  'automatic-salvage-collector': 'Salvage Controller',
  'automatic-defense-turret': 'Tracking Servo',
};
const glyphs: Record<PieceId, string> = Object.fromEntries(
  (Object.keys(BUILD_PIECES) as PieceId[]).map((id) => {
    const paths: Record<string, string> = {
      floor: 'M4 23L16 8l12 15M8 23h16',
      wall: 'M7 25V7h18v18M12 7v18M18 7v18',
      doorway: 'M6 25V7h20v18M12 25V14h8v11',
      railing: 'M5 24h22M7 24V11m6 13V11m6 13V11m6 13V11',
      roof: 'M4 22l12-13 12 13M9 22h14',
      stairs: 'M5 25h22M7 25v-5h6v-5h6v-5h6',
      crate: 'M6 8h20v17H6zM6 8l10 7L26 8M16 15v10',
      workbench: 'M5 10h22M8 10v15m16-15v15M5 25h22',
      refinery: 'M9 24V12h14v12M12 12V7h8v5M6 25h20',
      generator: 'M8 24V10h16v14M12 10V6h8v4M13 16l6 3-5 2',
      lamp: 'M16 6v7M10 13h12l-3 6h-6zM16 19v6',
      stove: 'M7 24V12h18v12M11 12V8h10v4M12 17h8',
      condenser: 'M9 7h14v18H9zM12 11h8M12 16h8M12 21h8',
      planter: 'M7 13h18l-3 12H10zM16 13V7m0 4l-5-3m5 3l5-3',
      'turret-manual': 'M16 6v10M10 25h12l-2-9h-8zM16 6l8 4',
      'collector-auto': 'M6 22h20M9 22l3-12h8l3 12M16 10V6',
      'turret-auto': 'M6 24h20M10 24l2-9h8l2 9M16 15V7l8-4',
      chair: 'M9 8h14v10H9zM11 18v7m10-7v7',
      table: 'M6 10h20v5H6zM10 15v10m12-10v10',
      rug: 'M5 8h22v16H5zM9 12h14v8H9z',
      shelf: 'M7 6h18v20H7zM7 13h18M7 20h18',
    };
    return [
      id,
      `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${paths[id] ?? 'M5 5h22v22H5z'}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    ];
  }),
) as Record<PieceId, string>;

/** Direct, searchable build selection. Rendering and selection are independent of Game. */
export class BuildCatalog {
  readonly root: HTMLDivElement;
  private state: BuildCatalogState | null = null;
  private query = '';
  private last = '';

  constructor(
    parent: HTMLElement,
    private readonly callbacks: BuildCatalogCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'build-catalog';
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.root.addEventListener('click', (event) => {
      event.stopPropagation();
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-piece]');
      if (el?.dataset.piece) this.callbacks.select(el.dataset.piece as PieceId);
      const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-category]');
      if (tab?.dataset.category) this.callbacks.category?.(tab.dataset.category as PieceCategory);
      if ((event.target as HTMLElement).closest('[data-catalog-close]')) this.callbacks.close?.();
    });
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.close?.();
        return;
      }
      // Non-editable controls use the active catalog bindings, including
      // remapped close keys. Text entry owns its letters.
      const editable = target.matches('input,textarea,[contenteditable="true"]');
      if (editable) event.stopPropagation();
    });
    this.root.addEventListener('input', (event) => {
      event.stopPropagation();
      const input = event.target as HTMLInputElement;
      if (input.matches('[data-catalog-search]')) {
        this.query = input.value;
        this.last = '';
        if (this.state) this.update(this.state);
      }
    });
  }

  update(state: BuildCatalogState): void {
    this.state = state;
    if (state.query !== undefined && state.query !== this.query) this.query = state.query;
    const sig = `${state.category}|${state.selected}|${this.query}|${PIECE_CATEGORIES.map((c) =>
      piecesInCategory(c)
        .map((p) => `${p}:${state.canBuild?.(p) ?? true}:${state.canAfford(BUILD_PIECES[p].cost)}`)
        .join(','),
    ).join('|')}`;
    if (sig === this.last) return;
    this.last = sig;
    const q = this.query.trim().toLowerCase();
    const visibleCategories = q ? PIECE_CATEGORIES : [state.category];
    const tabs = PIECE_CATEGORIES.map(
      (c) =>
        `<button class="build-catalog-tab${c === state.category && !q ? ' is-active' : ''}" data-category="${c}">${labels[c]}</button>`,
    ).join('');
    const cards = visibleCategories
      .flatMap((c) => piecesInCategory(c))
      .filter((id) => !q || BUILD_PIECES[id].name.toLowerCase().includes(q))
      .map((id) => {
        const d = BUILD_PIECES[id],
          unlocked = state.canBuild?.(id) ?? true,
          affordable = state.canAfford(d.cost);
        const reason =
          !unlocked && requiredUnlockOf(id)
            ? `Requires ${unlockNames[requiredUnlockOf(id)!] ?? requiredUnlockOf(id)}`
            : !affordable
              ? 'Insufficient materials'
              : '';
        return `<button class="build-catalog-card${id === state.selected ? ' is-selected' : ''}${!unlocked ? ' is-locked' : ''}" data-piece="${id}" ${!unlocked ? 'disabled' : ''}><span class="build-card-thumb">${glyphs[id]}</span><span class="build-card-name">${d.name}</span><span class="build-card-cost">${formatCostGlyphs(d.cost)}</span>${reason ? `<span class="build-card-reason">${reason}</span>` : ''}</button>`;
      })
      .join('');
    let tabRoot = this.root.querySelector<HTMLElement>('.build-catalog-tabs');
    if (!tabRoot) {
      const close = state.actionLabel?.('close', 'Close') ?? 'Close';
      const search = state.actionLabel?.('search', 'Search pieces') ?? 'Search pieces';
      this.root.innerHTML = `<div class="build-catalog-head"><span>Build catalog</span><button data-catalog-close aria-label="${close}">×</button></div><div class="build-catalog-tabs"></div><input data-catalog-search placeholder="${search}"/><div class="build-catalog-cards"></div>`;
      tabRoot = this.root.querySelector<HTMLElement>('.build-catalog-tabs');
    }
    tabRoot!.innerHTML = tabs;
    const cardRoot = this.root.querySelector<HTMLElement>('.build-catalog-cards');
    if (cardRoot)
      cardRoot.innerHTML = cards || '<span class="build-catalog-empty">No matching pieces</span>';
    const input = this.root.querySelector<HTMLInputElement>('[data-catalog-search]');
    if (input && input.value !== this.query) input.value = this.query;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.last = '';
  }
  dispose(): void {
    this.root.remove();
  }
}
