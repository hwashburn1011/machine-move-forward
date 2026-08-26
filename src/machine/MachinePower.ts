import {
  FUEL_BURN_PER_S,
  FUEL_TANK_CAP,
  PRIORITY_ORDER,
  STARTING_FUEL,
  type PowerPriority,
} from '@/data/power';

export type { PowerPriority };

export interface PowerConsumer {
  id: string;
  /** Units drawn while powered. */
  draw: number;
  priority: PowerPriority;
}

/**
 * What `fixedUpdate` reports.
 *
 * EDGES, not levels. `changed` fires when the capacity or the draw actually
 * moves, never once per tick — the HUD writes DOM off it and the audio plays a
 * breaker clunk off it, and both would be ruined by a per-frame stream. Fuel
 * ticks down continuously and is therefore polled, not announced; it rides
 * along on `changed` only so a listener has the whole picture at once.
 */
export type PowerEvent =
  | { type: 'changed'; capacity: number; draw: number; fuel: number }
  | { type: 'shed'; priority: PowerPriority }
  | { type: 'restored'; priority: PowerPriority };

export interface MachinePowerSave {
  fuel: number;
}

interface Producer {
  capacity: number;
  /** 0 at destroyed, 1 at whole. Phase 1's damage model drives this. */
  health: number;
}

/**
 * Total generation against total draw, and who loses when the two disagree.
 *
 * ONE POOL for the whole machine, not one per room. Wiring, conduits and room
 * isolation are explicitly future possibilities; this is the smallest model
 * that makes fuel matter and that Phase 5's turrets can be metered against.
 *
 * Pure, in the idiom `MachineDamage` established: plain numbers in, plain
 * numbers out, no Three, no Rapier, no event bus and no clock. The bus events
 * exist, but `Game` emits them from the edges this returns — which is what
 * lets the whole model be tested at sixty steps a second in node.
 *
 * Shedding drops WHOLE PRIORITY CLASSES, lowest first. A flickering subset of
 * lamps reads as a fault; a deck going dark reads as a decision.
 */
export class MachinePower {
  private tank = STARTING_FUEL;
  private readonly producers = new Map<string, Producer>();
  private readonly consumers = new Map<string, PowerConsumer>();

  /** Which classes are powered right now. Recomputed lazily; see `settle`. */
  private powered = new Set<PowerPriority>();
  private dirty = true;

  /** The last state announced, so `fixedUpdate` can return edges. */
  private announced: { capacity: number; draw: number; powered: Set<PowerPriority> } | null = null;

  /** Units in the tank. */
  get fuel(): number {
    return this.tank;
  }

  /**
   * Put fuel in. Returns how much was ACCEPTED, so the caller can put the
   * remainder back rather than quietly evaporating a player's salvage.
   */
  addFuel(units: number): number {
    const accepted = Math.max(0, Math.min(units, FUEL_TANK_CAP - this.tank));
    if (accepted === 0) return 0;
    this.tank += accepted;
    this.dirty = true;
    return accepted;
  }

  registerProducer(id: string, capacity: number): void {
    this.producers.set(id, { capacity: Math.max(0, capacity), health: 1 });
    this.dirty = true;
  }

  unregisterProducer(id: string): void {
    if (this.producers.delete(id)) this.dirty = true;
  }

  registerConsumer(consumer: PowerConsumer): void {
    this.consumers.set(consumer.id, { ...consumer, draw: Math.max(0, consumer.draw) });
    this.dirty = true;
  }

  unregisterConsumer(id: string): void {
    if (this.consumers.delete(id)) this.dirty = true;
  }

  /**
   * Phase 1's hook: a hurt generator makes less power.
   *
   * Silent about unknown ids on purpose. `build:damaged` can arrive for a
   * piece that has already come down, and a throw there would take the whole
   * fixed step with it.
   */
  setProducerHealth(id: string, fraction: number): void {
    const producer = this.producers.get(id);
    if (!producer) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    if (producer.health === clamped) return;
    producer.health = clamped;
    this.dirty = true;
  }

