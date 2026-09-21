import './terminal.css';
import { ITEMS } from '@/data/items';
import { attachmentsForWeapon, WEAPON_ATTACHMENTS } from '@/data/weapon-loadouts';
import type { FieldworkView } from '@/ui/FieldworkUI';
import {
  terminalViewSignature,
  type TerminalBuildView,
  type TerminalCommand,
  type TerminalOutputDestinationView,
  type TerminalTab,
  type TerminalView,
} from '@/game/TerminalView';

export interface TerminalUICallbacks {
  dispatch: (command: TerminalCommand) => void;
}

export interface TerminalAccessibility {
  readonly textScale: number;
  readonly reducedMotion: boolean;
}

const tabs: readonly { id: TerminalTab; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'character', label: 'Character' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'machine', label: 'Machine' },
  { id: 'signal', label: 'Signal' },
  { id: 'build', label: 'Build' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const node = el('button', label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', action);
  return node;
}

function labelled(text: string, value: string): HTMLElement {
  const row = el('div');
  row.className = 'terminal-stat';
  row.append(el('span', text), el('strong', value));
  return row;
}

/** Callback-only wrist terminal. It owns DOM and focus, never game state. */
export class TerminalUI {
  readonly root: HTMLElement;
  private readonly callbacks: TerminalUICallbacks;
  private readonly tabList: HTMLElement;
  private readonly content: HTMLElement;
  private readonly title: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private view: TerminalView | null = null;
  private lastSignature = '';
  private focusKey: string | null = null;
  private buildQuery = '';
  private _isOpen = false;

  constructor(parent: HTMLElement, callbacks: TerminalUICallbacks) {
    this.callbacks = callbacks;
    this.root = el('section');
    this.root.className = 'terminal-ui';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'terminal-title');
    this.root.hidden = true;

    const header = el('header');
    this.title = el('h2', 'Onboard Terminal');
    this.title.id = 'terminal-title';
    const eyebrow = el('p', 'CAMPAIGN SYSTEMS / REMOTE OPERATIONS');
    eyebrow.className = 'terminal-eyebrow';
    this.closeButton = button('Close terminal', () => this.callbacks.dispatch({ kind: 'close' }));
    this.closeButton.className = 'terminal-close';
    header.append(eyebrow, this.title, this.closeButton);

    this.tabList = el('nav');
    this.tabList.className = 'terminal-tabs';
    this.tabList.setAttribute('role', 'tablist');
    this.tabList.addEventListener('keydown', (event) => this.onTabKey(event));

    this.content = el('main');
    this.content.className = 'terminal-content';
    const footer = el('footer', 'ESC Close  ·  TAB Move  ·  ←/→ Switch sections');
    footer.className = 'terminal-footer';
    this.root.append(header, this.tabList, this.content, footer);
    parent.append(this.root);
    this.root.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  setAccessibility(accessibility: TerminalAccessibility): void {
    const scale = Number.isFinite(accessibility.textScale)
      ? Math.max(1, Math.min(1.4, accessibility.textScale))
      : 1;
    this.root.style.setProperty('--terminal-text-scale', String(scale));
    this.root.dataset.reducedMotion = String(accessibility.reducedMotion === true);
  }

  show(view: TerminalView): void {
    this._isOpen = true;
    this.root.hidden = false;
    this.update(view);
    this.focusFirst();
  }

  update(view: TerminalView): void {
    this.view = view;
    this.closeButton.disabled = view.busy === true;
    this.title.textContent = view.paused ? 'Onboard Terminal · PAUSED' : 'Onboard Terminal';
    const signature = terminalViewSignature(view);
    if (signature === this.lastSignature && this.content.childElementCount > 0) return;
    this.lastSignature = signature;
    this.renderTabs(view.activeTab, view.busy === true);
    const oldFocus = this.focusKey ?? this.focusedKey();
    this.focusKey = oldFocus;
    this.content.replaceChildren(this.renderPage(view));
    this.restoreFocus();
  }

  hide(): void {
    this._isOpen = false;
    this.root.hidden = true;
    this.content.replaceChildren();
    this.lastSignature = '';
    this.view = null;
    this.focusKey = null;
    this.buildQuery = '';
  }

  dispose(): void {
    this.root.remove();
    this._isOpen = false;
    this.view = null;
  }

  private renderTabs(active: TerminalTab, busy: boolean): void {
    this.tabList.replaceChildren(
      ...tabs.map((tab, index) => {
        const node = button(
          tab.label,
          () => this.callbacks.dispatch({ kind: 'select-tab', tab: tab.id }),
          busy,
        );
        node.className = 'terminal-tab';
        node.id = `terminal-tab-${tab.id}`;
        node.dataset.tab = tab.id;
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-selected', String(tab.id === active));
        node.setAttribute('aria-controls', 'terminal-page');
        node.tabIndex = tab.id === active ? 0 : -1;
        node.dataset.focusKey = `tab:${tab.id}`;
        if (index === 0) node.setAttribute('aria-label', `${tab.label} tab`);
        return node;
      }),
    );
  }

  private renderPage(view: TerminalView): HTMLElement {
    const page = el('div');
    page.id = 'terminal-page';
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', `terminal-tab-${view.activeTab}`);
    switch (view.activeTab) {
      case 'inventory':
        page.append(this.renderInventory(view));
        break;
      case 'character':
        page.append(this.renderCharacter(view));
        break;
      case 'workshop':
        page.append(this.renderWorkshop(view));
        break;
      case 'machine':
        page.append(this.renderMachine(view));
        break;
      case 'signal':
        page.append(this.renderSignal(view));
        break;
      case 'build':
        page.append(this.renderBuild(view.build, view.busy === true));
        break;
    }
    return page;
  }

  private renderInventory(view: TerminalView): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page-grid';
    const intro = el('div');
    intro.append(
      el('p', 'Owned containers connected to the machine network.'),
      labelled(
        'Access',
        view.inventory.canManage ? 'Available aboard' : (view.inventory.refusal ?? 'Unavailable'),
      ),
    );
    intro.append(
      button(
        'Eat carried ration',
        () => this.callbacks.dispatch({ kind: 'eat' }),
        !view.inventory.canEat || view.busy === true,
      ),
    );
    intro.append(
      button(
        'Drink carried water',
        () => this.callbacks.dispatch({ kind: 'drink' }),
        !view.inventory.canDrink || view.busy === true,
      ),
    );
    const storage = el('div');
    storage.className = 'terminal-storage-list';
    const entries = [view.inventory.carried, ...view.inventory.storage];
    for (const entry of entries) {
      const card = el('article');
      card.className = `terminal-storage${entry.selected ? ' is-selected' : ''}`;
      const heading = el('h3', entry.label);
      card.append(
        heading,
        el(
          'p',
          `${entry.kind === 'crate' ? 'Owned storage' : entry.kind === 'collector' ? 'Collector buffer' : 'Carried inventory'} · ${entry.online ? 'online' : 'offline'}`,
        ),
      );
      const slots = el('div');
      slots.className = 'terminal-slots';
      entry.slots.forEach((slot) => {
        const name = slot.itemId ? `${slot.label} ×${slot.count}` : 'Empty slot';
        const cell = el('div');
        cell.className = 'terminal-slot-cell';
        const node = button(
          name,
          () =>
            this.callbacks.dispatch({
              kind: 'transfer',
              sourceId: entry.id,
              destinationId:
                entry.id === 'carried'
                  ? (view.inventory.storage.find((item) => item.selected)?.id ?? '')
                  : 'carried',
              slot: slot.slot,
            }),
          !entry.transferEnabled || !slot.itemId,
        );
        node.className = 'terminal-slot';
        node.dataset.focusKey = `slot:${entry.id}:${slot.slot}`;
        node.setAttribute('aria-label', name);
        cell.append(node);
        if (entry.id === 'carried' && slot.itemId && slot.usable) {
          const use = button(
            'Use',
            () => this.callbacks.dispatch({ kind: 'use-item', slot: slot.slot }),
            !slot.usable || view.busy === true,
          );
          use.className = 'terminal-slot-use';
          use.dataset.focusKey = `use:${slot.slot}`;
          cell.append(use);
        }
        slots.append(cell);
      });
      card.append(slots);
      if (entry.id !== 'carried') {
        const actions = el('div');
        actions.className = 'terminal-list';
        actions.append(
          button(
            'Take all',
            () => this.callbacks.dispatch({ kind: 'take-all', sourceId: entry.id }),
            !entry.online || !entry.canTakeAll || view.busy === true,
          ),
          button(
            'Deposit matching',
            () => this.callbacks.dispatch({ kind: 'deposit-matching', sourceId: entry.id }),
            !entry.online || !entry.canDeposit || view.busy === true,
          ),
          button(
            'Sort storage',
            () => this.callbacks.dispatch({ kind: 'sort-storage', sourceId: entry.id }),
            !entry.online || !entry.canSort || view.busy === true,
          ),
        );
        card.append(actions);
      }
      if (entry.id !== 'carried') {
        const select = button(
          entry.selected ? 'Selected storage' : 'Select storage',
          () => this.callbacks.dispatch({ kind: 'select-storage', id: entry.id }),
          !entry.online || !view.inventory.canManage,
        );
        select.dataset.focusKey = `storage:${entry.id}`;
        card.append(select);
      }
      storage.append(card);
    }
    section.append(intro, storage);
    return section;
  }

  private renderCharacter(view: TerminalView): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page';
    section.append(el('p', `Profile: ${view.character.profile}`));
    section.append(labelled('Health', `${view.character.health} / ${view.character.maxHealth}`));
    section.append(labelled('Stamina', `${view.character.stamina} / ${view.character.maxStamina}`));
    section.append(
      labelled('Hydration', String(view.character.hydration)),
      labelled('Nourishment', String(view.character.nourishment)),
    );
    const weapon = el('section');
    weapon.className = 'terminal-card';
    weapon.append(
      el('h3', view.character.weapon.name),
      labelled('Magazine', String(view.character.weapon.ammoInMagazine)),
      labelled(
        'Reserve',
        view.character.weapon.infiniteReserve ? '∞' : String(view.character.weapon.reserveAmmo),
      ),
    );
    weapon.append(
      el(
        'p',
        view.character.weapon.attachments.length
          ? `Attachments: ${view.character.weapon.attachments.join(', ')}`
          : 'Attachments: none',
      ),
    );
    section.append(weapon);
    return section;
  }

  private renderWorkshop(view: TerminalView): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page-grid';
    const stations = el('div');
    stations.className = 'terminal-list';
    for (const station of view.workshop.stations) {
      const stationButton = button(
        `${station.label} · ${station.powered && station.healthy ? 'ready' : station.healthy ? 'unpowered' : 'needs repair'}`,
        () => this.callbacks.dispatch({ kind: 'select-station', id: station.id }),
        !station.unlocked,
      );
      stationButton.dataset.focusKey = `station:${station.id}`;
      stations.append(stationButton);
    }
    if (!view.workshop.stations.length)
      stations.append(el('p', 'No workbench, refinery, or stove is installed aboard.'));
    const recipes = el('div');
    recipes.className = 'terminal-list';
    for (const entry of view.workshop.recipes) {
      const row = el('article');
      row.className = 'terminal-action-row';
      const inputs = Object.entries(entry.recipe.inputs)
        .map(([id, count]) => `${count} ${ITEMS[id as keyof typeof ITEMS].name}`)
        .join(' + ');
      const output = `${entry.recipe.output.count} ${ITEMS[entry.recipe.output.itemId].name}`;
      row.append(
        el('strong', entry.recipe.name),
        el(
          'span',
          entry.canCraft ? `${inputs} → ${output}` : (entry.refusal ?? `${inputs} → ${output}`),
        ),
      );
      row.append(
        button(
          'Craft',
          () =>
            this.callbacks.dispatch({
              kind: 'craft',
              stationId: view.workshop.selectedStationId ?? '',
              recipeId: entry.recipe.id,
              destinationId: view.workshop.selectedDestinationId,
            }),
          !entry.canCraft || view.busy === true,
        ),
      );
      recipes.append(row);
    }
    if (!view.workshop.recipes.length)
      recipes.append(el('p', 'No recipes are available for the installed stations.'));
    section.append(
      el('h3', 'Installed stations'),
      stations,
      el('h3', 'Available recipes'),
      this.renderOutputPicker(
        'Craft into',
        view.workshop.outputDestinations,
        view.workshop.selectedDestinationId,
      ),
      recipes,
    );
    if (view.workshop.fieldwork?.length)
      section.append(
        el('h3', 'Fieldwork'),
        this.renderFieldwork(view.workshop.fieldwork, view.busy === true),
      );
    return section;
  }

  private renderFieldwork(views: readonly FieldworkView[], busy: boolean): HTMLElement {
    const list = el('div');
    list.className = 'terminal-fieldwork-list';
    for (const view of views) {
      const card = el('section');
      card.className = 'terminal-card terminal-fieldwork-card';
      card.append(el('h4', view.title));
      card.append(
        el('p', `${view.profileLabel} · Scrap ${view.scrap} · Components ${view.components}`),
      );
      if (view.refusal) card.append(el('p', view.refusal));
      for (const id of attachmentsForWeapon(view.weaponId)) {
        const attachment = WEAPON_ATTACHMENTS[id];
        const researched = view.researched.includes(id);
        const installed = view.active === id;
        const row = el('article');
        row.className = 'terminal-fieldwork-row';
        row.append(el('strong', attachment.name));
        row.append(
          el(
            'span',
            `Cost: ${attachment.cost.scrap} Scrap Metal · ${attachment.cost.components} Components`,
          ),
        );
        const action = researched
          ? button(
              installed ? 'Installed' : 'Equip',
              () =>
                this.callbacks.dispatch({
                  kind: 'fieldwork',
                  action: 'equip',
                  weaponId: view.weaponId,
                  attachmentId: id,
                }),
              busy || !view.available || installed,
            )
          : button(
              `Research + equip`,
              () =>
                this.callbacks.dispatch({
                  kind: 'fieldwork',
                  action: 'research',
                  weaponId: view.weaponId,
                  attachmentId: id,
                }),
              busy ||
                !view.available ||
                view.scrap < attachment.cost.scrap ||
                view.components < attachment.cost.components,
            );
        action.dataset.fieldworkAttachment = id;
        row.append(action);
        if (!view.available) row.append(el('small', view.refusal ?? 'Fieldwork unavailable.'));
        else if (
          !researched &&
          (view.scrap < attachment.cost.scrap || view.components < attachment.cost.components)
        )
          row.append(el('small', 'Insufficient materials'));
        card.append(row);
      }
      const remove = button(
        'Remove attachment',
        () =>
          this.callbacks.dispatch({
            kind: 'fieldwork',
            action: 'equip',
            weaponId: view.weaponId,
            attachmentId: null,
          }),
        busy || !view.available || view.active === null,
      );
      remove.dataset.fieldworkRemove = view.weaponId;
      card.append(remove);
      list.append(card);
    }
    return list;
  }

  private renderMachine(view: TerminalView): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page';
    for (const status of view.machine.status) section.append(el('p', status));
    const caretaker = el('section');
    caretaker.className = 'terminal-card';
    const c = view.machine.caretaker;
    caretaker.append(el('h3', 'Caretaker'));
    if (!c.recruited) {
      const status = el('p', 'Caretaker not recruited');
      status.className = 'terminal-caretaker-status';
      caretaker.append(status);
    } else {
      caretaker.append(
        labelled('Recruitment', 'Recruited'),
        labelled('Mode', c.mode),
        labelled('Priority', c.priority),
        labelled('Decision', c.decision),
        labelled('Active job', c.activeJob ?? 'Idle'),
      );
      if (c.globalBlock) caretaker.append(el('p', `Blocked: ${c.globalBlock}`));
      const priority = el('div');
      priority.className = 'terminal-list';
      for (const value of ['auto', 'gardens', 'outputs'] as const)
        priority.append(
          button(
            `Priority: ${value}`,
            () => this.callbacks.dispatch({ kind: 'caretaker-priority', priority: value }),
            c.canChangePriority === false || c.priority === value,
          ),
        );
      caretaker.append(priority);
    }
    for (const repair of view.machine.repairs) {
      const row = el('article');
      row.className = 'terminal-action-row';
      row.append(el('strong', repair.label), el('span', repair.condition));
      row.append(
        button(
          'Repair at hold',
          () => this.callbacks.dispatch({ kind: 'repair', id: repair.id }),
          !repair.canRepair || view.busy === true,
        ),
      );
      if (repair.refusal) row.append(el('p', repair.refusal));
      caretaker.append(row);
    }
    if (view.machine.producers.length || view.machine.gardens.length) {
      const routines = el('section');
      routines.className = 'terminal-card';
      routines.append(el('h3', 'Remote routines'));
      routines.append(
        this.renderOutputPicker(
          'Collect and harvest into',
          view.machine.outputDestinations,
          view.machine.outputDestinationId,
        ),
      );
      for (const producer of view.machine.producers) {
        const row = el('article');
        row.className = 'terminal-action-row';
        row.append(
          el('strong', producer.label),
          el(
            'span',
            `${producer.stored}/${producer.capacity} stored · ${producer.powered ? 'powered' : 'unpowered'} · ${Math.round(producer.health)} condition`,
          ),
        );
        row.append(
          button(
            'Collect output',
            () =>
              this.callbacks.dispatch({
                kind: 'collect-output',
                sourceId: producer.id,
                destinationId: view.machine.outputDestinationId,
              }),
            !producer.canCollect || view.busy === true,
          ),
        );
        if (producer.refusal) row.append(el('p', producer.refusal));
        routines.append(row);
      }
      for (const garden of view.machine.gardens) {
        const row = el('article');
        row.className = 'terminal-action-row';
        row.append(
          el('strong', garden.label),
          el('span', `Water ${garden.water}/${garden.maxWater} · Greens ${garden.greens}`),
        );
        const waterId = view.inventory.carried.slots.some((slot) => slot.itemId === 'water')
          ? 'carried'
          : (view.inventory.storage.find((entry) =>
              entry.slots.some((slot) => slot.itemId === 'water'),
            )?.id ?? '');
        row.append(
          button(
            'Water garden',
            () =>
              this.callbacks.dispatch({
                kind: 'water-garden',
                gardenId: garden.id,
                sourceId: waterId,
              }),
            !garden.canWater || !waterId || view.busy === true,
          ),
        );
        row.append(
          button(
            'Harvest greens',
            () =>
              this.callbacks.dispatch({
                kind: 'harvest-garden',
                gardenId: garden.id,
                destinationId: view.machine.outputDestinationId,
              }),
            !garden.canHarvest || view.busy === true,
          ),
        );
        if (garden.refusal) row.append(el('p', garden.refusal));
        routines.append(row);
      }
      caretaker.append(routines);
    }
    section.append(caretaker);
    if (view.machine.operations) section.append(this.renderOperations(view.machine.operations));
    const notes = el('ul');
    for (const note of view.machine.physicalNotes) notes.append(el('li', note));
    section.append(notes);
    return section;
  }

  private renderOutputPicker(
    label: string,
    destinations: readonly TerminalOutputDestinationView[],
    selected: string,
  ): HTMLElement {
    const wrap = el('div');
    wrap.className = 'terminal-output-picker';
    const id = 'terminal-output-destination';
    const caption = el('label', label);
    caption.htmlFor = id;
    const select = el('select');
    select.id = id;
    select.dataset.testid = 'terminal-output-destination';
    select.setAttribute('aria-label', label);
    for (const destination of destinations) {
      const option = el('option', destination.label);
      option.value = destination.id;
      option.selected = destination.id === selected;
      select.append(option);
    }
    select.disabled = destinations.length < 1;
    select.addEventListener('change', () =>
      this.callbacks.dispatch({ kind: 'select-output', id: select.value }),
    );
    wrap.append(caption, select);
    return wrap;
  }

  private renderOperations(
    operations: NonNullable<TerminalView['machine']['operations']>,
  ): HTMLElement {
    const wrap = el('section');
    wrap.className = 'terminal-operations';
    wrap.append(el('h3', 'Machine decks'));
    const diagram = el('div');
    diagram.className = 'terminal-deck-diagram';
    diagram.setAttribute('aria-label', 'Top-down machine deck diagram');
    for (const deck of operations.decks) {
      const deckNode = el('section');
      deckNode.className = 'terminal-deck';
      deckNode.append(el('h4', deck.label));
      for (const node of deck.nodes) {
        const selected =
          operations.pin?.kind === node.source.kind && operations.pin.id === node.source.id;
        const item = button(
          node.label,
          () => this.callbacks.dispatch({ kind: 'pin-task', pin: selected ? null : node.source }),
          false,
        );
        item.className = `terminal-node${selected ? ' is-pinned' : ''}`;
        item.style.left = `${node.x * 100}%`;
        item.style.top = `${node.z * 100}%`;
        item.dataset.focusKey = `node:${node.source.kind}:${node.source.id}`;
        item.setAttribute('aria-label', `${node.label}${node.detail ? `, ${node.detail}` : ''}`);
        deckNode.append(item);
      }
      diagram.append(deckNode);
    }
    const list = el('div');
    list.className = 'terminal-node-list';
    for (const deck of operations.decks)
      for (const node of deck.nodes) {
        const row = button(
          `${node.label}${node.detail ? ` — ${node.detail}` : ''}`,
          () => this.callbacks.dispatch({ kind: 'pin-task', pin: node.source }),
          false,
        );
        row.dataset.focusKey = `list:${node.source.kind}:${node.source.id}`;
        list.append(row);
      }
    wrap.append(diagram, list);
    return wrap;
  }

  private renderSignal(view: TerminalView): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page';
    section.append(
      labelled(
        'Scanner',
        view.signal.scanner.installed
          ? view.signal.scanner.powered
            ? `${Math.round(view.signal.scanner.progress * 100)}% ready`
            : 'Unpowered'
          : 'Not installed',
      ),
    );
    if (view.signal.scanner.refusal) section.append(el('p', view.signal.scanner.refusal));
    section.append(
      button(
        'Start scan',
        () => this.callbacks.dispatch({ kind: 'start-scanner' }),
        !view.signal.scanner.canStart || view.busy === true,
      ),
    );
    if (view.signal.objective) {
      const objective = el('article');
      objective.className = 'terminal-card terminal-objective';
      objective.append(
        el('h3', 'Current objective'),
        el('h4', view.signal.objective.title),
        el('p', view.signal.objective.text),
      );
      if (view.signal.objective.progress) objective.append(el('p', view.signal.objective.progress));
      section.append(objective);
    }
    if (view.signal.radioMessages?.length) {
      const messages = el('section');
      messages.className = 'terminal-card terminal-radio-messages';
      messages.append(el('h3', 'Radio channel'));
      for (const message of view.signal.radioMessages) {
        const item = el('article');
        item.append(el('h4', message.title), el('p', message.text));
        messages.append(item);
      }
      section.append(messages);
    }
    const records = el('div');
    records.className = 'terminal-records';
    for (const record of view.signal.records) {
      const item = el('article');
      item.append(el('h3', record.title), el('p', record.text));
      records.append(item);
    }
    if (view.signal.records.length) {
      const heading = el('h3', 'Campaign records');
      section.append(heading, records);
    }
    return section;
  }

  private renderBuild(view: TerminalBuildView, busy: boolean): HTMLElement {
    const section = el('div');
    section.className = 'terminal-page-grid';
    section.append(
      el('p', 'Catalog preview only. Placement and physical repair remain in the machine.'),
    );

    const searchWrap = el('div');
    searchWrap.className = 'terminal-build-search';
    const searchLabel = el('label', 'Search build catalog');
    searchLabel.htmlFor = 'terminal-build-search';
    const search = el('input');
    search.type = 'search';
    search.id = 'terminal-build-search';
    search.placeholder = 'Name or category';
    search.value = this.buildQuery;
    search.dataset.focusKey = 'build-search';
    search.setAttribute('aria-label', 'Search build catalog');
    const searchStatus = el('p');
    searchStatus.className = 'terminal-build-search-status';
    searchStatus.setAttribute('aria-live', 'polite');
    searchWrap.append(searchLabel, search, searchStatus);
    section.append(searchWrap);

    const groups = view.categories.map((category) => {
      const group = el('section');
      group.className = 'terminal-card';
      group.dataset.buildCategory = category.id;
      group.append(el('h3', category.label));
      const pieces = el('div');
      pieces.className = 'terminal-build-pieces';
      for (const piece of category.pieces) {
        const status = !piece.unlocked
          ? 'Locked'
          : piece.canBuild
            ? 'Available'
            : 'Insufficient materials';
        const cost =
          Object.entries(piece.cost)
            .map(([id, count]) => `${count} ${ITEMS[id as keyof typeof ITEMS]?.name ?? id}`)
            .join(' · ') || 'None';
        const row = el('article');
        row.className = 'terminal-build-piece';
        row.dataset.search = `${piece.label} ${category.label}`.toLocaleLowerCase();
        const action = button(
          `${piece.label} · ${status}`,
          () => this.callbacks.dispatch({ kind: 'select-build-piece', id: piece.id }),
          busy || !piece.unlocked || !piece.canBuild,
        );
        action.dataset.buildPieceId = piece.id;
        action.dataset.focusKey = `build-piece:${piece.id}`;
        const costNode = el('span', `Cost: ${cost}`);
        costNode.className = 'terminal-build-cost';
        row.append(action, costNode);
        pieces.append(row);
      }
      group.append(pieces);
      return group;
    });
    section.append(...groups);

    const applyFilter = (): void => {
      this.buildQuery = search.value;
      const query = this.buildQuery.trim().toLocaleLowerCase();
      let matches = 0;
      for (const group of groups) {
        const rows = [...group.querySelectorAll<HTMLElement>('.terminal-build-piece')];
        let visible = 0;
        for (const row of rows) {
          const match = !query || (row.dataset.search ?? '').includes(query);
          row.hidden = !match;
          if (match) visible += 1;
        }
        group.hidden = visible === 0;
        matches += visible;
      }
      searchStatus.textContent = query
        ? matches
          ? `${matches} build piece${matches === 1 ? '' : 's'} match.`
          : 'No build pieces match.'
        : `${matches} build pieces. Search by name or category.`;
    };
    search.addEventListener('input', applyFilter);
    applyFilter();
    return section;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this._isOpen) return;
    // The terminal owns keyboard navigation while simulation input is paused.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.closeButton.disabled) this.callbacks.dispatch({ kind: 'close' });
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const current = this.view?.activeTab ?? 'inventory';
    const index = tabs.findIndex((tab) => tab.id === current);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    event.preventDefault();
    this.callbacks.dispatch({ kind: 'select-tab', tab: next.id });
  }

  private focusedKey(): string | null {
    const active = document.activeElement;
    return active instanceof HTMLElement ? (active.dataset.focusKey ?? null) : null;
  }

  private restoreFocus(): void {
    if (this.focusKey) {
      const target = [...this.root.querySelectorAll<HTMLElement>('[data-focus-key]')].find(
        (candidate) => candidate.dataset.focusKey === this.focusKey,
      );
      if (target) {
        target.focus();
        return;
      }
    }
    this.focusFirst();
  }

  private focusFirst(): void {
    const target = this.root.querySelector<HTMLElement>('button:not(:disabled)');
    target?.focus();
  }
}
