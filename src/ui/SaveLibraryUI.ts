import './save-library.css';
import type { CampaignProfile } from '@/game/CampaignProfile';

/** The small, display-only record supplied by SaveManager. */
export interface SaveLibraryEntry {
  slot: string;
  name: string;
  savedAt: number;
  seed: string;
  profile: CampaignProfile;
  distanceTraveled: number;
  chapterLabel: string;
  system: boolean;
}

export interface SaveLibraryView {
  entries: readonly SaveLibraryEntry[];
  canSnapshot: boolean;
  canLoad: boolean;
  snapshotReason?: string | null;
}

export interface SaveLibraryCallbacks {
  load: (slot: string) => unknown | Promise<unknown>;
  snapshot: (name: string) => unknown | Promise<unknown>;
  export: (slot: string) => unknown | Promise<unknown>;
  requestImport: () => unknown | Promise<unknown>;
  delete: (slot: string) => unknown | Promise<unknown>;
  close: () => void;
}

/** Presentation-only campaign library. Storage, file handling, and game state stay with the caller. */
export class SaveLibraryUI {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly nameInput: HTMLInputElement;
  private readonly snapshotButton: HTMLButtonElement;
  private readonly importButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly status: HTMLDivElement;
  private readonly rows: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private entries: readonly SaveLibraryEntry[] = [];
  private canSnapshot = false;
  private canLoad = false;
  private snapshotReason = '';
  private pendingDelete: SaveLibraryEntry | null = null;
  private externallyBusy = false;
  private actionBusy = false;
  private disposed = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: SaveLibraryCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'save-library';
    this.root.dataset.panel = 'save-library';
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'save-library-title');

    const header = document.createElement('header');
    header.className = 'save-library-header';
    const headingGroup = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'save-library-kicker';
    kicker.textContent = 'IRON NOMAD / CAMPAIGN LIBRARY';
    this.title = document.createElement('h2');
    this.title.id = 'save-library-title';
    this.title.textContent = 'Campaign library';
    headingGroup.append(kicker, this.title);
    this.closeButton = this.button('Close', 'save-library-close');
    this.closeButton.dataset.saveLibraryClose = '';
    this.closeButton.dataset.saveClose = '';
    this.closeButton.setAttribute('aria-label', 'Close campaign library');
    header.append(headingGroup, this.closeButton);

    const content = document.createElement('div');
    content.className = 'save-library-content';
    const workshop = document.createElement('section');
    workshop.className = 'save-library-workshop';
    const workshopHeading = document.createElement('h3');
    workshopHeading.textContent = 'Save snapshot';
    this.form = document.createElement('form');
    this.form.className = 'save-library-form';
    this.form.noValidate = true;
    const label = document.createElement('label');
    label.htmlFor = 'save-library-name';
    label.textContent = 'Snapshot name';
    this.nameInput = document.createElement('input');
    this.nameInput.id = 'save-library-name';
    this.nameInput.name = 'snapshotName';
    this.nameInput.type = 'text';
    this.nameInput.autocomplete = 'off';
    this.nameInput.maxLength = 80;
    this.nameInput.placeholder = 'Name this run';
    this.nameInput.setAttribute('aria-describedby', 'save-library-reason');
    this.snapshotButton = this.button('Save Snapshot', 'save-library-snapshot');
    this.snapshotButton.type = 'submit';
    this.snapshotButton.dataset.saveSnapshot = '';
    this.importButton = this.button('Import JSON', 'save-library-import');
    this.importButton.dataset.saveImport = '';
    this.form.append(label, this.nameInput, this.snapshotButton, this.importButton);
    workshop.append(workshopHeading, this.form);

    this.status = document.createElement('div');
    this.status.id = 'save-library-status';
    this.status.className = 'save-library-status';
    this.status.hidden = true;
    this.status.setAttribute('aria-live', 'polite');

    const listSection = document.createElement('section');
    listSection.className = 'save-library-list-section';
    const listHeading = document.createElement('h3');
    listHeading.textContent = 'Stored campaigns';
    this.rows = document.createElement('div');
    this.rows.className = 'save-library-rows';
    this.rows.dataset.saveRows = '';
    this.rows.setAttribute('aria-label', 'Stored campaigns');
    listSection.append(listHeading, this.rows);
    content.append(workshop, this.status, listSection);
    this.root.append(header, content);
    parent.appendChild(this.root);

    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('keydown', this.onKeyDown);
    this.form.addEventListener('submit', this.onSubmit);
    this.nameInput.addEventListener('input', this.onNameInput);
    this.refreshControls();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: SaveLibraryView): void {
    if (this.disposed) return;
    this.entries = [...view.entries];
    this.canSnapshot = view.canSnapshot;
    this.canLoad = view.canLoad;
    this.snapshotReason = view.snapshotReason?.trim() ?? '';
    this.pendingDelete = null;
    this.root.hidden = false;
    this.renderRows();
    this.refreshControls();
    const focusTarget = this.canSnapshot && !this.effectiveBusy ? this.nameInput : this.closeButton;
    focusTarget.focus();
  }

  updateRows(entries: readonly SaveLibraryEntry[]): void {
    if (this.disposed) return;
    this.entries = [...entries];
    if (
      this.pendingDelete &&
      !this.entries.some((entry) => entry.slot === this.pendingDelete?.slot)
    )
      this.pendingDelete = null;
    if (this.isOpen) this.renderRows();
  }

  setBusy(busy: boolean): void {
    if (this.disposed) return;
    this.externallyBusy = busy;
    this.refreshControls();
  }

  showStatus(text: string, error = false): void {
    if (this.disposed) return;
    this.status.textContent = text;
    this.status.hidden = text.length === 0;
    this.status.classList.toggle('is-error', error && text.length > 0);
    this.status.setAttribute('role', error && text.length > 0 ? 'alert' : 'status');
  }

  hide(): void {
    if (this.disposed) return;
    this.pendingDelete = null;
    this.root.hidden = true;
    this.renderRows();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.form.removeEventListener('submit', this.onSubmit);
    this.nameInput.removeEventListener('input', this.onNameInput);
    this.root.remove();
  }

  private get effectiveBusy(): boolean {
    return this.externallyBusy || this.actionBusy;
  }

  private button(label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  private readonly onNameInput = (): void => {
    this.refreshControls();
  };

  private readonly onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    this.submitSnapshot();
  };

  private submitSnapshot(): void {
    if (!this.isOpen || this.effectiveBusy || !this.canSnapshot) return;
    const name = this.nameInput.value.trim();
    if (!name) {
      this.refreshControls();
      this.nameInput.focus();
      return;
    }
    this.runAction(() => this.callbacks.snapshot(name));
  }

  private readonly onClick = (event: MouseEvent): void => {
    if (this.disposed || !this.isOpen) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-save-library-close], .save-library-close')) {
      this.close();
      return;
    }
    if (this.effectiveBusy) return;
    if (target.closest('[data-save-snapshot]')) {
      event.preventDefault();
      this.submitSnapshot();
      return;
    }
    if (target.closest('[data-save-import], .save-library-import')) {
      this.runAction(() => this.callbacks.requestImport());
      return;
    }
    const load = target.closest<HTMLElement>('[data-save-load]')?.dataset.saveLoad;
    if (load) {
      if (this.canLoad) this.runAction(() => this.callbacks.load(load));
      return;
    }
    const exportSlot = target.closest<HTMLElement>('[data-save-export]')?.dataset.saveExport;
    if (exportSlot) {
      this.runAction(() => this.callbacks.export(exportSlot));
      return;
    }
    const deleteSlot = target.closest<HTMLElement>('[data-save-delete]')?.dataset.saveDelete;
    if (deleteSlot) {
      const entry = this.entries.find((candidate) => candidate.slot === deleteSlot);
      if (entry && !entry.system) {
        this.pendingDelete = entry;
        this.renderRows();
        this.rows.querySelector<HTMLButtonElement>('[data-save-delete-cancel]')?.focus();
      }
      return;
    }
    const confirmTarget = target.closest<HTMLElement>(
      '[data-save-delete-confirm], [data-save-confirm-delete]',
    );
    const confirmSlot =
      confirmTarget?.dataset.saveDeleteConfirm ?? confirmTarget?.dataset.saveConfirmDelete;
    if (confirmSlot) {
      const entry = this.pendingDelete;
      if (entry && entry.slot === confirmSlot && !entry.system)
        this.runAction(() => {
          this.pendingDelete = null;
          this.renderRows();
          return this.callbacks.delete(confirmSlot);
        });
      return;
    }
    if (target.closest('[data-save-delete-cancel], [data-save-cancel-delete]')) {
      this.pendingDelete = null;
      this.renderRows();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || !this.isOpen) return;
    if (event.key === 'Tab') {
      if (!this.effectiveBusy) this.trapFocus(event);
      return;
    }
    if (event.key !== 'Escape') return;
    if (this.effectiveBusy) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.pendingDelete) {
      this.pendingDelete = null;
      this.renderRows();
      this.rows.querySelector<HTMLButtonElement>('[data-save-delete]')?.focus();
      return;
    }
    this.close();
  };

  private trapFocus(event: KeyboardEvent): void {
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      this.root.focus();
      return;
    }
    const current = document.activeElement;
    const index = focusable.indexOf(current as HTMLElement);
    const next = event.shiftKey
      ? index <= 0
        ? focusable[focusable.length - 1]
        : focusable[index - 1]
      : index < 0 || index === focusable.length - 1
        ? focusable[0]
        : focusable[index + 1];
    event.preventDefault();
    next?.focus();
  }

  private close(): void {
    if (!this.isOpen || this.effectiveBusy) return;
    this.hide();
    this.callbacks.close();
  }

  private runAction(action: () => unknown | Promise<unknown>): void {
    if (this.effectiveBusy || !this.isOpen || this.disposed) return;
    this.actionBusy = true;
    this.refreshControls();
    let result: unknown;
    try {
      result = action();
    } catch {
      this.actionBusy = false;
      this.showStatus('That campaign action failed. The library is still available.', true);
      this.refreshControls();
      return;
    }
    if (!result || typeof (result as Promise<unknown>).then !== 'function') {
      this.actionBusy = false;
      this.refreshControls();
      return;
    }
    Promise.resolve(result)
      .catch(() => {
        if (!this.disposed)
          this.showStatus('That campaign action failed. The library is still available.', true);
      })
      .finally(() => {
        if (!this.disposed) {
          this.actionBusy = false;
          this.refreshControls();
        }
      });
  }

  private renderRows(): void {
    this.rows.replaceChildren();
    if (!this.entries.length) {
      const empty = document.createElement('p');
      empty.className = 'save-library-empty';
      empty.textContent = 'No campaigns have been stored yet.';
      this.rows.append(empty);
      this.refreshControls();
      return;
    }
    for (const entry of this.entries) this.rows.append(this.renderRow(entry));
    this.refreshControls();
  }

  private renderRow(entry: SaveLibraryEntry): HTMLElement {
    const row = document.createElement('article');
    row.className = `save-library-row${entry.system ? ' is-system' : ''}`;
    row.dataset.saveSlot = entry.slot;
    row.dataset.slot = entry.slot;
    const heading = document.createElement('div');
    heading.className = 'save-library-row-heading';
    const name = document.createElement('h4');
    name.textContent = entry.name || (entry.system ? 'System save' : 'Unnamed snapshot');
    heading.append(name);
    if (entry.system) {
      const badge = document.createElement('span');
      badge.className = 'save-library-system-badge';
      badge.textContent = 'System save';
      heading.append(badge);
    }
    const metadata = document.createElement('dl');
    metadata.className = 'save-library-metadata';
    this.metadata(metadata, 'Chapter', entry.chapterLabel || 'Unknown');
    this.metadata(metadata, 'Saved', formatSavedAt(entry.savedAt));
    this.metadata(metadata, 'Distance', `${formatDistance(entry.distanceTraveled)} m`);
    this.metadata(metadata, 'Profile', formatProfile(entry.profile));
    const actions = document.createElement('div');
    actions.className = 'save-library-row-actions';
    const load = this.button('Load', 'save-library-load');
    load.dataset.saveLoad = entry.slot;
    load.setAttribute('aria-label', `Load ${entry.name || 'campaign'}`);
    const exportButton = this.button('Export', 'save-library-export');
    exportButton.dataset.saveExport = entry.slot;
    exportButton.setAttribute('aria-label', `Export ${entry.name || 'campaign'}`);
    actions.append(load, exportButton);
    if (!entry.system) {
      const deleteButton = this.button('Delete', 'save-library-delete');
      deleteButton.dataset.saveDelete = entry.slot;
      deleteButton.setAttribute('aria-label', `Delete ${entry.name || 'snapshot'}`);
      actions.append(deleteButton);
    }
    row.append(heading, metadata, actions);
    if (this.pendingDelete?.slot === entry.slot) row.append(this.renderDeleteConfirmation(entry));
    return row;
  }

  private metadata(list: HTMLDListElement, label: string, value: string): void {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }

  private renderDeleteConfirmation(entry: SaveLibraryEntry): HTMLElement {
    const confirmation = document.createElement('div');
    confirmation.className = 'save-library-delete-confirmation';
    confirmation.dataset.saveDeletePrompt = entry.slot;
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-label', `Confirm deletion of ${entry.name}`);
    const message = document.createElement('p');
    message.textContent = `Delete snapshot “${entry.name}”? This cannot be undone.`;
    const confirm = this.button('Delete snapshot', 'save-library-delete-confirm');
    confirm.dataset.saveDeleteConfirm = entry.slot;
    confirm.dataset.saveConfirmDelete = entry.slot;
    const cancel = this.button('Cancel', 'save-library-delete-cancel');
    cancel.dataset.saveDeleteCancel = '';
    cancel.dataset.saveCancelDelete = '';
    confirmation.append(message, confirm, cancel);
    return confirmation;
  }

  private refreshControls(): void {
    const busy = this.effectiveBusy;
    this.snapshotButton.disabled = busy || !this.canSnapshot || !this.nameInput.value.trim();
    this.importButton.disabled = busy;
    this.closeButton.disabled = busy;
    this.nameInput.disabled = busy || !this.canSnapshot;
    const reason = this.snapshotReason;
    this.nameInput.setAttribute(
      'aria-describedby',
      reason ? 'save-library-reason' : 'save-library-status',
    );
    let reasonElement = this.root.querySelector<HTMLDivElement>('#save-library-reason');
    if (reason) {
      if (!reasonElement) {
        reasonElement = document.createElement('div');
        reasonElement.id = 'save-library-reason';
        reasonElement.className = 'save-library-reason';
        this.nameInput.insertAdjacentElement('afterend', reasonElement);
      }
      reasonElement.textContent = reason;
      reasonElement.hidden = false;
    } else if (reasonElement) {
      reasonElement.hidden = true;
    }
    for (const button of this.rows.querySelectorAll<HTMLButtonElement>(
      '[data-save-load], [data-save-export], [data-save-delete], [data-save-delete-confirm], [data-save-delete-cancel]',
    )) {
      button.disabled = busy || (button.dataset.saveLoad !== undefined && !this.canLoad);
    }
  }
}

function formatSavedAt(savedAt: number): string {
  if (!Number.isFinite(savedAt) || savedAt < 0) return 'Unknown time';
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDistance(distance: number): string {
  return Number.isFinite(distance) ? Math.max(0, Math.round(distance)).toLocaleString() : '—';
}

function formatProfile(_profile: CampaignProfile): string {
  return 'Story';
}
