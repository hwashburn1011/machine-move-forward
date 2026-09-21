/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { HUD } from '@/ui/HUD';
import { MachineStatusView } from '@/ui/MachineStatusView';

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

  it('separates the expanded empty-fuel helper and moves status back after refueling', () => {
    const root = document.createElement('section');
    const hud = new HUD(root, new EventBus());
    const status = new MachineStatusView(root);
    const state = {
      health: 100,
      maxHealth: 100,
      ammoInMag: 30,
      reserveAmmo: 90,
      infiniteAmmo: false,
      reelReady: false,
      weaponName: 'Scrapline AR',
      machineSpeed: 1,
      distanceTraveled: 12,
      spread: 0,
      moving: false,
      pointerLocked: true,
      playerX: 0,
      playerZ: 0,
      cameraYaw: 0,
      enemiesAboard: 0,
      deckHalfWidth: 6,
      deckHalfLength: 8,
      machineCondition: 'Sound',
      machineStopped: true,
      powerDraw: 0,
      powerCapacity: 0,
      fuel: 0,
      powerShed: false,
      hydration: 100,
      nourishment: 100,
    };

    hud.setControlLabels((action) =>
      action === 'contextual' ? 'Use' : action === 'interact' ? 'Interact' : action,
    );
    hud.update(state);
    const machine = root.querySelector('#hud-machine') as HTMLElement;
    const helper = root.querySelector('#hud-fuel-help') as HTMLElement;
    expect(machine.parentElement?.classList.contains('hud-machine-stack')).toBe(true);
    expect(status.root.parentElement).toBe(machine.parentElement);
    expect(machine.classList.contains('has-fuel-help')).toBe(true);
    expect(helper.style.display).toBe('block');
    expect(helper.textContent).toBe(
      'Fuel empty · emergency crawl\nReel in salvage [Use]. Refuel a generator [Interact].',
    );

    hud.update({ ...state, fuel: 8, machineStopped: false });
    expect(helper.style.display).toBe('none');
    expect(machine.classList.contains('has-fuel-help')).toBe(false);
    status.dispose();
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

  it('renders one finite projected cargo cue and hides invalid or cleared positions', () => {
    const root = document.createElement('section');
    const hud = new HUD(root, new EventBus());
    const hint = root.querySelector('#hud-cargo-hint') as HTMLElement;
    hud.setCargoHint({ x: 0.25, y: 0.4, distance: 12.7, key: 'F' });
    expect(hint.style.display).toBe('block');
    expect(hint.style.left).toBe('25%');
    expect(hint.style.top).toBe('40%');
    expect(hint.textContent).toBe('REEL CARGO · 13 m / [F]');
    hud.setCargoHint({ x: Number.NaN, y: 0.4, distance: 12, key: 'F' });
    expect(hint.style.display).toBe('none');
    hud.setCargoHint(null);
    expect(hint.style.display).toBe('none');
    hud.dispose();
  });
  it('keeps routine machine status quiet and reveals only attention detail', () => {
    const root = document.createElement('section');
    const status = new MachineStatusView(root);
    const clean = {
      fuel: { current: 8, capacity: 20 },
      power: { capacity: 10, demand: 4, shed: [] as string[] },
      condition: [{ id: 'engine' as const, fraction: 1 }],
      serviceDecks: [],
    };
    status.update(clean);
    expect(status.root.classList.contains('is-attention')).toBe(false);
    status.update({ ...clean, condition: [{ id: 'engine' as const, fraction: 0.5 }] });
    expect(status.root.classList.contains('is-attention')).toBe(true);
    expect(status.root.textContent).toContain('Engine:50%');
    status.dispose();
  });
});
