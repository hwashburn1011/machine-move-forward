import * as THREE from 'three';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import { hashSeed, Rng } from '@/core/math/Random';
import { bevelledBox } from '@/machine/MachineGeometry';
import { rollDrops, type DropEntry } from '@/enemies/Loot';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';
import type { ReelCandidate } from './Reel';
import type { ItemId, ItemStack } from '@/data/items';
import { salvageModel } from '@/art/SalvageModels';

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
const EARLY_INTERVAL_M = 180;

/** How far ahead of the machine a crate first appears. */
const AHEAD = 42;

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
  { id: 'fuel', min: 3, max: 4, chance: 0.75 },
];

interface Crate {
  readonly id: string;
  readonly object3D: THREE.Group;
  active: boolean;
  /** Set while the reel is dragging it in. */
  claimedBy: SalvageClaimOwner | null;
  manifest: ItemStack[] | null;
  opened: boolean;
  bob: number;
}

export type SalvageClaimOwner = 'manual' | `collector:${string}`;
export interface SalvageTransferResult {
  opened: boolean;
  remaining: readonly ItemStack[];
}

export class SalvageField {
  private readonly crates: Crate[] = [];
  private readonly seed: number;
  private rng: Rng;
  private nextAt = INTERVAL_M;
  private nextId = 0;
  private earlyArmed = false;
  private earlySpawned = false;
  private cadenceInterval = INTERVAL_M;

  constructor(
    scene: THREE.Scene,
    private readonly bus: EventBus,
    materials: Materials,
    seed: string,
  ) {
    this.seed = hashSeed(seed, 'salvage');
    this.rng = new Rng(this.seed);
    for (let i = 0; i < POOL; i++) {
      const crate = {
        id: `crate-${i}`,
        object3D: buildCrate(materials),
        active: false,
        claimedBy: null,
        manifest: null,
        opened: false,
        bob: 0,
      };
      crate.object3D.visible = false;
      scene.add(crate.object3D);
      this.crates.push(crate);
    }
  }

  /**
   * Drop all runtime crates and restart distance pacing for a fresh session.
   * The RNG is reseeded so New Game and a load produce the same first target
   * for a given world seed instead of inheriting the prior run's pool state.
   */
  reset(distance = 0): void {
    for (const crate of this.crates) this.retire(crate);
    const at = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    // A continued run keeps the post-opening cadence even if its radio was
    // already found and therefore does not re-arm the guaranteed early chest.
    this.nextAt = at + EARLY_INTERVAL_M;
    this.nextId = 0;
    this.earlyArmed = false;
    this.earlySpawned = false;
    this.cadenceInterval = EARLY_INTERVAL_M;
    this.rng = new Rng(this.seed);
  }

  /** Crates the reel is allowed to consider, in world space. */
  get targets(): ReelCandidate[] {
    return this.crates
      .filter((c) => c.active && c.claimedBy === null)
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

  /**
   * Arm the first post-opening target. Calling this is idempotent and does not
   * consume a chest, so an ignored or retired target leaves the story reward
   * eligible for the next successful chest.
   */
  armAfterOpening(distance: number): void {
    if (this.earlySpawned) return;
    const at = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    this.earlyArmed = true;
    this.nextAt = Math.min(this.nextAt, at);
  }

  /** Mark a crate as being dragged in, so nothing else targets it. */
  hook(id: string): boolean {
    return this.claim(id, 'manual');
  }

  claim(id: string, owner: SalvageClaimOwner): boolean {
    const crate = this.crates.find((c) => c.id === id && c.active);
    if (!crate || (crate.claimedBy !== null && crate.claimedBy !== owner)) return false;
    crate.claimedBy = owner;
    return true;
  }

  release(id: string, owner: SalvageClaimOwner): boolean {
    const crate = this.crates.find((c) => c.id === id && c.active && c.claimedBy === owner);
    if (!crate) return false;
    crate.claimedBy = null;
    return true;
  }

  pullClaimed(
    dt: number,
    id: string,
    owner: SalvageClaimOwner,
    toward: { x: number; y: number; z: number },
  ): boolean {
    const crate = this.crates.find((c) => c.id === id && c.active && c.claimedBy === owner);
    if (!crate) return false;
    const p = crate.object3D.position;
    const dx = toward.x - p.x,
      dy = toward.y - p.y,
      dz = toward.z - p.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1.1) return true;
    const step = Math.min(distance, Math.max(14, distance * 1.9) * Math.max(0, dt));
    p.x += (dx / distance) * step;
    p.y += (dy / distance) * step;
    p.z += (dz / distance) * step;
    crate.object3D.rotation.x += Math.max(0, dt) * 5;
    return step >= distance - 1e-6;
  }

