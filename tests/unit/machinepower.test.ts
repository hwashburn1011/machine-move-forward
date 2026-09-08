import { describe, expect, it } from 'vitest';
import { MachinePower, type PowerEvent } from '@/machine/MachinePower';
import { FUEL_BURN_PER_S, FUEL_TANK_CAP, STARTING_FUEL } from '@/data/power';

/**
 * The power model, checked the way `MachineDamage` is: plain numbers in, plain
 * numbers out, no scene and no bus.
 */

const STEP = 1 / 60;

/** Run the model for `seconds` of simulated time, collecting every edge. */
function run(power: MachinePower, seconds: number): PowerEvent[] {
  const out: PowerEvent[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) out.push(...power.fixedUpdate(STEP));
  return out;
}

/** A generator big enough for everything a test asks of it. */
function poweredMachine(capacity = 20): MachinePower {
  const power = new MachinePower();
  power.registerProducer('gen', capacity);
  return power;
}

describe('MachinePower fuel', () => {
  it('burns nothing while nothing is drawing', () => {
    const power = poweredMachine();
    const before = power.fuel;
    run(power, 10);
    expect(power.fuel).toBe(before);
  });

  it('burns while a consumer is powered', () => {
    const power = poweredMachine();
    power.registerConsumer({ id: 'lamp-1', draw: 1, priority: 'light' });
    const before = power.fuel;
    run(power, 10);
    expect(before - power.fuel).toBeCloseTo(10 * FUEL_BURN_PER_S, 5);
  });

  it('burns nothing once every consumer has shed', () => {
    // No producer at all: the consumer can never be powered, so the tank is
    // never touched even though a device is registered.
    const power = new MachinePower();
    power.registerConsumer({ id: 'lamp-1', draw: 1, priority: 'light' });
    const before = power.fuel;
    run(power, 10);
    expect(power.fuel).toBe(before);
  });

  it('accepts fuel up to the tank cap and reports what it took', () => {
    const power = new MachinePower();
    power.restore({ fuel: 0 });
    expect(power.addFuel(10)).toBe(10);
    expect(power.fuel).toBe(10);
    // Overfilling takes what fits and refuses the rest, so the caller can put
    // the remainder back in the player's bag.
    expect(power.addFuel(FUEL_TANK_CAP)).toBe(FUEL_TANK_CAP - 10);
    expect(power.fuel).toBe(FUEL_TANK_CAP);
    expect(power.addFuel(5)).toBe(0);
    // Nonsense in, nothing out.
    expect(power.addFuel(-5)).toBe(0);
  });

  it('starts with the tank the handoff gives a new machine', () => {
    expect(new MachinePower().fuel).toBe(STARTING_FUEL);
  });

  it('applies optional modifiers while preserving the default model', () => {
    const power = poweredMachine(16);
    power.setModifiers({ generationBonus: 6, fuelBurnMultiplier: 1.5 });
    expect(power.capacity).toBe(22);
    power.registerConsumer({ id: 'lamp', draw: 1, priority: 'light' });
    const before = power.fuel;
    run(power, 10);
    expect(before - power.fuel).toBeCloseTo(10 * FUEL_BURN_PER_S * 1.5, 5);
  });

  it('clamps modified generation at zero without changing the tank cap', () => {
    const power = poweredMachine(2);
    power.setModifiers({ generationBonus: -2 });
    expect(power.capacity).toBe(0);
    power.restore({ fuel: FUEL_TANK_CAP * 2 });
    expect(power.fuel).toBe(FUEL_TANK_CAP);
    expect(power.addFuel(1)).toBe(0);
  });
});

