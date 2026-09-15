/** Width of one reusable horizontal scenery band in permanent world metres. */
export const WORLD_COURSE_BAND_WIDTH = 256;

export interface WorldCourseBandSlot {
  /** Stable reusable slot identity. */
  readonly slotId: number;
  /** Permanent horizontal band represented by this slot. */
  bandIndex: number;
  /** Where the band's origin is drawn relative to the machine. */
  renderX: number;
}

/** Sanitize persisted/integration input before it reaches scene transforms. */
export function validLateralMetres(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Permanent terrain coordinate beneath a machine-relative rendered point. */
export function worldXAt(renderX: number, lateralMetres: number): number {
  return renderX + validLateralMetres(lateralMetres);
}

/** Machine-relative position for a permanent world coordinate. */
export function renderXAt(worldX: number, lateralMetres: number): number {
  return worldX - validLateralMetres(lateralMetres);
}

/** The horizontal band containing the saved lateral course coordinate. */
export function courseBandIndex(lateralMetres: number, width = WORLD_COURSE_BAND_WIDTH): number {
  if (!(Number.isFinite(width) && width > 0)) return 0;
  return Math.floor(validLateralMetres(lateralMetres) / width);
}

/** Permanent seed namespace for one X band. Band zero preserves the old seed. */
export function courseBandSeed(worldSeed: string, bandIndex: number): string {
  const index = Number.isSafeInteger(bandIndex) ? bandIndex : 0;
  return index === 0 ? worldSeed : `${worldSeed}:x-band:${index}`;
}

/**
 * Three reusable horizontal scenery bands around the machine's course.
 *
 * This owns arithmetic only. WorldManager decides which instanced groups use
 * the slots and repopulates only entries returned by `advance`. Slot positions
 * are always derived from permanent band identity, never accumulated.
 */
export class WorldCourseBands {
  private readonly slotsValue: WorldCourseBandSlot[] = [
    { slotId: 0, bandIndex: -1, renderX: 0 },
    { slotId: 1, bandIndex: 0, renderX: 0 },
    { slotId: 2, bandIndex: 1, renderX: 0 },
  ];
  private lateralMetres = 0;

  constructor(private width = WORLD_COURSE_BAND_WIDTH) {
    if (!(Number.isFinite(width) && width > 0)) this.width = WORLD_COURSE_BAND_WIDTH;
    this.reset(0);
  }

  get slots(): readonly WorldCourseBandSlot[] {
    return this.slotsValue;
  }

  get lateral(): number {
    return this.lateralMetres;
  }

  reset(lateralMetres: number): void {
    this.lateralMetres = validLateralMetres(lateralMetres);
    const centre = courseBandIndex(this.lateralMetres, this.width);
    for (let slotId = 0; slotId < this.slotsValue.length; slotId++) {
      const slot = this.slotsValue[slotId]!;
      slot.bandIndex = centre + slotId - 1;
      slot.renderX = renderXAt(slot.bandIndex * this.width, this.lateralMetres);
    }
  }

  /**
   * Move to an exact lateral offset and return only slots whose permanent band
   * changed. Ordinary motion inside a band performs no repopulation.
   */
  advance(lateralMetres: number): readonly WorldCourseBandSlot[] {
    this.lateralMetres = validLateralMetres(lateralMetres);
    const centre = courseBandIndex(this.lateralMetres, this.width);
    const wanted = [centre - 1, centre, centre + 1];
    const wantedSet = new Set(wanted);
    const retained = new Set<number>();
    for (const slot of this.slotsValue) {
      if (wantedSet.has(slot.bandIndex)) retained.add(slot.bandIndex);
    }

    const missing = wanted.filter((index) => !retained.has(index));
    const recycled: WorldCourseBandSlot[] = [];
    for (const slot of this.slotsValue) {
      if (wantedSet.has(slot.bandIndex)) continue;
      const next = missing.shift();
      if (next === undefined) break;
      slot.bandIndex = next;
      recycled.push(slot);
    }

    for (const slot of this.slotsValue)
      slot.renderX = renderXAt(slot.bandIndex * this.width, this.lateralMetres);
    return recycled;
  }
}
