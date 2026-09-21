/**
 * Pure, render-agnostic opening chase choreography.
 *
 * Game owns actors, damage, audio and camera application. This module only
 * describes where the actors should be and when a one-shot beat is due, so a
 * fixed-step runner can replay the same opening without duplicate shots.
 */

export interface OpeningCinematicVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type OpeningCinematicEventName =
  'takeoff' | 'land' | 'shot1' | 'kill1' | 'shot2' | 'kill2' | 'done';

export interface OpeningCinematicEvent {
  readonly name: OpeningCinematicEventName;
  readonly time: number;
  /** Present on the two shot/death beats so the scene can address an actor. */
  readonly actorId?: 'pursuer-1' | 'pursuer-2';
}

/** Seconds in real time; movement, cameras and effects share the same beats. */
export const OPENING_CINEMATIC_TIMING = {
  takeoff: 1.35,
  land: 2.35,
  turnStart: 2.48,
  aim: 3.05,
  shot1: 3.65,
  kill1: 3.73,
  secondAim: 4.48,
  shot2: 5,
  kill2: 5.08,
  reveal: 6.35,
  handoff: 8.1,
  done: 10.2,
} as const;
export const OPENING_JUMP_GRAVITY = -22;
const BEATS = OPENING_CINEMATIC_TIMING;

/** The authored beat sheet: a short chase, leap, return fire and handoff. */
export const OPENING_CINEMATIC_EVENTS: readonly OpeningCinematicEvent[] = [
  { name: 'takeoff', time: BEATS.takeoff },
  { name: 'land', time: BEATS.land },
  { name: 'shot1', time: BEATS.shot1, actorId: 'pursuer-1' },
  { name: 'kill1', time: BEATS.kill1, actorId: 'pursuer-1' },
  { name: 'shot2', time: BEATS.shot2, actorId: 'pursuer-2' },
  { name: 'kill2', time: BEATS.kill2, actorId: 'pursuer-2' },
  { name: 'done', time: BEATS.done },
];

export const OPENING_CINEMATIC_DURATION_S =
  OPENING_CINEMATIC_EVENTS[OPENING_CINEMATIC_EVENTS.length - 1]!.time;

export interface OpeningCinematicCamera {
  readonly shot: 'chase' | 'leap' | 'landing' | 'execution' | 'handoff';
  readonly position: OpeningCinematicVec3;
  readonly target: OpeningCinematicVec3;
}

export interface OpeningCinematicActor {
  readonly id: string;
  readonly position: OpeningCinematicVec3;
  readonly alive: boolean;
  /** Actual horizontal metres per second, for gait and braking animation. */
  readonly speed: number;
}

export interface OpeningCinematicSample {
  readonly time: number;
  readonly player: OpeningCinematicActor;
  readonly pursuers: readonly [OpeningCinematicActor, OpeningCinematicActor];
  readonly camera: OpeningCinematicCamera;
  readonly stance: 'running' | 'airborne' | 'landed' | 'aiming' | 'firing';
  readonly weaponAim: OpeningCinematicVec3;
  /** 0..1 presentation recoil pulse; Game applies the actual weapon pose. */
  readonly recoil: number;
  readonly completed: boolean;
}

export interface OpeningCinematicAnchors {
  /** Existing rooftop player spawn, normally `RooftopSet.playerSpawn`. */
  readonly rooftopOrigin: OpeningCinematicVec3;
  /** Existing machine deck landing point in world coordinates. */
  readonly landingAnchor: OpeningCinematicVec3;
  /** Existing ledge, normally `RooftopSet.ledge`; supplied explicitly so scene edits cannot stale the choreography. */
  readonly rooftopLedge: OpeningCinematicVec3;
}

const TAKEOFF = OPENING_CINEMATIC_EVENTS[0]!.time;
const LAND = OPENING_CINEMATIC_EVENTS[1]!.time;
const SHOT1 = OPENING_CINEMATIC_EVENTS[2]!.time;
const KILL1 = OPENING_CINEMATIC_EVENTS[3]!.time;
const SHOT2 = OPENING_CINEMATIC_EVENTS[4]!.time;
const KILL2 = OPENING_CINEMATIC_EVENTS[5]!.time;
const DONE = OPENING_CINEMATIC_DURATION_S;

function clampTime(time: number): number {
  return Number.isFinite(time) ? Math.max(0, Math.min(DONE, time)) : 0;
}

function add(a: OpeningCinematicVec3, b: OpeningCinematicVec3): OpeningCinematicVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function lerp(a: OpeningCinematicVec3, b: OpeningCinematicVec3, t: number): OpeningCinematicVec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function ledgeFor(anchors: OpeningCinematicAnchors): OpeningCinematicVec3 {
  return anchors.rooftopLedge;
}

function pursuerPosition(
  anchors: OpeningCinematicAnchors,
  ledge: OpeningCinematicVec3,
  side: -1 | 1,
  time: number,
): { position: OpeningCinematicVec3; speed: number } {
  const stagger = side === 1 ? 0 : 0.4;
  const start = add(anchors.rooftopOrigin, { x: 2.9 + stagger, y: 0, z: side * 2.5 });
  const atLedge = add(ledge, { x: 0.95 + stagger, y: 0, z: side * 1.8 });
  const stop = TAKEOFF + 0.6 + stagger * 0.2;
  const brake = 0.3;
  const elapsed = Math.min(stop, time);
  const brakingFor = Math.max(0, elapsed - (stop - brake));
  // Constant chase speed, then a short deceleration at the parapet. They keep
  // running after the hero launches, retaining roughly three metres of space.
  const travelled = elapsed - (brakingFor * brakingFor) / (2 * brake);
  const duration = stop - brake / 2;
  return {
    position: lerp(start, atLedge, travelled / duration),
    speed:
      (Math.hypot(atLedge.x - start.x, atLedge.z - start.z) / duration) *
      Math.max(0, 1 - brakingFor / brake),
  };
}

