export type InputAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'fire'
  | 'aim'
  | 'demolish'
  | 'reload'
  | 'interact'
  | 'contextual'
  | 'inventory'
  | 'build'
  | 'rotate-left'
  | 'rotate-right'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6';

/** Control map from handoff section 8. */
const KEY_MAP: Record<string, InputAction> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyR: 'reload',
  KeyE: 'interact',
  KeyF: 'contextual',
  Tab: 'inventory',
  KeyB: 'build',
  KeyQ: 'rotate-left',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
  Digit5: 'slot5',
  Digit6: 'slot6',
};

/**
 * Keys that mean one thing in normal play and another in build mode.
 *
 * Both actions are raised and the consumer picks by mode. Rebinding the map at
 * runtime instead would leave a stale held action if the mode flips while the
 * key is down.
 */
const SECONDARY_KEY_MAP: Record<string, InputAction> = {
  KeyE: 'rotate-right',
};

/**
 * Keyboard and mouse state.
 *
 * Held keys and edge-triggered presses are tracked separately. At high frame
 * rates a single keypress can straddle two fixed steps, and without the
 * `consumePressed` drain it would fire the action twice.
 */
export class InputManager {
  private readonly held = new Set<InputAction>();
  private readonly pressed = new Set<InputAction>();
  private readonly look = { x: 0, y: 0 };
  private wheel = 0;
  private locked = false;

  /**
   * When true, input is accepted without pointer lock. Headless browsers
   * cannot reliably acquire pointer lock, so the e2e and screenshot harnesses
   * need a way in.
   */
  private readonly bypassLock: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: { bypassPointerLock?: boolean } = {},
  ) {
    this.bypassLock = options.bypassPointerLock ?? false;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    canvas.addEventListener('click', this.requestPointerLock);
  }

  get pointerLocked(): boolean {
    return this.locked || this.bypassLock;
  }

  get lookDelta(): { x: number; y: number } {
    return this.look;
  }

  get wheelDelta(): number {
    return this.wheel;
  }

  isDown(action: InputAction): boolean {
    return this.held.has(action);
  }

  /** True once per physical press. Drains the flag. */
  consumePressed(action: InputAction): boolean {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  /** Clear per-frame deltas. Call after every render. */
  endFrame(): void {
    this.look.x = 0;
    this.look.y = 0;
    this.wheel = 0;
  }

  readonly requestPointerLock = (): void => {
    if (this.bypassLock || this.locked) return;
    void this.canvas.requestPointerLock();
  };

  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && !this.bypassLock) this.clearAll();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Tab would move focus out of the canvas and Space would scroll.
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    const action = KEY_MAP[e.code];
    const secondary = SECONDARY_KEY_MAP[e.code];
    if (!action && !secondary) return;

    for (const a of [action, secondary]) {
      if (!a) continue;
      if (!e.repeat) this.pressed.add(a);
      this.held.add(a);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    const secondary = SECONDARY_KEY_MAP[e.code];
    if (action) this.held.delete(action);
    if (secondary) this.held.delete(secondary);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    if (e.button === 0) {
      this.held.add('fire');
      this.pressed.add('fire');
    }
    if (e.button === 2) {
      // RMB means aim in combat and demolish in build mode. Both actions are
      // raised and the consumer picks by mode; rebinding at runtime instead
      // would leave a stuck 'aim' if the mode flips mid-press.
      this.held.add('aim');
      this.held.add('demolish');
      this.pressed.add('demolish');
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.held.delete('fire');
    if (e.button === 2) {
      this.held.delete('aim');
      this.held.delete('demolish');
    }
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.look.x += e.movementX;
    this.look.y += e.movementY;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.pointerLocked) this.wheel += e.deltaY;
  };

  /** Losing focus mid-key would otherwise leave the player running forever. */
  private readonly onBlur = (): void => this.clearAll();

  private clearAll(): void {
    this.held.clear();
    this.pressed.clear();
    this.look.x = 0;
    this.look.y = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.removeEventListener('click', this.requestPointerLock);
  }
}
