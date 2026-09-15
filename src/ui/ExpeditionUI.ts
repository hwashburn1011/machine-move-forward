import type { StoryPhase } from '@/story/StoryDirector';
import type { ExpeditionId } from '@/data/story';
import { WRECK_ONE, storyExpedition } from '@/data/story';
import { routeDefinition, type RouteId } from '@/data/routes';

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
  expeditionId?: ExpeditionId;
  recoveredUniques?: readonly string[];
  routeCards?: readonly { id: RouteId; distanceM: number; estimatedFuel: number; hazard: string }[];
  routeRefusal?: string | null;
  extraJournals?: readonly { id: string; title: string; text: string }[];
  availableJournalIds?: readonly string[];
  completedObjectives?: readonly string[];
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
    const expedition = storyExpedition(v.expeditionId ?? 'wreck-one') ?? WRECK_ONE;
    const key = viewKey(v);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const offeredRoutes = v.routeCards?.map((route) => route.id) ?? v.routes ?? [];
    if (this.pendingRoute && !offeredRoutes.includes(this.pendingRoute)) this.pendingRoute = null;
    const left =
      v.remainingM === null
        ? ''
        : `<div data-expedition-distance>${Math.max(0, Math.round(v.remainingM))} m remaining</div>`;
    const journals =
      expedition.journals
        .map((journal) => {
          const read = v.journalsRead.includes(journal.id);
          const available = !v.availableJournalIds || v.availableJournalIds.includes(journal.id);
          const status = read
            ? `<p>${escapeHtml(v.journalTexts?.[journal.id] ?? journal.text)}</p>`
            : available
              ? '<span>Interact at the log to read</span>'
              : '<span>Unavailable on this route</span>';
          return `<article data-journal-id="${escapeHtml(journal.id)}" class="expedition-log${read ? ' is-read' : ''}"><strong>${escapeHtml(journal.title)}</strong>${status}</article>`;
        })
        .join('') +
      (v.extraJournals ?? [])
        .map(
          (j) =>
            `<article data-journal-id="${escapeHtml(j.id)}" class="expedition-log is-read"><strong>${escapeHtml(j.title)}</strong><p>${escapeHtml(j.text)}</p></article>`,
        )
        .join('');
    const routeCards =
      v.routeCards ??
      v.routes?.map((id) => ({
        id,
        distanceM: routeDefinition(id)?.distanceM ?? 0,
        estimatedFuel: 0,
        hazard: routeDefinition(id)?.scriptedVehicle
          ? `One scripted ${routeDefinition(id)?.scriptedVehicle}`
          : 'No scripted gunboat; ordinary threats may still occur',
      }));
    const routes = routeCards?.length
      ? `<div data-route-options>${routeCards.map((route) => `<article data-route-card="${route.id}"><strong>${routeLabel(route.id)}</strong><span>${route.distanceM} m · estimated fuel ${route.estimatedFuel}</span><span>${escapeHtml(formatHazard(route.hazard))}</span><button type="button" data-route="${route.id}">Select</button>${this.pendingRoute === route.id ? `<button type="button" data-route-confirm="${route.id}">Confirm route</button>` : ''}</article>`).join('')}</div>${v.routeRefusal ? `<div data-route-refusal>${escapeHtml(v.routeRefusal)}</div>` : ''}`
      : '';
    const uniqueFacts = expedition.requiredUniques
      .map(
        (id) =>
          `<span data-expedition-unique="${id}">${friendlyFact(id)}: ${v.recoveredUniques?.includes(id) ? 'recovered' : 'pending'}</span>`,
      )
      .join('');
    const objectives = (expedition.requiredObjectives ?? [])
      .map(
        (id) =>
          `<span data-expedition-objective-id="${id}">${friendlyObjective(id)}: ${v.completedObjectives?.includes(id) ? 'complete' : 'pending'}</span>`,
      )
      .join('');
    this.body.innerHTML = `<div data-expedition-phase>${escapeHtml(STORY_PHASE_LABELS[v.phase] ?? expedition.title)}</div><div data-expedition-objective>${escapeHtml(v.objective || expedition.objective)}</div><div data-expedition-strength>Signal ${Math.round(v.strength * 100)}%</div>${left}${routes}<div data-expedition-logs>${journals}</div><div data-expedition-unique-list>${uniqueFacts}${objectives}</div>`;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-expedition-close]')) return this.callbacks.close();
    const route = target.closest('[data-route]')?.getAttribute('data-route') as RouteId | null;
    const offered = route
      ? (this.view.routeCards?.some((card) => card.id === route) ??
        this.view.routes?.includes(route) ??
        false)
      : false;
    if (route && offered) {
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
    const stillOffered =
      confirm &&
      (this.view.routeCards?.some((card) => card.id === confirm) ??
        this.view.routes?.includes(confirm) ??
        false);
    if (confirm && stillOffered) {
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
    routes: view.routes ?? [],
    routeCards: view.routeCards ?? [],
    routeRefusal: view.routeRefusal ?? null,
    extraJournals: view.extraJournals ?? [],
    availableJournalIds: view.availableJournalIds ?? [],
    completedObjectives: view.completedObjectives ?? [],
  });
}

function routeLabel(id: RouteId): string {
  return (
    {
      'foundry-direct': 'Direct',
      'foundry-detour': 'Detour',
      'orchard-caretaker': 'Caretaker Approach',
      'orchard-cold-vault': 'Cold Vault',
    } satisfies Record<RouteId, string>
  )[id];
}

function friendlyFact(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function friendlyObjective(id: string): string {
  return id
    .replace(/-isolator$/, ' isolator')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatHazard(hazard: string): string {
  return hazard
    .replace(/^One scripted /, 'Encounter: ')
    .replace(/^No scripted gunboat; /, 'No marked gunboat; ');
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
