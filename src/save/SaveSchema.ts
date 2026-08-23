import type { BuildPieceInstance } from '@/building/BuildSystem';
import type { ItemStack } from '@/data/items';

/**
 * Versioned save schema (handoff section 38).
 *
 * Fields for systems that do not exist yet are present and empty on purpose.
 * The handoff calls for schema versioning from the start, and retrofitting the
 * shape after the first save format ships is what makes save systems painful.
 */
export const CURRENT_SAVE_VERSION = 1;

/**
 * No migration was needed to add built structures, the player's inventory, or
 * crate contents: `machine.structures`, `player.inventory`, and each piece's
 * `state` were all reserved in v1 precisely so these milestones would not need
 * one. `magazineBonus` is optional for the same reason — a save written before
 * mods existed reads back as an unmodded weapon.
 */

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
    /** Serialised container slots, one entry per slot, null where empty. */
    inventory: (ItemStack | null)[];
    equipment: {
      currentWeapon: string;
      weapons: {
        id: string;
        ammoInMag: number;
        reserveAmmo: number;
        /** Absent in saves written before weapon mods existed. */
        magazineBonus?: number;
      }[];
    };
  };

  machine: {
    structures: BuildPieceInstance[];
    /** Empty until the machine-device milestone. */
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
