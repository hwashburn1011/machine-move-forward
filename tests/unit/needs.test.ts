import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Needs } from '@/player/Needs';
import { PlayerStats } from '@/player/PlayerStats';
import { EventBus } from '@/core/events/EventBus';
import {
  DRAIN_EMPTY_MINUTES,
  EMPTY_HEAL_SCALE,
  EMPTY_STAMINA_SCALE,
  HYDRATION_DRAIN_PER_S,
  NEEDS_MAX,
  NOURISHMENT_DRAIN_PER_S,
  RESTORE_PER_USE,
} from '@/data/needs';

/** One fixed step, the same one the game runs at. */
const DT = 1 / 60;

function run(needs: Needs, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) needs.fixedUpdate(DT);
}

describe('the needs meters', () => {
  it('starts both meters full', () => {
    const needs = new Needs();
    expect(needs.hydration).toBe(NEEDS_MAX);
    expect(needs.nourishment).toBe(NEEDS_MAX);
  });

  it('drains at the rates in data/needs.ts, not at a number written here', () => {
    const needs = new Needs();
    run(needs, 60);
    expect(needs.hydration).toBeCloseTo(NEEDS_MAX - HYDRATION_DRAIN_PER_S * 60, 4);
    expect(needs.nourishment).toBeCloseTo(NEEDS_MAX - NOURISHMENT_DRAIN_PER_S * 60, 4);
  });

  it('empties a full meter in about the advertised minutes of play', () => {
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 - 1);
    expect(needs.hydration).toBeGreaterThan(0);
    expect(needs.nourishment).toBeGreaterThan(0);

    run(needs, 2);
    expect(needs.hydration).toBe(0);
    expect(needs.nourishment).toBe(0);
  });

  it('clamps at zero however long it is left', () => {
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 * 4);
    expect(needs.hydration).toBe(0);
    expect(needs.nourishment).toBe(0);
  });

  it('ignores a negative or zero step rather than refilling', () => {
    const needs = new Needs();
    needs.fixedUpdate(-5);
    expect(needs.hydration).toBe(NEEDS_MAX);
  });
});

describe('the gates', () => {
  it('is completely neutral while both meters are above zero', () => {
    const needs = new Needs();
    run(needs, 60);
    expect(needs.canSprint).toBe(true);
    expect(needs.staminaRecoveryScale).toBe(1);
    expect(needs.healScale).toBe(1);
  });

  it('flips only at exactly zero, not on the way down', () => {
    const needs = new Needs();
    // One step short of empty: still sprinting, still healing at full rate.
    run(needs, DRAIN_EMPTY_MINUTES * 60 - 1);
    expect(needs.hydration).toBeGreaterThan(0);
    expect(needs.canSprint).toBe(true);
    expect(needs.healScale).toBe(1);

    run(needs, 2);
    expect(needs.canSprint).toBe(false);
    expect(needs.staminaRecoveryScale).toBe(EMPTY_STAMINA_SCALE);
    expect(needs.healScale).toBe(EMPTY_HEAL_SCALE);
  });

  it('lifts the moment something is consumed', () => {
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 * 2);
    expect(needs.canSprint).toBe(false);

    needs.drink();
    expect(needs.hydration).toBe(RESTORE_PER_USE);
    expect(needs.canSprint).toBe(true);
    // Eating is a separate meter and must not have moved with the drink.
    expect(needs.healScale).toBe(EMPTY_HEAL_SCALE);

    needs.eat();
    expect(needs.nourishment).toBe(RESTORE_PER_USE);
    expect(needs.healScale).toBe(1);
    expect(needs.staminaRecoveryScale).toBe(1);
  });

  it('clamps a drink and a meal at the maximum', () => {
    const needs = new Needs();
    needs.drink();
    needs.eat();
    expect(needs.hydration).toBe(NEEDS_MAX);
    expect(needs.nourishment).toBe(NEEDS_MAX);
  });
});

