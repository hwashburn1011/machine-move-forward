import { isSupportedBindingCode } from '@/core/settings/SettingsStore';
import { QUALITY_TIERS, type QualityTier } from '@/core/renderer/QualitySettings';
import {
  loadSettings as loadStoredSettings,
  saveSettings as saveStoredSettings,
  type Settings as StoredSettings,
} from '@/core/settings/SettingsStore';
import {
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  effectiveBindingCode,
  rebindAction,
  type InputContext,
  type BindingAction,
} from '@/core/input/Bindings';
import './settings.css';

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
export type CampaignProfile = 'story' | 'survival';

/** What the settings panel can change. Small on purpose; Phase 15 grows it. */
export interface GameSettings {
  /** Master audio volume, 0..1. */
  volume: number;
  /** Engine, mechanical footsteps and calm atmosphere, independent of effects. */
  ambienceVolume: number;
  /**
   * Forced quality tier, or null to leave it to the boot-time probe.
   *
   * Null rather than a default tier: a player who has never opened Settings
   * must keep the tier their hardware was measured at, and a stored 'high'
   * would silently override that on every machine they ever load the game on.
   */
  quality: QualityTier | null;
  sensitivity?: number;
  hipFov?: number;
  shoulder?: 'left' | 'right';
  bindings?: Record<string, string>;
}

export interface TitleScreenCallbacks {
  onNewGame(profile?: CampaignProfile, preserve?: boolean): void;
  onContinue(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSave(): void;
  onSaveAndQuit(): void;
  onSettings(settings: GameSettings): void;
  onCampaigns?(mode: TitleMode): void;
  /** Whether there is anything to continue. Awaited before the menu is shown. */
  hasSave(): Promise<boolean>;
}

export type TitleMode = 'boot' | 'pause';

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
  const settings = loadStoredSettings();
  return {
    volume: settings.volume,
    ambienceVolume: settings.ambienceVolume,
    quality: settings.quality,
  };
}

