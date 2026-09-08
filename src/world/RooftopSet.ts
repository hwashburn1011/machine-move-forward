import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import type { LoadedModel } from '@/art/ModelLoader';
import { bevelledBox } from '@/machine/MachineGeometry';
import { CHARACTER_DROP_Y, DECK_SURFACE_Y, DESERT_FLOOR_Y } from '@/game/constants';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';

/**
 * The ruined building the game opens on.
 *
 * A STATIC set piece, deliberately. The architecture pins the machine at the
 * origin and scrolls the world past it, so a building the player jumps FROM
 * onto a machine that is moving would have to be a moving platform: a
 * kinematic collider translated every step, with the player's and every
 * chasing scavenger's `carry` fed from it. Instead the machine idles at
 * throttle 0 beside solid, unmoving ground, and the LANDING is what pushes the
 * throttle up — which is the same story beat and touches nothing.
 *
 * Once the opening is over the building recedes with the world, by the same
 * per-step delta the dunes scroll by, and is dropped when it is far enough
 * astern to be out of shot. Nothing stands on it while it moves: `Game` only
 * starts scrolling it after the opening's `teardown-rooftop`.
 *
 * Everything here is procedural, for the reason the machine and the build
 * pieces are: the roof is standable and its collider has to derive from the
 * same geometry the player can see. `applyClutter` is the seam a CC0 rooftop
 * pack drops into later; it is dressing, and its absence costs nothing.
 */

/** Footprint, in world X. The near face is the ledge. */
export const ROOFTOP_MIN_X = 7.5;
export const ROOFTOP_MAX_X = 17.5;

/** Footprint, in world Z, before the set starts scrolling astern. */
export const ROOFTOP_MIN_Z = -5;
export const ROOFTOP_MAX_Z = 5;

/**
 * The roof surface, in metres.
 *
 * A storey above the deck (3.69), so the jump has a real fall in it. Higher
 * and the landing starts hurting; level with the deck and it is a step across
 * rather than a leap of faith.
 */
export const ROOFTOP_ROOF_Y = 6.6;

/** Parapet height above the roof. Chest-high: a barrier, not a kerb. */
const PARAPET_H = 1.0;
const PARAPET_T = 0.3;

/** Width of the gap in the near parapet — the ledge you are funnelled onto. */
const LEDGE_GAP_HALF_Z = 2;

/**
 * The lip the player jumps from.
 *
 * Its X is the building's near face, which is what makes the gap to the deck
 * edge exactly the number `openingdirector.test.ts` measures the ballistics
 * against.
 */
export const ROOFTOP_LEDGE = { x: ROOFTOP_MIN_X, y: ROOFTOP_ROOF_Y, z: 0 } as const;

/**
 * Y to drop a character capsule from onto the roof.
 *
 * The deck's own drop clearance, moved up to the roof, rather than a second
 * number: a capsule started inside a collider is one Rapier's character
 * controller refuses to move ever again, and that lesson is already paid for
 * in `CHARACTER_DROP_Y`.
 */
export const ROOFTOP_DROP_Y = ROOFTOP_ROOF_Y + (CHARACTER_DROP_Y - DECK_SURFACE_Y);

/** Mid-roof, between the stair stub they came through and the ledge. */
export const ROOFTOP_PLAYER_SPAWN = { x: 13.5, y: ROOFTOP_DROP_Y, z: 0 } as const;

/**
 * Where the scavengers come up.
 *
 * Behind the player and either side of the stair stub, so the roof is cut off
 * behind them and the only way out is forward, over the ledge.
 */
export const ROOFTOP_ENEMY_SPAWNS = [
  { x: 16, y: ROOFTOP_DROP_Y, z: 3 },
  { x: 16, y: ROOFTOP_DROP_Y, z: -3 },
] as const;

/**
 * Metres astern at which the building is dropped.
 *
 * Past the sun's shadow box (±22m) and past anything the chunk window keeps
 * alive ahead, so it cannot be seen to vanish.
 */
export const ROOFTOP_GONE_BEHIND_M = 80;

interface Slab {
  half: THREE.Vector3;
  center: THREE.Vector3;
  material: 'hull' | 'hullDark' | 'rustedSteel' | 'bareSteel';
  bevel?: number;
}

/**
 * Every solid the building is made of.
 *
 * One list, read twice — once to build meshes and once to build colliders — so
 * what you see and what you stand on cannot drift apart.
 */
