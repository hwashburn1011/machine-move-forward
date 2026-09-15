/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { HUD } from '@/ui/HUD';
import { Game } from '@/game/Game';

const spawnScriptedSkiff = (Game.prototype as unknown as { spawnScriptedSkiff: () => boolean })
  .spawnScriptedSkiff;
const finishBoarding = (
  Game.prototype as unknown as {
    finishBoarding: (outcome: 'hull' | 'crew' | 'hook' | 'defended') => void;
  }
).finishBoarding;

function spawnHarness(title: string) {
  const root = document.createElement('section');
  const bus = new EventBus();
  const hud = new HUD(root, bus);
  const game = Object.assign(Object.create(Game.prototype), {
    scriptedSkiffPending: true,
    vehicleManager: { active: false },
    gunboatScene: { active: false },
    pendingBoardingOutcome: null,
    enemies: { activeCount: 0 },
    director: {
      hasActiveExternalEncounter: false,
      queueExternal: () => true,
      tryBeginExternal: () => true,
      waves: 0,
    },
    vehicleScene: { spawn: () => true },
    story: { chapter: { title } },
    state: { playerDead: false },
    bus,
    hud,
    world: { distanceTraveled: 0 },
  });
  return { game, root, bus, hud };
}

function finishHarness(hud: HUD, bus: EventBus) {
  const events: Array<{ type: string; event: unknown }> = [];
  for (const type of ['boarding:survived', 'boarding:ended', 'loot:collected'] as const)
    bus.on(type, (event) => events.push({ type, event }));
  const deposits: Array<{ id: string; count: number }> = [];
  const game = Object.assign(Object.create(Game.prototype), {
    hud,
    boardingWarning: hud.claimWarning('boarding', 'Patrol inbound'),
    optionalSalvageEncounterId: null,
    optionalSalvageFailed: false,
    raidMissions: { finish: () => {} },
    tutorialStarted: false,
    tutorialReadyAt: null,
    tutorialTurretId: null,
    radioRaids: { toSave: () => ({ wave: 0 }), finished: () => {} },
    state: { seed: 'warning-test' },
    machine: { damage: { damaged: () => [] } },
    resources: { deposit: (id: string, count: number) => deposits.push({ id, count }) },
    bus,
    player: { stats: { health: 100 } },
    world: { distanceTraveled: 0 },
    boardingEnemyIds: new Set<string>(),
    vehicleScene: { clear: () => {} },
    director: { hasActiveExternalEncounter: false },
    pendingBoardingOutcome: 'hook',
    scriptedSkiffActive: true,
    story: {
      recordRadioRaidVictory: () => false,
      resolveScriptedEncounter: () => {},
    },
    applyStoryEffects: () => {},
    requestAutosave: () => {},
  });
  return { game, events, deposits };
}

describe('Game boarding warning ownership', () => {
  it('does not let a delayed hook announcement overwrite the death notice', () => {
    const { game, root, hud } = spawnHarness('Glass Orchard');
    game.state.playerDead = true;
    hud.setWarning('Critical failure');
    game.showBoardingWarning('Grapple attached');
    expect(root.querySelector('#hud-warning')?.textContent).toBe('Critical failure');
    hud.dispose();
  });
  it.each([
    [
      'Glass Orchard',
      'Glass Orchard patrol — starboard grapple! Clear the boarders or cut their hook.',
    ],
    [
      'Last Garden Meridian',
      'Last Garden Meridian patrol — starboard grapple! Clear the boarders or cut their hook.',
    ],
  ])('uses the current chapter label while preserving encounter ID', (title, expected) => {
    const { game, root, bus, hud } = spawnHarness(title);
    const started: unknown[] = [];
    bus.on('boarding:started', (event) => started.push(event));
    expect(spawnScriptedSkiff.call(game)).toBe(true);
    expect(root.querySelector('#hud-warning')?.textContent).toBe(expected);
    expect(started).toEqual([{ encounterId: 'orchard-patrol-skiff' }]);
    hud.dispose();
  });

  it.each(['hook', 'defended'] as const)(
    'clears the exact boarding claim after %s and preserves rewards/events',
    (outcome) => {
      const root = document.createElement('section');
      const bus = new EventBus();
      const hud = new HUD(root, bus);
      const { game, events, deposits } = finishHarness(hud, bus);
      game.pendingBoardingOutcome = outcome;
      finishBoarding.call(game, outcome);
      expect(root.querySelector('#hud-warning')?.classList.contains('is-active')).toBe(false);
      expect(deposits.every(({ count }) => count > 0)).toBe(true);
      expect(events.map(({ type }) => type)).toEqual([
        'loot:collected',
        'boarding:survived',
        'boarding:ended',
      ]);
      hud.dispose();
    },
  );

  it('cannot clear a newer ordinary critical notice during boarding cleanup', () => {
    const root = document.createElement('section');
    const bus = new EventBus();
    const hud = new HUD(root, bus);
    const { game } = finishHarness(hud, bus);
    hud.setWarning('Critical failure');
    finishBoarding.call(game, 'hook');
    expect(root.querySelector('#hud-warning')?.textContent).toBe('Critical failure');
    hud.dispose();
  });
});
