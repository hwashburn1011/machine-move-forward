import type { ThreatDirectorSave } from '@/enemies/ThreatDirector';
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
    /**
     * Absent in saves written before machine damage, and absent means
     * undamaged. No version bump and no migration for the reason
     * `threatDirector` gives below: the old shape is still a legal value of
     * the new type, and there is exactly one sensible reading of its absence.
     */
    subsystems?: { id: string; health: number }[];
  };

  progression: {
    unlocks: string[];
  };

  world: {
    chunkIndex: number;
    /**
     * Null in saves written before the threat director, and in a fresh game
     * that has not reached its first phase change. Both mean the same thing to
     * a loader — start a director from the seed — so this needed no version
     * bump and no migration: the old shape is still a legal value of the new
     * type.
     */
    threatDirector: ThreatDirectorSave | null;
  };
}

export type AnySaveGame = SaveGameV1;
