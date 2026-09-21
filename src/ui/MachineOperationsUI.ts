import './machine-operations.css';
import type { CaretakerPriority } from '@/companion/CaretakerWork';
import type {
  MachineDeckId,
  MachineOperationsNode,
  MachineOperationsPin,
  MachineOperationsView,
} from '@/game/MachineOperations';

export interface MachineOperationsUICallbacks {
  selectDeck(deck: MachineDeckId): void;
  pinTask(pin: MachineOperationsPin | null): void;
  setCaretakerPriority(priority: CaretakerPriority): void;
  close?(): void;
}

const priorities: readonly CaretakerPriority[] = ['auto', 'gardens', 'outputs'];

/** Accessible, callback-only presentation for the machine's three operation decks. */
export class MachineOperationsUI {
  private readonly root: HTMLElement;
  private readonly heading: HTMLHeadingElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private view: MachineOperationsView | null = null;
  private selectedDeck: MachineDeckId = 'upper';
  private disposed = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: MachineOperationsUICallbacks,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'machine-operations';
    this.root.dataset.panel = 'machine-operations';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    this.heading = document.createElement('h2');
    this.heading.id = 'machine-operations-title';
    this.heading.textContent = 'Machine operations';
    this.root.setAttribute('aria-labelledby', this.heading.id);
    this.tabs = document.createElement('div');
    this.tabs.className = 'machine-operations-tabs';
    this.tabs.setAttribute('role', 'tablist');
    this.body = document.createElement('div');
    this.body.className = 'machine-operations-body';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'machine-operations-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      this.hide();
      this.callbacks.close?.();
    });
    this.root.append(this.heading, this.tabs, this.body, close);
    this.root.addEventListener('keydown', (event) => this.onKeyDown(event));
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden && !this.disposed;
  }

  show(view: MachineOperationsView): void {
    if (this.disposed) return;
    this.root.hidden = false;
    this.setView(view);
    const first = this.root.querySelector<HTMLElement>('[role="tab"], button, select');
    first?.focus();
  }

  open(view: MachineOperationsView): void {
    this.show(view);
  }

  update(view: MachineOperationsView): void {
    if (this.disposed) return;
    this.setView(view);
  }

  hide(): void {
    this.root.hidden = true;
    this.view = null;
  }

  dispose(): void {
    this.disposed = true;
    this.root.remove();
  }

  setView(view: MachineOperationsView): void {
    const active =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? (document.activeElement.dataset.operationFocus ??
          document.activeElement.dataset.deck ??
          null)
        : null;
    this.view = view;
    if (!view.decks.some((deck) => deck.id === this.selectedDeck))
      this.selectedDeck = view.decks[0]?.id ?? 'upper';
    this.tabs.replaceChildren();
    for (const deck of view.decks) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = `machine-operations-tab-${deck.id}`;
      tab.dataset.deck = deck.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `machine-operations-deck-${deck.id}`);
      tab.setAttribute('aria-selected', String(deck.id === this.selectedDeck));
      tab.tabIndex = deck.id === this.selectedDeck ? 0 : -1;
      tab.textContent = deck.label;
      tab.addEventListener('click', () => this.chooseDeck(deck.id));
      this.tabs.append(tab);
    }
    this.body.replaceChildren();
    const deck = view.decks.find((candidate) => candidate.id === this.selectedDeck);
    const section = document.createElement('section');
    section.id = `machine-operations-deck-${this.selectedDeck}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `machine-operations-tab-${this.selectedDeck}`);
    const title = document.createElement('h3');
    title.textContent = deck?.label ?? 'Deck';
    section.append(title);
    const result = document.createElement('p');
    result.className = `machine-operations-work machine-operations-work-${view.caretakerWork.kind}`;
    result.textContent =
      view.caretakerWork.kind === 'ready'
        ? `Caretaker: ${view.caretakerWork.job.kind === 'water-garden' ? 'watering' : 'storing output'}`
        : `Caretaker: ${view.caretakerWork.reason.replaceAll('-', ' ')}`;
    section.append(result);
    const priorityLabel = document.createElement('label');
    priorityLabel.textContent = 'Work priority';
    const priority = document.createElement('select');
    priority.id = 'machine-operations-priority';
    priority.name = 'caretaker-priority';
    for (const value of priorities) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent =
        value === 'auto' ? 'Auto · water first' : value === 'gardens' ? 'Gardens' : 'Outputs';
      option.selected = value === view.caretakerPriority;
      priority.append(option);
    }
    priority.addEventListener('change', () =>
      this.callbacks.setCaretakerPriority(priority.value as CaretakerPriority),
    );
    priorityLabel.append(priority);
    section.append(priorityLabel);
    const list = document.createElement('ul');
    list.className = 'machine-operations-list';
    for (const node of deck?.nodes ?? []) list.append(this.renderNode(node, view.pinnedTask));
    if (!list.children.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No operations recorded on this deck.';
      list.append(empty);
    }
    section.append(list);
    this.body.append(section);
    if (active)
      this.root
        .querySelector<HTMLElement>(
          `[data-operation-focus="${CSS.escape(active)}"], [data-deck="${CSS.escape(active)}"]`,
        )
        ?.focus();
  }

  private renderNode(
    node: MachineOperationsNode,
    pinned: MachineOperationsPin | null,
  ): HTMLElement {
    const item = document.createElement('li');
    item.className = `machine-operations-node machine-operations-node-${node.kind}`;
    const name = document.createElement('strong');
    name.textContent = node.label;
    item.append(name);
    const detail = document.createElement('span');
    detail.textContent =
      node.detail ?? `${Math.round(node.x * 100)}%, ${Math.round(node.z * 100)}%`;
    item.append(detail);
    if (node.pin) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.dataset.operationFocus = node.id;
      const active = pinned?.kind === node.pin.kind && pinned.id === node.pin.id;
      pin.textContent = active ? 'Unpin task' : 'Pin task';
      pin.setAttribute('aria-pressed', String(active));
      pin.addEventListener('click', () => this.callbacks.pinTask(active ? null : node.pin!));
      item.append(pin);
    }
    return item;
  }

  private chooseDeck(deck: MachineDeckId): void {
    this.selectedDeck = deck;
    this.callbacks.selectDeck(deck);
    if (this.view) this.setView(this.view);
    this.root.querySelector<HTMLElement>(`[data-deck="${deck}"]`)?.focus();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
      this.callbacks.close?.();
      return;
    }
    if (
      event.target instanceof HTMLButtonElement &&
      event.target.getAttribute('role') === 'tab' &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      const ids = [...this.root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map(
        (button) => button.dataset.deck as MachineDeckId,
      );
      const current = Math.max(0, ids.indexOf(this.selectedDeck));
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? ids.length - 1
            : (current + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
      event.preventDefault();
      if (ids[next]) this.chooseDeck(ids[next]!);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