describe('MachinePower capacity', () => {
  it('does not create standalone capacity without a live generator', () => {
    const power = new MachinePower();
    power.setModifiers({ generationBonus: 6 });
    power.registerConsumer({ id: 'lamp', draw: 1, priority: 'light' });
    expect(power.capacity).toBe(0);
    expect(power.isPowered('lamp')).toBe(false);

    power.registerProducer('dead-gen', 16);
    power.setProducerHealth('dead-gen', 0);
    expect(power.capacity).toBe(0);
    expect(power.isPowered('lamp')).toBe(false);
  });

  it('sums its producers', () => {
    const power = new MachinePower();
    power.registerProducer('gen-a', 16);
    power.registerProducer('gen-b', 16);
    expect(power.capacity).toBe(32);
    power.unregisterProducer('gen-b');
    expect(power.capacity).toBe(16);
  });

  it('halves with a generator at half health', () => {
    const power = poweredMachine(16);
    expect(power.capacity).toBe(16);
    power.setProducerHealth('gen', 0.5);
    expect(power.capacity).toBe(8);
    // Phase 1 hands fractions straight through; clamp rather than trust them.
    power.setProducerHealth('gen', 2);
    expect(power.capacity).toBe(16);
    power.setProducerHealth('gen', -1);
    expect(power.capacity).toBe(0);
    // An unknown producer is not an error — a piece can be damaged after it
    // has already been demolished.
    expect(() => power.setProducerHealth('nobody', 0.5)).not.toThrow();
  });

  it('is zero on an empty tank, however healthy the generator', () => {
    const power = poweredMachine(16);
    power.restore({ fuel: 0 });
    expect(power.capacity).toBe(0);
    power.addFuel(10);
    expect(power.capacity).toBe(16);
  });
});

describe('MachinePower shedding', () => {
  /** A lamp, a refinery, and a turret: one of each priority class. */
  function loaded(capacity: number): MachinePower {
    const power = poweredMachine(capacity);
    power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });
    power.registerConsumer({ id: 'refinery', draw: 10, priority: 'station' });
    power.registerConsumer({ id: 'turret', draw: 6, priority: 'defense' });
    return power;
  }

  it('powers everything when capacity covers the draw', () => {
    const power = loaded(20);
    expect(power.draw).toBe(18);
    expect(power.isPowered('lamp')).toBe(true);
    expect(power.isPowered('refinery')).toBe(true);
    expect(power.isPowered('turret')).toBe(true);
  });

  it('drops whole classes lowest-first until the draw fits', () => {
    // 17 < 18: the lights go, and only the lights.
    const power = loaded(17);
    expect(power.isPowered('lamp')).toBe(false);
    expect(power.isPowered('refinery')).toBe(true);
    expect(power.isPowered('turret')).toBe(true);
    expect(power.draw).toBe(16);
  });

  it('sheds the stations next, and the defenses last of all', () => {
    const stations = loaded(8);
    expect(stations.isPowered('lamp')).toBe(false);
    expect(stations.isPowered('refinery')).toBe(false);
    expect(stations.isPowered('turret')).toBe(true);
    expect(stations.draw).toBe(6);

    const everything = loaded(1);
    expect(everything.isPowered('turret')).toBe(false);
    expect(everything.draw).toBe(0);
  });

  it('recovers a shed radio after removing the capacity reducing governor', () => {
    const power = poweredMachine(16);
    power.registerConsumer({ id: 'refinery', draw: 10, priority: 'station' });
    power.registerConsumer({ id: 'radio', draw: 1, priority: 'station' });
    power.registerConsumer({ id: 'gun', draw: 4, priority: 'defense' });

    // Economy Governor takes the live generator from 16 to 14. Heavy Breech
    // raises the gun draw to 4, so the 15 total exceeds capacity and the
    // station class sheds as a whole, including the radio needed to uninstall.
    power.setModifiers({ generationBonus: -2 });
    expect(power.capacity).toBe(14);
    expect(power.isPowered('radio')).toBe(false);

    // Game's stable uninstall path removes the active module and restores the
    // unmodified capacity, bringing the radio back without a fuel refill.
    power.setModifiers({ generationBonus: 0 });
    expect(power.capacity).toBe(16);
    expect(power.isPowered('radio')).toBe(true);
    expect(power.isPowered('refinery')).toBe(true);
  });

  it('restores in the exact reverse order as capacity comes back', () => {
    const power = loaded(20);
    power.setProducerHealth('gen', 0);
    const order: string[] = [];
    // 6 carries the turret alone, 16 adds the refinery, 18 covers everything.
    for (const capacity of [6, 16, 18]) {
      power.setProducerHealth('gen', capacity / 20);
      for (const id of ['lamp', 'refinery', 'turret']) {
        if (power.isPowered(id) && !order.includes(id)) order.push(id);
      }
    }
    expect(order).toEqual(['turret', 'refinery', 'lamp']);
  });

  it('sheds everything when the tank runs dry, and restores it on a refuel', () => {
    const power = loaded(20);
    power.restore({ fuel: 0 });
    expect(power.isPowered('lamp')).toBe(false);
    expect(power.isPowered('turret')).toBe(false);
    power.addFuel(10);
    expect(power.isPowered('lamp')).toBe(true);
    expect(power.isPowered('turret')).toBe(true);
  });

  it('forgets every device on clearDevices, and keeps the fuel', () => {
    // The path a load takes: `BuildSystem.clear()` drops its instances without
    // demolishing them, so nothing unregisters and the previous game's
    // generators would otherwise survive as capacity from nowhere.
    const power = loaded(20);
    const fuel = power.fuel;
    power.clearDevices();
    expect(power.capacity).toBe(0);
    expect(power.draw).toBe(0);
    expect(power.isPowered('turret')).toBe(false);
    expect(power.fuel).toBe(fuel);
  });

  it('knows nothing about ids it was never given', () => {
    const power = loaded(20);
    expect(power.isPowered('who')).toBe(false);
    power.unregisterConsumer('lamp');
    expect(power.isPowered('lamp')).toBe(false);
    expect(power.draw).toBe(16);
  });
});