function slabs(): Slab[] {
  const cx = (ROOFTOP_MIN_X + ROOFTOP_MAX_X) / 2;
  const cz = (ROOFTOP_MIN_Z + ROOFTOP_MAX_Z) / 2;
  const halfX = (ROOFTOP_MAX_X - ROOFTOP_MIN_X) / 2;
  const halfZ = (ROOFTOP_MAX_Z - ROOFTOP_MIN_Z) / 2;

  // The shell: one block from the sand to the roof surface. Solid rather than
  // four walls and a slab, because nothing ever goes inside it — the stair
  // stub's door is blocked, which is the whole reason the ledge is the exit.
  const shellHalfY = (ROOFTOP_ROOF_Y - DESERT_FLOOR_Y) / 2;
  const out: Slab[] = [
    {
      half: new THREE.Vector3(halfX, shellHalfY, halfZ),
      center: new THREE.Vector3(cx, DESERT_FLOOR_Y + shellHalfY, cz),
      material: 'hull',
      bevel: 0.12,
    },
  ];

  const parapetY = ROOFTOP_ROOF_Y + PARAPET_H / 2;

  // Far side, and both flanks: nowhere to retreat to.
  out.push({
    half: new THREE.Vector3(PARAPET_T / 2, PARAPET_H / 2, halfZ),
    center: new THREE.Vector3(ROOFTOP_MAX_X - PARAPET_T / 2, parapetY, cz),
    material: 'hullDark',
  });
  for (const sign of [-1, 1]) {
    out.push({
      half: new THREE.Vector3(halfX, PARAPET_H / 2, PARAPET_T / 2),
      center: new THREE.Vector3(cx, parapetY, cz + sign * (halfZ - PARAPET_T / 2)),
      material: 'hullDark',
    });
  }

  // Near side, in two pieces, leaving the ledge gap between them. The gap is
  // the point: it funnels a fleeing player to one place, and that place is
  // the only one the jump works from.
  const wingHalfZ = (halfZ - LEDGE_GAP_HALF_Z) / 2;
  for (const sign of [-1, 1]) {
    out.push({
      half: new THREE.Vector3(PARAPET_T / 2, PARAPET_H / 2, wingHalfZ),
      center: new THREE.Vector3(
        ROOFTOP_MIN_X + PARAPET_T / 2,
        parapetY,
        cz + sign * (LEDGE_GAP_HALF_Z + wingHalfZ),
      ),
      material: 'hullDark',
    });
  }

  // The stair stub: the door they came through, and it is not going to open
  // again. Flavour, and an obstacle to round on the way out.
  out.push({
    half: new THREE.Vector3(1.1, 1.2, 1.1),
    center: new THREE.Vector3(ROOFTOP_MAX_X - 2.2, ROOFTOP_ROOF_Y + 1.2, cz),
    material: 'rustedSteel',
    bevel: 0.08,
  });
  // The blocked panel across its face, so "blocked" is something you can see.
  out.push({
    half: new THREE.Vector3(0.07, 0.9, 0.75),
    center: new THREE.Vector3(ROOFTOP_MAX_X - 3.36, ROOFTOP_ROOF_Y + 0.95, cz),
    material: 'bareSteel',
    bevel: 0.03,
  });

  return out;
}

export class RooftopSet {
  readonly group = new THREE.Group();

  readonly playerSpawn = new THREE.Vector3(
    ROOFTOP_PLAYER_SPAWN.x,
    ROOFTOP_PLAYER_SPAWN.y,
    ROOFTOP_PLAYER_SPAWN.z,
  );

  readonly enemySpawns: THREE.Vector3[] = ROOFTOP_ENEMY_SPAWNS.map(
    (s) => new THREE.Vector3(s.x, s.y, s.z),
  );

