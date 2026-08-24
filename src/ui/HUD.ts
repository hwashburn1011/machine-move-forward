import type { EventBus } from '@/core/events/EventBus';
import { damageBearing } from './DamageDirection';
import { deckBearingName } from './DeckBearing';
import './hud.css';

export interface HUDState {
  health: number;
  maxHealth: number;
  ammoInMag: number;
  reserveAmmo: number;
  /** Reserve is unlimited: show a symbol rather than a number that never moves. */
  infiniteAmmo: boolean;
  weaponName: string;
  machineSpeed: number;
  distanceTraveled: number;
  /** Current weapon cone half-angle, degrees. Drives crosshair spread. */
  spread: number;
  moving: boolean;
  pointerLocked: boolean;
  /** Where the player is and which way they face, for the damage arc. */
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  /** How many scavengers are aboard right now. */
  enemiesAboard: number;
  /** Deck half-extents, so a boarding alert can name where. */
  deckHalfWidth: number;
  deckHalfLength: number;
}

/**
 * DOM overlay HUD (handoff section 43).
 *
 * Discrete changes arrive by event; continuous values are polled each frame.
 * Every write is guarded by a cached previous value — writing unchanged text
 * to the DOM every frame is a real, measurable layout cost for no benefit.
 */
/** Seconds a damage indicator stays up after a hit. */
const HURT_SECONDS = 1.1;

/** Seconds a boarding alert stays up. */
const BOARDING_SECONDS = 4;

/** Seconds a loot line stays up. */
const PICKUP_SECONDS = 2.6;

export class HUD {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly disposers: (() => void)[] = [];
  private readonly cache = new Map<string, string>();

  private reloadEndsAt = 0;
  private reloadDuration = 0;
  private hitFlashUntil = 0;
  /** Where the last hit came from, and how long the arc stays up. */
  private hurtFrom: { x: number; z: number } | null = null;
  private hurtUntil = 0;
  private hurtWeight = 0;
  /** Boarding alert text, and when it stops being shown. */
  private boardingText = '';
  private boardingUntil = 0;
  private pickupText = '';
  private pickupUntil = 0;
  /** Last deck size seen, so a spawn handler can name a position. */
  private deckHalf = { w: 5, l: 8 };

