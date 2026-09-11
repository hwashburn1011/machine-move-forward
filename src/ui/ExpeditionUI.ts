import type { StoryPhase } from '@/story/StoryDirector';
import { WRECK_ONE, storyExpedition } from '@/data/story';
import type { RouteId } from '@/data/routes';

export interface ExpeditionView {
  phase: StoryPhase;
  objective: string;
  strength: number;
  remainingM: number | null;
  journalsRead: readonly string[];
  uniqueCollected: boolean;
  playerOnMachine: boolean;
  journalTexts?: Readonly<Record<string, string>>;
  routes?: readonly RouteId[];
  expeditionId?: 'wreck-one' | 'relay-foundry';
  recoveredUniques?: readonly string[];
  routeCards?: readonly { id: RouteId; distanceM: number; estimatedFuel: number; hazard: string }[];
  routeRefusal?: string | null;
}

export interface ExpeditionUICallbacks {
  close: () => void;
  selectRoute?: (route: RouteId) => void;
}

const STORY_PHASE_LABELS: Record<StoryPhase, string> = {
  locked: 'Locked',
  signal: 'Recovered receiver',
  crossfire: 'Crossfire',
  raids: 'Hold the Nomad',
  'route-selection': 'Choose a route',
  approach: 'Relay tender',
  braking: 'Docking',
  docked: 'The Wake',
  departing: 'Resuming route',
  complete: 'Next transmission',
};

/** Lightweight exploration log and destination status panel. */
export class ExpeditionUI {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private renderedKey = '';
  private pendingRoute: RouteId | null = null;
  private view: ExpeditionView = {
    phase: 'locked',
    objective: '',
    strength: 0,
    remainingM: null,
    journalsRead: [],
    uniqueCollected: false,
    playerOnMachine: false,
    journalTexts: {},
  };

  constructor(
    parent: HTMLElement,
    private readonly callbacks: ExpeditionUICallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'expedition-panel';
    this.root.dataset.panel = 'expedition';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="expedition-panel-head"><span>Expedition</span><button type="button" data-expedition-close>Close</button></div><div class="expedition-panel-body"></div>';
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.expedition-panel-body') as HTMLDivElement;
    this.root.addEventListener('click', this.onClick);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(view?: ExpeditionView): void {
    this.root.hidden = false;
    if (view) this.view = view;
    this.render();
  }
  close(): void {
    this.root.hidden = true;
  }
  setView(view: ExpeditionView): void {
    this.view = view;
    if (this.isOpen) this.render();
  }

  private render(): void {
    const v = this.view;
    const key = viewKey(v);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const left =
      v.remainingM === null
        ? ''
        : `<div data-expedition-distance>${Math.max(0, Math.round(v.remainingM))} m remaining</div>`;
    const journals = (storyExpedition(v.expeditionId ?? 'wreck-one') ?? WRECK_ONE).journals
      .map((journal) => {
        const read = v.journalsRead.includes(journal.id);
        return `<article data-journal-id="${journal.id}" class="expedition-log${read ? ' is-read' : ''}"><strong>${escapeHtml(journal.title)}</strong>${read ? `<p>${escapeHtml(v.journalTexts?.[journal.id] ?? journal.text)}</p>` : '<span>Interact at the log to read</span>'}</article>`;
      })
      .join('');
    const gyro = v.uniqueCollected
      ? '<span data-expedition-gyro>Course Gyro recovered</span>'
      : '<span data-expedition-gyro>Course Gyro: interact with its pedestal</span>';
    const routeCards =
      v.routeCards ??
      v.routes?.map((id) => ({
        id,
        distanceM: id === 'foundry-direct' ? 750 : 1150,
        estimatedFuel: 0,
        hazard:
          id === 'foundry-direct'
            ? 'One scripted gunboat'
            : 'No scripted gunboat; ordinary threats may still occur',
      }));
    const routes = routeCards?.length
      ? `<div data-route-options>${routeCards.map((route) => `<article data-route-card="${route.id}"><strong>${route.id === 'foundry-direct' ? 'Direct' : 'Detour'}</strong><span>${route.distanceM} m · estimated fuel ${route.estimatedFuel}</span><span>${escapeHtml(route.hazard)}</span><button type="button" data-route="${route.id}">Select</button>${this.pendingRoute === route.id ? `<button type="button" data-route-confirm="${route.id}">Confirm route</button>` : ''}</article>`).join('')}</div>${v.routeRefusal ? `<div data-route-refusal>${escapeHtml(v.routeRefusal)}</div>` : ''}`
      : '';
    const uniqueFacts =
      v.expeditionId === 'relay-foundry'
        ? ['salvage-controller', 'tracking-servo']
            .map(
              (id) =>
                `<span data-expedition-unique="${id}">${v.recoveredUniques?.includes(id) ? `${id} recovered` : `${id} pending`}</span>`,
            )
            .join('')
        : gyro;
    this.body.innerHTML = `<div data-expedition-phase>${STORY_PHASE_LABELS[v.phase]}</div><div data-expedition-objective>${escapeHtml(v.objective)}</div><div data-expedition-strength>Signal ${Math.round(v.strength * 100)}%</div>${left}${routes}<div data-expedition-logs>${journals}</div><div data-expedition-unique-list>${uniqueFacts}</div>`;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-expedition-close]')) return this.callbacks.close();
    const route = target.closest('[data-route]')?.getAttribute('data-route') as RouteId | null;
    if (route) {
      this.pendingRoute = route;
      // The selected route is transient UI state and is not part of the
      // campaign view key. Force the confirmation control to render.
      this.renderedKey = '';
      this.render();
      return;
    }
    const confirm = target
      .closest('[data-route-confirm]')
      ?.getAttribute('data-route-confirm') as RouteId | null;
    if (confirm) {
      this.pendingRoute = null;
      this.callbacks.selectRoute?.(confirm);
    }
  };

  dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
  }
}

function viewKey(view: ExpeditionView): string {
  return JSON.stringify({
    phase: view.phase,
    objective: view.objective,
    strength: Math.round(view.strength * 100),
    remainingM: view.remainingM === null ? null : Math.max(0, Math.round(view.remainingM)),
    journalsRead: [...view.journalsRead].sort(),
    uniqueCollected: view.uniqueCollected,
    journalTexts: view.journalTexts ?? {},
    expeditionId: view.expeditionId,
    recoveredUniques: view.recoveredUniques ?? [],
    routeCards: view.routeCards ?? [],
    routeRefusal: view.routeRefusal ?? null,
  });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
