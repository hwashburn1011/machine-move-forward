export interface ChunkSlot {
  /** Stable identity of the reusable slot. Never changes. */
  readonly slotId: number;
  /** Which chunk of the infinite world this slot currently represents. */
  chunkIndex: number;
  /** Current world Z, derived from chunkIndex and distance travelled. */
  z: number;
}

/**
 * Ring buffer of terrain slots (handoff section 6).
 *
 * Pure logic — deliberately no Three.js import, so the recycling arithmetic
 * that the whole world-scroll architecture rests on can be tested exhaustively
 * in node.
 *
 * The machine never moves. Chunks flow past it and, once behind, jump to the
 * far end of the ring. A slot's position is always DERIVED from its chunk
 * index and the total distance travelled, never accumulated incrementally —
 * that is what keeps the state identical whether distance arrives in one lump
 * or ten thousand frames, and what lets `reset` restore a save exactly.
 */
export class ChunkManager {
  private readonly _slots: ChunkSlot[] = [];
  private readonly slotCount: number;
  private distance = 0;

  constructor(
    chunksAhead: number,
    private readonly chunksBehind: number,
    private readonly chunkSizeZ: number,
  ) {
    this.slotCount = chunksAhead + chunksBehind + 1;
    for (let i = 0; i < this.slotCount; i++) {
      this._slots.push({ slotId: i, chunkIndex: i - chunksBehind, z: 0 });
    }
    this.reset(0);
  }

  get slots(): readonly ChunkSlot[] {
    return this._slots;
  }

  get distanceTraveled(): number {
    return this.distance;
  }

  /**
   * Set total distance travelled and return the slots that had to be recycled.
   * Callers repopulate exactly those.
   */
  advance(distanceTraveled: number): ChunkSlot[] {
    this.distance = distanceTraveled;
    const recycled: ChunkSlot[] = [];

    // Behind the machine by more than the trailing margin means it can never
    // be seen again, so it is free to jump to the front of the ring.
    const cutoff = -(this.chunksBehind + 1) * this.chunkSizeZ;

    for (const slot of this._slots) {
      slot.z = slot.chunkIndex * this.chunkSizeZ - this.distance;

      // A loop, not an if: a single long frame can carry a slot several chunk
      // lengths past the cutoff.
      while (slot.z < cutoff) {
        slot.chunkIndex += this.slotCount;
        slot.z = slot.chunkIndex * this.chunkSizeZ - this.distance;
        if (!recycled.includes(slot)) recycled.push(slot);
      }
    }

    return recycled;
  }

  /**
   * Jump straight to a distance, deriving indices arithmetically rather than
   * replaying advances. This is what makes save/load reproduce the world
   * exactly rather than approximately.
   */
  reset(distanceTraveled: number): void {
    this.distance = distanceTraveled;

    // A slot starts at (slotId - chunksBehind) and only ever gains whole
    // multiples of slotCount, so restoring means finding how many times it
    // would have recycled.
    //
    // Counting recycles rather than picking the smallest valid index matters:
    // several index sets satisfy the cutoff at once (at distance 0 both
    // {-3..5} and {-2..6} are stable), and only the recycle count picks out
    // the one the initial condition actually evolves into. The clamp at zero
    // is what encodes "slots never move backwards".
    const threshold = distanceTraveled / this.chunkSizeZ - (this.chunksBehind + 1);

    for (const slot of this._slots) {
      const start = slot.slotId - this.chunksBehind;
      // Epsilon guards the case where threshold lands exactly on a boundary
      // and floating point drifts it a hair above.
      const recycles = Math.max(0, Math.ceil((threshold - start) / this.slotCount - 1e-9));
      slot.chunkIndex = start + recycles * this.slotCount;
      slot.z = slot.chunkIndex * this.chunkSizeZ - this.distance;
    }
  }
}
