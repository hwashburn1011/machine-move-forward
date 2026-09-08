import { describe, expect, it } from 'vitest';
import { MachineMovement } from '@/machine/MachineMovement';
import { StoryDirector, type StoryInput } from '@/story/StoryDirector';
import { Destination } from '@/story/Destination';
import * as THREE from 'three';

const input = (overrides: Partial<StoryInput> = {}): StoryInput => ({
  distance: 0,
  radioFound: false,
  firstRunComplete: false,
  stable: false,
  speed: 0,
  playerOnMachine: true,
  ...overrides,
});

describe('StoryDirector', () => {
  it('starts locked and begins the signal immediately when the radio is found', () => {
    const director = new StoryDirector();
    expect(director.update(input())).toEqual([]);
    expect(director.update(input({ radioFound: true }))).toEqual([{ type: 'begin-signal' }]);
    expect(director.snapshot(0).phase).toBe('signal');
  });

  it('gates approach on first-run completion and a stable machine', () => {
    const director = new StoryDirector();
    director.update(input({ radioFound: true }));
    expect(director.update(input({ radioFound: true, distance: 40 }))).toEqual([]);
    const effects = director.update(
      input({ radioFound: true, firstRunComplete: true, stable: true, distance: 40 }),
    );
    expect(effects).toEqual([
      { type: 'begin-approach', arrivalDistance: 740 },
      { type: 'request-sanctuary', active: true },
    ]);
  });

  it('does not stop short: scripted speed limits crawl into the exact docking window', () => {
    const director = new StoryDirector();
    const machine = new MachineMovement();
    director.update(input({ radioFound: true }));
    director.update(input({ radioFound: true, firstRunComplete: true, stable: true }));
    machine.setThrottle(1);

    let distance = 0;
    let docked = false;
    for (let frame = 0; frame < 20_000; frame++) {
      const effects = director.update(
        input({
          distance,
          radioFound: true,
          firstRunComplete: true,
          stable: true,
          speed: machine.currentSpeed,
          maxSpeed: machine.maxSpeed,
          playerOnMachine: true,
        }),
      );
      for (const effect of effects) {
        if (effect.type === 'request-speed-limit') machine.setScriptedSpeedLimit(effect.mps);
      }
      machine.fixedUpdate(1 / 60);
      distance += machine.currentSpeed / 60;
      if (director.currentPhase === 'docked') {
        docked = true;
        expect(Math.abs(700 - distance)).toBeLessThanOrEqual(0.75);
        break;
      }
    }
    expect(docked).toBe(true);
    expect(director.snapshot(distance).remainingM as number).toBeLessThanOrEqual(0.75);
  });

  it('requires the unique gyro and a player back on the machine before departure', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'docked',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: false,
      nextSignal: false,
    });
    expect(director.requestDepart({ playerOnMachine: true })).toEqual([]);
    expect(director.collectUnique()).toBe(true);
    expect(director.requestDepart({ playerOnMachine: false })).toEqual([]);
    expect(director.requestDepart({ playerOnMachine: true })[0]).toEqual({
      type: 'retract-gangway',
    });
  });

  it('accepts every journal ID exposed by the destination interactables', () => {
    const destination = new Destination({ scene: new THREE.Scene(), arrivalDistance: 700 });
    destination.setActive(true);
    destination.setDocked(true);
    const journalIds = destination.interactables
      .filter((interactable) => interactable.kind === 'journal')
      .map((interactable) => interactable.id);
    expect(journalIds).toHaveLength(3);

    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'docked',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: false,
      nextSignal: false,
    });
    for (const id of journalIds) expect(director.readJournal(id)).toBe(true);
    expect(director.legacyProjection().journalsRead).toEqual(journalIds);
    destination.dispose();
  });

  it('round-trips malformed optional and legacy save fields safely', () => {
    const director = new StoryDirector();
    director.restore({ chapter: 'wreck-one', state: 'approaching', journalsRead: ['unknown', 7] });
    expect(director.currentPhase).toBe('signal');
    expect(director.legacyProjection().arrivalDistance).toBeNull();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'docked',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: false,
      nextSignal: false,
    });
    director.restore(undefined);
    expect(director.currentPhase).toBe('locked');
    const malformed = new StoryDirector();
    malformed.restore({ chapterId: 'other' } as never);
    expect(malformed.currentPhase).toBe('locked');
  });
});
