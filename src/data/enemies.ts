import type { DropEntry } from '@/enemies/Loot';

/** Enemy definitions (handoff section 32). Data only. */
export interface EnemyDefinition {
  id: string;
  name: string;
  maxHealth: number;
  /** Metres per second. */
  moveSpeed: number;
  /** Damage per attack. */
  damage: number;
  /** Metres. */
  attackRange: number;
  /** Metres. Beyond this the enemy loses interest. */
  detectRange: number;
  /** Seconds between attacks. */
  attackCooldown: number;
  armor: number;
  /** What killing one is worth. Rolled once, on death. */
  drops: readonly DropEntry[];
  /**
   * Multiplied into every body colour, after the hostile tint.
   *
   * The two types share a rig and therefore a silhouette until a second model
   * lands, so colour is doing the work of telling them apart. That is a real
   * limitation and it is stated here rather than hidden: `EnemyVisual` takes a
   * model per definition already, so a distinct body is a file and a URL, not
   * a code change.
   */
  tint: { r: number; g: number; b: number };
  /**
   * How the threat director prices one in a wave.
   *
   * A raider is not half a scavenger just because it has half the health --
   * it is faster, and speed is what actually costs the player. Kept as data so
   * the balance argument happens here rather than inside `composeWave`.
   */
  threat: number;
  /**
   * What this type is trying to reach.
   *
   * The raider used to be distinguished from the scavenger by speed alone —
   * the fast one you cannot back away from. Sending it for the engine gives it
   * a job, makes the player choose under fire between the one hitting them and
   * the one crossing the deck, and is what makes engine-as-stop ever fire:
   * with both types walking at the player, nothing damages the engine and the
   * failure state is dead code.
   */
  targetPriority: 'player' | 'engine';
  /** Authored mech combat uses a committed aim point and a visible windup. */
  ranged?: { windup: number; shots: number; shotInterval: number };
  /** Wider body, with the same 1.92m collision height for deck doorways. */
  capsuleRadius?: number;
  surface?: 'metal';
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  scavenger: {
    id: 'scavenger',
    name: 'Wasteland Scavenger',
    maxHealth: 110,
    moveSpeed: 3.1,
    damage: 9,
    attackRange: 2.2,
    detectRange: 40,
    attackCooldown: 1.1,
    armor: 2,
    // Enough that a fight pays for a piece of deck, and components rarely
    // enough that they still feel worth crossing the deck for.
    drops: [
      { id: 'scrap', min: 9, max: 18 },
      { id: 'components', min: 1, max: 1, chance: 0.3 },
    ],
    // Left as it comes out of `hostileTint`: rusted, scorched, unsaturated.
    tint: { r: 1, g: 1, b: 1 },
    threat: 2,
    // An opportunist. It wants what you are carrying.
    targetPriority: 'player',
  },

  raider: {
    id: 'raider',
    name: 'Dust Raider',
    /**
     * The opposite problem to a scavenger, deliberately.
     *
     * A scavenger is slow and tough: you can walk backwards from one and shoot
     * it down, and a player who has learnt that has learnt to solve every
     * fight the same way. A raider is 60% faster than the player WALKS and
     * only a shade under a sprint, so backing away does not work -- it closes,
     * and the answer has to be a wall, a doorway, or hitting it first.
     *
     * Half the health and no armour, so that answer is available. It is a
     * pacing change, not a difficulty one.
     */
    maxHealth: 55,
    moveSpeed: 5.4,
    damage: 6,
    attackRange: 2.0,
    detectRange: 46,
    attackCooldown: 0.75,
    armor: 0,
    // Poorer than a scavenger, and that is the trade: they arrive in numbers.
    drops: [
      { id: 'scrap', min: 4, max: 9 },
      { id: 'components', min: 1, max: 1, chance: 0.15 },
    ],
    // Pushed toward dried blood, away from the scavenger's rust, so a mixed
    // wave is readable at the distance the deck actually is.
    tint: { r: 1.35, g: 0.72, b: 0.66 },
    threat: 3,
    // It is here to stop the machine, not to rob you.
    targetPriority: 'engine',
  },

  warden: {
    id: 'warden',
    name: 'Warden Rifleman',
    maxHealth: 85,
    moveSpeed: 2.9,
    damage: 8,
    attackRange: 13,
    detectRange: 42,
    attackCooldown: 2.7,
    armor: 1,
    threat: 3,
    targetPriority: 'player',
    surface: 'metal',
    tint: { r: 1, g: 1, b: 1 },
    ranged: { windup: 0.85, shots: 1, shotInterval: 0.12 },
    drops: [
      { id: 'scrap', min: 10, max: 18 },
      { id: 'components', min: 1, max: 2, chance: 0.35 },
    ],
  },
  revenant: {
    id: 'revenant',
    name: 'Revenant Blademaster',
    maxHealth: 75,
    moveSpeed: 5.8,
    damage: 10,
    attackRange: 2.1,
    detectRange: 44,
    attackCooldown: 1.05,
    armor: 0,
    threat: 3,
    targetPriority: 'player',
    surface: 'metal',
    tint: { r: 1, g: 1, b: 1 },
    drops: [
      { id: 'scrap', min: 9, max: 16 },
      { id: 'components', min: 1, max: 1, chance: 0.3 },
    ],
  },
  bastion: {
    id: 'bastion',
    name: 'Bastion Heavy Gunner',
    maxHealth: 180,
    moveSpeed: 2.0,
    damage: 4,
    attackRange: 11,
    detectRange: 40,
    attackCooldown: 3.6,
    armor: 3,
    threat: 5,
    targetPriority: 'player',
    capsuleRadius: 0.56,
    surface: 'metal',
    tint: { r: 1, g: 1, b: 1 },
    ranged: { windup: 1.15, shots: 3, shotInterval: 0.14 },
    drops: [
      { id: 'scrap', min: 20, max: 30 },
      { id: 'components', min: 2, max: 3 },
    ],
  },
  sovereign: {
    id: 'sovereign',
    name: 'Sovereign Drone Commander',
    maxHealth: 140,
    moveSpeed: 2.4,
    damage: 13,
    attackRange: 15,
    detectRange: 46,
    attackCooldown: 3.8,
    armor: 2,
    threat: 5,
    targetPriority: 'player',
    surface: 'metal',
    tint: { r: 1, g: 1, b: 1 },
    ranged: { windup: 1.2, shots: 1, shotInterval: 0.12 },
    drops: [
      { id: 'scrap', min: 18, max: 28 },
      { id: 'components', min: 2, max: 3 },
    ],
  },
};

export const MECH_ENEMY_IDS = ['warden', 'revenant', 'bastion', 'sovereign'] as const;

/**
 * Metres of travel between arrivals.
 *
 * Distance rather than time on purpose: it is already the clock the world,
 * the save file, and the debug skip all derive from, so pacing off it needs
 * no state of its own — and standing still stays genuinely safe.
 */
export const SPAWN_INTERVAL_M = 250;

/**
 * Scavengers counted as "aboard" at once. This is `EnemyManager.activeCount`,
 * which stays true for a corpse until its ~2.5s death timer expires — a kill
 * causes a short spawn lull rather than an immediate free slot, and that is
 * intentional, not a bug. The pool holds 8, so this never starves it.
 */
export const MAX_ACTIVE_ENEMIES = 4;
