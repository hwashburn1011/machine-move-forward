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
