import type { OpeningSave } from '@/game/OpeningDirector';
import type { FirstRunSave } from '@/game/FirstRunDirector';
import type { ThreatDirectorSave } from '@/enemies/ThreatDirector';
import type { BuildPieceInstance } from '@/building/BuildSystem';
import type { ItemStack } from '@/data/items';
import type { NeedsSave } from '@/player/Needs';
import type { TurretRuntimeSave } from '@/defense/DefenseSystem';
import type { AutomaticDefenseSave } from '@/defense/AutomaticDefenseSystem';
import type { UpgradeSave } from '@/progression/UpgradeSystem';
import type { EarlyRadioDropSave } from '@/progression/EarlyRadioDrop';
import type { StorySave } from '@/story/StoryDirector';
export type {
  CampaignSave,
  ActiveExpeditionSave,
  LegacyWreckOneStorySave,
} from '@/story/StoryDirector';

/**
 * Versioned save schema (handoff section 38).
 *
 * Fields for systems that do not exist yet are present and empty on purpose.
 * The handoff calls for schema versioning from the start, and retrofitting the
 * shape after the first save format ships is what makes save systems painful.
 */
export const CURRENT_SAVE_VERSION = 1;

/** Optional v1 radio ledger. Kept additive so old saves remain valid. */
export type RadioSave = EarlyRadioDropSave;

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
    /**
     * Water and food. Absent in every save written before Phase 4, and absent
     * means FULL — a player who put the game down before the survival layer
     * existed must not come back to an empty bottle. No version bump and no
     * migration, for the reason `subsystems` and `opening` give above: the old
     * shape is still a legal value of the new type and its absence has exactly
     * one sensible reading.
     */
    needs?: NeedsSave;
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
    /** Determines whether saved positions use the taller three-deck hull. */
    layout?: string;
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
    /** Partial progress toward the guaranteed first manual-turret unlock. */
    turretBlueprintProgress?: number;
    /** Per-gun aim, optional for saves written before manual defenses existed. */
    turrets?: TurretRuntimeSave[];
    automaticTurrets?: AutomaticDefenseSave[];
    /** Optional first-run facts; absent means a fresh director. */
    firstRun?: FirstRunSave;
    /** Permanent machine research and the currently installed branch modules. */
    upgrades?: UpgradeSave;
    /** Guaranteed salvage reward ledger. `radioDrop` is retained for old builds. */
    radio?: RadioSave;
    radioDrop?: RadioSave;
    /**
     * Where the opening got to. Absent in saves written before Phase 2, and
     * a loader reads that as `done` — a game old enough to have a save is a
     * game that has already been played, and replaying its opening on load
     * would be the worst possible reading of a missing field. No version bump
     * and no migration for the same reason `magazineBonus` needed none.
     */
    opening?: OpeningSave;
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
    /** Optional expedition chapter state. */
    story?: StorySave;
    radioRaids?: import('@/story/RadioRaids').RadioRaidSave;
  };
}

export type AnySaveGame = SaveGameV1;
