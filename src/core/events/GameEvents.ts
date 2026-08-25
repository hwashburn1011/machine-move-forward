import type { ItemCost } from '@/data/items';
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
  'build:removed': { instanceId: string; definitionId: string; refunded: number };
  'build:rooms-changed': { roomCount: number; enclosedCount: number };
  'inventory:changed': { scrap: number };
  /** Loot that has just gone into the player's inventory. */
  'loot:collected': { items: { id: string; count: number }[]; source: string };
  'craft:completed': { recipeId: string };

  'game:save-written': { slot: string };
  'game:save-loaded': { slot: string };
};

export type GameEventName = keyof GameEvents;
