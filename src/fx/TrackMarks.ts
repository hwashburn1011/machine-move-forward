import * as THREE from 'three';
import { duneHeightAt } from '@/world/DuneField';
import { PALETTE } from '@/art/Palette';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';

/**
 * The footfalls the machine presses into the sand behind it.
 *
 * The single most convincing "this thing is under power" cue after the legs
 * themselves: the machine stops being something the desert slides past and
 * becomes something that has *been* somewhere. Legs say it is walking; the
 * prints say the walking did work.
 *
 * This was a pair of continuous tread tracks, and almost all of it survived
 * the machine growing legs unchanged — the pool, the world-locked movement,
 * the dune-height sampling and the taper. What changed is the spawn rule. A
 * track was laid every `SPACING` metres per side, because a belt presses the
 * same sand continuously; a print is pressed WHERE A FOOT LANDS, at the moment
 * it lands, and nowhere in between. The caller says when.
 *
 * Marks then move with the world at exactly its own scroll rate, so they stay
 * glued to the sand they were pressed into rather than swimming across it.
 *
 * One InstancedMesh, pooled and recycled — prints over a hundred metres of
 * trail would otherwise be hundreds of draw calls for something the player
 * only ever sees in their wake.
 */

/**
 * Prints in the pool.
 *
 * Four feet planting about once a second each at cruise, and a print living
 * until it is 50m astern, is some thirty prints in the air at once. 128 leaves
 * room for a machine walking faster than this one does before the cursor
 * catches its own tail.
 */
const POOL = 128;

/**
 * Metres ASTERN at which the trail has served its purpose and a print is
 * recycled.
 *
 * A distance, not a Z. It used to be `-50`, which is the same number with the
 * world's direction baked into its sign — correct only while the world scrolls
 * toward -Z, and silently never true once it does not: prints would simply
 * fly off toward +Z and the pool would exhaust itself.
 *
 * If a print were still alive when the cursor came round to it, reuse would
 * teleport it from the back of the trail to the front in one frame.
 */
const RETIRE_ASTERN = 50;

/** Marks shrink away over this last stretch instead of blinking out. */
const FADE_OVER = 9;

/** Sat just above the sand so it reads as a depression, not a floating card. */
const SAND_LIFT = 0.06;

interface Mark {
  x: number;
  z: number;
  live: boolean;
  /** Randomised so the trail is not a row of identical stamps. */
  scale: number;
  yaw: number;
}

export class TrackMarks {
  readonly mesh: THREE.InstancedMesh;
  private readonly marks: Mark[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVec = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private cursor = 0;
  private distance = 0;

  constructor(scene: THREE.Scene) {
    // The size of the foot that made it, near enough. A tread mark was long
    // and narrow because a belt drags; a print is the shape of the pad.
    const geo = new THREE.PlaneGeometry(1.2, 1.9);
    // Lie flat. PlaneGeometry stands upright by default.
    geo.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.sandCrest.clone().multiplyScalar(0.62),
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      // The mark sits a few centimetres above a shader-displaced dune surface
      // whose height this samples analytically. Depth writes off and a polygon
      // offset keep the two from fighting where the approximation drifts.
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.InstancedMesh(geo, material, POOL);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    for (let i = 0; i < POOL; i++) {
      this.marks.push({ x: 0, z: 0, live: false, scale: 1, yaw: 0 });
    }
    this.writeMatrices();
  }

  get liveCount(): number {
    let n = 0;
    for (const m of this.marks) if (m.live) n++;
    return n;
  }

  /**
   * @param distance how far the machine has travelled, as the world is being
   *                 DRAWN at — the same number the legs are driven by.
   *
   * The scroll is derived from that rather than passed in, and that is the
   * whole point. It used to be handed `-speed * frameDt`: wall time, while
   * every other thing that has to stay glued to the sand — the dunes, the
   * planted feet — moves on simulated time with the sub-step interpolation
   * folded in. The two agree only while the frame rate is keeping up. Whenever
   * it is not, the prints slide across the ground they were pressed into,
   * which is the one thing a trail must never do. Taking the delta of the same
   * distance the feet use makes them agree by construction.
   *
   * A print's position is kept in RENDER space, because that is where it has
   * to be drawn, but the dune it sits on is a function of WORLD space — so the
   * two are reconciled here rather than letting a print sample the height of
   * ground it is no longer over.
   */
  update(distance: number): void {
    const travelled = distance - this.distance;
    this.distance = distance;

    // A jump rather than a walk: the debug skip, a save loaded at 10km, or the
    // very first call against a distance that is not zero. Every print belongs
    // to ground that is now kilometres astern, so retire them rather than
    // scrolling them there one frame at a time.
    if (Math.abs(travelled) > RETIRE_ASTERN) {
      for (const mark of this.marks) mark.live = false;
      this.writeMatrices();
      return;
    }

    const scrollZ = WORLD_Z_PER_METRE * travelled;
    for (const mark of this.marks) {
      if (!mark.live) continue;
      mark.z += scrollZ;
      // How far astern it has got, in the world's own direction rather than
      // in raw Z, so this reads the same whichever way the machine faces.
      if (mark.z * WORLD_Z_PER_METRE > RETIRE_ASTERN) mark.live = false;
    }

    this.writeMatrices();
  }

  /**
   * Press a print into the sand under a foot that has just landed.
   *
   * Takes the foot's own position rather than a side, because that is the
   * whole point: a print appears under the foot that made it, wherever the
   * gait happened to put it, and not on a fixed line down each flank.
   */
  press(at: { x: number; z: number }): void {
    const mark = this.marks[this.cursor] as Mark;
    this.cursor = (this.cursor + 1) % this.marks.length;

    mark.x = at.x;
    mark.z = at.z;
    mark.live = true;
    // Cheap variation without an RNG draw: the cursor already cycles.
    mark.scale = 0.88 + ((this.cursor * 37) % 23) / 100;
    mark.yaw = (((this.cursor * 53) % 17) - 8) * 0.004;
  }

  private writeMatrices(): void {
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i] as Mark;
      if (mark.live) {
        this.position.set(
          mark.x,
          // Render Z back to world Z. A print is drawn where the world has
          // carried it; the dune under it is a function of where it was
          // pressed. `- WORLD_Z_PER_METRE * distance` is the inverse of the
          // scroll above, and derived from the same constant so the two cannot
          // disagree about which way the world went.
          duneHeightAt(mark.x, mark.z - WORLD_Z_PER_METRE * this.distance) + SAND_LIFT,
          mark.z,
        );
        this.euler.set(0, mark.yaw, 0);
        this.quat.setFromEuler(this.euler);
        // Taper the oldest marks to nothing. Sand slumps back into a track; a
        // trail that ends in a hard edge reads as a decal, not a depression.
        const remaining = RETIRE_ASTERN - mark.z * WORLD_Z_PER_METRE;
        const fade = remaining < FADE_OVER ? Math.max(0, remaining / FADE_OVER) : 1;
        this.scaleVec.set(mark.scale * fade, 1, mark.scale * fade);
        this.matrix.compose(this.position, this.quat, this.scaleVec);
      } else {
        // Dead marks are scaled to nothing rather than removed: an
        // InstancedMesh draws its whole count regardless, and a zero-scale
        // instance costs nothing visible.
        this.matrix.makeScale(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
