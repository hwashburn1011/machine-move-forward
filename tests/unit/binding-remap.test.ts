import { describe, expect, it } from 'vitest';
import { effectiveBindingCode, rebindAction, withBindingOverrides } from '@/core/input/Bindings';
import { validateSettings } from '@/core/settings/SettingsStore';

describe('binding remap transactions', () => {
  it('detects defaults and swaps effective bindings without restoring a conflict', () => {
    const changed = rebindAction({}, 'play', 'back', 'KeyW');
    expect(changed.conflict).toBe('forward');
    expect(effectiveBindingCode('play', 'back', changed.overrides)).toBe('KeyW');
    expect(effectiveBindingCode('play', 'forward', changed.overrides)).toBe('KeyS');

    const map = withBindingOverrides(changed.overrides).play;
    expect(map.find((binding) => binding.action === 'back')?.code).toBe('KeyW');
    expect(map.find((binding) => binding.action === 'forward')?.code).toBe('KeyS');
  });

  it('swaps against an existing override as part of the same transaction', () => {
    const first = rebindAction({}, 'play', 'forward', 'KeyQ').overrides;
    const changed = rebindAction(first, 'play', 'left', 'KeyQ');
    expect(changed.conflict).toBe('forward');
    expect(effectiveBindingCode('play', 'left', changed.overrides)).toBe('KeyQ');
    expect(effectiveBindingCode('play', 'forward', changed.overrides)).toBe('KeyA');
  });

  it('persists the canonical mouse code accepted by the input registry', () => {
    const settings = validateSettings({ bindings: { 'play:fire': 'Mouse3' } });
    expect(settings.bindings['play:fire']).toBe('Mouse3');
    expect(
      withBindingOverrides(settings.bindings).play.find((b) => b.action === 'fire'),
    ).toMatchObject({
      code: 'Mouse3',
      mouse: 3,
    });
  });
});
