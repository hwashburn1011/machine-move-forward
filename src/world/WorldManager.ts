import * as THREE from 'three';
import { CHUNKS_AHEAD, CHUNKS_BEHIND, CHUNK_SIZE_Z, FIXED_DT } from '@/game/constants';
import type { QualitySettings } from '@/core/renderer/QualitySettings';
import type { EventBus } from '@/core/events/EventBus';
import type { Materials } from '@/art/Materials';
import { ChunkManager } from './ChunkManager';
import { TerrainChunk } from './TerrainChunk';
import { DesertScenery } from './DesertScenery';
import type { TextureSet } from '@/art/TextureLoader';
import type { PropModelGeometries } from './PropModels';
import { createPropGeometries, PropSpawner, type PropGeometries } from './PropSpawner';

/**
 * How far the world has scrolled PAST its last simulated step, for rendering.
 *
 * Signed by `WORLD_Z_PER_METRE` rather than by a minus written here, so it
 * cannot disagree with the direction everything else derives from. Pure, so
 * the arithmetic is testable without a scene.
 */
export function scrollOffset(alpha: number, speed: number): number {
  return WORLD_Z_PER_METRE * speed * alpha * FIXED_DT;
}

/**
 * How far the world moves in Z for every metre the machine travels.
 *
 * The whole world slides this way as the machine covers ground, and anything
 * that has to stay glued to the sand has to move with it: the footfall prints,
 * the drifting salvage, the blown sand, and above all the machine's own
 * planted feet, whose entire job is to not skate.
 *
 * Named and exported rather than written as a minus sign in each of them.
 * A foot that moves the wrong way does not look like a bug in a constant, it
 * looks like the machine is moonwalking, and it is the sort of thing that gets
 * "fixed" in one place and left wrong in three others.
 *
 * **+1, and that is the fix for walker spec section 12.** The hull's face has
 * always been at -Z — the prow, the plough, `DeckBearing`'s "bow", the heading
 * the player spawns looking down — while the world scrolled as though forward
 * were +Z. The machine drove stern-first and ploughed sand it had already
 * crossed. Treads hid it, because a belt is symmetrical and its cleats scroll
 * the same way whichever end leads; a stride is not symmetrical and neither is
 * a footprint, which is why the walker work is what surfaced it.
 *
 * The spec offered three answers and preferred turning the HULL round, on the
 * grounds that the world's direction was load-bearing for chunk recycling,
 * spawning and saves. That was true when it was written and is not true now:
 * the walker work funnelled every direction-dependent system through this one
 * constant precisely so a foot could not be wrong on its own. What was left
 * hard-coding a direction was `ChunkManager`'s arithmetic, which is now a
 * parameter it takes, and one dune-height lookup in `TrackMarks`. Turning the
 * hull round would have meant moving the prow, the plough, the deck-bearing
 * names and the spawn heading, and rotating the machine's group breaks the
 * gait outright — a planted foot is glued to the sand in MACHINE space, so
 * under a rotated group every foot travels backwards.
 *
 * So the world turned round instead. Two files, both tested in both
 * directions.
 */
