import {
  DEFAULT_BINDINGS,
  type Binding,
  type BindingAction,
  type InputContext,
  getBindingLabel,
} from './Bindings';

export type InputAction = BindingAction | 'build-category';
type PhysicalCode = `key:${string}` | `mouse:${number}`;
const DANGEROUS: BindingAction[] = [
  'fire',
  'aim',
  'interact',
  'shoulder',
  'relocate',
  'demolish',
  'build',
];

export class InputManager {
  private readonly held = new Set<PhysicalCode>();
  private readonly pressed = new Set<BindingAction>();
  private readonly suppressed = new Set<PhysicalCode>();
  private maps: Record<InputContext, Binding[]>;
  private context: InputContext = 'play';
  private locked = false;
  private wheel = 0;
  private readonly look = { x: 0, y: 0 };
  private readonly consumedLook = { x: 0, y: 0 };
  private readonly bypassLock: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: { bypassPointerLock?: boolean; bindings?: Record<InputContext, Binding[]> } = {},
  ) {
    this.bypassLock = options.bypassPointerLock ?? false;
    this.maps = options.bindings ?? DEFAULT_BINDINGS;
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
  consumeWheel(): number {
    const wheel = this.wheel;
    this.wheel = 0;
    return wheel;
  }
  get inputContext(): InputContext {
    return this.context;
  }

  setBindings(maps: Record<InputContext, Binding[]>): void {
    this.maps = maps;
    this.pressed.clear();
    for (const code of this.held) this.suppressed.add(code);
  }

  setContext(context: InputContext): void {
    if (context === this.context) return;
    for (const code of this.held) {
      const oldAction = this.find(code, this.context)?.action;
      const newAction = this.find(code, context)?.action;
      if (
        DANGEROUS.includes(oldAction as BindingAction) ||
        (oldAction !== newAction &&
          (oldAction === undefined ||
            newAction === undefined ||
            DANGEROUS.includes(newAction as BindingAction)))
      )
        this.suppressed.add(code);
    }
    this.context = context;
    this.pressed.clear();
  }

  suppressUntilReleased(actions: InputAction[]): void {
    for (const code of this.held) {
      const action = this.find(code, this.context)?.action;
      if (actions.includes(action as InputAction)) this.suppressed.add(code);
    }
  }

  isDown(action: InputAction): boolean {
    for (const code of this.held) {
      if (this.find(code, this.context)?.action === action && !this.suppressed.has(code))
        return true;
    }
    return false;
  }

  consumePressed(action: InputAction): boolean {
    const current = action as BindingAction;
    if (!this.pressed.has(current)) return false;
    this.pressed.delete(current);
    return true;
  }

  consumeLook(): Readonly<{ x: number; y: number }> {
    this.consumedLook.x = this.look.x;
    this.consumedLook.y = this.look.y;
    this.look.x = 0;
    this.look.y = 0;
    return this.consumedLook;
  }

  endFrame(): void {
    this.wheel = 0;
  }
  readonly requestPointerLock = (): void => {
    if (!this.bypassLock && !this.locked) {
      try {
        const request = this.canvas.requestPointerLock();
        request?.catch(() => {
          /* Game retains the paused menu on denial. */
        });
      } catch {
        /* Browsers can also reject synchronously. */
      }
    }
  };
  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && !this.bypassLock) this.clearAll();
  };

  private find(code: PhysicalCode, context: InputContext = this.context): Binding | undefined {
    return this.maps[context]?.find((binding) =>
      binding.mouse !== undefined
        ? code === `mouse:${binding.mouse}`
        : code === `key:${binding.code}`,
    );
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Text controls own their keyboard input, including Space in a campaign
    // name. Leave Escape untouched so the open panel can receive and handle it.
    if (isEditableTarget(event.target)) return;
    const code: PhysicalCode = `key:${event.code}`;
    const binding = this.find(code);
    if (!binding) return;
    if (['Tab', 'Space', 'PageUp', 'PageDown', 'Home'].includes(event.code)) event.preventDefault();
    this.held.add(code);
    if (!event.repeat && !this.suppressed.has(code)) this.pressed.add(binding.action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const code: PhysicalCode = `key:${event.code}`;
    this.held.delete(code);
    this.suppressed.delete(code);
  };
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.pointerLocked && this.context !== 'catalog') return;
    const code: PhysicalCode = `mouse:${event.button}`;
    const binding = this.find(code);
    if (binding) {
      this.held.add(code);
      if (!this.suppressed.has(code)) this.pressed.add(binding.action);
    }
  };
  private readonly onMouseUp = (event: MouseEvent): void => {
    const code: PhysicalCode = `mouse:${event.button}`;
    this.held.delete(code);
    this.suppressed.delete(code);
  };
  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.pointerLocked) {
      this.look.x += event.movementX;
      this.look.y += event.movementY;
    }
  };
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.pointerLocked || this.context === 'catalog') this.wheel += event.deltaY;
  };
  private readonly onBlur = (): void => this.clearAll();
  clearAll(): void {
    this.held.clear();
    this.pressed.clear();
    this.suppressed.clear();
    this.look.x = 0;
    this.look.y = 0;
    this.wheel = 0;
  }
  hasKeyBinding(code: string): boolean {
    return this.find(`key:${code}`) !== undefined;
  }
  getBindingLabel(action: BindingAction, context: InputContext = this.context): string {
    return getBindingLabel(action, context, this.maps);
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const constructors = [
    globalThis.HTMLInputElement,
    globalThis.HTMLTextAreaElement,
    globalThis.HTMLSelectElement,
  ];
  if (
    constructors.some(
      (constructor) => typeof constructor === 'function' && target instanceof constructor,
    )
  )
    return true;
  const element = target as {
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selectors: string) => unknown;
  };
  if (element.isContentEditable) return true;
  const contentEditable = element.getAttribute?.('contenteditable');
  if (contentEditable !== null && contentEditable !== undefined && contentEditable !== 'false')
    return true;
  return Boolean(element.closest?.('[contenteditable="true"], [contenteditable=""]'));
}
