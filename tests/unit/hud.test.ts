/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { HUD } from '@/ui/HUD';

describe('HUD story state cache', () => {
  it('reapplies a chapter title after a phase event targets the same node', () => {
    const root = document.createElement('section');
    const bus = new EventBus();
    const hud = new HUD(root, bus);

    hud.setStoryState({
      phase: 'docked',
      title: 'Glass Orchard',
      objective: 'Restore the archive isolators.',
      remainingM: 0,
    });
    expect(root.querySelector('#hud-story-phase')?.textContent).toBe('Glass Orchard');

    bus.emit('story:phase', { chapterId: 'glass-orchard', phase: 'docked' });
    expect(root.querySelector('#hud-story-phase')?.textContent).toBe('The Wake');

    hud.setStoryState({
      phase: 'docked',
      title: 'Glass Orchard',
      objective: 'Restore the archive isolators.',
      remainingM: 0,
    });
    expect(root.querySelector('#hud-story-phase')?.textContent).toBe('Glass Orchard');
    hud.dispose();
  });

  it('does not let a signal event permanently suppress the next detail update', () => {
    const root = document.createElement('section');
    const bus = new EventBus();
    const hud = new HUD(root, bus);

    hud.setStoryState({ phase: 'approach', title: 'Glass Orchard', objective: 'Dock safely.' });
    bus.emit('story:signal', { strength: 1, remainingM: 50, text: 'Incoming transmission.' });
    hud.setStoryState({ phase: 'approach', title: 'Glass Orchard', objective: 'Dock safely.' });

    expect(root.querySelector('#hud-story-detail')?.textContent).toBe('Dock safely.');
    hud.dispose();
  });
});