export const WORLD_Z_PER_METRE = 1;

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
  private desert: DesertScenery | null = null;
  private propModels: PropModelGeometries | null = null;
  private readonly chunkManager: ChunkManager;
  private readonly terrain: TerrainChunk[] = [];
  private readonly props: PropSpawner[] = [];
  private geometry: THREE.BufferGeometry;
  private readonly propGeometries: PropGeometries;
  private quality: QualitySettings;
  private sand: TextureSet | null = null;
  private readonly sunDirection = new THREE.Vector3(0.78, 0.5, 0.37).normalize();
  private renderOffset = 0;

  private distance = 0;

  constructor(
    private readonly scene: THREE.Scene,
    quality: QualitySettings,
    private readonly bus: EventBus,
    materials: Materials,
    private readonly worldSeed: string,
  ) {
    this.quality = quality;
    this.chunkManager = new ChunkManager(
      CHUNKS_AHEAD,
      CHUNKS_BEHIND,
      CHUNK_SIZE_Z,
      WORLD_Z_PER_METRE,
    );
    this.geometry = TerrainChunk.createGeometry(quality);
    this.propGeometries = createPropGeometries();

    for (const slot of this.chunkManager.slots) {
      const chunk = new TerrainChunk(quality, this.geometry, this.worldSeed);
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
    this.renderOffset = 0;
    this.chunkManager.reset(distance);
    for (const slot of this.chunkManager.slots) {
      this.placeSlot(slot.slotId, slot.chunkIndex, slot.z);
    }
    this.desert?.setDistance(this.distance);
    this.desert?.syncSlots(
      this.chunkManager.slots,
      this.worldSeed,
      this.quality.propsPerChunk,
      true,
    );
  }

  private applyDistance(): void {
    this.renderOffset = 0;
    const recycled = this.chunkManager.advance(this.distance);
    this.desert?.setDistance(this.distance);
    if (recycled.length)
      this.desert?.syncSlots(this.chunkManager.slots, this.worldSeed, this.quality.propsPerChunk);

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
    this.renderOffset = offset;
    this.desert?.setDistance(this.distance, offset);
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
    this.sand = set;
    for (const chunk of this.terrain) chunk.applySand(set);
  }

  /**
   * Hand the props their wreck models, once the packs have loaded, and
   * repopulate so this chunk's wrecks appear rather than waiting for it to
   * recycle sixty-odd metres from now.
   */
  applyPropModels(models: PropModelGeometries): void {
    if (models === this.propModels) return;
    if (this.desert) {
      this.scene.remove(this.desert.group);
      this.desert.dispose();
      this.desert = null;
    }
    for (const slot of this.chunkManager.slots) {
      const prop = this.props[slot.slotId];
      if (!prop) continue;
      prop.attachModels(models);
      prop.populate(this.worldSeed, slot.chunkIndex);
    }
    this.propModels?.dispose();
    this.propModels = models;
    if (models.desert) {
      this.desert = new DesertScenery(models.desert, this.chunkManager.slots.length);
      this.desert.setDistance(this.distance, this.renderOffset);
      this.desert.syncSlots(this.chunkManager.slots, this.worldSeed, this.quality.propsPerChunk);
      this.scene.add(this.desert.group);
    }
  }

  /** Per-frame visual update — shader time, not simulation. */
  update(elapsed: number): void {
    for (const chunk of this.terrain) chunk.update(elapsed);
  }

  setSunDirection(dir: THREE.Vector3): void {
    this.sunDirection.copy(dir).normalize();
    for (const chunk of this.terrain) chunk.setSunDirection(dir);
  }

  /**
   * Rebuild quality dependent terrain geometry and prop instance buffers once
   * at a tier transition. Slot indices, world distance and seeded placement
   * remain untouched, so terrain collision and recycled scenery stay aligned.
   */
  applyQuality(quality: QualitySettings): void {
    const terrainChanged = quality.terrainSegments !== this.quality.terrainSegments;
    const propsChanged = quality.propsPerChunk !== this.quality.propsPerChunk;
    this.quality = quality;
    if (!terrainChanged && !propsChanged) return;

    if (terrainChanged) {
      const nextGeometry = TerrainChunk.createGeometry(quality);
      for (const slot of this.chunkManager.slots) {
        const old = this.terrain[slot.slotId];
        if (!old) continue;
        this.scene.remove(old.mesh);
        old.dispose();
        const next = new TerrainChunk(quality, nextGeometry, this.worldSeed);
        next.setZ(slot.z + this.renderOffset, slot.chunkIndex * CHUNK_SIZE_Z);
        next.setSunDirection(this.sunDirection);
        if (this.sand) next.applySand(this.sand);
        this.scene.add(next.mesh);
        this.terrain[slot.slotId] = next;
      }
      this.geometry.dispose();
      this.geometry = nextGeometry;
    }

    if (propsChanged) {
      this.desert?.syncSlots(this.chunkManager.slots, this.worldSeed, quality.propsPerChunk, true);
      for (const slot of this.chunkManager.slots) {
        this.props[slot.slotId]?.applyQuality(quality, this.worldSeed, slot.chunkIndex);
        this.props[slot.slotId]?.setZ(slot.z + this.renderOffset);
      }
    }
  }

  dispose(): void {
    if (this.desert) {
      this.scene.remove(this.desert.group);
      this.desert.dispose();
      this.desert = null;
    }
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
    this.propModels?.dispose();
    this.propModels = null;
    this.terrain.length = 0;
    this.props.length = 0;
  }
}
