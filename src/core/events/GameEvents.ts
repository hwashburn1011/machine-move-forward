import type { ItemCost } from '@/data/items';
import type { PieceId } from '@/data/build-pieces';
import type { OpeningPhase } from '@/game/OpeningDirector';
import type { ThreatPhase } from '@/enemies/ThreatDirector';
import type { FirstRunStep } from '@/game/FirstRunDirector';
import type { BoardingPhase } from '@/vehicles/BoardingEncounter';
import type { UpgradeBranch, UpgradeId } from '@/data/upgrades';
import type { StoryPhase } from '@/story/StoryDirector';

export type UnlockId = 'manual-turret' | 'automatic-salvage-collector' | 'automatic-defense-turret';
export type ImpactSurface = 'flesh' | 'metal' | 'sand';

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

  'weapon:fired': {
    shotId?: number;
    weaponId: string;
    ammoRemaining: number;
    visualOrigin?: Vec3Like;
    aimEnd?: Vec3Like;
  };
  'weapon:dry-fire': { weaponId: string };
  'weapon:reload-started': { weaponId: string; durationMs: number };
  'weapon:reload-finished': { weaponId: string; ammoRemaining: number };
  'weapon:equipped': { weaponId: string };

  'combat:hit': {
    shotId?: number;
    position: Vec3Like;
    normal: Vec3Like;
    targetId: string | null;
    targetKind?: import('@/combat/Damageable').DamageableKind | null;
    surface?: ImpactSurface;
    damage?: number;
    onMetal: boolean;
  };
  'combat:shot-resolved': {
    shotId: number;
    weaponId: string;
    pelletsHit: number;
    totalDamage: number;
    targetIds: string[];
  };

  'enemy:spawned': { enemyId: string; defId?: string; position: Vec3Like };
  'enemy:fired': { enemyId: string; defId: string; visualOrigin: Vec3Like; aimEnd: Vec3Like };
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
  /** A player completed a hold-to-repair action at a subsystem or structure. */
  'repair:completed': { targetId: string; targetKind: 'subsystem' | 'structure' };
  /** Defense and boarding facts are intentionally small integration seams. */
  'defense:built': { defenseId: string };
  'boarding:started': { encounterId?: string; tutorial?: boolean };
  'boarding:survived': { encounterId?: string; tutorial?: boolean };
  'progression:unlocked': { id: UnlockId };
  'objective:changed': {
    view: {
      title: string;
      instruction: string;
      control?: string;
      progress?: string;
      optional: boolean;
    };
  };
  'turret:entered': { instanceId: string };
  'turret:exited': { instanceId: string };
  'turret:fired': { instanceId: string; targetId: string | null };
  'automatic-turret:target-acquired': { instanceId: string; targetId: string };
  'automatic-turret:fired': {
    instanceId: string;
    targetId: string;
    visualOrigin: Vec3Like;
    aimEnd: Vec3Like;
  };
  'vehicle:phase': { id: string; phase: BoardingPhase; side: 'port' | 'starboard' };
  'gunboat:phase': {
    phase: import('@/vehicles/GunboatEncounter').GunboatPhase;
    side: 'port' | 'starboard';
  };
  'gunboat:volley': { serial: number };
  'gunboat:telegraph': { origin: Vec3Like; target: Vec3Like };
  'vehicle:damaged': { id: string; part: 'hull' | 'crew' | 'hook'; health: number };
  'boarding:hook-attached': { side: 'port' | 'starboard' };
  'boarding:crossed': { enemyId: string; crewIndex?: number };
  'boarding:ended': {
    outcome: 'hull' | 'crew' | 'hook' | 'defended';
    tutorial: boolean;
    needsRepair?: boolean;
  };
  /**
   * The power picture moved. EDGES ONLY — `MachinePower` returns these when
   * capacity or draw actually changes, never once a tick. Fuel rides along so
   * a listener has the whole picture, but fuel alone never triggers one.
   */
  'power:changed': { capacity: number; draw: number; fuel: number };
  /** A whole priority class lost power. The breaker clunk plays off this. */
  'power:shed': { priority: string };
  'power:restored': { priority: string };

  /**
   * A survival meter moved by a whole point.
   *
   * WHOLE POINTS, not every tick: the meters drain by a fifteenth of a point a
   * second and the HUD writes DOM off this. Emitted on the integer edge for
   * the same reason `power:changed` is emitted on the capacity edge.
   */
  'needs:changed': { hydration: number; nourishment: number };

  /**
   * A condenser or a planter finished something.
   *
   * The unit is IN the device, not in the player's bag — claiming it is a
   * separate press of E. The event exists so the audio and a later HUD cue can
   * tell the player there is something to collect without polling every
   * producer on the deck every frame.
   */
  'producer:output': { instanceId: string; itemId: string; count: number };

  'inventory:changed': { scrap: number };
  /** Loot that has just gone into the player's inventory. */
  'loot:collected': { items: { id: string; count: number }[]; source: string };
  'craft:completed': {
    recipeId: string;
    /** Concrete output units let progression count production rather than clicks. */
    outputs: { id: string; count: number }[];
  };

  'radio:found': {
    source: 'salvage-crate';
    distance: number;
    elapsedSincePlayable: number;
  };
  'radio:power': { powered: boolean };
  'upgrade:researched': { id: UpgradeId };
  'upgrade:active-changed': { branch: UpgradeBranch; id: UpgradeId | null };
  'story:phase': { chapterId: 'wreck-one' | 'relay-foundry'; phase: StoryPhase };
  'story:signal': { strength: number; remainingM: number | null; text: string };
  'story:journal-read': { id: string };
  'story:unique-collected': { id: 'course-gyro' };
  'story:docked': { chapterId: 'wreck-one' | 'relay-foundry' };
  'story:departed': { chapterId: 'wreck-one' | 'relay-foundry' };
  'story:next-signal': { id: 'signal-two' };

  /**
   * The opening moved on. Emitted on the edge only, and once at boot so a
   * listener never has to guess where it started.
   *
   * Phase 9 attaches the premise to this reaching `done`; Phase 15 replaces
   * the placeholder chase behind the same phases.
   */
  'opening:phase': { phase: OpeningPhase };

  /** The first-run director advanced; active is derived by the HUD. */
  'objective:updated': {
    current: FirstRunStep | 'complete';
    completed: FirstRunStep[];
    newlyCompleted: FirstRunStep[];
  };

  'game:save-written': { slot: string };
  'game:save-loaded': { slot: string };
  'game:autosave-pending': Record<string, never>;
  'game:save-failed': { message: string };
};

export type GameEventName = keyof GameEvents;
