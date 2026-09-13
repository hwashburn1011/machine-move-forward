import type { InputContext } from '@/core/input/Bindings';

export type ControlLabelResolver = (action: string, context: InputContext) => string;

/** Replaces complete, bracketed control tokens while leaving ordinary prose intact. */
export function formatControlText(
  text: string,
  resolve: ControlLabelResolver,
  context: InputContext = 'play',
): string {
  const aliases: Record<string, string> = {
    E: 'interact',
    F: 'contextual',
    B: 'build',
    G: 'catalog',
    R: 'reload',
    Shift: 'sprint',
    Space: 'jump',
    Esc: 'cancel',
    Escape: 'cancel',
    Tab: 'inventory',
    LMB: 'fire',
    RMB: 'aim',
    Q: 'rotate-left',
    W: 'forward',
    A: 'left',
    S: 'back',
    D: 'right',
    'Hold E': 'interact',
    'Hold X': 'demolish',
  };
  return text.replace(/\[((?:Hold )?[A-Za-z]+(?: [A-Za-z]+)?)\]/g, (token, key: string) => {
    const action = aliases[key];
    return action ? `[${resolve(action, context)}]` : token;
  });
}
