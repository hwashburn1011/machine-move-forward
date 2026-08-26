import { describe, expect, it } from 'vitest';
import { isDamageable } from '@/combat/Damageable';

const target = (kind: string) => ({ kind, id: 'x', armor: 0, takeDamage: () => {} });

describe('what a shot can hurt', () => {
  it('accepts all three damage targets', () => {
    for (const kind of ['enemy', 'structure', 'subsystem']) {
      expect(isDamageable(target(kind))).toBe(true);
    }
  });

  it('rejects a collider carrying something else', () => {
    // Colliders carry arbitrary userData. A guard that only checked for the
    // presence of takeDamage would let a future payload through.
    expect(isDamageable(target('scenery'))).toBe(false);
    expect(isDamageable({ id: 'x', armor: 0, takeDamage: () => {} })).toBe(false);
    expect(isDamageable(null)).toBe(false);
    expect(isDamageable(undefined)).toBe(false);
    expect(isDamageable('enemy')).toBe(false);
  });
});
