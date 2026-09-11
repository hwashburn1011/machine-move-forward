import { describe, expect, it } from 'vitest';
import { RadioRaids, MECH_BOARDERS } from '@/story/RadioRaids';
import { StoryDirector, type StoryInput } from '@/story/StoryDirector';
import { WRECK_ONE } from '@/data/story';
import { VehicleManager } from '@/vehicles/VehicleManager';
import * as THREE from 'three';
import { Destination } from '@/story/Destination';
import { placeSkiffCrewOnCable } from '@/art/DefenseModels';
import { DECK_SURFACE_Y, LEVEL_HEIGHT } from '@/game/constants';
import nomad from '@/data/iron-nomad.json';

const input = (overrides: Partial<StoryInput> = {}): StoryInput => ({
  distance: 100,
  radioFound: true,
  firstRunComplete: true,
  stable: true,
  speed: 7.5,
  playerOnMachine: true,
  signalBattleMode: true,
  ...overrides,
});
const lockedAt = 100 + WRECK_ONE.signalStartDistanceM;

describe('radio crossfire progression', () => {
  it('recognizes all three Nomad decks and perimeter walks but excludes the sand below', () => {
    const destination = new Destination({ scene: new THREE.Scene(), arrivalDistance: 0 });
    for (const level of [0, 1, 2]) {
      expect(
        destination.playerOnMachine({
          x: 6.8,
          y: DECK_SURFACE_Y - LEVEL_HEIGHT * level + 0.96,
          z: 8.5,
        }),
      ).toBe(true);
    }
    expect(destination.playerOnMachine({ x: 0, y: 2, z: 0 })).toBe(false);
    expect(destination.playerOnMachine({ x: 9, y: DECK_SURFACE_Y + 0.96, z: 0 })).toBe(false);
    destination.dispose();
  });
  it('waits for genuine 100% reception, then reveals once at a safe boundary', () => {
    const story = new StoryDirector();
    story.update(input());
    expect(story.update(input({ distance: lockedAt - 1 }))).toEqual([]);
    for (const blocker of [
      { stable: false },
      { firstRunComplete: false },
      { encounterActive: true },
      { playerOnMachine: false },
    ]) {
      expect(story.update(input({ distance: lockedAt, ...blocker }))).toEqual([]);
      expect(story.currentPhase).toBe('signal');
    }
    expect(story.update(input({ distance: lockedAt }))).toEqual([{ type: 'begin-signal-battle' }]);
    expect(story.update(input({ distance: lockedAt + 1 }))).toEqual([]);
    expect(story.finishSignalBattle()).toBe(true);
    expect(story.finishSignalBattle()).toBe(false);
    expect(story.currentPhase).toBe('raids');
    expect(story.update(input({ distance: 99999 }))).toEqual([]);
    expect(story.snapshot(99999)).toMatchObject({
      phase: 'raids',
      signalStrength: 1,
      remainingM: null,
    });
  });

  it('preserves the reception origin and the completed reveal through save/load', () => {
    const story = new StoryDirector();
    story.update(input());
    const saved = story.toSave();
    const restored = new StoryDirector();
    restored.restore(saved);
    expect(restored.snapshot(1200).signalStrength).toBe(0.5);
    expect(restored.update(input({ distance: lockedAt }))).toEqual([
      { type: 'begin-signal-battle' },
    ]);
    restored.finishSignalBattle();
    story.restore(restored.toSave());
    expect(story.currentPhase).toBe('raids');
    expect(story.update(input({ distance: lockedAt + 800 }))).toEqual([]);
  });

  it('gives old signal saves a persistent origin and leaves committed expeditions intact', () => {
    const story = new StoryDirector();
    story.update(input());
    const saved = story.toSave();
    delete saved.active!.signalStartedAt;
    story.restore(saved);
    story.update(input({ distance: 500, stable: false }));
    expect(story.snapshot(1600).signalStrength).toBe(0.5);
    story.restore({
      ...saved,
      active: { ...saved.active!, phase: 'approach', arrivalDistance: 3000 },
    });
    expect(story.update(input({ distance: 500 }))).toEqual([]);
    expect(story.currentPhase).toBe('approach');
  });
});