  constructor(root: HTMLElement, bus: EventBus) {
    root.innerHTML = `
      <div id="hud-machine" class="hud-panel">
        <div class="hud-label">Machine</div>
        <div class="hud-row"><span>Speed</span><span class="hud-value" id="hud-speed">0.0 m/s</span></div>
        <div class="hud-row"><span>Distance</span><span class="hud-value" id="hud-distance">0 m</span></div>
        <div class="hud-row"><span>Aboard</span><span class="hud-value" id="hud-threats">0</span></div>
      </div>

      <div id="hud-health" class="hud-panel">
        <div class="hud-label">Vitals</div>
        <div class="hud-value" id="hud-health-value">100</div>
        <div id="hud-health-bar"><div id="hud-health-fill"></div></div>
      </div>

      <div id="hud-weapon" class="hud-panel">
        <div class="hud-label">Weapon</div>
        <div class="hud-value" id="hud-ammo">30<span id="hud-ammo-reserve"> / 150</span></div>
        <div id="hud-weapon-name">Scrapline AR</div>
        <div id="hud-reload"><div id="hud-reload-fill"></div></div>
      </div>

      <div id="hud-boarding"></div>
      <div id="hud-pickup"></div>
      <div id="hud-damage"><div id="hud-damage-arc"></div></div>
      <div id="hud-crosshair"><i></i><i></i><i></i><i></i></div>
      <div id="hud-prompt"></div>
      <div id="hud-warning"></div>
      <div id="hud-lock">Click to take control</div>
    `;

    for (const id of [
      'hud-speed',
      'hud-distance',
      'hud-threats',
      'hud-boarding',
      'hud-pickup',
      'hud-health',
      'hud-health-value',
      'hud-health-fill',
      'hud-ammo',
      'hud-ammo-reserve',
      'hud-weapon-name',
      'hud-reload',
      'hud-reload-fill',
      'hud-damage',
      'hud-damage-arc',
      'hud-crosshair',
      'hud-prompt',
      'hud-warning',
      'hud-lock',
    ]) {
      const node = root.querySelector<HTMLElement>(`#${id}`);
      if (node) this.el[id] = node;
    }

    this.disposers.push(
      bus.on('weapon:reload-started', (e) => {
        this.reloadDuration = e.durationMs / 1000;
        this.reloadEndsAt = performance.now() / 1000 + this.reloadDuration;
        this.el['hud-reload']?.classList.add('is-active');
      }),
      bus.on('weapon:reload-finished', () => {
        this.reloadEndsAt = 0;
        this.el['hud-reload']?.classList.remove('is-active');
      }),
      bus.on('combat:hit', (e) => {
        // Only flash for hits on something that can be hurt.
        if (e.targetId) this.hitFlashUntil = performance.now() / 1000 + 0.12;
      }),
      bus.on('enemy:spawned', (e) => {
        // One scavenger arrives every 250m, at the deck edge, deliberately
        // placed as far from the player as the deck allows -- which puts it
        // behind them, screened by cargo, on a deck they are usually facing
        // away from. Nothing announced it, so the first news of an arrival was
        // being hit by it.
        this.boardingText = `Scavenger boarding ${deckBearingName(
          e.position.x,
          e.position.z,
          this.deckHalf.w,
          this.deckHalf.l,
        )}`;
        this.boardingUntil = performance.now() / 1000 + BOARDING_SECONDS;
      }),
      bus.on('loot:collected', (e) => {
        // Killing something has to visibly pay. Without this the only sign is
        // a number in a panel the player is not looking at mid-fight.
        this.pickupText = e.items.map((i) => `+${i.count} ${i.id}`).join('   ');
        this.pickupUntil = performance.now() / 1000 + PICKUP_SECONDS;
      }),
      bus.on('player:damaged', (e) => {
        // Being hit produced no feedback at all before this: the only tell was
        // a number in the corner quietly going down, which reads as the game
        // malfunctioning rather than as something attacking you.
        this.hurtFrom = { x: e.from.x, z: e.from.z };
        this.hurtUntil = performance.now() / 1000 + HURT_SECONDS;
        // A scratch and a serious hit should not look the same.
        this.hurtWeight = Math.min(0.85, Math.max(0.5, e.amount / 25));
        // Restart the panel kick even on back-to-back hits.
        const panel = this.el['hud-health'];
        if (panel) {
          panel.classList.remove('is-hurt');
          void panel.offsetWidth;
          panel.classList.add('is-hurt');
        }
      }),
      bus.on('player:respawned', () => {
        this.hurtFrom = null;
        this.hurtUntil = 0;
      }),
      bus.on('player:died', () => this.setWarning('Critical failure')),
      bus.on('player:respawned', () => this.setWarning(null)),
    );
  }

  setPrompt(text: string | null): void {
    const node = this.el['hud-prompt'];
    if (!node) return;
    node.style.display = text ? 'block' : 'none';
    if (text) this.write('prompt', node, text);
  }

  setWarning(text: string | null): void {
    const node = this.el['hud-warning'];
    if (!node) return;
    node.classList.toggle('is-active', text !== null);
    if (text) this.write('warning', node, text);
  }

