import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { bevelledBox } from './MachineGeometry';
import { footAt, planted } from './Gait';
import { solveLeg } from './LegIK';
import { LEGS, LOWER_LEG, UPPER_LEG, type LegDefinition } from '@/data/gait';

/**
 * The machine's legs: geometry, and the joints the gait drives.
 *
 * **Procedural, not imported.** The spec (section 6.2) called for CC0 legs
 * with a named candidate, and required the model to be opened and inspected
 * before anything was committed rather than trusted from a listing. It was,
 * and nothing survived:
 *
 *   - Quaternius' Mech, the spec's own pick: CC0, but one skinned mesh of a
 *     BIPED, 4,008 triangles for the whole robot. The legs are vertex weights
 *     on a whole-character mesh, not parts that can be taken off it.
 *   - Quaternius' Robot Enemy Legs: CC0, and the same story — skinned, biped,
 *     ~1k triangles of leg.
 *   - MechQuadruped and Mech Assault Walker, which are the two that actually
 *     look like heavy walkers: 59,644 and 36,906 triangles, single unsplittable
 *     meshes, eleven and thirteen materials — and both CC-BY, where the spec
 *     required CC0 with no attribution.
 *
 * So the spec's own fallback: built from `bevelledBox` like the rest of the
 * machine, which at minimum matches the hull it hangs off. Roughly 40
 * triangles a leg against 4,000 for a listing's whole robot, and every
 * proportion is a number somebody can argue about.
 *
 * The rig is three nested rotations per leg, which is what `LegIK` solves for:
 * splay rolls the whole leg out from the hull, the hip swings the thigh fore
 * and aft, and the knee folds. Building it as a hierarchy rather than
 * positioning bones by hand is what keeps the drawn leg and the solved leg the
 * same leg.
 */

/** Proportions. Chunky and obviously load-bearing, like the hull. */
const HIP_HOUSING = { w: 1.3, h: 1.2, d: 1.5 };
const THIGH = { w: 0.7, d: 0.95 };
const SHIN = { w: 0.5, d: 0.66 };
const FOOT_PAD = { w: 1.2, h: 0.3, d: 2.0 };
const KNEE_RADIUS = 0.38;

interface LegRig {
  root: THREE.Group;
  splay: THREE.Group;
  thigh: THREE.Group;
  knee: THREE.Group;
  foot: THREE.Group;
}

export class MachineLegs {
  /** Hang this off the machine's group, so the body pose carries it. */
  readonly object3D = new THREE.Group();

  private readonly rigs: LegRig[] = [];
  private readonly disposables: THREE.BufferGeometry[] = [];
  private distance = 0;
  /** Leg indices that planted on the last update. Reused, never reallocated. */
  private readonly plants: number[] = [];

  constructor(
    materials: Materials,
    private readonly legs: readonly LegDefinition[] = LEGS,
  ) {
    this.object3D.name = 'legs';
    for (const leg of this.legs) this.rigs.push(this.buildLeg(leg, materials));
  }

  /**
   * Drive the legs to a distance travelled.
   *
   * Returns the legs whose feet planted since the last call, for the footfalls
   * in the sand and the puff of dust that go with them. Returns the same array
   * every time; read it before calling again.
   */
  setDistance(distance: number): readonly number[] {
    this.plants.length = 0;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i] as LegDefinition;
      const rig = this.rigs[i] as LegRig;

      const angles = solveLeg(leg.hip, footAt(distance, leg), UPPER_LEG, LOWER_LEG);
      rig.splay.rotation.z = angles.splay;
      // Negated: a positive rotation about +X carries a bone hanging down
      // toward -Z, and the solver's positive angle is toward +Z. This is the
      // one place the two conventions meet, and the test that catches getting
      // it wrong is the one that asks where the foot ended up in world space.
      rig.thigh.rotation.x = -angles.hip;
      rig.knee.rotation.x = -angles.knee;

