export interface WorkItem {
  itemId: string;
  count: number;
}
export interface CaretakerCrate {
  id: string;
  reachable: boolean;
  items: readonly WorkItem[];
  spaceByItem: Readonly<Record<string, number>>;
}
export interface CaretakerProducer {
  id: string;
  reachable: boolean;
  output: WorkItem;
}
export interface CaretakerGarden {
  id: string;
  reachable: boolean;
  water: number;
}
export interface CaretakerWorkSnapshot {
  crates: readonly CaretakerCrate[];
  producers: readonly CaretakerProducer[];
  gardens: readonly CaretakerGarden[];
}
export const CARETAKER_PRIORITIES = ['auto', 'gardens', 'outputs'] as const;
export type CaretakerPriority = (typeof CARETAKER_PRIORITIES)[number];
export type CaretakerBlockedReason =
  | 'no-work'
  | 'garden-unreachable'
  | 'output-unreachable'
  | 'water-unavailable'
  | 'water-source-unreachable'
  | 'storage-full'
  | 'storage-unreachable'
  | 'unsafe'
  | 'dock-missing'
  | 'dock-unpowered'
  | 'companion-mode'
  | 'busy';
export type CaretakerJobKind = 'water-garden' | 'store-output';
export interface CaretakerJob {
  readonly kind: CaretakerJobKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly itemId: string;
  readonly count: 1;
}

const count = (crate: CaretakerCrate, itemId: string): number =>
  crate.items.find((item) => item.itemId === itemId)?.count ?? 0;
const canStore = (crate: CaretakerCrate, itemId: string): boolean =>
  (crate.spaceByItem[itemId] ?? 0) >= 1;

export type CaretakerWorkResult =
  | { kind: 'ready'; job: CaretakerJob }
  | { kind: 'idle'; reason: 'no-work' }
  | {
      kind: 'blocked';
      reason: Exclude<
        CaretakerBlockedReason,
        'no-work' | 'unsafe' | 'dock-missing' | 'dock-unpowered' | 'companion-mode' | 'busy'
      >;
      nodeId?: string;
    };
export type CaretakerWorkDecision = CaretakerWorkResult;

const idle = (reason: 'no-work'): CaretakerWorkResult => ({ kind: 'idle', reason });
const blocked = (
  reason: Exclude<
    CaretakerBlockedReason,
    'no-work' | 'unsafe' | 'dock-missing' | 'dock-unpowered' | 'companion-mode' | 'busy'
  >,
  nodeId?: string,
): CaretakerWorkResult =>
  nodeId ? { kind: 'blocked', reason, nodeId } : { kind: 'blocked', reason };
const ready = (job: CaretakerJob): CaretakerWorkResult => ({ kind: 'ready', job });

function gardenWork(snapshot: CaretakerWorkSnapshot): CaretakerWorkResult {
  const allGardens = [...snapshot.gardens]
    .filter((garden) => garden.water < 2)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!allGardens.length) return idle('no-work');
  const gardens = allGardens.filter((garden) => garden.reachable);
  if (!gardens.length) return blocked('garden-unreachable', allGardens[0]?.id);
  const allWater = snapshot.crates.filter((crate) => count(crate, 'water') > 0);
  const crates = [...snapshot.crates]
    .filter((crate) => crate.reachable)
    .sort((a, b) => a.id.localeCompare(b.id));
  const source = crates.find((crate) => count(crate, 'water') > 0);
  if (!source)
    return allWater.length
      ? blocked('water-source-unreachable', allWater[0]?.id)
      : blocked('water-unavailable');
  return ready({
    kind: 'water-garden',
    sourceId: source.id,
    targetId: gardens[0]!.id,
    itemId: 'water',
    count: 1,
  });
}

function outputWork(snapshot: CaretakerWorkSnapshot): CaretakerWorkResult {
  const allProducers = [...snapshot.producers]
    .filter((producer) => producer.output.count > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!allProducers.length) return idle('no-work');
  const producers = allProducers.filter((producer) => producer.reachable);
  if (!producers.length) return blocked('output-unreachable', allProducers[0]?.id);
  const crates = [...snapshot.crates].sort((a, b) => a.id.localeCompare(b.id));
  for (const producer of producers) {
    const target = crates.find(
      (crate) => crate.reachable && canStore(crate, producer.output.itemId),
    );
    if (target)
      return ready({
        kind: 'store-output',
        sourceId: producer.id,
        targetId: target.id,
        itemId: producer.output.itemId,
        count: 1,
      });
  }
  const reachable = crates.filter((crate) => crate.reachable);
  if (!reachable.length) return blocked('storage-unreachable', crates[0]?.id);
  return blocked('storage-full', producers[0]?.id);
}

/** Evaluates one stable transfer without mutating any resource. */
export function evaluateCaretakerWork(
  snapshot: CaretakerWorkSnapshot,
  priority: CaretakerPriority = 'auto',
): CaretakerWorkResult {
  const gardens = gardenWork(snapshot);
  const outputs = outputWork(snapshot);
  if (priority === 'gardens') {
    if (gardens.kind === 'ready') return gardens;
    if (outputs.kind === 'ready') return outputs;
    return gardens.kind === 'blocked' ? gardens : outputs;
  }
  if (priority === 'outputs') {
    if (outputs.kind === 'ready') return outputs;
    if (gardens.kind === 'ready') return gardens;
    return outputs.kind === 'blocked' ? outputs : gardens;
  }
  if (gardens.kind === 'ready') return gardens;
  if (outputs.kind === 'ready') return outputs;
  if (gardens.reason !== 'no-work') return gardens;
  return outputs;
}

/** Chooses one stable, reachable transfer without mutating any resource. */
export function chooseCaretakerJob(
  snapshot: CaretakerWorkSnapshot,
  priority: CaretakerPriority = 'auto',
): CaretakerJob | null {
  const result = evaluateCaretakerWork(snapshot, priority);
  return result.kind === 'ready' ? result.job : null;
}
