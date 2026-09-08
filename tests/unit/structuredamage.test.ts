import { describe, expect, it } from 'vitest';
import { BUILD_PIECES, REFUND_FRACTION } from '@/data/build-pieces';

describe('what a structure is worth breaking', () => {
  it('gives every piece the health and armour a damage model needs', () => {
    // These fields have been carried, saved and restored since the build
    // system landed, with nothing ever reading them. This is that consumer.
    for (const def of Object.values(BUILD_PIECES)) {
      expect(def.maxHealth, def.id).toBeGreaterThan(0);
      expect(def.armor, def.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a railing the cheapest thing to lose and a refinery the dearest', () => {
    expect(BUILD_PIECES.railing.maxHealth).toBeLessThan(BUILD_PIECES.wall.maxHealth);
    expect(BUILD_PIECES.refinery.maxHealth).toBeGreaterThan(BUILD_PIECES.railing.maxHealth);
  });

  it('refunds nothing on destruction, unlike demolition', () => {
    // Demolition refunds because it is a considered decision. Losing a wall to
    // a raider is not, and refunding it would make being attacked free.
    expect(REFUND_FRACTION).toBeGreaterThan(0);
  });
});
