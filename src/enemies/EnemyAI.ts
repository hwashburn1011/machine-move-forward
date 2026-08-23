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
}

export interface AIDecision {
  state: EnemyAIState;
  /** True on the tick the enemy should deal damage. */
  shouldAttack: boolean;
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
  if (input.health <= 0) return { state: 'dead', shouldAttack: false };
  // Death is terminal — nothing brings an enemy back out of it.
  if (current === 'dead') return { state: 'dead', shouldAttack: false };

  const { distanceToPlayer: dist } = input;

  if (dist > def.detectRange) return { state: 'idle', shouldAttack: false };

  if (dist <= def.attackRange) {
    const ready = input.timeSinceLastAttack >= def.attackCooldown;
    return { state: 'attack', shouldAttack: ready };
  }

  // Inside detection but outside attack range. Once engaged the enemy pursues;
  // from idle it starts by navigating in.
  const engaged = current === 'attack' || current === 'pursue';
  return { state: engaged ? 'pursue' : 'navigate', shouldAttack: false };
}
