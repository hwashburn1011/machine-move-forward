import { describe, it, expect } from 'vitest';
import { stepEnemyAI, type EnemyAIState } from '@/enemies/EnemyAI';
import { ENEMIES } from '@/data/enemies';

const def = ENEMIES.scavenger!;
const input = (over: Partial<Parameters<typeof stepEnemyAI>[2]> = {}) => ({
  distanceToPlayer: 100,
  health: def.maxHealth,
  timeSinceLastAttack: 999,
  ...over,
});

describe('stepEnemyAI', () => {
  it('idles when the player is beyond detection range', () => {
    expect(stepEnemyAI('idle', def, input({ distanceToPlayer: 60 })).state).toBe('idle');
  });

  it('navigates when the player enters detection range', () => {
    expect(stepEnemyAI('idle', def, input({ distanceToPlayer: 20 })).state).toBe('navigate');
  });

  it('attacks within attack range', () => {
    expect(stepEnemyAI('navigate', def, input({ distanceToPlayer: 1.5 })).state).toBe('attack');
  });

  it('pursues when the player leaves attack range but stays detected', () => {
    expect(stepEnemyAI('attack', def, input({ distanceToPlayer: 12 })).state).toBe('pursue');
  });

  it('keeps pursuing rather than dropping back to navigate', () => {
    expect(stepEnemyAI('pursue', def, input({ distanceToPlayer: 12 })).state).toBe('pursue');
  });

  it('gives up when the player escapes detection range', () => {
    expect(stepEnemyAI('pursue', def, input({ distanceToPlayer: 80 })).state).toBe('idle');
  });

  it('dies at zero health from any state', () => {
    const states: EnemyAIState[] = ['idle', 'navigate', 'attack', 'pursue'];
    for (const s of states) {
      expect(stepEnemyAI(s, def, input({ health: 0 })).state).toBe('dead');
    }
  });

  it('never leaves the dead state', () => {
    const d = stepEnemyAI('dead', def, input({ distanceToPlayer: 1, health: def.maxHealth }));
    expect(d.state).toBe('dead');
    expect(d.shouldAttack).toBe(false);
  });

  it('attacks only once the cooldown has elapsed', () => {
    const ready = stepEnemyAI('attack', def, input({ distanceToPlayer: 1, timeSinceLastAttack: 5 }));
    expect(ready.shouldAttack).toBe(true);

    const notReady = stepEnemyAI(
      'attack',
      def,
      input({ distanceToPlayer: 1, timeSinceLastAttack: 0.2 }),
    );
    expect(notReady.state).toBe('attack');
    expect(notReady.shouldAttack).toBe(false);
  });

  it('attacks exactly at the cooldown boundary', () => {
    const d = stepEnemyAI(
      'attack',
      def,
      input({ distanceToPlayer: 1, timeSinceLastAttack: def.attackCooldown }),
    );
    expect(d.shouldAttack).toBe(true);
  });

  it('never attacks outside attack range', () => {
    for (const dist of [2.3, 5, 20, 39]) {
      expect(stepEnemyAI('pursue', def, input({ distanceToPlayer: dist })).shouldAttack).toBe(false);
    }
  });

  it('is deterministic', () => {
    const a = stepEnemyAI('navigate', def, input({ distanceToPlayer: 7 }));
    const b = stepEnemyAI('navigate', def, input({ distanceToPlayer: 7 }));
    expect(a).toEqual(b);
  });
});