describe('MachinePower events', () => {
  it('announces a change once, not every tick', () => {
    const power = poweredMachine(16);
    power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });

    const first = run(power, 1);
    expect(first.filter((e) => e.type === 'changed')).toHaveLength(1);
    // Nothing has changed since; the next second must be silent even though
    // fuel is ticking down the whole time.
    expect(run(power, 1)).toHaveLength(0);
  });

  it('names the class that shed, and the class that came back', () => {
    const power = poweredMachine(16);
    // 9 all told against a half-health capacity of 8, so exactly one class has
    // to go and the station is comfortably carried once it has.
    power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });
    power.registerConsumer({ id: 'refinery', draw: 7, priority: 'station' });
    run(power, 1);

    power.setProducerHealth('gen', 0.5);
    const shed = run(power, 1);
    expect(shed.filter((e) => e.type === 'shed').map((e) => e.priority)).toEqual(['light']);
    expect(shed.some((e) => e.type === 'changed')).toBe(true);

    power.setProducerHealth('gen', 1);
    const back = run(power, 1);
    expect(back.filter((e) => e.type === 'restored').map((e) => e.priority)).toEqual(['light']);
  });

  it('reports capacity, draw and fuel on the change it announces', () => {
    const power = poweredMachine(16);
    power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });
    const changed = run(power, 1).find((e) => e.type === 'changed');
    expect(changed).toBeDefined();
    if (changed?.type !== 'changed') throw new Error('expected a change');
    expect(changed.capacity).toBe(16);
    expect(changed.draw).toBe(2);
    expect(changed.fuel).toBeGreaterThan(0);
  });

  it('says nothing about a class that has no devices in it', () => {
    const power = poweredMachine(1);
    power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });
    const events = run(power, 1);
    // The lights shed. There are no stations and no turrets, so nothing may be
    // said about either — a HUD that heard 'defense shed' with no turret built
    // would be lying.
    expect(events.filter((e) => e.type === 'shed').map((e) => e.priority)).toEqual(['light']);
  });

  it('is deterministic: the same script produces the same edges twice', () => {
    const script = (power: MachinePower): PowerEvent[] => {
      power.registerProducer('gen', 16);
      power.registerConsumer({ id: 'lamp', draw: 2, priority: 'light' });
      const out = run(power, 2);
      power.setProducerHealth('gen', 0);
      out.push(...run(power, 2));
      return out;
    };
    expect(script(new MachinePower())).toEqual(script(new MachinePower()));
  });
});

describe('MachinePower persistence', () => {
  it('round-trips the tank', () => {
    const power = poweredMachine();
    power.registerConsumer({ id: 'lamp', draw: 1, priority: 'light' });
    run(power, 30);
    const saved = power.toSave();

    const loaded = poweredMachine();
    loaded.restore(saved);
    expect(loaded.fuel).toBeCloseTo(power.fuel, 6);
  });

  it('reads a missing block as a fresh tank', () => {
    const power = poweredMachine();
    power.restore({ fuel: 3 });
    power.restore(undefined);
    expect(power.fuel).toBe(STARTING_FUEL);
  });

  it('clamps a save that names more fuel than the tank holds', () => {
    const power = new MachinePower();
    power.restore({ fuel: FUEL_TANK_CAP * 10 });
    expect(power.fuel).toBe(FUEL_TANK_CAP);
    power.restore({ fuel: -1 });
    expect(power.fuel).toBe(0);
  });
});