describe('random mech ships', () => {
  it('hoists passengers outside the hull before moving their feet over the top rail', () => {
    const body = new THREE.Group();
    const grip = new THREE.Object3D();
    grip.name = 'BoardingGrip';
    grip.position.set(0, 2.2, 0.6);
    body.add(grip);
    const launcher = new THREE.Vector3(13, 2, 0),
      feet = new THREE.Vector3(6, DECK_SURFACE_Y + 0.05, -2);
    const rail = new THREE.Vector3(nomad.deckHalfWidth, DECK_SURFACE_Y + 1.1, -2);
    for (let i = 1; i <= 100; i++) {
      placeSkiffCrewOnCable(body, launcher, feet, new THREE.Vector3(13, 1.2, 0), i / 100, rail);
      if (body.position.y < DECK_SURFACE_Y)
        expect(body.position.x).toBeGreaterThan(nomad.deckHalfWidth);
      if (body.position.x > 6.15 && body.position.x < nomad.deckHalfWidth)
        expect(body.position.y).toBeGreaterThan(DECK_SURFACE_Y + 1.1);
    }
    expect(body.position.distanceTo(feet)).toBeLessThan(1e-9);
  });
  it('has a 24-second initial breather, pauses when unsafe and never overlaps ships', () => {
    const raids = new RadioRaids();
    expect(raids.update(1000, false, 'seed')).toBeNull();
    expect(raids.update(23, true, 'seed')).toBeNull();
    expect(raids.update(1, true, 'seed')).not.toBeNull();
    raids.started();
    expect(raids.update(9999, true, 'seed')).toBeNull();
    raids.finished('seed');
    expect(raids.toSave().remaining).toBeGreaterThanOrEqual(75);
    expect(raids.toSave().remaining).toBeLessThanOrEqual(115);
    expect(raids.update(74, true, 'seed')).toBeNull();
  });

  it('uses all four models across two waves and both arrival sides across the loop', () => {
    const raids = new RadioRaids();
    const seen = new Set<string>(),
      sides = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const plan = raids.update(200, true, 'nomad-seed')!;
      expect(plan.crew[0]).not.toBe(plan.crew[1]);
      if (i < 2) plan.crew.forEach((id) => seen.add(id));
      sides.add(plan.side);
      raids.started();
      raids.finished('nomad-seed');
    }
    expect([...seen].sort()).toEqual([...MECH_BOARDERS].sort());
    expect(sides.size).toBe(2);
  });

  it('preserves the next roster and remaining cooldown on reload, validating corrupt fields', () => {
    const a = new RadioRaids(),
      b = new RadioRaids();
    a.update(10, true, 71);
    b.restore(a.toSave());
    expect(a.update(14, true, 71)).toEqual(b.update(14, true, 71));
    b.restore({ wave: NaN, remaining: Infinity });
    expect(b.toSave()).toEqual({ wave: 0, remaining: 24 });
    expect(b.update(NaN, true, 71)).toBeNull();
  });

  it('retains mech health through the visible crossing and publishes each landing once', () => {
    const landed: { index: number; health: number }[] = [];
    const manager = new VehicleManager({
      onSpawn: () => {},
      onState: () => {},
      onDestroyed: () => {},
      onRetreat: () => {},
      onVolley: () => {},
      onCrewLand: (index) => landed.push({ index, health: manager.snapshot!.crewHealth[index]! }),
    });
    manager.spawn('skiff', 'starboard', false, [75, 85]);
    manager.damageCrew(0, 20);
    expect(manager.spawn()).toBe(false);
    const phases = new Set<string>();
    for (let i = 0; i < 300; i++) {
      manager.fixedUpdate(0.1);
      phases.add(manager.snapshot!.phase);
    }
    for (const phase of [
      'approach',
      'firing-pass',
      'alongside',
      'hook-flight',
      'attached',
      'boarding',
    ])
      expect(phases.has(phase)).toBe(true);
    expect(landed).toEqual([
      { index: 0, health: 55 },
      { index: 1, health: 85 },
    ]);
  });
});
