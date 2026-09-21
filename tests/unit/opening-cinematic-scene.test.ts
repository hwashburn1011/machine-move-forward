import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Materials } from '@/art/Materials';
import { OpeningCinematicScene } from '@/game/OpeningCinematicScene';
import {
  OPENING_CINEMATIC_TIMING as BEATS,
  type OpeningCinematicAnchors,
} from '@/game/OpeningCinematicTimeline';

const anchors: OpeningCinematicAnchors = {
  rooftopOrigin: { x: 20.5, y: 19.52, z: 0 },
  rooftopLedge: { x: 14.5, y: 19.52, z: 0 },
  landingAnchor: { x: 10, y: 16.03, z: -0.5 },
};

describe('OpeningCinematicScene presentation', () => {
  it('prepares overlapping flashes without consuming beats and cleans up on skip', () => {
    const scene = new THREE.Scene();
    const sounds: string[] = [];
    const cinematic = new OpeningCinematicScene(scene, new Materials(), anchors, null, (sound) =>
      sounds.push(sound),
    );
    let renders = 0;
    cinematic.prewarm(() => {
      renders++;
    });
    expect(renders).toBeGreaterThan(2);
    expect(sounds).toEqual([]);
    expect(cinematic.time).toBe(0);
    expect(cinematic.active).toBe(false);
    cinematic.start();
    cinematic.fixedUpdate(BEATS.kill2 + 0.02);
    cinematic.render(1, 1 / 60);
    expect(sounds).toEqual(['shot', 'explosion', 'shot', 'explosion']);
    const geometry = (scene.getObjectByName('opening-shot-tracer') as THREE.Line).geometry;
    cinematic.stop();
    cinematic.start();
    cinematic.fixedUpdate(BEATS.kill2 + 0.02);
    expect((scene.getObjectByName('opening-shot-tracer') as THREE.Line).geometry).toBe(geometry);
    cinematic.dispose();
    expect(scene.getObjectByName('robot-detonation-flash')).toBeUndefined();
    expect(scene.getObjectByName('opening-shot-tracer')).toBeUndefined();
  });

  it('turns the hero through the jump, exposes actors only while active, and finishes facing forward', () => {
    const scene = new THREE.Scene();
    const cinematic = new OpeningCinematicScene(scene, new Materials(), anchors, null);
    const player = scene.getObjectByName('opening-cinematic-player')!;
    const warden = scene.getObjectByName('opening-cinematic-warden')!;

    expect(cinematic.active).toBe(false);
    expect(player.visible).toBe(false);
    cinematic.start();
    expect(cinematic.active).toBe(true);
    expect(player.visible).toBe(true);
    expect(player.rotation.y).toBeCloseTo(-Math.PI / 2, 5);

    const turnMidpoint = (BEATS.turnStart + BEATS.aim) / 2;
    cinematic.fixedUpdate(turnMidpoint);
    expect(player.rotation.y).toBeGreaterThan(-Math.PI / 2);
    expect(player.rotation.y).toBeLessThan(Math.PI / 2);
    cinematic.render(1, 1 / 60);

    cinematic.fixedUpdate(BEATS.reveal + 0.7 - turnMidpoint);
    expect(player.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(warden.visible).toBe(true);
    cinematic.stop();
    expect(cinematic.active).toBe(false);
    expect(player.visible).toBe(false);
    expect(warden.visible).toBe(false);
    cinematic.dispose();
  });

  it('keeps the late camera aimed at the hero instead of a dead pursuer', () => {
    const scene = new THREE.Scene();
    const cinematic = new OpeningCinematicScene(scene, new Materials(), anchors, null);
    cinematic.start();
    cinematic.fixedUpdate(BEATS.done);
    cinematic.render(1, 1 / 60);
    const player = scene.getObjectByName('opening-cinematic-player')!;
    player.getWorldPosition(new THREE.Vector3());
    const expected = new THREE.Vector3(10, 16.03 + 0.5, -0.5 - 2);
    const direction = new THREE.Vector3();
    cinematic.camera.getWorldDirection(direction);
    const toHero = expected.sub(cinematic.camera.position).normalize();
    expect(direction.dot(toHero)).toBeGreaterThan(0.97);
    cinematic.dispose();
  });
});