  /** The ledge, kept live so the skip and the harness can aim at it. */
  readonly ledge = new THREE.Vector3(ROOFTOP_LEDGE.x, ROOFTOP_LEDGE.y, ROOFTOP_LEDGE.z);

  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private clutter: THREE.Object3D | null = null;
  private built = false;
  /** How far astern the whole set has been scrolled so far. */
  private scrolled = 0;
  /** Reused by `scroll`, so a departing building costs no allocation a step. */
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly materials: Materials,
  ) {}

  /** True once the building is far enough behind to stop paying for it. */
  get gone(): boolean {
    return this.scrolled >= ROOFTOP_GONE_BEHIND_M;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  /** Metres the set has receded. Read by the harness. */
  get scrolledBy(): number {
    return this.scrolled;
  }

  build(): void {
    if (this.built) return;
    this.built = true;

    for (const slab of slabs()) {
      const geo = bevelledBox(
        slab.half.x * 2,
        slab.half.y * 2,
        slab.half.z * 2,
        slab.bevel ?? 0.05,
      );
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, this.materials[slab.material]);
      mesh.position.copy(slab.center);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // A DRIVEN body — dynamic, locked, gravity-free — exactly as the machine
      // uses. Not fixed, because the set has to be translated once the opening
      // is over and a fixed body cannot move. Not KINEMATIC either, and that
      // distinction is the whole of `PhysicsWorld.createDrivenBody`'s doc
      // comment: against a kinematic platform Rapier's character controller
      // resolves as though the ground were moving and pins whatever stands on
      // it. Measured here, exactly as it was measured on the machine — two
      // scavengers spawned on a kinematic roof reported grounded, asked to
      // walk, and did not move a centimetre for the whole run.
      const body = this.physics.createDrivenBody(slab.center);
      this.physics.addBoxTo(body, slab.half, new THREE.Vector3(), undefined, {
        kind: 'rooftop',
      });
      this.bodies.push(body);
    }

    this.buildDressing();

    this.scene.add(this.group);
  }

  /**
   * A few authored-looking roof details break up the broad procedural shell.
   * They remain visual only: the collider list above is the trusted opening
   * contract, so dressing can evolve without changing the jump or chase.
   */
  private buildDressing(): void {
    const vent = bevelledBox(1.1, 0.42, 0.72, 0.08);
    vent.translate(0, ROOFTOP_ROOF_Y + 0.21, -3.15);
    const ventMesh = new THREE.Mesh(vent, this.materials.rustedSteel);
    ventMesh.position.set(13.9, 0, 0);
    ventMesh.castShadow = false;
    ventMesh.receiveShadow = true;
    this.geometries.push(vent);
    this.group.add(ventMesh);

    const tank = new THREE.CylinderGeometry(0.58, 0.64, 1.15, 12, 2);
    tank.translate(15.7, ROOFTOP_ROOF_Y + 0.58, 2.8);
    const tankMesh = new THREE.Mesh(tank, this.materials.hullDark);
    tankMesh.castShadow = true;
    tankMesh.receiveShadow = true;
    this.geometries.push(tank);
    this.group.add(tankMesh);

    // A short antenna and its foot give the skyline a useful silhouette while
    // staying clear of the ledge gap and the player spawn.
    const mast = new THREE.CylinderGeometry(0.045, 0.07, 1.65, 8);
    mast.translate(12.1, ROOFTOP_ROOF_Y + 0.83, 2.9);
    const mastMesh = new THREE.Mesh(mast, this.materials.bareSteel);
    mastMesh.castShadow = false;
    mastMesh.receiveShadow = false;
    this.geometries.push(mast);
    this.group.add(mastMesh);
  }

  /**
   * Optional CC0 roof dressing — an AC unit, an antenna, vents.
   *
   * Behind the model loader on the same bargain as everything else: a missing
   * pack costs a slightly barer roof, never a boot, and `?nomodel=1` takes the
   * identical path. Purely visual: it gets no collider, because a player being
   * stopped by a decoration they cannot see the shape of is worse than one
   * walking through it during a four-second chase.
   */
  applyClutter(model: LoadedModel | null): void {
    if (!model || !this.built) return;
    const object = model.scene;
    object.position.set(ROOFTOP_MAX_X - 4.5, ROOFTOP_ROOF_Y, ROOFTOP_MIN_Z + 1.5);
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    this.clutter = object;
    this.group.add(object);
  }

  /**
   * Move the whole set astern by this step's world scroll.
   *
   * `deltaMetres` is how far the machine walked, not a Z: the sign belongs to
   * `WORLD_Z_PER_METRE`, the same way it does for the dunes and the tread
   * marks, so a machine that ever turns round cannot leave this scrolling the
   * wrong way.
   */
  scroll(deltaMetres: number): void {
    if (!this.built || deltaMetres === 0) return;
    this.scrolled += deltaMetres;

    const dz = WORLD_Z_PER_METRE * deltaMetres;
    this.group.position.z += dz;
    this.ledge.z += dz;
    for (const body of this.bodies) {
      const t = body.translation();
      // `setTranslation` teleports, which is how a locked dynamic body is
      // driven — the solver will not move it. Same call `Machine.applyPose`
      // makes for the same reason.
      this.scratch.set(t.x, t.y, t.z + dz);
      body.setTranslation(this.scratch, true);
    }
  }

  dispose(): void {
    for (const body of this.bodies) {
      for (let i = body.numColliders() - 1; i >= 0; i--) {
        const collider = body.collider(i);
        if (collider) this.physics.removeCollider(collider);
      }
      this.physics.removeBody(body);
    }
    this.bodies.length = 0;

    if (this.clutter) {
      this.group.remove(this.clutter);
      this.clutter = null;
    }
    this.scene.remove(this.group);
    this.group.clear();
    for (const geo of this.geometries) geo.dispose();
    this.geometries.length = 0;
    this.built = false;
  }
}