function recoilAt(time: number): number {
  const first = Math.max(0, 1 - Math.abs(time - SHOT1) / 0.18);
  const second = Math.max(0, 1 - Math.abs(time - SHOT2) / 0.18);
  return Math.max(first, second);
}

/** Sample the complete choreography at any deterministic time. */
export function sampleOpeningCinematic(
  time: number,
  rooftopOrigin: OpeningCinematicVec3,
  landingAnchor: OpeningCinematicVec3,
  rooftopLedge: OpeningCinematicVec3,
): OpeningCinematicSample {
  const anchors: OpeningCinematicAnchors = { rooftopOrigin, landingAnchor, rooftopLedge };
  const t = clampTime(time);
  const ledge = ledgeFor(anchors);
  const flight = Math.max(0, Math.min(1, (t - TAKEOFF) / (LAND - TAKEOFF)));
  let player =
    t < TAKEOFF ? lerp(rooftopOrigin, ledge, t / TAKEOFF) : lerp(ledge, landingAnchor, flight);
  if (t >= TAKEOFF && t < LAND) {
    const duration = LAND - TAKEOFF;
    const elapsed = t - TAKEOFF;
    const launchVelocity =
      (landingAnchor.y - ledge.y) / duration - 0.5 * OPENING_JUMP_GRAVITY * duration;
    player = {
      ...player,
      y: ledge.y + launchVelocity * elapsed + 0.5 * OPENING_JUMP_GRAVITY * elapsed * elapsed,
    };
  }
  if (t >= LAND) player = landingAnchor;

  const first = pursuerPosition(anchors, ledge, 1, t);
  const second = pursuerPosition(anchors, ledge, -1, t);
  const pursuers: readonly [OpeningCinematicActor, OpeningCinematicActor] = [
    { id: 'pursuer-1', ...first, alive: t < KILL1 },
    { id: 'pursuer-2', ...second, alive: t < KILL2 },
  ];
  const target = t < BEATS.secondAim ? first.position : second.position;
  const stance =
    t < TAKEOFF
      ? 'running'
      : t < LAND
        ? 'airborne'
        : t < SHOT1
          ? 'landed'
          : recoilAt(t) > 0
            ? 'firing'
            : 'aiming';
  const cameraShot =
    t < TAKEOFF
      ? 'chase'
      : t < LAND
        ? 'leap'
        : t < SHOT1
          ? 'landing'
          : t < DONE
            ? 'execution'
            : 'handoff';
  const cameraPosition =
    cameraShot === 'leap'
      ? add(player, { x: 4.5, y: 3.8, z: 5.5 })
      : cameraShot === 'execution'
        ? add(player, { x: 3.2, y: 2.1, z: 4.2 })
        : add(player, { x: 4.8, y: 2.8, z: 6.2 });
  const cameraTarget = cameraShot === 'execution' ? target : player;

  return {
    time: t,
    player: {
      id: 's-07',
      position: player,
      alive: true,
      speed:
        t < TAKEOFF
          ? Math.hypot(ledge.x - rooftopOrigin.x, ledge.z - rooftopOrigin.z) / TAKEOFF
          : t < LAND
            ? Math.hypot(landingAnchor.x - ledge.x, landingAnchor.z - ledge.z) / (LAND - TAKEOFF)
            : 0,
    },
    pursuers,
    camera: { shot: cameraShot, position: cameraPosition, target: cameraTarget },
    stance,
    weaponAim: target,
    recoil: recoilAt(t),
    completed: t >= DONE,
  };
}

/** A monotonic event cursor for fixed-step integration. */
export class OpeningCinematicTimeline {
  private lastTime = 0;
  private nextEvent = 0;

  constructor(private readonly anchors: OpeningCinematicAnchors) {}

  reset(): void {
    this.lastTime = 0;
    this.nextEvent = 0;
  }

  sample(time: number): OpeningCinematicSample {
    return sampleOpeningCinematic(
      time,
      this.anchors.rooftopOrigin,
      this.anchors.landingAnchor,
      this.anchors.rooftopLedge,
    );
  }

  /** Advance once; each beat is returned at most once until reset. */
  advance(time: number): {
    readonly sample: OpeningCinematicSample;
    readonly events: readonly OpeningCinematicEvent[];
  } {
    const current = clampTime(time);
    if (current < this.lastTime) this.reset();
    const events: OpeningCinematicEvent[] = [];
    while (this.nextEvent < OPENING_CINEMATIC_EVENTS.length) {
      const event = OPENING_CINEMATIC_EVENTS[this.nextEvent]!;
      if (event.time > current) break;
      if (event.time > this.lastTime) events.push(event);
      this.nextEvent += 1;
    }
    this.lastTime = current;
    return { sample: this.sample(current), events };
  }
}
