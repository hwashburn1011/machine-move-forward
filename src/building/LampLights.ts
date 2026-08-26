import * as THREE from 'three';

/**
 * One lamp, as the pool needs to see it. No meshes, no materials.
 */
export interface LampSample {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Has power. An unlit lamp never gets a light, however close. */
  lit: boolean;
}

/**
 * How much closer a challenger has to be, in metres, before it takes a
 * standing assignment.
 *
 * Not an epsilon — a real margin. Two lamps a hair apart with one light
 * between them would otherwise swap every time the camera drifted a
 * centimetre, and a player walking a corridor would watch the lighting
 * flicker for no reason they could see. A metre and a half is far larger than
 * any drift and far smaller than the spacing of lamps a player actually
 * builds.
 */
export const LAMP_HYSTERESIS = 1.5;

/**
 * Which lamps get one of the few real lights.
 *
 * Pure, and separate from the pool below, because this is the only part that
 * can be wrong in a way anyone would notice. The pool is bookkeeping over
 * `THREE.PointLight`s; this is the decision.
 */
export function assignLamps(
  lamps: readonly LampSample[],
  camera: { x: number; y: number; z: number },
  maxLights: number,
  previous: readonly string[],
  hysteresis: number = LAMP_HYSTERESIS,
): string[] {
  if (maxLights <= 0) return [];

  const held = new Set(previous);
  const ranked = lamps
    .filter((lamp) => lamp.lit)
    .map((lamp) => {
      const distance = Math.hypot(lamp.x - camera.x, lamp.y - camera.y, lamp.z - camera.z);
      // A lamp already holding a light is credited the margin, which is what
      // makes the assignment sticky without making it stale.
      return { id: lamp.id, score: held.has(lamp.id) ? distance - hysteresis : distance };
    })
    // Id breaks ties, so two lamps at the same distance cannot swap places on
    // float noise — the same reason `InteractionSystem` tie-breaks by id.
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

  return ranked.slice(0, maxLights).map((entry) => entry.id);
}

/**
 * Seconds between reassignments.
 *
 * Reassigning every frame would be both wasted work and a source of exactly
 * the flicker the hysteresis exists to prevent. A second is far shorter than
 * it takes to walk out of a room and far longer than a frame.
 */
export const LAMP_REASSIGN_S = 1;

/** Metres a lamp throws. Roughly a room and a half at the 2m grid. */
const LAMP_RANGE = 7;
const LAMP_INTENSITY = 9;
/** Warm, and the same hue the lamp head glows. */
const LAMP_COLOR = 0xffc27a;

/**
 * A fixed pool of point lights, pointed at whichever lamps are nearest.
 *
 * The one renderer-facing part of the whole phase. Lights are created ONCE and
 * moved, never created and destroyed per lamp: a Three material recompiles its
 * shader when the number of lights in the scene changes, so a pool that grew
 * and shrank would hitch every time the player walked past a lamp.
 *
 * Shadowless, deliberately. Shadow-casting point lights are six render passes
 * each, and eight of them would cost more than everything else in the frame
 * put together. The visible cost is that light leaks through walls at close
 * range — an accepted MVP artefact, noted for the polish phase.
 */
export class LampLights {
  readonly group = new THREE.Group();

  private readonly lights: THREE.PointLight[] = [];
  private assigned: string[] = [];
  private sinceReassign = Number.POSITIVE_INFINITY;

  constructor(scene: THREE.Scene, maxLights: number) {
    this.group.name = 'lamp-lights';
    scene.add(this.group);

    for (let i = 0; i < Math.max(0, maxLights); i++) {
      const light = new THREE.PointLight(LAMP_COLOR, LAMP_INTENSITY, LAMP_RANGE, 2);
      light.castShadow = false;
      light.visible = false;
      this.lights.push(light);
      this.group.add(light);
    }
  }

  get size(): number {
    return this.lights.length;
  }

  /** Which lamps currently hold a light. For tests and the debug overlay. */
  get current(): readonly string[] {
    return this.assigned;
  }

  /**
   * Move the pool onto the nearest lit lamps.
   *
   * Cheap on most frames: the assignment only runs once a second, and between
   * times this walks the handful of lights it already owns to keep them on
   * lamps that may have moved with the deck.
   */
  update(dt: number, lamps: readonly LampSample[], camera: THREE.Vector3): void {
    if (this.lights.length === 0) return;

    this.sinceReassign += dt;
    if (this.sinceReassign >= LAMP_REASSIGN_S) {
      this.sinceReassign = 0;
      this.assigned = assignLamps(lamps, camera, this.lights.length, this.assigned);
    }

    const byId = new Map(lamps.map((lamp) => [lamp.id, lamp]));
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i] as THREE.PointLight;
      const lamp = byId.get(this.assigned[i] ?? '');
      // A lamp that shed or was demolished between reassignments goes dark
      // immediately rather than waiting out the second.
      if (!lamp || !lamp.lit) {
        light.visible = false;
        continue;
      }
      // Just below the head, so the fitting itself is not the brightest thing
      // in the room.
      light.position.set(lamp.x, lamp.y - 0.2, lamp.z);
      light.visible = true;
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      light.visible = false;
      this.group.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
    this.group.parent?.remove(this.group);
  }
}
