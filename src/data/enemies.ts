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
  },
};

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
