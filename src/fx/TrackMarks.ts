import * as THREE from 'three';
import { duneHeightAt } from '@/world/DuneField';
import { PALETTE } from '@/art/Palette';

/**
 * The pair of tread tracks the machine presses into the sand behind it.
 *
 * The single most convincing "this thing is under power" cue after the treads
 * themselves: the machine stops being something the desert slides past and
 * becomes something that has *been* somewhere. Cleats say the belts are
 * turning; tracks say the turning did work.
 *
 * Marks are laid at the front of the tread and then move with the world, at
 * exactly the world's own scroll rate, so they stay glued to the sand they
 * were pressed into rather than swimming across it.
 *
 * One InstancedMesh, pooled and recycled — a mark per metre over a hundred
 * metres of trail would otherwise be hundreds of draw calls for something the
 * player only ever sees in their wake.
 */

/** Marks per side. Two sides, so the pool is twice this. */
const PER_SIDE = 64;

/** Metres of travel between one mark and the next. */
const SPACING = 0.85;

/** Lateral offset of each tread's centre line. */
const TRACK_X = 5.75;

/** Where a mark is laid: the leading end of the tread's contact patch. */
const LAY_Z = 7.0;

/**
 * Behind this the trail has served its purpose and the mark is recycled.
 *
 * Deliberately just SHORT of the pool's own reach (PER_SIDE * SPACING is about
 * 54m). If a mark were still alive when the cursor came round to it, reuse
 * would teleport it from the back of the trail to the front in one frame.
 */
const RETIRE_Z = -50;

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
  private sinceLast = 0;
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1.5, 1.0);
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

    this.mesh = new THREE.InstancedMesh(geo, material, PER_SIDE * 2);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    for (let i = 0; i < PER_SIDE * 2; i++) {
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
   * @param dt      frame seconds — this is visual, so it runs on frame time
   * @param speed   the machine's real speed, so tracks stop when it stops
   * @param scrollZ how far the world has moved this frame, in metres. Marks
   *                move by exactly this, which is what glues them to the sand.
   */
  update(dt: number, speed: number, scrollZ: number): void {
    for (const mark of this.marks) {
      if (!mark.live) continue;
      mark.z += scrollZ;
      if (mark.z < RETIRE_Z) mark.live = false;
    }

    // Laid by distance travelled, not by time: at a crawl the tracks space out
    // the same as at speed, because the tread is pressing the same sand.
    this.sinceLast += speed * dt;
    while (this.sinceLast >= SPACING) {
      this.sinceLast -= SPACING;
      this.lay(-TRACK_X);
      this.lay(TRACK_X);
    }

    this.writeMatrices();
  }

  private lay(x: number): void {
    const mark = this.marks[this.cursor] as Mark;
    this.cursor = (this.cursor + 1) % this.marks.length;

    mark.x = x;
    mark.z = LAY_Z;
    mark.live = true;
    // Cheap variation without an RNG draw: the cursor already cycles.
    mark.scale = 0.88 + ((this.cursor * 37) % 23) / 100;
    mark.yaw = (((this.cursor * 53) % 17) - 8) * 0.004;
  }

  private writeMatrices(): void {
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i] as Mark;
      if (mark.live) {
        this.position.set(mark.x, duneHeightAt(mark.x, mark.z) + SAND_LIFT, mark.z);
        this.euler.set(0, mark.yaw, 0);
        this.quat.setFromEuler(this.euler);
        // Taper the oldest marks to nothing. Sand slumps back into a track; a
        // trail that ends in a hard edge reads as a decal, not a depression.
        const remaining = mark.z - RETIRE_Z;
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
