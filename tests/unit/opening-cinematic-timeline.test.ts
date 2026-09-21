import { describe, expect, it } from 'vitest';
import {
  OPENING_CINEMATIC_DURATION_S,
  OPENING_CINEMATIC_EVENTS,
  OPENING_CINEMATIC_TIMING as BEATS,
  OPENING_JUMP_GRAVITY,
  OpeningCinematicTimeline,
  sampleOpeningCinematic,
  type OpeningCinematicAnchors,
} from '@/game/OpeningCinematicTimeline';

const anchors: OpeningCinematicAnchors = {
  rooftopOrigin: { x: 20.5, y: 20.482, z: 0 },
  rooftopLedge: { x: 14.5, y: 20.482, z: 0 },
  landingAnchor: { x: 10, y: 17.02, z: 0 },
};
const sample = (time: number) =>
  sampleOpeningCinematic(time, anchors.rooftopOrigin, anchors.landingAnchor, anchors.rooftopLedge);
const beats = ['takeoff', 'land', 'shot1', 'kill1', 'shot2', 'kill2', 'done'];

describe('OpeningCinematicTimeline', () => {
  it('runs at a grounded pace with room for both readable impacts and a handoff', () => {
    expect(OPENING_CINEMATIC_DURATION_S).toBeGreaterThanOrEqual(9);
    expect(OPENING_CINEMATIC_DURATION_S).toBeLessThanOrEqual(12);
    expect(OPENING_CINEMATIC_EVENTS.map((event) => event.name)).toEqual(beats);
    expect(BEATS.shot1 - BEATS.land).toBeGreaterThan(0.7);
    expect(BEATS.shot2 - BEATS.kill1).toBeGreaterThan(0.7);
    expect(BEATS.kill1 - BEATS.shot1).toBeLessThanOrEqual(0.1);
    expect(BEATS.kill2 - BEATS.shot2).toBeLessThanOrEqual(0.1);
    expect(BEATS.done - BEATS.kill2).toBeGreaterThan(2.25);
  });

  it('keeps the runner at a steady speed and pursuers behind until takeoff', () => {
    expect(sample(0).player.position).toEqual(anchors.rooftopOrigin);
    for (let t = 0; t < BEATS.takeoff; t += 0.05) {
      const frame = sample(t);
      expect(frame.player.speed).toBeGreaterThan(4);
      expect(frame.player.speed).toBeLessThan(5);
      expect(frame.stance).toBe('running');
      for (const actor of frame.pursuers) {
        expect(actor.position.x - frame.player.position.x).toBeGreaterThan(2.7);
        expect(actor.position.x).toBeLessThan(24);
      }
    }
    const firstStep = sample(0.15).player.position.x - sample(0.1).player.position.x;
    const lastStep = sample(1.25).player.position.x - sample(1.2).player.position.x;
    expect(firstStep).toBeCloseTo(lastStep, 8);
    expect(sample(BEATS.takeoff + 0.1).pursuers[0].speed).toBeGreaterThan(0);
    expect(sample(BEATS.land).pursuers[0].speed).toBeCloseTo(0);
  });

  it('uses constant horizontal velocity and gravity through a one-second jump without floating at the apex', () => {
    expect(BEATS.land - BEATS.takeoff).toBeCloseTo(1);
    const flight = (t: number) => sample(BEATS.takeoff + t);
    expect(flight(0).player.position).toEqual(anchors.rooftopLedge);
    const a = flight(0.2).player.position;
    const b = flight(0.3).player.position;
    const c = flight(0.4).player.position;
    expect(flight(0.3).stance).toBe('airborne');
    expect(a.y).toBeGreaterThan(anchors.rooftopLedge.y);
    expect((c.y - 2 * b.y + a.y) / 0.01).toBeCloseTo(OPENING_JUMP_GRAVITY, 6);
    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 8);
    expect(flight(0.99).player.position.y).toBeGreaterThan(anchors.landingAnchor.y);
    expect(sample(BEATS.land).player.position).toEqual(anchors.landingAnchor);
    expect(sample(BEATS.land).stance).toBe('landed');
  });

  it('addresses the correct robot and fires each beat once even when frames are dropped', () => {
    expect(sample(BEATS.shot1).weaponAim).toEqual(sample(BEATS.shot1).pursuers[0].position);
    expect(sample(BEATS.shot2).weaponAim).toEqual(sample(BEATS.shot2).pursuers[1].position);
    expect(sample(BEATS.shot1).recoil).toBe(1);
    expect(sample(BEATS.kill1).pursuers[0].alive).toBe(false);
    expect(sample(BEATS.kill2).pursuers[1].alive).toBe(false);
    const timeline = new OpeningCinematicTimeline(anchors);
    const fired: string[] = [];
    for (const t of [0, 0.13, 1.5, 1.5, 3.8, 5.2, BEATS.done, BEATS.done + 10]) {
      fired.push(...timeline.advance(t).events.map((event) => event.name));
    }
    expect(fired).toEqual(beats);
    expect(timeline.sample(BEATS.done).completed).toBe(true);
    timeline.reset();
    expect(timeline.advance(BEATS.takeoff).events.map((event) => event.name)).toEqual(['takeoff']);
  });
});
