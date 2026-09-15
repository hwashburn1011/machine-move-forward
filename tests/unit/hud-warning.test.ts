/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { HUD } from '@/ui/HUD';

describe('HUD owned warning lifecycle', () => {
  it('renders a claim and clears only the matching token', () => {
    const root = document.createElement('section');
    const hud = new HUD(root, new EventBus());
    const token = hud.claimWarning('patrol', 'Patrol inbound');
    expect(root.querySelector('#hud-warning')?.textContent).toBe('Patrol inbound');
    expect(hud.clearWarning(token)).toBe(true);
    expect(root.querySelector('#hud-warning')?.classList.contains('is-active')).toBe(false);
    hud.dispose();
  });

  it('does not let a stale token erase an ordinary critical notice', () => {
    const root = document.createElement('section');
    const hud = new HUD(root, new EventBus());
    const token = hud.claimWarning('patrol', 'Patrol inbound');
    hud.setWarning('Critical failure');
    expect(hud.clearWarning(token)).toBe(false);
    expect(root.querySelector('#hud-warning')?.textContent).toBe('Critical failure');
    hud.dispose();
  });

  it('invalidates the previous claim when the owner is reused', () => {
    const root = document.createElement('section');
    const hud = new HUD(root, new EventBus());
    const first = hud.claimWarning('patrol', 'First patrol');
    const second = hud.claimWarning('patrol', 'Second patrol');
    expect(hud.clearWarning(first)).toBe(false);
    expect(root.querySelector('#hud-warning')?.textContent).toBe('Second patrol');
    expect(hud.clearWarning(second)).toBe(true);
    hud.dispose();
  });
});