      if (planted(this.distance, distance, leg)) this.plants.push(i);
    }

    this.distance = distance;
    return this.plants;
  }

  /** Where a foot is, for whatever needs to mark the sand under it. */
  footObject(index: number): THREE.Object3D {
    return (this.rigs[index] as LegRig).foot;
  }

  /**
   * Where a foot is in the world, right now.
   *
   * The matrix is refreshed rather than trusted: this is asked for at the
   * moment a foot lands, which is inside the visual update and before the
   * renderer has walked the graph. A stale matrix would put the print where
   * the foot was a frame ago, which at speed is nearly a metre adrift.
   */
  footPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const foot = (this.rigs[index] as LegRig).foot;
    foot.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(foot.matrixWorld);
  }

  /** Exposed for the tests that check the rig folds the way a leg folds. */
  kneeObject(index: number): THREE.Object3D {
    return (this.rigs[index] as LegRig).knee;
  }

  dispose(): void {
    for (const geo of this.disposables) geo.dispose();
    this.disposables.length = 0;
  }

  private buildLeg(leg: LegDefinition, materials: Materials): LegRig {
    const root = new THREE.Group();
    root.name = `leg-${leg.id}`;
    root.position.set(leg.hip.x, leg.hip.y, leg.hip.z);
    this.object3D.add(root);

    // The housing does not move with the leg: it is where the leg meets the
    // hull, and it hides the join. It is the one part in hull green — the
    // moving parts are darker, so the leg reads as machinery hung off the hull
    // rather than as more hull.
    root.add(this.mesh(bevelledBox(HIP_HOUSING.w, HIP_HOUSING.h, HIP_HOUSING.d, 0.1), materials.hull));

    const splay = new THREE.Group();
    root.add(splay);

    const thigh = new THREE.Group();
    splay.add(thigh);
    // Bones hang along -Y from their joint, so the mesh sits half a bone down.
    const thighMesh = this.mesh(
      bevelledBox(THIGH.w, UPPER_LEG * 0.94, THIGH.d, 0.08),
      materials.hullDark,
    );
    thighMesh.position.y = -UPPER_LEG / 2;
    thigh.add(thighMesh);

    // A piston alongside the thigh: the cheapest thing that reads as machinery
    // rather than as a rectangle.
    const piston = this.mesh(
      new THREE.CylinderGeometry(0.11, 0.11, UPPER_LEG * 0.8, 8),
      materials.bareSteel,
    );
    piston.position.set(0, -UPPER_LEG / 2, THIGH.d / 2 + 0.06);
    thigh.add(piston);

    const knee = new THREE.Group();
    knee.position.y = -UPPER_LEG;
    thigh.add(knee);
    const kneeMesh = this.mesh(
      new THREE.CylinderGeometry(KNEE_RADIUS, KNEE_RADIUS, THIGH.w + 0.16, 12),
      materials.bareSteel,
    );
    // The knee pivots about X, so its cylinder lies along X too.
    kneeMesh.rotation.z = Math.PI / 2;
    knee.add(kneeMesh);

    const shinMesh = this.mesh(
      bevelledBox(SHIN.w, LOWER_LEG * 0.92, SHIN.d, 0.07),
      materials.hullDark,
    );
    shinMesh.position.y = -LOWER_LEG / 2;
    knee.add(shinMesh);

    const foot = new THREE.Group();
    foot.position.y = -LOWER_LEG;
    knee.add(foot);
    const pad = this.mesh(
      bevelledBox(FOOT_PAD.w, FOOT_PAD.h, FOOT_PAD.d, 0.06),
      materials.rubber,
    );
    // The pad's top face is the foot point, so the sole sits on the ground
    // rather than sinking half a pad into it.
    pad.position.y = FOOT_PAD.h / 2;
    foot.add(pad);

    return { root, splay, thigh, knee, foot };
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    this.disposables.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
