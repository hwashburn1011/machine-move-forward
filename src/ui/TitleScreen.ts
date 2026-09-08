import { QUALITY_TIERS, type QualityTier } from '@/core/renderer/QualitySettings';

/**
 * The game's front door, and the pause menu behind it.
 *
 * One component for both, because they are the same list with one row swapped:
 * a menu that looks and behaves differently depending on whether you reached
 * it from boot or from `Esc` is two things to keep in step for no reason.
 *
 * It reads and writes nothing but its own DOM and `localStorage`. Every effect
 * on the game goes out through the callbacks handed in, so the whole of the
 * menu can be moved, restyled or replaced (Phase 15 grows Settings and
 * onboarding inside it) without touching the simulation.
 */

export const GAME_TITLE = 'Machine Move Forward';

/** What the settings panel can change. Small on purpose; Phase 15 grows it. */
export interface GameSettings {
  /** Master audio volume, 0..1. */
  volume: number;
  /**
   * Forced quality tier, or null to leave it to the boot-time probe.
   *
   * Null rather than a default tier: a player who has never opened Settings
   * must keep the tier their hardware was measured at, and a stored 'high'
   * would silently override that on every machine they ever load the game on.
   */
  quality: QualityTier | null;
}

export interface TitleScreenCallbacks {
  onNewGame(): void;
  onContinue(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSave(): void;
  onSaveAndQuit(): void;
  onSettings(settings: GameSettings): void;
  /** Whether there is anything to continue. Awaited before the menu is shown. */
  hasSave(): Promise<boolean>;
}

export type TitleMode = 'boot' | 'pause';

const SETTINGS_KEY = 'mmf-settings';

const DEFAULT_SETTINGS: GameSettings = { volume: 0.8, quality: null };

/** The value the `auto` option carries, since a `<select>` has no null. */
const AUTO_QUALITY = 'auto';

/**
 * Read the persisted settings.
 *
 * Never throws and never returns a partial: a browser with storage disabled,
 * a truncated value, or a tier that no longer exists all read back as the
 * defaults, because a settings file is not worth a failed boot.
 */
export function loadSettings(): GameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_SETTINGS.volume;
    const quality = QUALITY_TIERS.includes(parsed.quality as QualityTier)
      ? (parsed.quality as QualityTier)
      : null;
    return { volume, quality };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: GameSettings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A private-mode browser refuses to store. It still gets to play.
  }
}

interface MenuItem {
  id: string;
  label: string;
  run(): void;
}

export class TitleScreen {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly disposers: (() => void)[] = [];

