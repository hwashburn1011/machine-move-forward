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
    expect(fn).toHaveBeenCalledWith({ amount: 25, remaining: 75, source: 'skiff' });
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