describe('needs are forgiving, always', () => {
  it('never touches health, however long both meters sit at zero', () => {
    // The roadmap's Act I promise, and the one thing here that is not a tuning
    // knob: running dry slows you, it does not hurt you.
    const stats = new PlayerStats(new EventBus());
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 * 3);

    expect(needs.hydration).toBe(0);
    expect(needs.nourishment).toBe(0);
    expect(stats.health).toBe(stats.maxHealth);
    expect(stats.alive).toBe(true);
  });

  it('has no API that could hurt anyone', () => {
    const surface = Object.getOwnPropertyNames(Needs.prototype).sort();
    expect(surface).toEqual([
      'canSprint',
      'constructor',
      'drink',
      'eat',
      'fixedUpdate',
      'healScale',
      'hydration',
      'nourishment',
      'reset',
      'restore',
      'staminaRecoveryScale',
      'toSave',
    ]);
  });

  it('does not know PlayerStats exists', () => {
    // Asserted against the source rather than the shape: the promise is that
    // this model cannot reach health at all, and an import is how it would.
    const source = readFileSync(
      fileURLToPath(new URL('../../src/player/Needs.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/PlayerStats/);
    expect(source).not.toMatch(/\bdamage\b/);
  });
});

describe('needs across a save', () => {
  it('round-trips both meters', () => {
    const needs = new Needs();
    run(needs, 300);
    const saved = needs.toSave();

    const loaded = new Needs();
    loaded.restore(saved);
    expect(loaded.hydration).toBe(needs.hydration);
    expect(loaded.nourishment).toBe(needs.nourishment);
  });

  it('reads an absent save as full meters, so old saves are not punished', () => {
    const needs = new Needs();
    run(needs, 600);
    needs.restore(undefined);
    expect(needs.hydration).toBe(NEEDS_MAX);
    expect(needs.nourishment).toBe(NEEDS_MAX);
  });

  it('clamps a corrupt save into range', () => {
    const needs = new Needs();
    needs.restore({ hydration: 9999, nourishment: -40 });
    expect(needs.hydration).toBe(NEEDS_MAX);
    expect(needs.nourishment).toBe(0);
  });

  it('reset refills, the way a new life does', () => {
    const needs = new Needs();
    run(needs, 600);
    needs.reset();
    expect(needs.hydration).toBe(NEEDS_MAX);
    expect(needs.nourishment).toBe(NEEDS_MAX);
  });
});

describe('the needs numbers', () => {
  it('empties in a quarter of an hour or more — a pressure, not a chore', () => {
    expect(DRAIN_EMPTY_MINUTES).toBeGreaterThanOrEqual(15);
    expect(DRAIN_EMPTY_MINUTES).toBeLessThanOrEqual(45);
  });

  it('makes one drink or one meal worth more than half a meter', () => {
    expect(RESTORE_PER_USE).toBeGreaterThan(NEEDS_MAX / 2);
    expect(RESTORE_PER_USE).toBeLessThan(NEEDS_MAX);
  });

  it('slows the empty player rather than stopping them', () => {
    expect(EMPTY_STAMINA_SCALE).toBeGreaterThan(0);
    expect(EMPTY_STAMINA_SCALE).toBeLessThan(1);
    expect(EMPTY_HEAL_SCALE).toBeGreaterThan(0);
    expect(EMPTY_HEAL_SCALE).toBeLessThan(1);
  });
});

describe('the gates as the player feels them', () => {
  it('halves a repair kit while nourishment is empty, and never refuses one', () => {
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 * 2);
    const stats = new PlayerStats(new EventBus(), needs);

    stats.damage(60, 'harness');
    expect(stats.useRepairKit()).toBe(true);
    expect(stats.health).toBe(40 + 40 * EMPTY_HEAL_SCALE);
  });

  it('halves stamina recovery while nourishment is empty', () => {
    const needs = new Needs();
    run(needs, DRAIN_EMPTY_MINUTES * 60 * 2);
    const stats = new PlayerStats(new EventBus(), needs);

    stats.drainStamina(100);
    stats.recoverStamina(40);
    expect(stats.stamina).toBe(40 * EMPTY_STAMINA_SCALE);
  });

  it('leaves a fed player alone: a kit heals its full forty', () => {
    const stats = new PlayerStats(new EventBus(), new Needs());
    stats.damage(60, 'harness');
    stats.useRepairKit();
    expect(stats.health).toBe(80);
  });
});
