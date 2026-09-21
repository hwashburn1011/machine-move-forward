import { ITEMS, type ItemCost, type ItemId } from '@/data/items';
import type { Recipe } from '@/data/recipes';
import { Container } from '@/items/Container';

export type OnboardStorageKind = 'crate' | 'collector';
export type OnboardContainerId = 'carried' | string;

/** A live, freshly resolved endpoint. The terminal never stores this object. */
export interface OnboardStorageEndpoint {
  readonly id: string;
  readonly kind: OnboardStorageKind;
  readonly label: string;
  readonly container: Container;
  readonly online: boolean;
}

export interface OnboardStationEndpoint {
  readonly id: string;
  readonly kind: 'workbench' | 'refinery' | 'stove';
  readonly powered: boolean;
  readonly healthy: boolean;
  readonly unlocked: boolean;
}

export interface OnboardResourceContext {
  readonly carried: Container;
  readonly storage: readonly OnboardStorageEndpoint[];
  readonly aboard: boolean;
}

export interface OnboardMutationResult {
  readonly ok: boolean;
  readonly moved: number;
  readonly leftovers: number;
  readonly reason?:
    | 'off-machine'
    | 'missing-endpoint'
    | 'offline'
    | 'invalid-slot'
    | 'capacity'
    | 'invalid-item'
    | 'invalid-station'
    | 'cannot-afford';
}

/** Resource purse accepted directly by Weapon.researchAttachment. */
export interface OnboardPurse {
  canAfford(cost: Readonly<ItemCost>): boolean;
  consume(cost: Readonly<ItemCost>): boolean;
}

const empty = (reason: OnboardMutationResult['reason']): OnboardMutationResult => ({
  ok: false,
  moved: 0,
  leftovers: 0,
  reason,
});

function endpoint(context: OnboardResourceContext, id: string): OnboardStorageEndpoint | null {
  if (!context.aboard) return null;
  const found = context.storage.find((entry) => entry.id === id);
  return found?.online ? found : null;
}

function registryValid(context: OnboardResourceContext): boolean {
  if (!(context.carried instanceof Container) || !Array.isArray(context.storage)) return false;
  const ids = new Set<string>();
  const containers = new Set<Container>([context.carried]);
  for (const entry of context.storage) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      entry.id === 'carried' ||
      (entry.kind !== 'crate' && entry.kind !== 'collector') ||
      typeof entry.online !== 'boolean' ||
      !(entry.container instanceof Container) ||
      ids.has(entry.id) ||
      containers.has(entry.container)
    )
      return false;
    ids.add(entry.id);
    containers.add(entry.container);
  }
  return true;
}

function isOffline(context: OnboardResourceContext, id: OnboardContainerId): boolean {
  return id !== 'carried' && context.storage.some((entry) => entry.id === id && !entry.online);
}

function validAmount(amount: number | undefined): amount is number {
  return amount === undefined || (Number.isSafeInteger(amount) && amount > 0);
}

function containerFor(context: OnboardResourceContext, id: OnboardContainerId): Container | null {
  if (!context.aboard) return null;
  if (id === 'carried') return context.carried;
  return endpoint(context, id)?.container ?? null;
}

/** Moves one selected slot through the existing Container capacity rules. */
export function transferOnboardSlot(
  context: OnboardResourceContext,
  sourceId: OnboardContainerId,
  destinationId: OnboardContainerId,
  slotIndex: number,
  count?: number,
): OnboardMutationResult {
  if (!validAmount(count)) return empty('invalid-item');
  if (!context.aboard) return empty('off-machine');
  if (!registryValid(context)) return empty('missing-endpoint');
  const source = containerFor(context, sourceId);
  const destination = containerFor(context, destinationId);
  if (!source || !destination)
    return empty(
      isOffline(context, sourceId) || isOffline(context, destinationId)
        ? 'offline'
        : 'missing-endpoint',
    );
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= source.capacity)
    return empty('invalid-slot');
  if (source === destination) return empty('invalid-slot');
  const slot = source.slots[slotIndex];
  if (!slot) return { ok: true, moved: 0, leftovers: 0 };
  const wanted = count === undefined ? slot.count : Math.min(slot.count, Math.max(0, count));
  if (wanted <= 0) return { ok: true, moved: 0, leftovers: 0 };
  const leftovers = source.moveTo(destination, slotIndex, wanted);
  return {
    ok: leftovers === 0,
    moved: wanted - leftovers,
    leftovers,
    reason: leftovers ? 'capacity' : undefined,
  };
}

