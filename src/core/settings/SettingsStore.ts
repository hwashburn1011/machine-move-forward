import { QUALITY_TIERS, type QualityTier } from '@/core/renderer/QualitySettings';
import { DEFAULT_AMBIENCE_VOLUME } from '@/audio/SoundBank';
import { DEFAULT_BINDINGS } from '@/core/input/Bindings';

export const SETTINGS_KEY = 'mmf-settings';
export const SETTINGS_VERSION = 3;
export type Shoulder = 'left' | 'right';
export interface Settings {
  version: number;
  volume: number;
  ambienceVolume: number;
  quality: QualityTier | null;
  sensitivity: number;
  hipFov: number;
  shoulder: Shoulder;
  terminalTextScale: number;
  reducedMotion: boolean;
  bindings: Record<string, string>;
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  volume: 0.8,
  ambienceVolume: DEFAULT_AMBIENCE_VOLUME,
  quality: null,
  sensitivity: 1,
  hipFov: 55,
  shoulder: 'right',
  terminalTextScale: 1,
  reducedMotion: prefersReducedMotion(),
  bindings: {},
};

const numberIn = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;

const SUPPORTED_CODES =
  /^(?:Key[A-Z]|Digit[0-9]|Mouse[0-4]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)|Space|Tab|Escape|Enter|Backspace|Delete|Insert|PageUp|PageDown|Home|End|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Arrow(?:Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|ContextMenu)$/;
export const isSupportedBindingCode = (code: string): boolean => SUPPORTED_CODES.test(code);

export function validateSettings(value: unknown): Settings {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const quality = QUALITY_TIERS.includes(raw.quality as QualityTier)
    ? (raw.quality as QualityTier)
    : null;
  const bindings: Record<string, string> = {};
  if (raw.bindings && typeof raw.bindings === 'object') {
    for (const [key, code] of Object.entries(raw.bindings as Record<string, unknown>)) {
      const [context, action, extra] = key.split(':');
      if (extra !== undefined || !context || !action || !Object.hasOwn(DEFAULT_BINDINGS, context))
        continue;
      if (
        DEFAULT_BINDINGS[context as keyof typeof DEFAULT_BINDINGS].some(
          (binding) => binding.action === action,
        ) &&
        typeof code === 'string' &&
        isSupportedBindingCode(code)
      )
        bindings[key] = code;
    }
  }
  return {
    version: SETTINGS_VERSION,
    volume: numberIn(raw.volume, 0, 1, DEFAULT_SETTINGS.volume),
    ambienceVolume: numberIn(raw.ambienceVolume, 0, 1, DEFAULT_SETTINGS.ambienceVolume),
    quality,
    sensitivity: numberIn(raw.sensitivity, 0.25, 3, 1),
    hipFov: numberIn(raw.hipFov, 50, 80, 55),
    shoulder: raw.shoulder === 'left' ? 'left' : 'right',
    terminalTextScale: numberIn(raw.terminalTextScale, 1, 1.4, DEFAULT_SETTINGS.terminalTextScale),
    reducedMotion:
      typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    bindings,
  };
}

export function loadSettings(storage?: Storage): Settings {
  try {
    storage ??= globalThis.localStorage;
    const text = storage?.getItem(SETTINGS_KEY);
    return text ? validateSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS, bindings: {} };
  } catch {
    return { ...DEFAULT_SETTINGS, bindings: {} };
  }
}

export function saveSettings(settings: Settings, storage?: Storage): void {
  try {
    storage ??= globalThis.localStorage;
    storage?.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(settings)));
  } catch {
    /* private mode */
  }
}

export function resetSettings(storage?: Storage): Settings {
  const next = { ...DEFAULT_SETTINGS, bindings: {} };
  saveSettings(next, storage);
  return next;
}