  /**
   * Generation available, after damage and after the tank.
   *
   * An empty tank is a dead generator, however healthy the metal: this is the
   * single line that makes fuel matter to anything at all.
   */
  get capacity(): number {
    if (this.tank <= 0) return 0;
    let total = 0;
    for (const producer of this.producers.values()) total += producer.capacity * producer.health;
    return total;
  }

  /** What the POWERED devices are drawing. Shed devices draw nothing. */
  get draw(): number {
    this.settle();
    let total = 0;
    for (const consumer of this.consumers.values()) {
      if (this.powered.has(consumer.priority)) total += consumer.draw;
    }
    return total;
  }

  isPowered(id: string): boolean {
    const consumer = this.consumers.get(id);
    if (!consumer) return false;
    this.settle();
    return this.powered.has(consumer.priority);
  }

  /**
   * Burn, re-shed, and report what changed.
   *
   * Order matters. Fuel is spent against the capacity the tick STARTED with,
   * then the state is settled again — so the tick that empties the tank is the
   * tick the lights go out, rather than one step later.
   */
  fixedUpdate(dt: number): PowerEvent[] {
    this.settle();
    if (this.powered.size > 0 && this.tank > 0) {
      this.tank = Math.max(0, this.tank - FUEL_BURN_PER_S * Math.max(0, dt));
      this.dirty = true;
    }
    this.settle();
    return this.diff();
  }

  toSave(): MachinePowerSave {
    return { fuel: this.tank };
  }

  /**
   * Absent means a fresh tank, which is what every save written before this
   * phase means — `machine.fuel` has been in the schema since v1 and has been
   * written as a placeholder ever since, so there is nothing here to migrate.
   */
  restore(saved: MachinePowerSave | undefined): void {
    this.tank = saved ? Math.max(0, Math.min(FUEL_TANK_CAP, saved.fuel)) : STARTING_FUEL;
    this.dirty = true;
    // A load is not an edge the player should hear a breaker for.
    this.announced = null;
    this.settle();
    this.announced = { capacity: this.capacity, draw: this.draw, powered: new Set(this.powered) };
  }

  /**
   * Recompute which classes are powered.
   *
   * Lazily, so `isPowered` and `draw` are correct the instant a device
   * registers rather than one fixed step later — a turret asked whether it may
   * fire on the frame it was built must get a truthful answer.
   */
  private settle(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const capacity = this.capacity;
    const next = new Set<PowerPriority>();
    let total = 0;
    for (const consumer of this.consumers.values()) {
      next.add(consumer.priority);
      total += consumer.draw;
    }

    // Cut whole classes, lowest first, until what is left fits.
    for (const priority of PRIORITY_ORDER) {
      if (total <= capacity) break;
      if (!next.delete(priority)) continue;
      for (const consumer of this.consumers.values()) {
        if (consumer.priority === priority) total -= consumer.draw;
      }
    }

    this.powered = next;
  }

  /** The edges since the last report. */
  private diff(): PowerEvent[] {
    const capacity = this.capacity;
    const draw = this.draw;
    const previous = this.announced;

    if (previous && previous.capacity === capacity && previous.draw === draw) {
      return [];
    }

    const events: PowerEvent[] = [{ type: 'changed', capacity, draw, fuel: this.tank }];
    // Only classes something is actually registered in: a HUD told the turrets
    // had shed on a machine with no turret would be lying.
    const occupied = new Set<PowerPriority>();
    for (const consumer of this.consumers.values()) occupied.add(consumer.priority);

    for (const priority of PRIORITY_ORDER) {
      if (!occupied.has(priority)) continue;
      const was = previous?.powered.has(priority) ?? true;
      const is = this.powered.has(priority);
      if (was === is) continue;
      events.push({ type: is ? 'restored' : 'shed', priority });
    }

    this.announced = { capacity, draw, powered: new Set(this.powered) };
    return events;
  }
}