function cloneOf(container: Container): Container {
  const clone = new Container(container.capacity);
  clone.restore(container.serialise());
  return clone;
}

function commitClones(entries: readonly { original: Container; clone: Container }[]): void {
  for (const entry of entries) entry.original.restore(entry.clone.serialise());
}

function validCostEntries(cost: Readonly<ItemCost>): readonly [ItemId, number][] | null {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return null;
  const entries = Object.entries(cost);
  for (const [itemId, amount] of entries) {
    if (!Object.hasOwn(ITEMS, itemId) || !Number.isSafeInteger(amount) || amount < 0) return null;
  }
  return entries as [ItemId, number][];
}

function planOnboardCost(
  context: OnboardResourceContext,
  cost: Readonly<ItemCost>,
): readonly { original: Container; clone: Container }[] | null {
  if (!context.aboard || !registryValid(context)) return null;
  const entries = validCostEntries(cost);
  if (!entries) return null;
  const sources = [
    context.carried,
    ...context.storage
      .filter((entry) => entry.online && entry.kind === 'crate')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => entry.container),
  ];
  const plans = sources.map((original) => ({ original, clone: cloneOf(original) }));
  for (const [itemId, amount] of entries) {
    let remaining = amount;
    for (const plan of plans) {
      remaining -= plan.clone.remove(itemId, remaining);
      if (remaining <= 0) break;
    }
    if (remaining > 0) return null;
  }
  return plans;
}

/**
 * Presents carried inventory and healthy ordinary crates as one atomic purse.
 * Debits are deterministic: carried first, then crate ID order. Collectors and
 * offline crate buffers are never research inputs.
 */
export function createOnboardPurse(context: OnboardResourceContext): OnboardPurse {
  return {
    canAfford(cost): boolean {
      return planOnboardCost(context, cost) !== null;
    },
    consume(cost): boolean {
      const plans = planOnboardCost(context, cost);
      if (!plans) return false;
      commitClones(plans);
      return true;
    },
  };
}

/**
 * Crafts into one selected owned crate or carried inventory. Inputs are read
 * from carried inventory first, then stable crate IDs; collector buffers are
 * deliberately excluded from recipe inputs.
 */
export function craftOnboard(
  context: OnboardResourceContext,
  stations: readonly OnboardStationEndpoint[],
  stationId: string,
  recipe: Recipe,
  destinationId: OnboardContainerId,
): OnboardMutationResult {
  if (!context.aboard) return empty('off-machine');
  if (!registryValid(context)) return empty('missing-endpoint');
  const station = stations.find((entry) => entry.id === stationId);
  if (
    !station ||
    station.kind !== recipe.station ||
    !station.powered ||
    !station.healthy ||
    !station.unlocked
  )
    return empty('invalid-station');
  const destination = containerFor(context, destinationId);
  if (!destination)
    return empty(isOffline(context, destinationId) ? 'offline' : 'missing-endpoint');
  if (destinationId !== 'carried' && endpoint(context, destinationId)?.kind !== 'crate')
    return empty('missing-endpoint');

  const sources = [
    { id: 'carried', container: context.carried },
    ...context.storage
      .filter((entry) => entry.online && entry.kind === 'crate')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({ id: entry.id, container: entry.container })),
  ];
  const unique = new Map<string, { original: Container; clone: Container }>();
  for (const source of sources)
    unique.set(source.id, { original: source.container, clone: cloneOf(source.container) });
  if (!unique.has(destinationId))
    unique.set(destinationId, { original: destination, clone: cloneOf(destination) });
  const plans = [...unique.values()];
  for (const [itemId, amount] of Object.entries(recipe.inputs) as [ItemId, number][]) {
    if (!ITEMS[itemId] || !Number.isSafeInteger(amount) || amount < 0) return empty('invalid-item');
    let remaining = amount;
    for (const source of sources) {
      remaining -= unique.get(source.id)!.clone.remove(itemId, remaining);
      if (remaining <= 0) break;
    }
    if (remaining > 0) return empty('cannot-afford');
  }
  const destinationClone = unique.get(destinationId)!.clone;
  const outputLeft = destinationClone.add(recipe.output.itemId, recipe.output.count);
  if (outputLeft > 0) return { ...empty('capacity'), leftovers: outputLeft };
  commitClones(plans);
  return { ok: true, moved: recipe.output.count, leftovers: 0 };
}

