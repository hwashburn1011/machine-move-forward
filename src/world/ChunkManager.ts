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

  /**
   * @param zPerMetre which way the world moves for every metre travelled: -1
   *   if it slides toward -Z (the machine advancing toward +Z), +1 if it
   *   slides toward +Z.
   *
   * A parameter rather than an import, so this file keeps the property its
   * header claims -- pure logic, no dependencies, exhaustively testable -- and
   * so the tests can drive BOTH directions rather than whichever one the
   * constant happens to hold. `WorldManager` passes `WORLD_Z_PER_METRE`, which
   * is the single place the answer lives.
   */
  constructor(
    chunksAhead: number,
    private readonly chunksBehind: number,
    private readonly chunkSizeZ: number,
    private readonly zPerMetre: -1 | 1 = -1,
  ) {
    this.slotCount = chunksAhead + chunksBehind + 1;
    for (let i = 0; i < this.slotCount; i++) {
      this._slots.push({ slotId: i, chunkIndex: this.startIndex(i), z: 0 });
    }
    this.reset(0);
  }

  /**
   * A slot's render Z. The one expression the direction actually lives in.
   *
   * A chunk sits at a fixed world Z of `chunkIndex * chunkSizeZ`. The machine
   * holds station at the render origin having travelled `distance` along its
   * heading, and the world is drawn relative to it -- so the chunk is drawn
   * `zPerMetre * distance` from where it sits.
   */
  private zFor(chunkIndex: number): number {
    return chunkIndex * this.chunkSizeZ + this.zPerMetre * this.distance;
  }

  /**
   * How far a slot has gone the way the world is going, in chunk lengths.
   *
   * Positive is astern. Multiplying by `zPerMetre` is what makes "behind"
   * mean the same thing whichever way the machine faces, and it is why the
   * recycle test below reads the same in both.
   */
  private astern(z: number): number {
    return (z * this.zPerMetre) / this.chunkSizeZ;
  }

  /**
   * The chunk a slot starts life representing.
   *
   * Slot 0 is the furthest astern, whichever way astern is -- so which INDEX
   * that corresponds to depends on the direction. This was `slotId -
   * chunksBehind`, which silently assumed lower index meant further back, and
   * that assumption is only true when the world scrolls toward -Z.
   */
  private startIndex(slotId: number): number {
    return -this.zPerMetre * (slotId - this.chunksBehind);
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
    const cutoff = this.chunksBehind + 1;
    // Recycling moves a slot AHEAD, which is the opposite way to the world.
    const step = -this.zPerMetre * this.slotCount;

    for (const slot of this._slots) {
      slot.z = this.zFor(slot.chunkIndex);

      // A loop, not an if: a single long frame can carry a slot several chunk
      // lengths past the cutoff.
      while (this.astern(slot.z) > cutoff) {
        slot.chunkIndex += step;
        slot.z = this.zFor(slot.chunkIndex);
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
    // The signed index a slot must fall below to be out of play, in the same
    // "positive is astern" frame `astern` uses -- so this is the recycle test
    // above, solved for the index instead of iterated toward.
    const threshold = this.chunksBehind + 1 - distanceTraveled / this.chunkSizeZ;
    const step = -this.zPerMetre * this.slotCount;

    for (const slot of this._slots) {
      const start = this.startIndex(slot.slotId);
      // Epsilon guards the case where threshold lands exactly on a boundary
      // and floating point drifts it a hair above.
      const recycles = Math.max(
        0,
        Math.ceil((start * this.zPerMetre - threshold) / this.slotCount - 1e-9),
      );
      slot.chunkIndex = start + recycles * step;
      slot.z = this.zFor(slot.chunkIndex);
    }
  }
}