  update(state: HUDState): void {
    const now = performance.now() / 1000;

    // --- Vitals ------------------------------------------------------------
    const hp = Math.round(state.health);
    this.write('hp', this.el['hud-health-value'], String(hp));
    const pct = Math.max(0, Math.min(1, state.health / state.maxHealth));
    this.style('hpfill', this.el['hud-health-fill'], 'width', `${(pct * 100).toFixed(1)}%`);
    this.el['hud-health']?.classList.toggle('is-critical', pct <= 0.3);

    // --- Threats -----------------------------------------------------------
    this.deckHalf = { w: state.deckHalfWidth, l: state.deckHalfLength };
    this.write('threats', this.el['hud-threats'], String(state.enemiesAboard));
    this.el['hud-threats']?.classList.toggle('is-hot', state.enemiesAboard > 0);

    const boarding = this.el['hud-boarding'];
    if (boarding) {
      const showing = this.boardingUntil - now > 0;
      boarding.classList.toggle('is-active', showing);
      if (showing) this.write('boarding', boarding, this.boardingText);
    }

    const pickup = this.el['hud-pickup'];
    if (pickup) {
      const showing = this.pickupUntil - now > 0;
      pickup.classList.toggle('is-active', showing);
      if (showing) this.write('pickup', pickup, this.pickupText);
    }

    // --- Damage ------------------------------------------------------------
    const hurt = this.el['hud-damage'];
    if (hurt) {
      const left = this.hurtUntil - now;
      const showing = left > 0 && this.hurtFrom !== null;
      hurt.classList.toggle('is-active', showing);
      if (showing && this.hurtFrom) {
        // Recomputed every frame rather than frozen at the moment of impact,
        // so turning to look sweeps the arc round to meet the attacker.
        const bearing = damageBearing(
          this.hurtFrom.x,
          this.hurtFrom.z,
          state.playerX,
          state.playerZ,
          state.cameraYaw,
        );
        const fade = Math.min(1, left / HURT_SECONDS);
        this.style(
          'hurtrot',
          this.el['hud-damage-arc'],
          'transform',
          `rotate(${((bearing * 180) / Math.PI).toFixed(1)}deg)`,
        );
        this.style('hurtop', hurt, 'opacity', (fade * this.hurtWeight).toFixed(3));
      }
    }

    // --- Weapon ------------------------------------------------------------
    this.write('mag', this.el['hud-ammo'], String(state.ammoInMag), true);
    this.write(
      'reserve',
      this.el['hud-ammo-reserve'],
      state.infiniteAmmo ? ' / ∞' : ` / ${state.reserveAmmo}`,
    );
    this.write('wname', this.el['hud-weapon-name'], state.weaponName);

    if (this.reloadEndsAt > 0 && this.reloadDuration > 0) {
      const remaining = Math.max(0, this.reloadEndsAt - now);
      const progress = 1 - remaining / this.reloadDuration;
      this.style(
        'reload',
        this.el['hud-reload-fill'],
        'width',
        `${(progress * 100).toFixed(0)}%`,
      );
    }

    // --- Machine -----------------------------------------------------------
    this.write('speed', this.el['hud-speed'], `${state.machineSpeed.toFixed(1)} m/s`);
    this.write('dist', this.el['hud-distance'], `${Math.round(state.distanceTraveled)} m`);

    // --- Crosshair ---------------------------------------------------------
    // Spread is an angle; the crosshair gap should track it, plus a bump while
    // moving so the player can feel accuracy loss without reading a number.
    // The ticks are pinned to the container edges, so resizing the container
    // is what opens and closes the gap — no per-tick maths needed.
    const gap = 3 + state.spread * 2.6 + (state.moving ? 3 : 0);
    const size = `${(16 + gap * 2).toFixed(1)}px`;
    this.style('crossW', this.el['hud-crosshair'], 'width', size);
    this.style('crossH', this.el['hud-crosshair'], 'height', size);
    this.el['hud-crosshair']?.classList.toggle('is-hit', now < this.hitFlashUntil);

    this.el['hud-lock']?.classList.toggle('is-hidden', state.pointerLocked);
  }

  /** Write only when the value actually changed. */
  private write(key: string, node: HTMLElement | undefined, value: string, firstChildOnly = false): void {
    if (!node) return;
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    if (firstChildOnly && node.firstChild) node.firstChild.nodeValue = value;
    else if (!firstChildOnly) node.textContent = value;
  }

  private style(key: string, node: HTMLElement | undefined, prop: string, value: string): void {
    if (!node) return;
    const cacheKey = `${key}:${prop}`;
    if (this.cache.get(cacheKey) === value) return;
    this.cache.set(cacheKey, value);
    node.style.setProperty(prop, value);
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
  }
}
