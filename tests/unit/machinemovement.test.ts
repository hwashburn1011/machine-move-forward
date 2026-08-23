import { describe, it, expect } from 'vitest';
import { MachineMovement } from '@/machine/MachineMovement';
import { BASE_MACHINE_SPEED, FIXED_DT, REFERENCE_WEIGHT } from '@/game/constants';

const step = (m: MachineMovement, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) m.fixedUpdate(FIXED_DT);
};

describe('MachineMovement', () => {
  it('starts stopped', () => {
    expect(new MachineMovement().currentSpeed).toBe(0);
  });

  it('accelerates toward the target speed', () => {
    const m = new MachineMovement();
    step(m, 1);
    expect(m.currentSpeed).toBeGreaterThan(0);
    expect(m.currentSpeed).toBeLessThanOrEqual(m.targetSpeed);
  });

  it('converges to the target and does not overshoot', () => {
    const m = new MachineMovement();
    step(m, 30);
    expect(m.currentSpeed).toBeCloseTo(m.targetSpeed, 2);
    step(m, 10);
    expect(m.currentSpeed).toBeLessThanOrEqual(m.targetSpeed + 1e-6);
  });

  it('hits base speed at the reference weight and base engine power', () => {
    const m = new MachineMovement();
    m.totalWeight = REFERENCE_WEIGHT;
    expect(m.maxSpeed).toBeCloseTo(BASE_MACHINE_SPEED, 5);
  });

  it('goes slower as weight increases', () => {
    const light = new MachineMovement();
    light.totalWeight = REFERENCE_WEIGHT * 0.5;
    const heavy = new MachineMovement();
    heavy.totalWeight = REFERENCE_WEIGHT * 2;
    expect(heavy.maxSpeed).toBeLessThan(light.maxSpeed);
  });

  it('goes faster as engine power increases', () => {
    const weak = new MachineMovement();
    const strong = new MachineMovement();
    strong.enginePower = weak.enginePower * 2;
    expect(strong.maxSpeed).toBeGreaterThan(weak.maxSpeed);
  });

  it('never returns a negative or zero max speed even when absurdly overloaded', () => {
    const m = new MachineMovement();
    m.totalWeight = REFERENCE_WEIGHT * 1000;
    expect(m.maxSpeed).toBeGreaterThan(0);
  });

  it('decelerates toward zero at zero throttle without going negative', () => {
    const m = new MachineMovement();
    step(m, 20);
    m.setThrottle(0);
    step(m, 30);
    expect(m.currentSpeed).toBeGreaterThanOrEqual(0);
    expect(m.currentSpeed).toBeLessThan(0.05);
  });

  it('scales target speed with throttle', () => {
    const m = new MachineMovement();
    m.setThrottle(0.5);
    expect(m.targetSpeed).toBeCloseTo(m.maxSpeed * 0.5, 6);
  });

  it('clamps throttle to 0..1', () => {
    const m = new MachineMovement();
    m.setThrottle(5);
    expect(m.targetSpeed).toBeCloseTo(m.maxSpeed, 6);
    m.setThrottle(-3);
    expect(m.targetSpeed).toBe(0);
  });

  it('is deterministic for the same dt sequence', () => {
    const a = new MachineMovement();
    const b = new MachineMovement();
    step(a, 3.5);
    step(b, 3.5);
    expect(a.currentSpeed).toBe(b.currentSpeed);
  });
});