  /**
   * Open a hooked crate: pay out, announce, and recycle it.
   *
   * Rolled here rather than at spawn so a crate that is never reeled in costs
   * nothing, and the same seed still gives the same run.
   */
  open(
    id: string,
    deposit: (item: ItemId, count: number) => number | void,
    onOpened?: () => readonly { id: string; count: number }[] | void,
  ): boolean {
    const result = this.transferContents(id, (item, count) => {
      const leftover = deposit(item, count);
      return typeof leftover === 'number' ? leftover : 0;
    });
    if (!result.opened) return false;
    // The callback is invoked only after a real crate was opened. This keeps
    // deterministic story rewards outside spawn timing and RNG.
    if (result.remaining.length === 0) {
      const bonus = onOpened?.() ?? [];
      for (const item of bonus) deposit(item.id as ItemId, item.count);
      if (bonus.length > 0)
        this.bus.emit('loot:collected', { items: [...bonus], source: 'Salvage crate bonus' });
    }
    return result.remaining.length === 0;
  }

  transferContents(
    id: string,
    deposit: (id: ItemId, count: number) => number,
  ): SalvageTransferResult {
    const crate = this.crates.find((c) => c.id === id && c.active);
    if (!crate) return { opened: false, remaining: [] };
    if (!crate.manifest)
      crate.manifest = rollDrops(CONTENTS, this.rng).map((d) => ({ itemId: d.id, count: d.count }));
    crate.opened = true;
    const accepted: ItemStack[] = [];
    const remaining: ItemStack[] = [];
    for (const stack of crate.manifest) {
      const leftover = Math.max(
        0,
        Math.min(stack.count, Math.floor(deposit(stack.itemId, stack.count))),
      );
      const got = stack.count - leftover;
      if (got > 0) accepted.push({ itemId: stack.itemId, count: got });
      if (leftover > 0) remaining.push({ itemId: stack.itemId, count: leftover });
    }
    crate.manifest = remaining;
    if (accepted.length > 0)
      this.bus.emit('loot:collected', {
        items: accepted.map((s) => ({ id: s.itemId, count: s.count })),
        source: 'Salvage crate',
      });
    if (remaining.length === 0) this.retire(crate);
    return { opened: true, remaining };
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
      if (!crate.active || crate.claimedBy === null) continue;

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
  update(dt: number, distance: number, machineSpeed: number, enabled = true): void {
    if (!enabled) return;
    if (distance >= this.nextAt) {
      this.nextAt = distance + (this.earlyArmed ? EARLY_INTERVAL_M : this.cadenceInterval);
      this.spawn();
      if (this.earlyArmed) {
        this.earlyArmed = false;
        this.earlySpawned = true;
        this.cadenceInterval = EARLY_INTERVAL_M;
      }
    }

    for (const crate of this.crates) {
      if (!crate.active) continue;
      // Toward -Z, the way the world goes. This was positive, which drifted
      // every crate AGAINST the desert it is supposedly adrift in: they spawn
      // ahead at +42 and retire behind at -26, so moving them toward +Z sent
      // them the wrong way down their own corridor.
      if (crate.claimedBy === null) {
        crate.object3D.position.z += WORLD_Z_PER_METRE * machineSpeed * DRIFT * dt;
      }

      // A slow list and bob, so they read as adrift rather than as props
      // glued to the terrain.
      crate.bob += dt;
      crate.object3D.rotation.z = Math.sin(crate.bob * 0.7) * 0.06;
      crate.object3D.rotation.y += dt * 0.15;

      if (crate.object3D.position.z * WORLD_Z_PER_METRE > -BEHIND) this.retire(crate);
    }
  }

  private spawn(): void {
    const crate = this.crates.find((c) => !c.active);
    if (!crate) return;

    const side = this.rng.next() < 0.5 ? -1 : 1;
    const lateral = this.rng.range(SIDE_MIN, SIDE_MAX) * side;
    // Spawned where the world comes FROM, so a crate arrives with the desert
    // rather than swimming up it. The whole field used to run the other way:
    // crates entered at the bow and left over the stern while every dune,
    // wreck and footprint travelled the opposite way past them, which read
    // exactly as the loot floating backwards that it was.
    crate.object3D.position.set(lateral, this.rng.range(1.6, 2.6), -WORLD_Z_PER_METRE * AHEAD);
    crate.object3D.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
    crate.object3D.visible = true;
    crate.active = true;
    crate.claimedBy = null;
    crate.manifest = null;
    crate.opened = false;
    crate.bob = this.rng.range(0, 10);
    this.nextId++;
  }

  private retire(crate: Crate): void {
    crate.active = false;
    crate.claimedBy = null;
    crate.manifest = null;
    crate.opened = false;
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
  const authored = salvageModel('salvage-chest');
  if (authored) return authored;
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