export interface OnboardGardenPort {
  readonly id: string;
  readonly water: number;
  readonly capacity: number;
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  addWater(amount: number): number;
  harvest(amount: number): number;
  readonly greens: number;
}

export interface OnboardProducerPort {
  readonly id: string;
  readonly itemId: ItemId;
  readonly stored: number;
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  claim(amount: number): number;
}

/** Atomic water transfer for a live garden adapter supplied by Game. */
export function waterGardenOnboard(
  context: OnboardResourceContext,
  garden: OnboardGardenPort,
  sourceId: OnboardContainerId,
  amount = 1,
): OnboardMutationResult {
  if (!validAmount(amount)) return empty('invalid-item');
  if (!context.aboard) return empty('off-machine');
  if (!registryValid(context)) return empty('missing-endpoint');
  const source = containerFor(context, sourceId);
  if (!source) return empty(isOffline(context, sourceId) ? 'offline' : 'missing-endpoint');
  const sourceClone = cloneOf(source);
  const gardenBefore = garden.snapshot();
  const available = Math.min(
    Math.max(0, amount),
    sourceClone.count('water'),
    Math.max(0, garden.capacity - garden.water),
  );
  if (available <= 0) return empty(sourceClone.count('water') ? 'capacity' : 'cannot-afford');
  if (
    sourceClone.remove('water', available) !== available ||
    garden.addWater(available) !== available
  ) {
    garden.restore(gardenBefore);
    return empty('capacity');
  }
  source.restore(sourceClone.serialise());
  return { ok: true, moved: available, leftovers: 0 };
}

/** Atomic producer/garden output collection into one owned destination. */
export function collectOnboardOutput(
  context: OnboardResourceContext,
  source: OnboardProducerPort | OnboardGardenPort,
  destinationId: OnboardContainerId,
  amount = 1,
): OnboardMutationResult {
  if (!validAmount(amount)) return empty('invalid-item');
  if (!context.aboard) return empty('off-machine');
  if (!registryValid(context)) return empty('missing-endpoint');
  const destination = containerFor(context, destinationId);
  if (
    !destination ||
    (destinationId !== 'carried' && endpoint(context, destinationId)?.kind !== 'crate')
  )
    return empty(isOffline(context, destinationId) ? 'offline' : 'missing-endpoint');
  const sourceBefore = source.snapshot();
  const destinationClone = cloneOf(destination);
  const itemId = 'itemId' in source ? source.itemId : 'greens';
  const available = Math.min(
    Math.max(0, amount),
    'stored' in source ? source.stored : source.greens,
  );
  if (available <= 0) return { ok: true, moved: 0, leftovers: 0 };
  if (destinationClone.add(itemId, available) !== 0) return empty('capacity');
  const claimed = 'claim' in source ? source.claim(available) : source.harvest(available);
  if (claimed !== available) {
    source.restore(sourceBefore);
    return empty('capacity');
  }
  destination.restore(destinationClone.serialise());
  return { ok: true, moved: available, leftovers: 0 };
}
