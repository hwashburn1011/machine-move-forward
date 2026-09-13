export type InputContext = 'play' | 'build-placement' | 'catalog' | 'mounted' | 'menu';
export type BindingAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'interact'
  | 'contextual'
  | 'inventory'
  | 'build'
  | 'catalog'
  | 'rotate-left'
  | 'rotate-right'
  | 'next-level'
  | 'previous-level'
  | 'auto-level'
  | 'shoulder'
  | 'relocate'
  | 'demolish'
  | 'cancel'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8'
  | 'slot9';
export interface Binding {
  action: BindingAction;
  code: string;
  mouse?: number;
}
export const DEFAULT_BINDINGS: Record<InputContext, Binding[]> = {
  play: [
    { action: 'forward', code: 'KeyW' },
    { action: 'back', code: 'KeyS' },
    { action: 'left', code: 'KeyA' },
    { action: 'right', code: 'KeyD' },
    { action: 'jump', code: 'Space' },
    { action: 'sprint', code: 'ShiftLeft' },
    { action: 'sprint', code: 'ShiftRight' },
    { action: 'crouch', code: 'ControlLeft' },
    { action: 'crouch', code: 'KeyC' },
    { action: 'fire', code: 'Mouse0', mouse: 0 },
    { action: 'aim', code: 'Mouse2', mouse: 2 },
    { action: 'reload', code: 'KeyR' },
    { action: 'interact', code: 'KeyE' },
    { action: 'contextual', code: 'KeyF' },
    { action: 'inventory', code: 'Tab' },
    { action: 'slot1', code: 'Digit1' },
    { action: 'slot2', code: 'Digit2' },
    { action: 'build', code: 'KeyB' },
    { action: 'shoulder', code: 'KeyV' },
    { action: 'cancel', code: 'Escape' },
  ],
  'build-placement': [
    { action: 'forward', code: 'KeyW' },
    { action: 'back', code: 'KeyS' },
    { action: 'left', code: 'KeyA' },
    { action: 'right', code: 'KeyD' },
    { action: 'jump', code: 'Space' },
    { action: 'sprint', code: 'ShiftLeft' },
    { action: 'sprint', code: 'ShiftRight' },
    { action: 'crouch', code: 'ControlLeft' },
    { action: 'crouch', code: 'KeyC' },
    { action: 'build', code: 'KeyB' },
    { action: 'catalog', code: 'KeyG' },
    { action: 'fire', code: 'Mouse0', mouse: 0 },
    { action: 'aim', code: 'Mouse2', mouse: 2 },
    { action: 'rotate-left', code: 'KeyQ' },
    { action: 'rotate-right', code: 'KeyE' },
    { action: 'next-level', code: 'PageUp' },
    { action: 'previous-level', code: 'PageDown' },
    { action: 'auto-level', code: 'Home' },
    { action: 'relocate', code: 'KeyV' },
    { action: 'demolish', code: 'KeyX' },
    { action: 'cancel', code: 'Escape' },
  ],
  catalog: [
    { action: 'build', code: 'KeyB' },
    { action: 'cancel', code: 'Escape' },
    { action: 'fire', code: 'Mouse0', mouse: 0 },
  ],
  mounted: [
    { action: 'fire', code: 'Mouse0', mouse: 0 },
    { action: 'aim', code: 'Mouse2', mouse: 2 },
    { action: 'interact', code: 'KeyE' },
    { action: 'cancel', code: 'Escape' },
  ],
  menu: [{ action: 'cancel', code: 'Escape' }],
};
export const ACTION_LABELS: Record<string, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
  sprint: 'Sprint',
  crouch: 'Crouch',
  fire: 'Fire / place',
  aim: 'Aim / cancel',
  reload: 'Reload',
  interact: 'Use',
  contextual: 'Interact',
  inventory: 'Inventory',
  build: 'Build / exit',
  catalog: 'Open catalog',
  'rotate-left': 'Rotate left',
  'rotate-right': 'Rotate right',
  'next-level': 'Next deck',
  'previous-level': 'Previous deck',
  'auto-level': 'Auto deck',
  shoulder: 'Swap shoulder',
  relocate: 'Relocate',
  demolish: 'Demolish',
  cancel: 'Menu / cancel',
};
export function getBindingLabel(
  action: BindingAction,
  context: InputContext,
  bindings = DEFAULT_BINDINGS,
) {
  const b = bindings[context].find((x) => x.action === action);
  return b
    ? b.mouse !== undefined
      ? `Mouse ${b.mouse === 0 ? 'left' : 'right'}`
      : b.code.replace(/^Key|^Digit/, '')
    : (ACTION_LABELS[action] ?? action);
}
export function bindingConflicts(bindings: Binding[], candidate: Binding) {
  return bindings.filter(
    (b) =>
      b.action !== candidate.action && b.code === candidate.code && b.mouse === candidate.mouse,
  );
}

/** The primary effective code shown by the settings UI for an action. */
export function effectiveBindingCode(
  context: InputContext,
  action: BindingAction,
  overrides: Record<string, string> = {},
): string | undefined {
  return (
    overrides[`${context}:${action}`] ??
    DEFAULT_BINDINGS[context].find((b) => b.action === action)?.code
  );
}

export interface BindingChange {
  overrides: Record<string, string>;
  conflict?: BindingAction;
}

/**
 * Rebind one action against the effective context map. When the physical input
 * is already in use, swap the two primary bindings so neither action silently
 * falls back onto the key that was just assigned away from it.
 */
export function rebindAction(
  overrides: Record<string, string>,
  context: InputContext,
  action: BindingAction,
  code: string,
): BindingChange {
  const oldCode = effectiveBindingCode(context, action, overrides);
  const effective = withBindingOverrides(overrides)[context];
  const conflict = effective.find(
    (binding) => binding.action !== action && binding.code === code,
  )?.action;
  const next = { ...overrides, [`${context}:${action}`]: code };
  if (conflict && oldCode) next[`${context}:${conflict}`] = oldCode;
  return { overrides: next, conflict };
}
export function withBindingOverrides(
  overrides: Record<string, string> = {},
): Record<InputContext, Binding[]> {
  const result = Object.fromEntries(
    Object.entries(DEFAULT_BINDINGS).map(([c, bs]) => [c, bs.map((b) => ({ ...b }))]),
  ) as Record<InputContext, Binding[]>;
  for (const [key, code] of Object.entries(overrides)) {
    const [context, action] = key.split(':') as [InputContext, BindingAction];
    if (
      !result[context] ||
      !result[context].some((b) => b.action === action) ||
      action === 'cancel' ||
      !code
    )
      continue;
    const target = result[context].find((b) => b.action === action)!;
    if (code.startsWith('Mouse')) {
      target.code = code;
      target.mouse = Number(code.slice(5));
    } else {
      target.code = code;
      delete target.mouse;
    }
    // An action may have convenience aliases in the defaults (for example
    // both Shift keys). An explicit remap replaces that physical set; leaving
    // the aliases live would preserve conflicts the settings UI just resolved.
    result[context] = result[context].filter(
      (binding) => binding.action !== action || binding === target,
    );
  }
  return result;
}
