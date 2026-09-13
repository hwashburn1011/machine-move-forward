import { describe, expect, it } from 'vitest';
import { validateSettings } from '@/core/settings/SettingsStore';

describe('settings binding migration', () => {
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
