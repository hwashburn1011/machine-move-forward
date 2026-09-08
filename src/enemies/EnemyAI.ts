import type { EnemyDefinition } from '@/data/enemies';

/**
 * MVP enemy states (handoff section 32).
 *
 * Deliberately the reduced set the handoff calls for — navigate, attack,
 * pursue — plus idle and dead. Cover, searching, and stealing arrive with the
 * boarding milestone, where they have something to do.
 */
export type EnemyAIState = 'idle' | 'navigate' | 'attack' | 'pursue' | 'dead';

export interface AIInput {
  distanceToPlayer: number;
  health: number;
  timeSinceLastAttack: number;
  /**
   * The instance id of the structure between this enemy and the player, or
   * null when the way is clear.
   *
   * The caller computes it, because the caller is the one holding the grid.
   * Its absence was a real bug rather than a missing feature: attacks were
   * decided on straight-line distance alone, and with 2m cells against a 2.2m
   * reach, an enemy one cell away damaged the player THROUGH a wall.
   */
  blockedBy: string | null;
}

export interface AIDecision {
  state: EnemyAIState;
  /** True on the tick the enemy should deal damage. */
  shouldAttack: boolean;
  /** What that damage lands on. Null when not attacking. */
  attackTarget: 'player' | 'blocker' | null;
}

/**
 * Pure state transition. Kept free of physics and Three.js so the behaviour
 * can be tested exhaustively without a scene.
 */
export function stepEnemyAI(
  current: EnemyAIState,
  def: EnemyDefinition,
  input: AIInput,
): AIDecision {
  const idle = (state: EnemyAIState): AIDecision => ({
    state,
    shouldAttack: false,
    attackTarget: null,
  });

  if (input.health <= 0) return idle('dead');
  // Death is terminal — nothing brings an enemy back out of it.
  if (current === 'dead') return idle('dead');

  const { distanceToPlayer: dist, blockedBy } = input;

  if (dist > def.detectRange) return idle('idle');

  const ready = input.timeSinceLastAttack >= def.attackCooldown;

  // Blocked beats range. An enemy standing at a wall it cannot get past
  // attacks the wall, whether or not the player on the other side happens to
  // be within arm's reach through it — which, at 2m cells, they usually are.
  if (blockedBy !== null) {
    return { state: 'attack', shouldAttack: ready, attackTarget: ready ? 'blocker' : null };
  }

  if (dist <= def.attackRange) {
    return { state: 'attack', shouldAttack: ready, attackTarget: ready ? 'player' : null };
  }

  // Inside detection but outside attack range. Once engaged the enemy pursues;
  // from idle it starts by navigating in.
  const engaged = current === 'attack' || current === 'pursue';
  return idle(engaged ? 'pursue' : 'navigate');
}
