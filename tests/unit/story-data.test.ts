import { describe, expect, it } from 'vitest';
import { RELAY_FOUNDRY, STORY_EXPEDITIONS, WRECK_ONE, validateStoryData } from '@/data/story';
import { FOUNDRY_ROUTES, validateRoutes, type RouteDefinition } from '@/data/routes';
import { StoryDirector } from '@/story/StoryDirector';
import { Destination } from '@/story/Destination';
import * as THREE from 'three';

const context = {
  poweredHelm: true,
  playerOnMachine: true,
  stable: true,
  encounterActive: false,
  currentDistance: 300,
};

describe('campaign data and route contracts', () => {
  it('validates the shipped data and rejects duplicate/unknown interaction data', () => {
    expect(validateStoryData()).toEqual([]);
    expect(validateRoutes()).toEqual([]);
    expect(validateStoryData([...STORY_EXPEDITIONS, WRECK_ONE])).toContain(
      'duplicate expedition wreck-one',
    );
    expect(
      validateRoutes([{ ...FOUNDRY_ROUTES[0]!, distanceM: Infinity } as RouteDefinition]),
    ).toContain('invalid distance foundry-direct');
    expect(
      validateRoutes([
        { ...FOUNDRY_ROUTES[0]!, scriptedVehicleRemainingM: 220 } as RouteDefinition,
      ]),
    ).toContain('gunboat threshold invalid foundry-direct');
  });

  it('commits from the current world distance and clears Wreck journal state', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'docked',
      arrivalDistance: 700,
      journalsRead: ['wreck-one-journal-cargo'],
      uniqueCollected: true,
      nextSignal: false,
    });
    director.requestDepart(true);
    director.update({
      distance: 712,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 1,
      playerOnMachine: true,
    });
    expect(director.currentPhase).toBe('route-selection');
    const result = director.selectRoute('foundry-detour', context);
    expect(result.ok).toBe(true);
    expect(director.snapshot(300).remainingM).toBe(1150);
    expect(director.toSave()).toMatchObject({
      format: 2,
      active: { routeId: 'foundry-detour', arrivalDistance: 1450, journalsRead: [] },
    });
  });

  it('requests the direct gunboat once and holds at 220m while unresolved', () => {
    const director = new StoryDirector();
    director.restore({
      chapterId: 'wreck-one',
      phase: 'complete',
      arrivalDistance: 700,
      journalsRead: [],
      uniqueCollected: true,
      nextSignal: true,
    });
    const selected = director.selectRoute('foundry-direct', { ...context, currentDistance: 100 });
    expect(selected.ok).toBe(true);
    const due = director.update({
      distance: 350,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 4,
      playerOnMachine: true,
    });
    expect(due).toContainEqual({
      type: 'scripted-vehicle-due',
      vehicle: 'gunboat',
      routeId: 'foundry-direct',
    });
    const hold = director.update({
      distance: 640,
      radioFound: true,
      firstRunComplete: true,
      stable: true,
      speed: 4,
      playerOnMachine: true,
      encounterActive: false,
    });
    expect(hold).toContainEqual({ type: 'hold-destination', remainingM: 220 });
    expect(director.snapshot(640).remainingM).toBe(220);
    expect(director.resolveScriptedEncounter()).toEqual([]);
    expect(director.resolveScriptedEncounter()).toEqual([]);
  });

  it('repairs malformed Foundry saves into selectable route state', () => {
    const director = new StoryDirector();
    director.restore({
      format: 2,
      completed: [],
      recoveredUniques: ['course-gyro'],
      active: {
        expeditionId: 'relay-foundry',
        routeId: 'foundry-direct',
        phase: 'approach',
        arrivalDistance: Infinity,
        journalsRead: [],
        scriptedEncounter: 'queued',
      },
    } as never);
    expect(director.currentPhase).toBe('route-selection');
    expect(director.selectRoute('foundry-direct', context).ok).toBe(true);
    const complete = new StoryDirector();
    complete.restore({
      format: 2,
      completed: ['relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: null,
    });
    expect(complete.currentPhase).toBe('complete');
  });
});

describe('Foundry destination contract', () => {
  it('uses the authored/fallback anchors and independently hides each pickup', () => {
    const destination = new Destination({
      scene: new THREE.Scene(),
      arrivalDistance: 1450,
      definition: RELAY_FOUNDRY,
    });
    destination.setActive(true);
    destination.setDocked(true);
    expect(destination.root.position.x).toBe(13);
    expect(destination.interactables.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'relay-foundry-salvage-controller',
        'relay-foundry-tracking-servo',
        'relay-foundry-departure',
      ]),
    );
    destination.syncProgress({ journalsRead: [], uniqueIds: ['salvage-controller'] });
    expect(
      destination.interactables.some((item) => item.id === 'relay-foundry-salvage-controller'),
    ).toBe(false);
    expect(
      destination.interactables.some((item) => item.id === 'relay-foundry-tracking-servo'),
    ).toBe(true);
    destination.dispose();
  });
});
