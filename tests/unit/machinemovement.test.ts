import { describe, it, expect } from 'vitest';
import { MachineMovement } from '@/machine/MachineMovement';
import { BASE_MACHINE_SPEED, FIXED_DT, REFERENCE_WEIGHT } from '@/game/constants';
import { MachineDamage } from '@/machine/MachineDamage';
import { SUBSYSTEMS } from '@/data/subsystems';

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

  it('caps scripted speed without overwriting the stored player throttle', () => {
    const m = new MachineMovement();
    m.setThrottle(1);
    m.setScriptedSpeedLimit(1.2);
    expect(m.targetSpeed).toBeCloseTo(1.2, 6);
    m.setScriptedSpeedLimit(null);
    expect(m.targetSpeed).toBeCloseTo(m.maxSpeed, 6);
  });

  it('applies upgrade movement modifiers to speed, load, and acceleration', () => {
    const baseline = new MachineMovement();
    const tuned = new MachineMovement();
    tuned.setModifiers({ speedMultiplier: 1.2, effectiveWeightMultiplier: 0.7, accelerationMultiplier: 0.5 });
    expect(tuned.maxSpeed).toBeGreaterThan(baseline.maxSpeed);
    tuned.fixedUpdate(FIXED_DT);
    baseline.fixedUpdate(FIXED_DT);
    expect(tuned.currentSpeed).toBeLessThan(baseline.currentSpeed);
  });

  it('keeps the torque clutch empty-machine penalty while improving a heavy payload', () => {
    const emptyBaseline = new MachineMovement();
    const emptyTorque = new MachineMovement();
    emptyTorque.setModifiers({ speedMultiplier: 0.97, effectiveWeightMultiplier: 0.65, accelerationMultiplier: 0.7 });
    expect(emptyTorque.maxSpeed).toBeCloseTo(emptyBaseline.maxSpeed * 0.97, 6);

    const heavyBaseline = new MachineMovement();
    heavyBaseline.totalWeight = REFERENCE_WEIGHT + 3000;
    const heavyTorque = new MachineMovement();
    heavyTorque.totalWeight = REFERENCE_WEIGHT + 3000;
    heavyTorque.setModifiers({ speedMultiplier: 0.97, effectiveWeightMultiplier: 0.65, accelerationMultiplier: 0.7 });
    expect(heavyTorque.maxSpeed).toBeGreaterThan(heavyBaseline.maxSpeed);
  });
});

describe('a damaged machine', () => {
  const applied = (d: MachineDamage) => {
    const m = new MachineMovement();
    m.enginePower = d.enginePower;
    m.legScale = d.speedScale;
    return m;
  };

  it('halves its top speed with a half-wrecked engine', () => {
    const whole = new MachineMovement();
    const d = new MachineDamage();
    d.damage('engine', SUBSYSTEMS.engine.maxHealth / 2 + SUBSYSTEMS.engine.armor);
    expect(applied(d).maxSpeed).toBeCloseTo(whole.maxSpeed * 0.5, 5);
  });

  it('stops dead at a destroyed engine', () => {
    const d = new MachineDamage();
    d.damage('engine', 99999);
    expect(applied(d).maxSpeed).toBe(0);
  });

  it('crawls but never halts on wrecked legs', () => {
    const d = new MachineDamage();
    for (const id of [
      'leg-front-left',
      'leg-front-right',
      'leg-rear-left',
      'leg-rear-right',
    ] as const) {
      d.damage(id, 99999);
    }
    const m = applied(d);
    expect(m.maxSpeed).toBeGreaterThan(0);
    expect(m.maxSpeed).toBeLessThan(new MachineMovement().maxSpeed);
  });

  it('converges on zero rather than snapping there when the engine dies', () => {
    // A machine that stopped in one frame would throw the player off the deck.
    const m = new MachineMovement();
    m.setThrottle(1);
    for (let i = 0; i < 200; i++) m.fixedUpdate(1 / 60);
    const rolling = m.currentSpeed;
    expect(rolling).toBeGreaterThan(0);

    m.enginePower = 0;
    m.fixedUpdate(1 / 60);
    expect(m.currentSpeed).toBeLessThan(rolling);
    expect(m.currentSpeed).toBeGreaterThan(0);

    for (let i = 0; i < 600; i++) m.fixedUpdate(1 / 60);
    expect(m.currentSpeed).toBeLessThan(0.05);
  });
});
