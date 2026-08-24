import * as THREE from 'three';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import { hashSeed, Rng } from '@/core/math/Random';
import { bevelledBox } from '@/machine/MachineGeometry';
import { rollDrops, type DropEntry } from '@/enemies/Loot';
import type { ReelCandidate } from './Reel';

/**
 * Salvage crates drifting past in the dunes.
 *
 * The machine holds station at the world origin and the desert scrolls by, so
 * a chest is spawned ahead, moved astern at the machine's own speed, and
 * recycled once it is behind. Nothing here is physical: they float in the sand
 * beside the deck and exist to be shot at with the reel, not walked into.
 */

/** How many crates exist at once. Pooled, never allocated during play. */
const POOL = 6;

/** Metres of travel between one crate appearing and the next. */
const INTERVAL_M = 90;

/** How far ahead of the machine a crate first appears. */
const AHEAD = 46;

/**
 * Fraction of the machine's speed a crate appears to move at.
 *
 * Strictly they are static and the machine passes them, which puts them at a
 * full 7.5 m/s and leaves barely a moment to aim. Treating them as adrift on
 * the same wind is the cheaper fiction: they stay in reach long enough to be
 * lined up and hooked, which is the point of having them.
 */
const DRIFT = 0.42;

/** Behind this, a crate is out of play and goes back in the pool. */
const BEHIND = -26;

/** Lateral band the crates sit in, either side of the deck. */
const SIDE_MIN = 7;
const SIDE_MAX = 17;

/** What a crate is worth. Richer than a scavenger: it has to be worth aiming at. */
const CONTENTS: readonly DropEntry[] = [
  { id: 'scrap', min: 22, max: 46 },
  { id: 'components', min: 1, max: 3, chance: 0.75 },
  { id: 'fuel', min: 1, max: 2, chance: 0.35 },
];

interface Crate {
  readonly id: string;
  readonly object3D: THREE.Group;
  active: boolean;
  /** Set while the reel is dragging it in. */
  hooked: boolean;
  bob: number;
}

export class SalvageField {
  private readonly crates: Crate[] = [];
  private readonly rng: Rng;
  private nextAt = INTERVAL_M;
  private nextId = 0;

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
    materials: Materials,
    seed: string,
  ) {
    this.rng = new Rng(hashSeed(seed, 'salvage'));
    for (let i = 0; i < POOL; i++) {
      const crate = {
        id: `crate-${i}`,
        object3D: buildCrate(materials),
        active: false,
        hooked: false,
        bob: 0,
      };
      crate.object3D.visible = false;
      scene.add(crate.object3D);
      this.crates.push(crate);
    }
  }

  /** Crates the reel is allowed to consider, in world space. */
  get targets(): ReelCandidate[] {
    return this.crates
      .filter((c) => c.active && !c.hooked)
      .map((c) => ({
        id: c.id,
        x: c.object3D.position.x,
        y: c.object3D.position.y,
        z: c.object3D.position.z,
      }));
  }

  positionOf(id: string): THREE.Vector3 | null {
    const crate = this.crates.find((c) => c.id === id && c.active);
    return crate ? crate.object3D.position : null;
  }

  /** Mark a crate as being dragged in, so nothing else targets it. */
  hook(id: string): boolean {
    const crate = this.crates.find((c) => c.id === id && c.active && !c.hooked);
    if (!crate) return false;
    crate.hooked = true;
    return true;
  }

  /**
   * Open a hooked crate: pay out, announce, and recycle it.
   *
   * Rolled here rather than at spawn so a crate that is never reeled in costs
   * nothing, and the same seed still gives the same run.
   */
  open(id: string, deposit: (item: string, count: number) => void): boolean {
    const crate = this.crates.find((c) => c.id === id && c.active);
    if (!crate) return false;

    const drops = rollDrops(CONTENTS, this.rng);
    for (const drop of drops) deposit(drop.id, drop.count);
    if (drops.length > 0) {
      this.bus.emit('loot:collected', { items: drops, source: 'Salvage crate' });
    }
    this.retire(crate);
    return true;
  }

  /**
   * Drag every hooked crate towards a point.
   *
   * Returns the ids that have arrived, for the caller to open. Speed rises
   * with distance so a crate snatched from forty metres does not spend five
   * seconds crawling in, while one already close still lands promptly.
   */
  reelIn(dt: number, toward: THREE.Vector3): string[] {
    const arrived: string[] = [];

    for (const crate of this.crates) {
      if (!crate.active || !crate.hooked) continue;

      const p = crate.object3D.position;
      const dx = toward.x - p.x;
      const dy = toward.y - p.y;
      const dz = toward.z - p.z;
      const distance = Math.hypot(dx, dy, dz);

      if (distance < 1.1) {
        arrived.push(crate.id);
        continue;
      }

      const speed = Math.max(14, distance * 1.9);
      const step = Math.min(distance, speed * dt);
      p.x += (dx / distance) * step;
      p.y += (dy / distance) * step;
      p.z += (dz / distance) * step;
      // Tumble on the way in, so the pull reads as a yank rather than a glide.
      crate.object3D.rotation.x += dt * 5;
    }

    return arrived;
  }

  /**
   * Drift everything astern and spawn on distance.
   *
   * Driven by distance rather than time so the field stays consistent whatever
   * the machine's speed is doing.
   */
  update(dt: number, distance: number, machineSpeed: number): void {
    if (distance >= this.nextAt) {
      this.nextAt = Math.floor(distance / INTERVAL_M) * INTERVAL_M + INTERVAL_M;
      this.spawn();
    }

    for (const crate of this.crates) {
      if (!crate.active) continue;
      if (!crate.hooked) crate.object3D.position.z += machineSpeed * DRIFT * dt;

      // A slow list and bob, so they read as adrift rather than as props
      // glued to the terrain.
      crate.bob += dt;
      crate.object3D.rotation.z = Math.sin(crate.bob * 0.7) * 0.06;
      crate.object3D.rotation.y += dt * 0.15;

      if (crate.object3D.position.z > BEHIND * -1) this.retire(crate);
    }
  }

  private spawn(): void {
    const crate = this.crates.find((c) => !c.active);
    if (!crate) return;

    const side = this.rng.next() < 0.5 ? -1 : 1;
    const lateral = this.rng.range(SIDE_MIN, SIDE_MAX) * side;
    crate.object3D.position.set(lateral, this.rng.range(1.6, 2.6), -AHEAD);
    crate.object3D.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
    crate.object3D.visible = true;
    crate.active = true;
    crate.hooked = false;
    crate.bob = this.rng.range(0, 10);
    this.nextId++;
  }

  private retire(crate: Crate): void {
    crate.active = false;
    crate.hooked = false;
    crate.object3D.visible = false;
  }
}

/**
 * A banded salvage crate.
 *
 * Procedural on purpose: it has to read at forty metres against sand, which
 * wants a bold silhouette and a hot accent far more than it wants detail.
 */
function buildCrate(materials: Materials): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
  };
  add(bevelledBox(1.5, 1.1, 1.1, 0.07), materials.rustedSteel);
  add(bevelledBox(1.56, 0.16, 1.16, 0.04), materials.hullDark, 0.34);
  // The accent is what makes it findable against a dune at range.
  add(bevelledBox(1.6, 0.1, 0.3, 0.02), materials.emissiveWarn, -0.1);
  return g;
}
