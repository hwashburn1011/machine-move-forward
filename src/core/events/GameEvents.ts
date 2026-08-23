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
  'player:damaged': { amount: number; remaining: number; source: string };
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
  'enemy:killed': { enemyId: string; position: Vec3Like };

  'world:chunk-recycled': { chunkIndex: number };

  'build:placed': { instanceId: string; definitionId: string; scrapSpent: number };
  'build:removed': { instanceId: string; definitionId: string; scrapRefunded: number };
  'build:rooms-changed': { roomCount: number; enclosedCount: number };
  'resources:changed': { scrap: number };

  'game:save-written': { slot: string };
  'game:save-loaded': { slot: string };
};

export type GameEventName = keyof GameEvents;
