import { describe, it, expect } from 'vitest';
import { stepEnemyAI, type EnemyAIState } from '@/enemies/EnemyAI';
import { ENEMIES } from '@/data/enemies';

const def = ENEMIES.scavenger!;
const input = (over: Partial<Parameters<typeof stepEnemyAI>[2]> = {}) => ({
  distanceToPlayer: 100,
  health: def.maxHealth,
  timeSinceLastAttack: 999,
  blockedBy: null,
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

describe('what an enemy actually swings at', () => {
  const base = {
    distanceToPlayer: 1.5,
    health: 10,
    timeSinceLastAttack: 99,
    blockedBy: null as string | null,
  };

  it('hits the player when nothing is in the way', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger!, base);
    expect(d.shouldAttack).toBe(true);
    expect(d.attackTarget).toBe('player');
  });

  it('does NOT hit the player through a wall — the bug this fixes', () => {
    // Grid tiles are 2m and the scavenger reaches 2.2m, so an enemy in the
    // cell next to you is inside attack range with a wall between. Before
    // this, distance alone decided, and it damaged you through the wall.
    const d = stepEnemyAI('attack', ENEMIES.scavenger!, { ...base, blockedBy: 'bp-7' });
    expect(d.attackTarget).not.toBe('player');
  });

  it('hits the wall instead, so being sealed in is not permanent safety', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger!, { ...base, blockedBy: 'bp-7' });
    expect(d.shouldAttack).toBe(true);
    expect(d.attackTarget).toBe('blocker');
  });

  it('still respects the cooldown when chewing a wall', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger!, {
      ...base,
      blockedBy: 'bp-7',
      timeSinceLastAttack: 0,
    });
    expect(d.shouldAttack).toBe(false);
  });

  it('attacks a blocker even out of reach of the player, which is the sealed-room case', () => {
    // Sealed in, the player may be well beyond attackRange. The enemy is at
    // the wall, and the wall is what it can reach.
    const d = stepEnemyAI('navigate', ENEMIES.scavenger!, {
      ...base,
      distanceToPlayer: 6,
      blockedBy: 'bp-7',
    });
    expect(d.attackTarget).toBe('blocker');
    expect(d.shouldAttack).toBe(true);
  });

  it('does not wake up for a blocker it has not noticed', () => {
    const d = stepEnemyAI('idle', ENEMIES.scavenger!, {
      ...base,
      distanceToPlayer: ENEMIES.scavenger!.detectRange + 10,
      blockedBy: 'bp-7',
    });
    expect(d.state).toBe('idle');
    expect(d.shouldAttack).toBe(false);
  });
});

describe('what each type is here for', () => {
  it('sends the scavenger after the player and the raider after the engine', () => {
    expect(ENEMIES.scavenger!.targetPriority).toBe('player');
    expect(ENEMIES.raider!.targetPriority).toBe('engine');
  });
});
