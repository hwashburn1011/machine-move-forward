import { BUILD_PIECES, type PieceCategory, type PieceId } from '@/data/build-pieces';
import { formatCostGlyphs, type ItemCost } from '@/data/items';
import { REASON_TEXT, type Validation } from '@/building/BuildValidation';
import { TARGET_REJECTION_TEXT, type TargetRejection } from '@/building/BuildTargeting';

export interface BuildUIState {
  piece: PieceId;
  category: PieceCategory;
  level: number;
  rotation: number;
  scrap: number;
  components: number;
  canAfford: (cost: ItemCost) => boolean;
  canBuild?: (piece: PieceId) => boolean;
  validation: Validation;
  roomCount: number;
  enclosedCount: number;
  range?: number;
  levelPinned?: boolean;
  targetRejection?: TargetRejection;
  message?: string;
  relocation?: boolean;
  aimedName?: string;
  demolition?: { progress: number; cascade: number; refund: string };
  label?: (action: string) => string;
}
const LEVEL_NAMES: Record<number, string> = {
  [-2]: 'Lower deck',
  [-1]: 'Service deck',
  0: 'Command deck',
  1: 'Build level 1',
  2: 'Build level 2',
};

/** Compact, cached build HUD. Catalog selection remains owned by BuildCatalog. */
export class BuildUI {
  private readonly root: HTMLDivElement;
  private readonly el = new Map<string, HTMLElement>();
  private signature = '';
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'build-panel';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="build-selected"><span class="build-selected-name"></span><span class="build-selected-cost"></span></div><div class="build-target"><span class="build-target-status"></span><span class="build-target-name"></span></div><div class="build-placement"><span class="build-level"></span><span class="build-range"></span><span class="build-facing"></span></div><div class="build-resources"></div><div class="build-message"></div><div class="build-controls"></div><div class="build-demolition"></div>`;
    parent.appendChild(this.root);
    for (const key of [
      'selected-name',
      'selected-cost',
      'target-status',
      'target-name',
      'level',
      'range',
      'facing',
      'resources',
      'message',
      'controls',
      'demolition',
    ]) {
      const node = this.root.querySelector<HTMLElement>(`.build-${key}`);
      if (node) this.el.set(key, node);
    }
  }
  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
  update(state: BuildUIState): void {
    const def = BUILD_PIECES[state.piece];
    const reason =
      (state.targetRejection && TARGET_REJECTION_TEXT[state.targetRejection]) ||
      (!state.validation.ok && state.validation.reason
        ? REASON_TEXT[state.validation.reason]
        : 'Ready to place');
    const level = LEVEL_NAMES[state.level] ?? `Build level ${state.level}`;
    const range =
      state.range === undefined ? 'Reach 12.0 m' : `Reach ${state.range.toFixed(1)} / 12.0 m`;
    const facing = `Facing ${['north', 'east', 'south', 'west'][((state.rotation % 4) + 4) % 4]}`;
    const key = (action: string, fallback: string) => state.label?.(action) ?? fallback;
    const controls = [
      `${key('fire', 'LMB')} ${state.relocation ? 'Move here' : 'Place'}`,
      `${key('catalog', 'G')} Catalog`,
      `${key('rotate-left', 'Q')}/${key('rotate-right', 'E')} or wheel Rotate`,
      `${key('next-level', 'PgUp')}/${key('previous-level', 'PgDn')} Deck`,
      `${key('auto-level', 'Home')} Auto deck`,
      `${key('relocate', 'V')} Move equipment`,
      `${key('aim', 'RMB')}/${key('cancel', 'Esc')} Cancel`,
      `Hold ${key('demolish', 'X')} Demolish`,
    ].join(' · ');
    const values: Record<string, string> = {
      'selected-name': state.relocation ? `Moving ${state.aimedName ?? def.name}` : def.name,
      'selected-cost': state.relocation ? '' : formatCostGlyphs(def.cost),
      'target-status': state.validation.ok && !state.targetRejection ? '✓ Valid' : `⚠ ${reason}`,
      'target-name': state.aimedName ? `Target: ${state.aimedName}` : '',
      level: `${level} · ${state.levelPinned ? 'Manual' : 'Auto'}`,
      range,
      facing,
      resources: `${state.scrap} ▪ · ${state.components} ⬡ · rooms ${state.roomCount} · enclosed ${state.enclosedCount}`,
      message: state.message ?? '',
      controls,
      demolition: state.demolition
        ? `Demolish ${Math.round(state.demolition.progress * 100)}% · ${state.demolition.cascade} affected · Refund ${state.demolition.refund}`
        : '',
    };
    const sig = JSON.stringify(values);
    if (sig === this.signature) return;
    this.signature = sig;
    for (const [key, value] of Object.entries(values)) {
      const node = this.el.get(key);
      if (node && node.textContent !== value) node.textContent = value;
    }
    this.root.classList.toggle('is-invalid', !(state.validation.ok && !state.targetRejection));
    this.root.classList.toggle('is-relocating', !!state.relocation);
  }
  dispose(): void {
    this.root.remove();
  }
}
