import './loading.css';

export interface LoadingView {
  label: string;
  completed: number;
  total: number;
  fallbackCount: number;
  detail?: string;
  allowSimpler?: boolean;
}

export interface LoadingUICallbacks {
  retry: () => void;
  simpler: () => void;
}

const EMPTY_VIEW: LoadingView = { label: 'Starting', completed: 0, total: 0, fallbackCount: 0 };

/** Small presentation-only loading and failure surface. */
export class LoadingUI {
  private readonly label: HTMLElement;
  private readonly count: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly fallback: HTMLElement;
  private readonly failure: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly simplerButton: HTMLButtonElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view = EMPTY_VIEW;
  private busy = false;
  private allowSimpler = true;
  private slowElapsed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: LoadingUICallbacks,
  ) {
    root.classList.add('loading-ui');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `<div class="loading-card"><p class="loading-kicker">IRON NOMAD / SYSTEM START</p><h1>Machine Move Forward</h1><p data-loading-label></p><p data-loading-count></p><div class="loading-track" aria-hidden="true"><div data-loading-progress></div></div><p data-loading-detail></p><p data-loading-fallback></p><p class="loading-failure" data-loading-failure></p><div class="loading-actions"><button type="button" data-loading-retry>Retry</button><button type="button" data-loading-simpler>Use simpler visuals</button></div></div>`;
    this.label = root.querySelector('[data-loading-label]') as HTMLElement;
    this.count = root.querySelector('[data-loading-count]') as HTMLElement;
    this.detail = root.querySelector('[data-loading-detail]') as HTMLElement;
    this.progress = root.querySelector('[data-loading-progress]') as HTMLElement;
    this.fallback = root.querySelector('[data-loading-fallback]') as HTMLElement;
    this.failure = root.querySelector('[data-loading-failure]') as HTMLElement;
    this.retryButton = root.querySelector('[data-loading-retry]') as HTMLButtonElement;
    this.simplerButton = root.querySelector('[data-loading-simpler]') as HTMLButtonElement;
    this.retryButton.addEventListener('click', () => {
      if (this.root.hidden || !this.allowSimpler || this.busy) return;
      this.busy = true;
      this.retryButton.disabled = true;
      this.simplerButton.disabled = true;
      this.callbacks.retry();
    });
    this.simplerButton.addEventListener('click', () => {
      if (this.root.hidden || !this.allowSimpler || this.busy) return;
      this.busy = true;
      this.retryButton.disabled = true;
      this.simplerButton.disabled = true;
      this.callbacks.simpler();
    });
    this.hide();
  }

  update(view: LoadingView): void {
    this.view = view;
    if (view.allowSimpler !== undefined) this.allowSimpler = view.allowSimpler;
    this.render();
  }

  show(label?: string, allowSimpler = true): void {
    this.allowSimpler = allowSimpler;
    this.slowElapsed = false;
    if (label !== undefined) this.view = { ...EMPTY_VIEW, label, allowSimpler };
    this.root.hidden = false;
    this.busy = false;
    this.retryButton.disabled = false;
    this.simplerButton.disabled = false;
    this.failure.textContent = '';
    this.failure.hidden = true;
    this.render();
    this.startSlowTimer();
  }

  hide(): void {
    this.root.hidden = true;
    this.slowElapsed = false;
    this.clearTimer();
  }

  fail(message: string): void {
    this.root.hidden = false;
    this.clearTimer();
    this.busy = false;
    this.retryButton.disabled = false;
    this.simplerButton.disabled = false;
    this.failure.textContent = message;
    this.failure.hidden = false;
    this.retryButton.hidden = !this.allowSimpler;
    this.simplerButton.hidden = !this.allowSimpler;
  }

  dispose(): void {
    this.clearTimer();
    this.retryButton.replaceWith(this.retryButton.cloneNode(true));
    this.simplerButton.replaceWith(this.simplerButton.cloneNode(true));
    this.root.replaceChildren();
    this.root.classList.remove('loading-ui');
  }

  private render(): void {
    this.label.textContent = this.view.label;
    this.detail.textContent = this.view.detail ?? '';
    const completed = Number.isFinite(this.view.completed) ? Math.max(0, this.view.completed) : 0;
    const total = Number.isFinite(this.view.total) ? Math.max(0, this.view.total) : 0;
    this.count.textContent =
      total > 0 ? `${Math.min(completed, total)} of ${total}` : 'Preparing playable systems';
    this.progress.classList.toggle('is-indeterminate', total <= 0);
    this.progress.style.width = total > 0 ? `${Math.min(100, (completed / total) * 100)}%` : '';
    this.fallback.textContent =
      this.view.fallbackCount > 0
        ? 'Some visual details are unavailable; the game can still be played.'
        : '';
    this.fallback.hidden = this.view.fallbackCount <= 0;
    this.failure.hidden = true;
    this.retryButton.hidden = true;
    this.simplerButton.hidden = !(this.allowSimpler && this.slowElapsed && !this.busy);
  }

  private startSlowTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.slowElapsed = true;
      if (!this.root.hidden && !this.busy && this.allowSimpler) this.simplerButton.hidden = false;
    }, 15_000);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