  private mode: TitleMode = 'boot';
  private open = false;
  private inSettings = false;
  private items: MenuItem[] = [];
  private selected = 0;
  private hasSaveGame = false;
  private settings: GameSettings;
  private cardTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: TitleScreenCallbacks,
  ) {
    this.settings = loadSettings();

    root.innerHTML = `
      <div id="title-card"><span id="title-card-text"></span></div>
      <div id="title-skip">
        <span>Hold <b>Esc</b> to skip</span>
        <div id="title-skip-bar"><div id="title-skip-fill"></div></div>
      </div>
      <div id="title-screen">
        <div id="title-plate">
          <h1 id="title-name">${GAME_TITLE}</h1>
          <div id="title-tagline">Keep it walking.</div>
          <nav id="title-menu"></nav>
          <form id="title-settings">
            <label class="title-setting">
              <span>Volume</span>
              <input id="title-volume" type="range" min="0" max="100" step="1" />
              <output id="title-volume-value"></output>
            </label>
            <label class="title-setting">
              <span>Quality</span>
              <select id="title-quality">
                <option value="${AUTO_QUALITY}">auto</option>
                ${QUALITY_TIERS.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </label>
            <button type="button" id="title-settings-back" class="title-item">Back</button>
          </form>
          <div id="title-status" role="status" aria-live="polite"></div>
        </div>
      </div>
    `;

    for (const id of [
      'title-screen',
      'title-plate',
      'title-name',
      'title-menu',
      'title-settings',
      'title-settings-back',
      'title-volume',
      'title-volume-value',
      'title-quality',
      'title-card',
      'title-card-text',
      'title-skip',
      'title-skip-fill',
      'title-status',
    ]) {
      const node = root.querySelector<HTMLElement>(`#${id}`);
      if (node) this.el[id] = node;
    }

    const volume = this.el['title-volume'] as HTMLInputElement | undefined;
    const quality = this.el['title-quality'] as HTMLSelectElement | undefined;
    if (volume) {
      volume.value = String(Math.round(this.settings.volume * 100));
      const onInput = (): void => {
        this.settings = { ...this.settings, volume: Number(volume.value) / 100 };
        this.applySettings();
      };
      volume.addEventListener('input', onInput);
      this.disposers.push(() => volume.removeEventListener('input', onInput));
    }
    if (quality) {
      quality.value = this.settings.quality ?? AUTO_QUALITY;
      const onChange = (): void => {
        const value = quality.value;
        this.settings = {
          ...this.settings,
          quality: value === AUTO_QUALITY ? null : (value as QualityTier),
        };
        this.applySettings();
      };
      quality.addEventListener('change', onChange);
      this.disposers.push(() => quality.removeEventListener('change', onChange));
    }

    const back = this.el['title-settings-back'];
    if (back) {
      const onBack = (): void => this.showMenu();
      back.addEventListener('click', onBack);
      this.disposers.push(() => back.removeEventListener('click', onBack));
    }

    // Capture, so the menu's arrows and Enter never reach the game underneath.
    // Only while it is open: a listener that swallowed keys off-screen would
    // be a bug that only shows up as the player being unable to move.
    const onKey = (e: KeyboardEvent): void => this.onKeyDown(e);
    window.addEventListener('keydown', onKey, true);
    this.disposers.push(() => window.removeEventListener('keydown', onKey, true));

    this.syncVolumeLabel();
    this.hide();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Live settings, so `Game` can apply them on boot without re-reading. */
  get current(): GameSettings {
    return { ...this.settings };
  }

  show(mode: TitleMode): void {
    this.mode = mode;
    this.open = true;
    if (mode === 'boot') this.showStatus(null);
    this.root.classList.add('is-open');
    this.el['title-screen']?.classList.add('is-open');
    // Boot leads with the game's name; the pause menu does not, because the
    // player already knows what they are playing and the shot behind it is
    // their own deck.
    this.el['title-plate']?.classList.toggle('is-boot', mode === 'boot');
    this.showMenu();

    // Asked every time rather than cached: a game saved this session must put
    // Continue back on the boot menu without a reload.
    void this.callbacks.hasSave().then((has) => {
      this.hasSaveGame = has;
      if (this.open && !this.inSettings) this.showMenu();
    });
  }

  /** Status for asynchronous save actions. Kept in the pause plate so a
   * failure cannot be mistaken for a successful quit. */
  showStatus(text: string | null, error = false): void {
    const node = this.el['title-status'];
    if (!node) return;
    node.textContent = text ?? '';
    node.classList.toggle('is-error', error);
    node.classList.toggle('is-visible', text !== null);
  }

  hide(): void {
    this.open = false;
    this.inSettings = false;
    this.root.classList.remove('is-open');
    this.el['title-screen']?.classList.remove('is-open');
    this.el['title-settings']?.classList.remove('is-open');
  }

  /**
   * The game's name, over the first seconds of the machine walking.
   *
   * Deliberately not a menu: it is the payoff for the leap, and anything the
   * player has to dismiss would land as an interruption instead.
   */
  showTitleCard(text: string = GAME_TITLE, seconds = 4): void {
    const card = this.el['title-card'];
    if (!card) return;
    const label = this.el['title-card-text'];
    if (label) label.textContent = text;
    card.classList.remove('is-active');
    void card.offsetWidth;
    card.classList.add('is-active');
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => card.classList.remove('is-active'), seconds * 1000);
  }

  /**
   * The hold-to-skip prompt, and how far through the hold we are.
   *
   * `progress` is 0..1. Called every frame of the rooftop phase, so the bar is
   * the director's own accumulator rather than a second timer that could
   * disagree with it.
   */
  showSkipHint(progress = 0): void {
    this.el['title-skip']?.classList.add('is-active');
    const fill = this.el['title-skip-fill'];
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }

  hideSkipHint(): void {
    this.el['title-skip']?.classList.remove('is-active');
  }

  private applySettings(): void {
    this.syncVolumeLabel();
    saveSettings(this.settings);
    this.callbacks.onSettings({ ...this.settings });
  }

  private syncVolumeLabel(): void {
    const out = this.el['title-volume-value'];
    if (out) out.textContent = `${Math.round(this.settings.volume * 100)}%`;
  }

  private showMenu(): void {
    this.inSettings = false;
    this.el['title-settings']?.classList.remove('is-open');
    this.el['title-menu']?.classList.remove('is-hidden');

    this.items =
      this.mode === 'boot'
        ? [
            { id: 'new-game', label: 'New Game', run: () => this.callbacks.onNewGame() },
            ...(this.hasSaveGame
              ? [
                  {
                    id: 'continue',
                    label: 'Continue',
                    run: () => this.callbacks.onContinue(),
                  },
                ]
              : []),
            { id: 'settings', label: 'Settings', run: () => this.showSettings() },
          ]
        : [
            { id: 'resume', label: 'Resume', run: () => this.callbacks.onResume() },
            { id: 'save', label: 'Save', run: () => this.callbacks.onSave() },
            {
              id: 'save-quit',
              label: 'Save & Quit',
              run: () => this.callbacks.onSaveAndQuit(),
            },
            { id: 'settings', label: 'Settings', run: () => this.showSettings() },
            {
              id: 'quit',
              label: 'Quit to Title',
              run: () => this.callbacks.onQuitToTitle(),
            },
          ];

    this.selected = Math.min(this.selected, this.items.length - 1);
    this.renderMenu();
  }

  private showSettings(): void {
    this.inSettings = true;
    this.el['title-menu']?.classList.add('is-hidden');
    this.el['title-settings']?.classList.add('is-open');
    this.el['title-settings-back']?.focus();
  }

  private renderMenu(): void {
    const menu = this.el['title-menu'];
    if (!menu) return;
    menu.innerHTML = this.items
      .map(
        (item, i) =>
          `<button type="button" class="title-item${i === this.selected ? ' is-selected' : ''}" data-id="${item.id}">${item.label}</button>`,
      )
      .join('');

    menu.querySelectorAll<HTMLButtonElement>('.title-item').forEach((node, i) => {
      node.addEventListener('click', () => {
        this.selected = i;
        this.items[i]?.run();
      });
      node.addEventListener('mouseenter', () => {
        this.selected = i;
        this.paintSelection();
      });
    });
  }

  private paintSelection(): void {
    this.el['title-menu']
      ?.querySelectorAll<HTMLElement>('.title-item')
      .forEach((node, i) => node.classList.toggle('is-selected', i === this.selected));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.open) return;

    if (this.inSettings) {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.showMenu();
      }
      return;
    }

    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const step = e.code === 'ArrowDown' ? 1 : this.items.length - 1;
      this.selected = (this.selected + step) % this.items.length;
      this.paintSelection();
      return;
    }

    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      this.items[this.selected]?.run();
      return;
    }

    // Esc closes the pause menu but never the boot menu: there is nothing
    // behind the boot menu to go back to.
    if (e.code === 'Escape' && this.mode === 'pause') {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onResume();
    }
  }

  dispose(): void {
    if (this.cardTimer) clearTimeout(this.cardTimer);
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.root.innerHTML = '';
  }
}
