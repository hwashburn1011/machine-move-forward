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

/** Chooses one stable, reachable transfer without mutating any resource. */
export function chooseCaretakerJob(snapshot: CaretakerWorkSnapshot): CaretakerJob | null {
  const crates = [...snapshot.crates]
    .filter((crate) => crate.reachable)
    .sort((a, b) => a.id.localeCompare(b.id));
  const gardens = [...snapshot.gardens]
    .filter((garden) => garden.reachable && garden.water < 2)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const garden of gardens) {
    const source = crates.find((crate) => count(crate, 'water') > 0);
    if (source)
      return {
        kind: 'water-garden',
        sourceId: source.id,
        targetId: garden.id,
        itemId: 'water',
        count: 1,
      };
  }
  const producers = [...snapshot.producers]
    .filter((producer) => producer.reachable && producer.output.count > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const producer of producers) {
    const target = crates.find((crate) => canStore(crate, producer.output.itemId));
    if (target)
      return {
        kind: 'store-output',
        sourceId: producer.id,
        targetId: target.id,
        itemId: producer.output.itemId,
        count: 1,
      };
  }
  return null;
}
