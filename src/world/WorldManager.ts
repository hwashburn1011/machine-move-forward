import * as THREE from 'three';
import { CHUNKS_AHEAD, CHUNKS_BEHIND, CHUNK_SIZE_Z, FIXED_DT } from '@/game/constants';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import { ChunkManager } from './ChunkManager';
import { TerrainChunk } from './TerrainChunk';
import type { TextureSet } from '@/art/TextureLoader';
import type { PropModelGeometries } from './PropModels';
import { createPropGeometries, PropSpawner, type PropGeometries } from './PropSpawner';

/**
 * How far the world has scrolled PAST its last simulated step, for rendering.
 *
 * `slot.z` is `chunkIndex * chunkSize - distance`, so the world travels toward
 * -Z and the sub-step offset is negative. Pure so the arithmetic is testable
 * without a scene.
 */
export function scrollOffset(alpha: number, speed: number): number {
  return WORLD_Z_PER_METRE * speed * alpha * FIXED_DT;
}

/**
 * How far the world moves in Z for every metre the machine travels.
 *
 * `ChunkManager` places a chunk at `chunkIndex * chunkSize - distance`, so the
 * whole world slides toward -Z as the machine covers ground, and anything that
 * has to stay glued to the sand has to move with it: the footfall prints, and
 * above all the machine's own planted feet, whose entire job is to not skate.
 *
 * Named and exported rather than written as a minus sign in each of them.
 * A foot that moves the wrong way does not look like a bug in a constant, it
 * looks like the machine is moonwalking, and it is the sort of thing that gets
 * "fixed" in one place and left wrong in three others.
 */
export const WORLD_Z_PER_METRE = -1;

/**
 * How far the world has scrolled by the time a frame is DRAWN.
 *
 * The simulation advances `distance` once per fixed step; the render slides the
 * world on past it by `scrollOffset`. Anything that has to stay glued to the
 * sand — most of all the machine's feet, which are only convincing while they
 * do not skate — has to be placed against this number rather than against the
 * simulation's, or it slides by up to a full step of travel, 0.125m at speed.
 */
export function renderedDistance(distance: number, alpha: number, speed: number): number {
  return distance - scrollOffset(alpha, speed);
}

/**
 * Owns the scrolling world (handoff section 6).
 *
 * The machine stays at the origin; this moves everything else. Distance
 * travelled is tracked as a plain accumulating number and is the only thing
 * that needs saving — the world regenerates from it deterministically.
 */
export class WorldManager {
  private readonly chunkManager: ChunkManager;
  private readonly terrain: TerrainChunk[] = [];
  private readonly props: PropSpawner[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly propGeometries: PropGeometries;

  private distance = 0;

  constructor(
    private readonly scene: THREE.Scene,
    quality: QualitySettings,
    private readonly bus: EventBus,
    materials: Materials,
    private readonly worldSeed: string,
  ) {
    this.chunkManager = new ChunkManager(CHUNKS_AHEAD, CHUNKS_BEHIND, CHUNK_SIZE_Z);
    this.geometry = TerrainChunk.createGeometry(quality);
    this.propGeometries = createPropGeometries();

    for (const slot of this.chunkManager.slots) {
      const chunk = new TerrainChunk(quality, this.geometry);
      const prop = new PropSpawner(quality, this.propGeometries, materials);

      chunk.setZ(slot.z, slot.chunkIndex * CHUNK_SIZE_Z);
      prop.setZ(slot.z);
      prop.populate(this.worldSeed, slot.chunkIndex);

      scene.add(chunk.mesh);
      scene.add(prop.group);
      this.terrain.push(chunk);
      this.props.push(prop);
    }
  }

  get distanceTraveled(): number {
    return this.distance;
  }

  get activeChunkCount(): number {
    return this.terrain.length;
  }

  /** Advance the world past the machine at `speed` metres per second. */
  fixedUpdate(dt: number, speed: number): void {
    this.distance += speed * dt;
    this.applyDistance();
  }

  /** Jump to an exact distance — used by save/load. */
  reset(distance: number): void {
    this.distance = distance;
    this.chunkManager.reset(distance);
    for (const slot of this.chunkManager.slots) {
      this.placeSlot(slot.slotId, slot.chunkIndex, slot.z);
    }
  }

  private applyDistance(): void {
    const recycled = this.chunkManager.advance(this.distance);

    // Every slot needs its Z applied each step; only recycled ones need their
    // contents regenerated.
    for (const slot of this.chunkManager.slots) {
      this.terrain[slot.slotId]?.setZ(slot.z, slot.chunkIndex * CHUNK_SIZE_Z);
      this.props[slot.slotId]?.setZ(slot.z);
    }

    for (const slot of recycled) {
      this.props[slot.slotId]?.populate(this.worldSeed, slot.chunkIndex);
      this.bus.emit('world:chunk-recycled', { chunkIndex: slot.chunkIndex });
    }
  }

  private placeSlot(slotId: number, chunkIndex: number, z: number): void {
    this.terrain[slotId]?.setZ(z, chunkIndex * CHUNK_SIZE_Z);
    this.props[slotId]?.setZ(z);
    this.props[slotId]?.populate(this.worldSeed, chunkIndex);
  }

  /**
   * Slide the world by the fraction of a step the renderer is ahead of the
   * simulation.
   *
   * Without this the ground moves in 60Hz jumps while the player and enemies
   * are interpolated smoothly, so on any display not exactly in phase with the
   * fixed step the world stutters — and worse, entities visibly slide against
   * the ground, by up to a full step of travel (0.125m at 7.5 m/s). The
   * simulation is untouched: `distance` and chunk recycling still advance only
   * on the fixed step, and this is a purely visual offset applied on top.
   */
  applyRenderOffset(alpha: number, speed: number): void {
    const offset = scrollOffset(alpha, speed);
    for (const slot of this.chunkManager.slots) {
      // Only where it is DRAWN moves by the sub-step offset. The ground it
      // represents is the same ground it was a moment ago, so its world origin
      // is untouched — nudging that too would slide the dune field itself and
      // undo the whole point of keeping the two apart.
      this.terrain[slot.slotId]?.setZ(slot.z + offset, slot.chunkIndex * CHUNK_SIZE_Z);
      this.props[slot.slotId]?.setZ(slot.z + offset);
    }
  }

  /**
   * Hand the dunes their sand scan, once it has loaded.
   *
   * Every chunk, because each owns its own material — they share geometry, not
   * surface.
   */
  applySand(set: TextureSet): void {
    for (const chunk of this.terrain) chunk.applySand(set);
  }

  /**
   * Hand the props their wreck models, once the packs have loaded, and
   * repopulate so this chunk's wrecks appear rather than waiting for it to
   * recycle sixty-odd metres from now.
   */
  applyPropModels(models: PropModelGeometries): void {
    for (const slot of this.chunkManager.slots) {
      const prop = this.props[slot.slotId];
      if (!prop) continue;
      prop.attachModels(models);
      prop.populate(this.worldSeed, slot.chunkIndex);
    }
  }

  /** Per-frame visual update — shader time, not simulation. */
  update(elapsed: number): void {
    for (const chunk of this.terrain) chunk.update(elapsed);
  }

  setSunDirection(dir: THREE.Vector3): void {
    for (const chunk of this.terrain) chunk.setSunDirection(dir);
  }

  dispose(): void {
    for (const chunk of this.terrain) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    for (const prop of this.props) {
      this.scene.remove(prop.group);
      prop.dispose();
    }
    this.geometry.dispose();
    this.propGeometries.dispose();
    this.terrain.length = 0;
    this.props.length = 0;
  }
}
