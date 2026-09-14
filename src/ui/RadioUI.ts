import type { EventBus } from '@/core/events/EventBus';

export interface RadioView {
  found: boolean;
  powered: boolean;
  signalText: string;
  strength: number;
  remainingM: number | null;
  nextSignal: boolean;
  canDepart?: boolean;
  traceOffer?: boolean;
  traceReady?: boolean;
  traceDisabledReason?: string;
  chapterComplete?: boolean;
  recoveredSupplies?: string;
}

export interface RadioUICallbacks {
  close: () => void;
  openResearch?: () => void;
  depart?: () => void;
  beginTrace?: () => void;
  collectRecovered?: () => void;
}

/** Functional radio panel. Appearance belongs to the application stylesheet. */
export class RadioUI {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly strength: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly distance: HTMLDivElement;
  private readonly nextSignal: HTMLDivElement;
  private readonly researchButton: HTMLButtonElement;
  private readonly departButton: HTMLButtonElement;
  private readonly traceButton: HTMLButtonElement;
  private readonly disposers: (() => void)[] = [];
  private view: RadioView = {
    found: false,
    powered: false,
    signalText: 'No signal decoded.',
    strength: 0,
    remainingM: null,
    nextSignal: false,
  };

  constructor(
    parent: HTMLElement,
    private readonly callbacks: RadioUICallbacks,
    bus?: EventBus,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'radio-panel';
    this.root.dataset.panel = 'radio';
    this.root.hidden = true;
    this.root.innerHTML =
      '<div class="radio-panel-content"><div class="radio-panel-title">Recovered Radio</div><div data-radio-status></div><div data-radio-strength></div><div data-radio-message></div><div data-radio-distance hidden></div><div data-radio-next hidden>Another signal waits beyond the route.</div><div data-radio-trace hidden></div><div data-radio-recovered hidden></div><div class="radio-panel-actions"><button type="button" data-radio-research hidden>Research</button><button type="button" data-radio-trace-button hidden>Trace Wreck One</button><button type="button" data-radio-collect hidden>Collect recovered supplies</button><button type="button" data-radio-depart hidden>Depart</button><button type="button" data-radio-close>Close</button></div></div>';
    parent.appendChild(this.root);
    this.content = this.root.firstElementChild as HTMLDivElement;
    this.status = this.content.querySelector('[data-radio-status]') as HTMLDivElement;
    this.strength = this.content.querySelector('[data-radio-strength]') as HTMLDivElement;
    this.message = this.content.querySelector('[data-radio-message]') as HTMLDivElement;
    this.distance = this.content.querySelector('[data-radio-distance]') as HTMLDivElement;
    this.nextSignal = this.content.querySelector('[data-radio-next]') as HTMLDivElement;
    this.researchButton = this.content.querySelector('[data-radio-research]') as HTMLButtonElement;
    this.departButton = this.content.querySelector('[data-radio-depart]') as HTMLButtonElement;
    this.traceButton = this.content.querySelector('[data-radio-trace-button]') as HTMLButtonElement;
    this.root.addEventListener('click', this.onClick);
    if (bus) {
      this.disposers.push(
        bus.on('radio:found', () => this.setView({ found: true })),
        bus.on('radio:power', (e) => this.setView({ powered: e.powered })),
        bus.on('story:signal', (e) =>
          this.setView({ signalText: e.text, strength: e.strength, remainingM: e.remainingM }),
        ),
        bus.on('story:next-signal', () => this.setView({ nextSignal: true })),
      );
    }
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setView(partial: Partial<RadioView>): void {
    this.view = { ...this.view, ...partial };
    if (!this.isOpen) return;
    this.render();
  }

  open(view?: Partial<RadioView>): void {
    if (view) this.view = { ...this.view, ...view };
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const v = this.view;
    const status = !v.found
      ? 'Radio not recovered'
      : v.powered
        ? 'Signal decoded'
        : 'Static — radio has no power';
    this.status.textContent = status;
    this.strength.textContent = `Signal ${Math.round(Math.max(0, Math.min(1, v.strength)) * 100)}%`;
    this.message.textContent = v.signalText;
    this.distance.textContent =
      v.remainingM === null ? '' : `${Math.max(0, Math.round(v.remainingM))} m remaining`;
    this.distance.hidden = v.remainingM === null;
    this.nextSignal.hidden = !v.nextSignal;
    this.researchButton.hidden = !(this.callbacks.openResearch && v.found);
    this.departButton.hidden = !(this.callbacks.depart && v.canDepart);
    this.traceButton.hidden = !(this.callbacks.beginTrace && v.traceOffer);
    this.traceButton.disabled = !!v.traceDisabledReason || v.traceReady === false;
    this.traceButton.title = v.traceDisabledReason ?? 'Begin the optional Wreck One trace';
    const recovered = this.content.querySelector('[data-radio-recovered]') as HTMLDivElement;
    const collect = this.content.querySelector('[data-radio-collect]') as HTMLButtonElement;
    const hasRecovered = !!v.recoveredSupplies;
    recovered.hidden = !hasRecovered;
    recovered.textContent = hasRecovered ? `Recovered supplies: ${v.recoveredSupplies}` : '';
    collect.hidden = !(hasRecovered && this.callbacks.collectRecovered);
    const trace = this.content.querySelector('[data-radio-trace]') as HTMLElement;
    trace.hidden = !v.traceOffer && !v.chapterComplete;
    trace.textContent = v.chapterComplete
      ? 'First chapter complete — automate, fortify and survive.'
      : v.traceOffer
        ? `Optional trace: recover a Course Gyro to bring the Navigation Helm online.${v.traceDisabledReason ? ` ${v.traceDisabledReason}` : ''}`
        : '';
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-radio-close]')) this.callbacks.close();
    else if (target.closest('[data-radio-research]')) this.callbacks.openResearch?.();
    else if (target.closest('[data-radio-depart]')) this.callbacks.depart?.();
    else if (target.closest('[data-radio-trace-button]') && !this.traceButton.disabled)
      this.callbacks.beginTrace?.();
    else if (target.closest('[data-radio-collect]')) this.callbacks.collectRecovered?.();
  };

  dispose(): void {
    this.root.removeEventListener('click', this.onClick);
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.root.remove();
  }
}
