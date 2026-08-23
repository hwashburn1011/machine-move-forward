/**
 * Versioned save schema (handoff section 38).
 *
 * Fields for systems that do not exist yet are present and empty on purpose.
 * The handoff calls for schema versioning from the start, and retrofitting the
 * shape after the first save format ships is what makes save systems painful.
 */
export const CURRENT_SAVE_VERSION = 1;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SaveGameV1 {
  version: 1;
  savedAt: number;
  seed: string;
  distanceTraveled: number;

  player: {
    position: Vec3;
    health: number;
    /** Empty until the inventory milestone. */
    inventory: unknown[];
    equipment: {
      currentWeapon: string;
      weapons: { id: string; ammoInMag: number; reserveAmmo: number }[];
    };
  };

  machine: {
    /** Empty until the building milestone. */
    structures: unknown[];
    devices: unknown[];
    fuel: number;
    coreHealth: number;
    navigationTier: number;
  };

  progression: {
    unlocks: string[];
  };

  world: {
    chunkIndex: number;
    /** Null until the threat director milestone. */
    threatDirector: null;
  };
}

export type AnySaveGame = SaveGameV1;