function saveSettings(settings: StoredSettings): void {
  saveStoredSettings(settings);
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
  private settings: StoredSettings;
  private cardTimer: ReturnType<typeof setTimeout> | null = null;
  private renderBindings: (() => void) | null = null;
  private cancelBindingCapture: (() => void) | null = null;
  private profileChooserOpen = false;
  private campaignDialogOpen = false;
  private campaignProfile: CampaignProfile | null = null;
  private campaignCheckPending = false;
  private campaignActionPending = false;
  private externallyCampaignBusy = false;
  private campaignCheckGeneration = 0;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: TitleScreenCallbacks,
  ) {
    this.settings = loadStoredSettings();

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
          <section id="title-profile" hidden><h2>Choose a campaign</h2><p>Story keeps the current infinite reserve. Survival uses finite ammunition with the same enemies and needs.</p><button type="button" data-profile="story">Story</button><button type="button" data-profile="survival">Survival</button><button type="button" data-profile-cancel>Cancel</button></section>
          <section id="title-campaign-preserve" hidden role="dialog" aria-modal="true" aria-labelledby="title-campaign-preserve-heading"><h2 id="title-campaign-preserve-heading">Current campaign found</h2><p>Keep the current readable run in the campaign library before starting this new campaign?</p><button type="button" data-campaign-preserve>Preserve &amp; Start</button><button type="button" data-campaign-back>Back</button><button type="button" data-campaign-replace>Replace Current Run</button></section>
          <form id="title-settings">
            <label class="title-setting">
              <span>Master volume</span>
              <input id="title-volume" type="range" min="0" max="100" step="1" />
              <output id="title-volume-value"></output>
            </label>
            <label class="title-setting">
              <span>Machine &amp; ambience</span>
              <input id="title-ambience" type="range" min="0" max="100" step="1" />
              <output id="title-ambience-value"></output>
            </label>
            <label class="title-setting">
              <span>Quality</span>
              <select id="title-quality">
                <option value="${AUTO_QUALITY}">auto</option>
                ${QUALITY_TIERS.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </label>
            <label class="title-setting"><span>Look sensitivity</span><input id="title-sensitivity" type="range" min="0.25" max="3" step="0.05" /><output id="title-sensitivity-value"></output></label>
            <label class="title-setting"><span>Hip FOV</span><input id="title-fov" type="range" min="50" max="80" step="1" /><output id="title-fov-value"></output></label>
            <label class="title-setting"><span>Shoulder</span><select id="title-shoulder"><option value="right">Right</option><option value="left">Left</option></select></label>
            <fieldset id="title-bindings"><legend>Controls</legend><label>Context <select id="title-binding-context"><option value="play">Play</option><option value="build-placement">Build placement</option><option value="catalog">Catalog</option><option value="mounted">Mounted gun</option><option value="menu">Menu</option></select></label><div id="title-binding-list"></div><button type="button" id="title-bindings-reset">Reset controls</button></fieldset>
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
      'title-profile',
      'title-campaign-preserve',
      'title-settings',
      'title-settings-back',
      'title-volume',
      'title-volume-value',
      'title-ambience',
      'title-ambience-value',
      'title-quality',
      'title-card',
      'title-card-text',
      'title-skip',
      'title-skip-fill',
      'title-status',
      'title-sensitivity',
      'title-sensitivity-value',
      'title-fov',
      'title-fov-value',
      'title-shoulder',
      'title-binding-context',
      'title-binding-list',
      'title-bindings-reset',
    ]) {
      const node = root.querySelector<HTMLElement>(`#${id}`);
      if (node) this.el[id] = node;
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-profile]')) {
      const onProfile = (): void => this.beginNewGame(button.dataset.profile as CampaignProfile);
      button.addEventListener('click', onProfile);
      this.disposers.push(() => button.removeEventListener('click', onProfile));
    }
    const profileCancel = root.querySelector<HTMLButtonElement>('[data-profile-cancel]');
    if (profileCancel) {
      const onCancel = (): void => this.showMenu();
      profileCancel.addEventListener('click', onCancel);
      this.disposers.push(() => profileCancel.removeEventListener('click', onCancel));
    }
    const preserve = root.querySelector<HTMLButtonElement>('[data-campaign-preserve]');
    const campaignBack = root.querySelector<HTMLButtonElement>('[data-campaign-back]');
    const replace = root.querySelector<HTMLButtonElement>('[data-campaign-replace]');
    if (preserve) {
      const onPreserve = (): void => this.startSelectedCampaign(true);
      preserve.addEventListener('click', onPreserve);
      this.disposers.push(() => preserve.removeEventListener('click', onPreserve));
    }
    if (campaignBack) {
      const onBack = (): void => this.backToProfileChooser();
      campaignBack.addEventListener('click', onBack);
      this.disposers.push(() => campaignBack.removeEventListener('click', onBack));
    }
    if (replace) {
      const onReplace = (): void => this.startSelectedCampaign(false);
      replace.addEventListener('click', onReplace);
      this.disposers.push(() => replace.removeEventListener('click', onReplace));
    }

    const volume = this.el['title-volume'] as HTMLInputElement | undefined;
    const quality = this.el['title-quality'] as HTMLSelectElement | undefined;
    const ambience = this.el['title-ambience'] as HTMLInputElement | undefined;
    const sensitivity = this.el['title-sensitivity'] as HTMLInputElement | undefined;
    const fov = this.el['title-fov'] as HTMLInputElement | undefined;
    const shoulder = this.el['title-shoulder'] as HTMLSelectElement | undefined;
    if (sensitivity) {
      sensitivity.value = String(this.settings.sensitivity);
      const onInput = () => {
        this.settings = { ...this.settings, sensitivity: Number(sensitivity.value) };
        this.applySettings();
      };
      sensitivity.addEventListener('input', onInput);
      this.disposers.push(() => sensitivity.removeEventListener('input', onInput));
    }
    if (fov) {
      fov.value = String(this.settings.hipFov);
      const onInput = () => {
        this.settings = { ...this.settings, hipFov: Number(fov.value) };
        this.applySettings();
      };
      fov.addEventListener('input', onInput);
      this.disposers.push(() => fov.removeEventListener('input', onInput));
    }
    if (shoulder) {
      shoulder.value = this.settings.shoulder;
      const onChange = () => {
        this.settings = {
          ...this.settings,
          shoulder: shoulder.value === 'left' ? 'left' : 'right',
        };
        this.applySettings();
      };
      shoulder.addEventListener('change', onChange);
      this.disposers.push(() => shoulder.removeEventListener('change', onChange));
    }
    this.setupBindings();
    if (ambience) {
      ambience.value = String(Math.round(this.settings.ambienceVolume * 100));
      const onInput = (): void => {
        this.settings = { ...this.settings, ambienceVolume: Number(ambience.value) / 100 };
        this.applySettings();
      };
      ambience.addEventListener('input', onInput);
      this.disposers.push(() => ambience.removeEventListener('input', onInput));
    }
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
    if (this.disposed) return;
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
    const generation = ++this.campaignCheckGeneration;
    void Promise.resolve()
      .then(() => this.callbacks.hasSave())
      .then((has) => {
        if (
          this.disposed ||
          generation !== this.campaignCheckGeneration ||
          !this.open ||
          this.inSettings ||
          this.profileChooserOpen ||
          this.campaignDialogOpen ||
          this.campaignCheckPending
        )
          return;
        this.hasSaveGame = has;
        this.showMenu();
      })
      .catch(() => {
        if (
          !this.disposed &&
          generation === this.campaignCheckGeneration &&
          this.open &&
          !this.profileChooserOpen &&
          !this.campaignDialogOpen
        )
          this.showStatus('Unable to check for a current campaign.', true);
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
    this.profileChooserOpen = false;
    this.campaignDialogOpen = false;
    this.campaignProfile = null;
    this.campaignCheckPending = false;
    this.campaignActionPending = false;
    this.campaignCheckGeneration += 1;
    this.root.classList.remove('is-open');
    this.el['title-screen']?.classList.remove('is-open');
    this.el['title-settings']?.classList.remove('is-open');
    this.el['title-profile']?.setAttribute('hidden', '');
    this.el['title-campaign-preserve']?.setAttribute('hidden', '');
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

  private setupBindings(): void {
    const context = this.el['title-binding-context'] as HTMLSelectElement | undefined;
    const list = this.el['title-binding-list'];
    const reset = this.el['title-bindings-reset'];
    if (!context || !list || !reset) return;
    const render = (): void => {
      const ctx = context.value as InputContext;
      const bindings = (DEFAULT_BINDINGS[ctx] ?? []).filter(
        (binding, index, all) =>
          all.findIndex((candidate) => candidate.action === binding.action) === index,
      );
      list.innerHTML = bindings
        .map((binding) => {
          const key = `${ctx}:${binding.action}`;
          const value =
            effectiveBindingCode(ctx, binding.action, this.settings.bindings) ?? binding.code;
          const name =
            ACTION_LABELS[binding.action] ??
            (binding.action === 'slot1'
              ? 'Equip rifle'
              : binding.action === 'slot2'
                ? 'Equip shotgun'
                : binding.action);
          const codeNames: Record<string, string> = {
            Mouse0: 'LMB',
            Mouse1: 'MMB',
            Mouse2: 'RMB',
            ShiftLeft: 'Left Shift',
            ControlLeft: 'Left Ctrl',
            Escape: 'Esc',
            PageUp: 'Page Up',
            PageDown: 'Page Down',
          };
          return `<button type="button" class="title-binding" data-binding="${key}" ${binding.action === 'cancel' ? 'disabled title="Escape is reserved for recovery"' : ''}><span>${name}</span><b>${codeNames[value] ?? value.replace(/^Key|^Digit/, '')}</b></button>`;
        })
        .join('');
      list.querySelectorAll<HTMLButtonElement>('[data-binding]').forEach((button) => {
        button.addEventListener('click', () =>
          this.captureBinding(button, ctx, button.dataset.binding?.split(':')[1] as BindingAction),
        );
      });
    };
    this.renderBindings = render;
    const onReset = () => {
      this.settings = { ...this.settings, bindings: {} };
      this.applySettings();
      render();
    };
    context.addEventListener('change', render);
    reset.addEventListener('click', onReset);
    this.disposers.push(() => context.removeEventListener('change', render));
    this.disposers.push(() => reset.removeEventListener('click', onReset));
    render();
  }

  private captureBinding(
    button: HTMLButtonElement,
    context: InputContext,
    action: BindingAction,
  ): void {
    this.cancelBindingCapture?.();
    button.textContent = 'Press a key or mouse button (Esc cancels)';
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      this.cancelBindingCapture = null;
    };
    const commit = (code: string): void => {
      if (!isSupportedBindingCode(code)) {
        button.textContent = 'Unsupported key. Try another (Esc cancels)';
        return;
      }
      if (code === 'Escape' || code === 'Tab' || (code === 'Space' && context === 'menu')) {
        finish();
        this.renderBindings?.();
        return;
      }
      const change = rebindAction(this.settings.bindings, context, action, code);
      if (change.conflict && !globalThis.confirm(`Swap with ${change.conflict}?`)) {
        finish();
        this.renderBindings?.();
        return;
      }
      this.settings = { ...this.settings, bindings: change.overrides };
      this.applySettings();
      finish();
      this.renderBindings?.();
    };
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        finish();
        this.renderBindings?.();
        return;
      }
      commit(event.code);
    };
    const onMouse = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      commit(`Mouse${event.button}`);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    this.cancelBindingCapture = finish;
  }

  private applySettings(): void {
    this.syncVolumeLabel();
    saveSettings(this.settings);
    this.callbacks.onSettings(this.current);
  }

  private syncVolumeLabel(): void {
    const out = this.el['title-volume-value'];
    if (out) out.textContent = `${Math.round(this.settings.volume * 100)}%`;
    const ambience = this.el['title-ambience-value'];
    if (ambience) ambience.textContent = `${Math.round(this.settings.ambienceVolume * 100)}%`;
    const sensitivity = this.el['title-sensitivity-value'];
    if (sensitivity) sensitivity.textContent = `${this.settings.sensitivity.toFixed(2)}×`;
    const fov = this.el['title-fov-value'];
    if (fov) fov.textContent = `${this.settings.hipFov}°`;
  }

  private showMenu(): void {
    if (this.disposed) return;
    this.profileChooserOpen = false;
    this.campaignDialogOpen = false;
    this.campaignProfile = null;
    if (this.el['title-profile']) this.el['title-profile'].hidden = true;
    if (this.el['title-campaign-preserve']) this.el['title-campaign-preserve'].hidden = true;
    this.inSettings = false;
    this.el['title-settings']?.classList.remove('is-open');
    this.el['title-menu']?.classList.remove('is-hidden');

    this.items =
      this.mode === 'boot'
        ? [
            { id: 'new-game', label: 'New Game', run: () => this.showProfileChooser() },
            ...(this.hasSaveGame
              ? [
                  {
                    id: 'continue',
                    label: 'Continue',
                    run: () => this.callbacks.onContinue(),
                  },
                ]
              : []),
            ...(this.callbacks.onCampaigns
              ? [
                  {
                    id: 'campaigns',
                    label: 'Campaigns',
                    run: () => this.callbacks.onCampaigns?.(this.mode),
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
            ...(this.callbacks.onCampaigns
              ? [
                  {
                    id: 'campaigns',
                    label: 'Campaigns',
                    run: () => this.callbacks.onCampaigns?.(this.mode),
                  },
                ]
              : []),
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

  setCampaignBusy(busy: boolean): void {
    if (this.disposed) return;
    this.externallyCampaignBusy = busy;
    this.updateCampaignControls();
  }

  private showProfileChooser(): void {
    if (this.campaignBusy) return;
    this.profileChooserOpen = true;
    this.campaignDialogOpen = false;
    this.campaignProfile = null;
    this.el['title-menu']?.classList.add('is-hidden');
    this.el['title-campaign-preserve']?.setAttribute('hidden', '');
    const chooser = this.el['title-profile'];
    if (!chooser) return;
    chooser.hidden = false;
    chooser.querySelector<HTMLButtonElement>('[data-profile="story"]')?.focus();
    this.updateCampaignControls();
  }

  private get campaignBusy(): boolean {
    return this.externallyCampaignBusy || this.campaignCheckPending || this.campaignActionPending;
  }

  private beginNewGame(profile: CampaignProfile): void {
    if (!this.open || this.campaignBusy) return;
    this.profileChooserOpen = false;
    this.campaignProfile = profile;
    this.el['title-profile']?.setAttribute('hidden', '');
    this.campaignCheckPending = true;
    const generation = ++this.campaignCheckGeneration;
    this.showStatus('Checking for a current campaign…');
    this.updateCampaignControls();
    void Promise.resolve()
      .then(() => this.callbacks.hasSave())
      .then((hasSave) => {
        if (
          this.disposed ||
          generation !== this.campaignCheckGeneration ||
          !this.open ||
          this.campaignProfile !== profile
        )
          return;
        this.campaignCheckPending = false;
        if (hasSave) this.showCampaignPreserve(profile);
        else this.startSelectedCampaign(true);
      })
      .catch(() => {
        if (
          this.disposed ||
          generation !== this.campaignCheckGeneration ||
          !this.open ||
          this.campaignProfile !== profile
        )
          return;
        this.campaignCheckPending = false;
        this.profileChooserOpen = true;
        this.el['title-menu']?.classList.add('is-hidden');
        if (this.el['title-profile']) this.el['title-profile'].hidden = false;
        this.showStatus('Unable to check for a current campaign.', true);
        this.updateCampaignControls();
        this.el['title-profile']
          ?.querySelector<HTMLButtonElement>('[data-profile="story"]')
          ?.focus();
      });
  }

  private showCampaignPreserve(profile: CampaignProfile): void {
    this.campaignDialogOpen = true;
    this.campaignProfile = profile;
    this.el['title-menu']?.classList.add('is-hidden');
    this.el['title-profile']?.setAttribute('hidden', '');
    const dialog = this.el['title-campaign-preserve'];
    if (!dialog) return;
    dialog.hidden = false;
    this.showStatus(null);
    this.updateCampaignControls();
    if (!this.campaignBusy)
      dialog.querySelector<HTMLButtonElement>('[data-campaign-preserve]')?.focus();
  }

  private backToProfileChooser(): void {
    if (this.campaignBusy) return;
    this.campaignCheckGeneration += 1;
    this.campaignDialogOpen = false;
    this.campaignProfile = null;
    this.showStatus(null);
    this.showProfileChooser();
  }

  private startSelectedCampaign(preserve: boolean): void {
    const profile = this.campaignProfile;
    if (!profile || this.campaignBusy || !this.open) return;
    this.campaignActionPending = true;
    this.updateCampaignControls();
    try {
      this.callbacks.onNewGame(profile, preserve);
    } catch {
      this.showStatus('Unable to start this campaign. Try again.', true);
    } finally {
      // Keep the preservation dialog mounted while Game performs the async
      // preserve/start operation. A failed operation can then be retried from
      // the same safe default instead of leaving the title with no route back.
      this.campaignActionPending = false;
      this.updateCampaignControls();
    }
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
    this.updateCampaignControls();
  }

  private updateCampaignControls(): void {
    const busy = this.campaignBusy;
    this.el['title-menu']?.querySelectorAll<HTMLButtonElement>('.title-item').forEach((button) => {
      button.disabled = busy;
    });
    this.el['title-profile']?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    this.el['title-campaign-preserve']
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        button.disabled = busy;
      });
  }

  private paintSelection(): void {
    this.el['title-menu']
      ?.querySelectorAll<HTMLElement>('.title-item')
      .forEach((node, i) => node.classList.toggle('is-selected', i === this.selected));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.open) return;

    if (this.campaignDialogOpen) {
      if (e.code === 'Escape' && !this.campaignBusy) {
        e.preventDefault();
        e.stopPropagation();
        this.backToProfileChooser();
      }
      return;
    }

    if (this.profileChooserOpen) {
      if (this.campaignBusy) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.showMenu();
      }
      return;
    }

    if (this.campaignBusy) return;

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
    this.disposed = true;
    this.campaignCheckGeneration += 1;
    this.cancelBindingCapture?.();
    if (this.cardTimer) clearTimeout(this.cardTimer);
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.root.innerHTML = '';
  }
}
