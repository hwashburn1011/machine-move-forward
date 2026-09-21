import { describe, expect, it } from 'vitest';
import { validateSettings } from '@/core/settings/SettingsStore';

describe('settings binding migration', () => {
  it('clamps terminal text scale and preserves explicit reduced motion', () => {
    expect(validateSettings({ terminalTextScale: 9, reducedMotion: true })).toMatchObject({
      terminalTextScale: 1.4,
      reducedMotion: true,
    });
    expect(validateSettings({ terminalTextScale: 0.2, reducedMotion: false })).toMatchObject({
      terminalTextScale: 1,
      reducedMotion: false,
    });
  });

  it('keeps supported arrows and right-side modifiers', () => {
    const settings = validateSettings({
      bindings: {
        'play:forward': 'ArrowUp',
        'play:sprint': 'ShiftRight',
        'play:crouch': 'ControlRight',
        'play:reload': 'Digit0',
      },
    });
    expect(settings.bindings).toEqual({
      'play:forward': 'ArrowUp',
      'play:sprint': 'ShiftRight',
      'play:crouch': 'ControlRight',
      'play:reload': 'Digit0',
    });
  });

  it('rejects unknown actions and unsupported codes', () => {
    const settings = validateSettings({
      bindings: {
        'play:unknown': 'KeyZ',
        'play:forward': 'KeyZ',
        'play:back': 'Digit10',
        'toString:forward': 'KeyY',
        'play:forward:extra': 'KeyY',
        'play:left': 'Key!',
      },
    });
    expect(settings.bindings).toEqual({ 'play:forward': 'KeyZ' });
  });
});
