import { describe, it, expect, vi } from 'vitest';
import { PlayerStats } from '@/player/PlayerStats';
import { EventBus } from '@/core/events/EventBus';

const make = () => {
  const bus = new EventBus();
  return { bus, stats: new PlayerStats(bus) };
};

describe('PlayerStats', () => {
  it('starts at full health and alive', () => {
    const { stats } = make();
    expect(stats.health).toBe(stats.maxHealth);
    expect(stats.alive).toBe(true);
  });

  it('reduces health on damage', () => {
    const { stats } = make();
    stats.damage(30, 'enemy');
    expect(stats.health).toBe(70);
  });

  it('clamps health at zero', () => {
    const { stats } = make();
    stats.damage(500, 'enemy');
    expect(stats.health).toBe(0);
    expect(stats.alive).toBe(false);
  });

  it('emits player:damaged with the remaining health', () => {
    const { bus, stats } = make();
    const fn = vi.fn();
    bus.on('player:damaged', fn);
    stats.damage(25, 'skiff');
    expect(fn).toHaveBeenCalledWith({
      amount: 25,
      remaining: 75,
      source: 'skiff',
      from: { x: 0, y: 0, z: 0 },
    });
  });

  it('reports where the damage came from, so the HUD can point at it', () => {
    // Without this the player is told that they are hurt and nothing about
    // which way to turn -- and scavengers attack from behind.
    const { bus, stats } = make();
    const fn = vi.fn();
    bus.on('player:damaged', fn);
    stats.damage(9, 'Wasteland Scavenger', { x: 2, y: 3.4, z: -5 });
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ from: { x: 2, y: 3.4, z: -5 } }),
    );
  });

  it('emits player:died exactly once even under repeated damage', () => {
    const { bus, stats } = make();
    const fn = vi.fn();
    bus.on('player:died', fn);
    stats.damage(200, 'enemy');
    stats.damage(200, 'enemy');
    stats.damage(200, 'enemy');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores damage once dead', () => {
    const { bus, stats } = make();
    stats.damage(200, 'enemy');
    const fn = vi.fn();
    bus.on('player:damaged', fn);
    stats.damage(10, 'enemy');
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores damage when invulnerable', () => {
    const { stats } = make();
    stats.invulnerable = true;
    stats.damage(50, 'enemy');
    expect(stats.health).toBe(stats.maxHealth);
  });

  it('heal clamps at max', () => {
    const { stats } = make();
    stats.damage(10, 'enemy');
    stats.heal(500);
    expect(stats.health).toBe(stats.maxHealth);
  });

  it('does not heal the dead', () => {
    const { stats } = make();
    stats.damage(200, 'enemy');
    stats.heal(50);
    expect(stats.health).toBe(0);
  });

  it('reset restores health and allows death to fire again', () => {
    const { bus, stats } = make();
    const fn = vi.fn();
    bus.on('player:died', fn);
    stats.damage(200, 'enemy');
    stats.reset();
    expect(stats.health).toBe(stats.maxHealth);
    stats.damage(200, 'enemy');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clamps stamina to 0..max', () => {
    const { stats } = make();
    stats.drainStamina(500);
    expect(stats.stamina).toBe(0);
    stats.recoverStamina(500);
    expect(stats.stamina).toBe(stats.maxStamina);
  });
});

describe('respawn grace', () => {
  it('absorbs damage while it lasts', () => {
    const { stats } = make();
    stats.grantGrace(2);
    stats.damage(50, 'scavenger');
    expect(stats.health).toBe(stats.maxHealth);
  });

  it('emits nothing while absorbing', () => {
    const { bus, stats } = make();
    const fn = vi.fn();
    bus.on('player:damaged', fn);
    stats.grantGrace(2);
    stats.damage(50, 'scavenger');
    expect(fn).not.toHaveBeenCalled();
  });

  it('expires once its time is ticked away', () => {
    const { stats } = make();
    stats.grantGrace(2);
    stats.tick(1.0);
    stats.damage(10, 'scavenger');
    expect(stats.health).toBe(stats.maxHealth);

    stats.tick(1.1);
    stats.damage(10, 'scavenger');
    expect(stats.health).toBe(90);
  });

  it('never goes negative however long it is ticked', () => {
    const { stats } = make();
    stats.grantGrace(1);
    stats.tick(60);
    expect(stats.graceRemaining).toBe(0);
  });

  it('does not disturb god mode', () => {
    // Two separate mechanisms: grace expiring must not switch off invulnerable.
    const { stats } = make();
    stats.invulnerable = true;
    stats.grantGrace(1);
    stats.tick(5);
    stats.damage(50, 'scavenger');
    expect(stats.health).toBe(stats.maxHealth);
    expect(stats.invulnerable).toBe(true);
  });

  it('is cleared by reset, so a fresh life does not inherit it', () => {
    const { stats } = make();
    stats.grantGrace(5);
    stats.reset();
    expect(stats.graceRemaining).toBe(0);
  });

  it('takes the longer of two overlapping grants', () => {
    const { stats } = make();
    stats.grantGrace(5);
    stats.grantGrace(1);
    expect(stats.graceRemaining).toBe(5);
  });
});
