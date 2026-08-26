import type { ItemCost } from '@/data/items';
import type { PieceId } from '@/data/build-pieces';
import type { OpeningPhase } from '@/game/OpeningDirector';
import type { ThreatPhase } from '@/enemies/ThreatDirector';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Event name -> payload type.
 *
 * This map is the single source of truth for the bus: adding an entry here is
 * what makes `bus.on('name', ...)` type-check. Later milestones extend it with
 * building, boarding, loot, and threat-director events.
 */
export type GameEvents = {
  /** `from` is the attacker's position, for the directional indicator. */
  'player:damaged': {
    amount: number;
    remaining: number;
    source: string;
    from: Vec3Like;
  };
  'player:died': { position: Vec3Like };
  'player:respawned': { position: Vec3Like };

  'weapon:fired': { weaponId: string; ammoRemaining: number };
  'weapon:dry-fire': { weaponId: string };
  'weapon:reload-started': { weaponId: string; durationMs: number };
  'weapon:reload-finished': { weaponId: string; ammoRemaining: number };
  'weapon:equipped': { weaponId: string };

  'combat:hit': { position: Vec3Like; normal: Vec3Like; targetId: string | null; onMetal: boolean };

  'enemy:spawned': { enemyId: string; position: Vec3Like };
  'enemy:damaged': { enemyId: string; amount: number; remaining: number };
  /** `defId` indexes ENEMIES, so a listener can look up what it was worth. */
  'enemy:killed': { enemyId: string; defId: string; position: Vec3Like };

  'world:chunk-recycled': { chunkIndex: number };

  /**
   * The encounter pacing moved on. Emitted on the edge only — the HUD's alert
   * is a timed banner, and re-triggering it every frame would pin it up
   * forever.
   */
  'threat:phase': { phase: ThreatPhase; wavesSurvived: number };

  'build:placed': { instanceId: string; definitionId: string; cost: ItemCost };
  /**
   * A machine subsystem took a hit, rate-limited to a cue rather than a tick.
   *
   * The engine is the one thing that can be attacked while the player is
   * nowhere near it, so it needs to reach them through their ears.
   */
  'machine:damaged': { subsystemId: string; fraction: number; stopped: boolean };
  /** A piece took a hit. `health` is what is left; zero means it came down. */
  'build:damaged': {
    instanceId: string;
    definitionId: PieceId;
    health: number;
    maxHealth: number;
  };
  'build:removed': { instanceId: string; definitionId: string; refunded: number };
  'build:rooms-changed': { roomCount: number; enclosedCount: number };
  'inventory:changed': { scrap: number };
  /** Loot that has just gone into the player's inventory. */
  'loot:collected': { items: { id: string; count: number }[]; source: string };
  'craft:completed': { recipeId: string };

  /**
   * The opening moved on. Emitted on the edge only, and once at boot so a
   * listener never has to guess where it started.
   *
   * Phase 9 attaches the premise to this reaching `done`; Phase 15 replaces
   * the placeholder chase behind the same phases.
   */
  'opening:phase': { phase: OpeningPhase };

  'game:save-written': { slot: string };
  'game:save-loaded': { slot: string };
};

export type GameEventName = keyof GameEvents;
