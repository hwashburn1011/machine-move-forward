import './home-life.css';

export interface KeepsakeChoice {
  id: string;
  title: string;
  text: string;
}
export type HomeLifeView =
  | {
      mode: 'shelf';
      title: string;
      choices: readonly KeepsakeChoice[];
      selectedId: string | null;
      refusal?: string;
    }
  | {
      mode: 'salvage';
      title: string;
      description: string;
      status: 'undecided' | 'secure' | 'broadcast' | 'defended';
      canBroadcast: boolean;
      refusal?: string;
      remaining: string;
    };
export interface HomeLifeCallbacks {
  close(): void;
  selectKeepsake(id: string | null): void;
  chooseSalvage(choice: 'secure' | 'broadcast'): void;
}

export class HomeLifeUI {
  private view: HomeLifeView | null = null;
  private broadcastConfirm = false;
  private viewKey = '';
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  constructor(
    parent: HTMLElement,
    private readonly callbacks: HomeLifeCallbacks,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'home-life';
    this.root.dataset.panel = 'home-life';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Aboard the Nomad');
    this.content = document.createElement('div');
    this.content.className = 'home-life-content';
    this.root.append(this.content);
    parent.append(this.root);
  }
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(view: HomeLifeView): void {
    this.view = view;
    this.broadcastConfirm = false;
    this.viewKey = '';
    this.root.hidden = false;
    this.render();
  }
  setView(view: HomeLifeView): void {
    this.view = view;
    if (this.isOpen) this.render();
  }
  close(): void {
    this.root.hidden = true;
    this.broadcastConfirm = false;
    this.viewKey = '';
  }
  dispose(): void {
    this.root.remove();
    this.view = null;
  }
  private render(): void {
    const view = this.view;
    if (!view) return;
    const key = JSON.stringify([view, this.broadcastConfirm]);
    if (key === this.viewKey) return;
    const focusKey =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? (document.activeElement.dataset.keepsakeId ?? document.activeElement.textContent)
        : null;
    this.viewKey = key;
    this.content.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = view.mode === 'shelf' ? 'Aboard the Nomad' : 'Salvage transmitter';
    this.content.append(heading);
    const title = document.createElement('h3');
    title.textContent = view.title;
    this.content.append(title);
    if (view.mode === 'shelf') this.renderShelf(view);
    else this.renderSalvage(view);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.dataset.homeLifeClose = 'true';
    close.addEventListener('click', () => {
      this.close();
      this.callbacks.close();
    });
    this.content.append(close);
    if (focusKey)
      [...this.root.querySelectorAll<HTMLElement>('button')]
        .find((button) => button.dataset.keepsakeId === focusKey || button.textContent === focusKey)
        ?.focus();
  }
  private renderShelf(view: Extract<HomeLifeView, { mode: 'shelf' }>): void {
    const list = document.createElement('div');
    list.className = 'home-life-choices';
    for (const choice of view.choices) {
      if (!choice.id) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.keepsakeId = choice.id;
      button.textContent = choice.title;
      button.title = choice.text;
      button.setAttribute('aria-pressed', String(view.selectedId === choice.id));
      button.addEventListener('click', () => this.callbacks.selectKeepsake(choice.id));
      list.append(button);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear selection';
    clear.addEventListener('click', () => this.callbacks.selectKeepsake(null));
    list.append(clear);
    this.content.append(list);
    if (view.selectedId) {
      const selected = view.choices.find((choice) => choice.id === view.selectedId);
      if (selected) {
        const record = document.createElement('article');
        record.className = 'home-life-record';
        const recordTitle = document.createElement('h4');
        recordTitle.textContent = selected.title;
        const recordText = document.createElement('p');
        recordText.textContent = selected.text;
        record.append(recordTitle, recordText);
        this.content.append(record);
      }
    }
    if (view.refusal) {
      const note = document.createElement('p');
      note.className = 'home-life-refusal';
      note.textContent = view.refusal;
      this.content.append(note);
    }
  }
  private renderSalvage(view: Extract<HomeLifeView, { mode: 'salvage' }>): void {
    const description = document.createElement('p');
    description.textContent = view.description;
    this.content.append(description);
    const remaining = document.createElement('p');
    remaining.textContent = `Supplies remaining: ${view.remaining}`;
    this.content.append(remaining);
    const status = document.createElement('p');
    status.textContent = view.refusal ?? `Status: ${view.status}`;
    this.content.append(status);
    const secure = document.createElement('button');
    secure.type = 'button';
    secure.textContent = 'Secure salvage';
    secure.disabled = view.status !== 'undecided';
    secure.addEventListener('click', () => this.callbacks.chooseSalvage('secure'));
    this.content.append(secure);
    const broadcast = document.createElement('button');
    broadcast.type = 'button';
    broadcast.textContent = this.broadcastConfirm
      ? 'Confirm broadcast patrol'
      : 'Broadcast for patrol';
    broadcast.disabled = !view.canBroadcast || view.status !== 'undecided';
    broadcast.addEventListener('click', () => {
      if (!view.canBroadcast || view.status !== 'undecided') return;
      if (!this.broadcastConfirm) {
        this.broadcastConfirm = true;
        this.render();
        return;
      }
      this.callbacks.chooseSalvage('broadcast');
    });
    this.content.append(broadcast);
  }
}
