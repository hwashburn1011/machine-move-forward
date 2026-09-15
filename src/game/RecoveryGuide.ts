import type { PowerPriority } from '@/data/power';
export type { PowerPriority } from '@/data/power';

/** Read-only survival guidance. It deliberately owns no game state or clocks. */

export interface RecoverySnapshot {
  firstRunComplete: boolean;
  fuel: number;
  fuelCapacity: number;
  fuelBurnPerSecond: number;
  machineSpeedMps: number;
  emergencyCrawl: boolean;
  generatorCount: number;
  powerCapacity: number;
  registeredDemand: number;
  poweredDraw: number;
  shedPriorities: readonly PowerPriority[];
  hydration: number;
  nourishment: number;
  waterCarried: number;
  rationsCarried: number;
  condenserCount: number;
  garden?: { water: number; greens: number; progressS: number; cycleS: number };
  damagedSubsystems: number;
  repairKits: number;
  safeToSave: boolean;
  saveRefusal?: string;
}

export type RecoveryTopic = 'fuel' | 'power' | 'water' | 'food' | 'garden' | 'repair' | 'save';
export interface RecoveryHint {
  topic: RecoveryTopic;
  severity: 'info' | 'warning' | 'blocked';
  title: string;
  detail: string;
  metric?: string;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): number => (finite(value) ? Math.max(0, value) : 0);
const positive = (value: unknown): number => (finite(value) && value > 0 ? value : 0);
const bounded = (value: unknown, max: number): number => Math.min(max, nonnegative(value));

export function projectRecovery(snapshot: RecoverySnapshot): readonly RecoveryHint[] {
  const s = snapshot ?? ({} as RecoverySnapshot);
  const fuel = nonnegative(s.fuel);
  const fuelCapacity = positive(s.fuelCapacity);
  const burn = positive(s.fuelBurnPerSecond);
  const speed = positive(s.machineSpeedMps);
  const demand = nonnegative(s.registeredDemand);
  const poweredDraw = nonnegative(s.poweredDraw);
  const powerCapacity = nonnegative(s.powerCapacity);
  const hydration = bounded(s.hydration, 100);
  const nourishment = bounded(s.nourishment, 100);
  const water = nonnegative(s.waterCarried);
  const rations = nonnegative(s.rationsCarried);
  const damaged = nonnegative(s.damagedSubsystems);
  const hints: RecoveryHint[] = [];

  const add = (hint: RecoveryHint) => {
    hints.push(hint);
  };

  if (!s.safeToSave) {
    add({
      topic: 'save',
      severity: 'blocked',
      title: 'Saving is unavailable',
      detail: s.saveRefusal || 'Return to the machine and clear the current danger before saving.',
    });
  }

  if (fuel <= 0 || (fuelCapacity > 0 && fuel < fuelCapacity)) {
    if (fuel <= 0) {
      add({
        topic: 'fuel',
        severity: 'blocked',
        title: 'Fuel tank is empty',
        detail: 'Reel salvage for fuel, then refuel the machine at the generator.',
        metric: fuelCapacity > 0 ? `0/${trim(fuelCapacity)}` : '0',
      });
    } else {
      const forecast = forecastFuel(fuel, burn, speed, Boolean(s.emergencyCrawl));
      const low = fuelCapacity > 0 && fuel < fuelCapacity * 0.25;
      add({
        topic: 'fuel',
        severity: low ? 'warning' : 'info',
        title: low ? 'Fuel is running low' : 'Fuel forecast',
        detail: low
          ? 'Reel salvage and refuel the generator before leaving the machine.'
          : 'Current fuel can carry you onward; reel salvage and refuel when convenient.',
        metric: `${trim(fuel)}/${trim(fuelCapacity)}${forecast}`,
      });
    }
  }

  if (demand > powerCapacity + 1e-6 || (powerCapacity <= 0 && demand > 0)) {
    const shed = s.shedPriorities?.length
      ? ` Shed ${s.shedPriorities.join(', ')} loads first.`
      : '';
    add({
      topic: 'power',
      severity: powerCapacity <= 0 ? 'blocked' : 'warning',
      title: powerCapacity <= 0 ? 'No power is available' : 'Power demand exceeds generation',
      detail: `Equipment needs ${trim(demand)} power; ${trim(poweredDraw)} is supplied from ${trim(powerCapacity)} capacity.${shed}`,
      metric: `${trim(poweredDraw)}/${trim(demand)} supplied`,
    });
  }

  if (hydration <= 25) {
    add({
      topic: 'water',
      severity: hydration <= 0 ? 'blocked' : 'warning',
      title: hydration <= 0 ? 'Water is exhausted' : 'Water is running low',
      detail:
        water > 0
          ? 'Drink carried water now, then refill from a condenser or cache.'
          : s.condenserCount > 0
            ? 'Use a condenser to collect water before travelling farther.'
            : 'Find a water cache or condenser before travelling farther.',
      metric: `${trim(hydration)}%`,
    });
  }

  if (nourishment <= 25) {
    add({
      topic: 'food',
      severity: nourishment <= 0 ? 'blocked' : 'warning',
      title: nourishment <= 0 ? 'Food is exhausted' : 'Food is running low',
      detail:
        rations > 0
          ? 'Eat a carried ration from your inventory. Cook greens and water at a powered stove to make more.'
          : 'Cook greens and water at a powered stove, or recover rations from salvage.',
      metric: `${trim(nourishment)}%`,
    });
  }

  const garden = s.garden;
  if (garden && nonnegative(garden.water) > 0 && nonnegative(garden.greens) <= 3) {
    const cycle = positive(garden.cycleS) || 180;
    const progress = Math.min(cycle, nonnegative(garden.progressS));
    const eta = Math.max(0, cycle - progress);
    add({
      topic: 'garden',
      severity: 'info',
      title: eta <= 0 ? 'Garden is ready to harvest' : 'Garden is growing',
      detail:
        eta <= 0
          ? 'Harvest the greens before tending the next batch.'
          : 'Harvest regularly; growth pauses when the garden holds six greens.',
      metric:
        eta <= 0 ? `${trim(nonnegative(garden.greens))}/6 greens` : `${trim(eta)}s to harvest`,
    });
  }

  if (damaged > 0) {
    add({
      topic: 'repair',
      severity: 'warning',
      title: 'Repairs are needed',
      detail:
        'Use an access panel and bring the required scrap and components to restore the damaged subsystem.',
      metric: `${trim(damaged)} damaged`,
    });
  }

  const severity = { blocked: 0, warning: 1, info: 2 } as const;
  const topicOrder: readonly RecoveryTopic[] = [
    'save',
    'fuel',
    'power',
    'water',
    'food',
    'garden',
    'repair',
  ];
  return hints
    .sort(
      (a, b) =>
        severity[a.severity] - severity[b.severity] ||
        topicOrder.indexOf(a.topic) - topicOrder.indexOf(b.topic),
    )
    .slice(0, 3);
}

function forecastFuel(fuel: number, burn: number, speed: number, emergency: boolean): string {
  if (emergency || burn <= 0 || speed <= 0) return '';
  const seconds = fuel / burn;
  const range = seconds * speed;
  if (!Number.isFinite(seconds) || !Number.isFinite(range)) return '';
  const minutes = seconds / 60;
  if (!Number.isFinite(minutes)) return '';
  return ` · ${trim(minutes)} min / ${trim(range)} m range`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}
