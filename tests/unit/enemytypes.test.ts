import { describe, expect, it } from 'vitest';
import { ENEMIES, MAX_ACTIVE_ENEMIES } from '@/data/enemies';
import { PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from '@/game/constants';
import { subsystemTargetFor, hitboxContains } from '@/enemies/EnemyTargeting';
import { SUBSYSTEMS } from '@/data/subsystems';

/**
 * The enemy roster, as a set of claims about how each one plays.
 *
 * A second enemy type is only worth having if it cannot be beaten the way the
 * first one is. These assert that difference in the numbers rather than
 * trusting a comment — a raider quietly retuned down to a scavenger's speed
 * would still pass every behavioural test in the project and would have stopped
 * being a second enemy.
 */

describe('the enemy roster', () => {
  it('gives every definition everything the game reads off it', () => {
    for (const [id, def] of Object.entries(ENEMIES)) {
      expect(def.id, id).toBe(id);
      expect(def.maxHealth, id).toBeGreaterThan(0);
      expect(def.moveSpeed, id).toBeGreaterThan(0);
      expect(def.attackRange, id).toBeGreaterThan(0);
      expect(def.detectRange, id).toBeGreaterThan(def.attackRange);
      expect(def.attackCooldown, id).toBeGreaterThan(0);
      expect(def.drops.length, id).toBeGreaterThan(0);
      expect(def.threat, id).toBeGreaterThan(0);
      // A tint of zero would render a body pure black, not "dark".
      expect(def.tint.r, id).toBeGreaterThan(0);
      expect(def.tint.g, id).toBeGreaterThan(0);
      expect(def.tint.b, id).toBeGreaterThan(0);
    }
  });

  it('has a scavenger a walking player can back away from', () => {
    // This is the lesson the first waves teach, and it has to be true for the
    // raider below to be a surprise rather than an unfairness.
    expect(ENEMIES.scavenger?.moveSpeed).toBeLessThan(PLAYER_WALK_SPEED);
  });

  it('has a raider they cannot', () => {
    const raider = ENEMIES.raider;
    expect(raider).toBeDefined();
    // Faster than a walk, so retreating does not work...
    expect(raider?.moveSpeed).toBeGreaterThan(PLAYER_WALK_SPEED);
    // ...but slower than a sprint, so it is escapable at a real cost, and a
    // player who runs still ends up somewhere rather than being caught anyway.
    expect(raider?.moveSpeed).toBeLessThan(PLAYER_SPRINT_SPEED);
  });

  it('pays for that speed in health and armour', () => {
    const scav = ENEMIES.scavenger;
    const raider = ENEMIES.raider;
    expect(raider?.maxHealth).toBeLessThan((scav?.maxHealth ?? 0) * 0.75);
    expect(raider?.armor).toBeLessThan(scav?.armor ?? 1);
    // And is worth less, which is the trade for arriving in numbers.
    expect(raider?.threat).toBeGreaterThan(scav?.threat ?? 0);
  });

  it('tells the two apart by colour, since they share a silhouette', () => {
    // Honest about the limitation: one rig, so colour is doing the work. The
    // scavenger keeps the palette `hostileTint` gives it; the raider must
    // actually differ, or a mixed wave is unreadable.
    const scav = ENEMIES.scavenger?.tint;
    const raider = ENEMIES.raider?.tint;
    const distance = Math.hypot(
      (scav?.r ?? 0) - (raider?.r ?? 0),
      (scav?.g ?? 0) - (raider?.g ?? 0),
      (scav?.b ?? 0) - (raider?.b ?? 0),
    );
    expect(distance).toBeGreaterThan(0.25);
  });

  it('keeps the roster inside what the deck can hold', () => {
    expect(Object.keys(ENEMIES).length).toBeLessThanOrEqual(MAX_ACTIVE_ENEMIES * 2);
  });
});

describe('who goes for the engine', () => {
  it('sends a raider to the engine and a scavenger to nothing', () => {
    expect(subsystemTargetFor(ENEMIES.raider!)).toBe('engine');
    expect(subsystemTargetFor(ENEMIES.scavenger!)).toBeNull();
  });

  it('knows when a body is standing in the engine', () => {
    const c = SUBSYSTEMS.engine.hitbox.center;
    expect(hitboxContains('engine', c)).toBe(true);
    expect(hitboxContains('engine', { x: c.x, y: c.y, z: c.z + 99 })).toBe(false);
  });

  it("is generous by a body's width, so an enemy beside the engine can reach it", () => {
    // The hitbox is the engine's own box. An enemy that has walked up to it
    // stands OUTSIDE that box by definition, so a strict containment test
    // would mean the engine could never be hit at all.
    const c = SUBSYSTEMS.engine.hitbox.center;
    const justOutside = { x: c.x, y: c.y, z: c.z - SUBSYSTEMS.engine.hitbox.half.z - 0.9 };
    expect(hitboxContains('engine', justOutside)).toBe(true);
  });
});
