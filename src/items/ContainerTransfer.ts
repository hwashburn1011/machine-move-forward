import { Container } from './Container';
import { ITEMS, type ItemId } from '@/data/items';

export interface TransferResult {
  moved: number;
  leftovers: number;
  byItem: Readonly<Record<string, number>>;
}

const emptyResult = (): TransferResult => ({ moved: 0, leftovers: 0, byItem: {} });

function transfer(
  source: Container,
  destination: Container,
  ids: readonly ItemId[],
): TransferResult {
  if (source === destination) return emptyResult();
  const byItem: Record<string, number> = {};
  let moved = 0;
  let leftovers = 0;
  for (const id of ids) {
    // Move each valid source slot directly. Calling remove(itemId, n) could
    // accidentally consume a malformed earlier slot of the same item.
    for (let i = 0; i < source.slots.length; i++) {
      const slot = source.slots[i];
      if (
        !slot ||
        slot.itemId !== id ||
        !ITEMS[id] ||
        !Number.isSafeInteger(slot.count) ||
        slot.count <= 0 ||
        slot.count > ITEMS[id].stackSize
      )
        continue;
      const left = destination.add(id, slot.count);
      const didMove = slot.count - left;
      if (didMove > 0) {
        slot.count -= didMove;
        if (slot.count === 0) source.slots[i] = null;
        moved += didMove;
        byItem[id] = (byItem[id] ?? 0) + didMove;
      }
      leftovers += left;
    }
  }
  return { moved, leftovers, byItem };
}

/** Move every item present at the beginning of the operation. */
export function takeAll(source: Container, destination: Container): TransferResult {
  const ids = [
    ...new Set(
      source.slots
        .filter((s) => s && ITEMS[s.itemId] && Number.isSafeInteger(s.count) && s.count > 0)
        .map((s) => s!.itemId),
    ),
  ].sort();
  return transfer(source, destination, ids);
}

/** Move only item types already present in the destination at operation start. */
export function depositMatching(source: Container, destination: Container): TransferResult {
  const ids = [
    ...new Set(
      destination.slots
        .filter((s) => s && ITEMS[s.itemId] && Number.isSafeInteger(s.count) && s.count > 0)
        .map((s) => s!.itemId),
    ),
  ].sort();
  return transfer(source, destination, ids);
}

/** Compact stacks into deterministic item-id order without changing totals. */
export function sortContainer(container: Container): void {
  const totals = new Map<ItemId, number>();
  for (const slot of container.slots) {
    if (!slot) continue;
    if (
      !ITEMS[slot.itemId] ||
      !Number.isSafeInteger(slot.count) ||
      slot.count <= 0 ||
      slot.count > ITEMS[slot.itemId].stackSize
    )
      return;
    totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + slot.count);
  }
  container.clear();
  const ordered = [...totals.keys()].sort(
    (a, b) =>
      ITEMS[a].category.localeCompare(ITEMS[b].category) ||
      ITEMS[a].name.localeCompare(ITEMS[b].name) ||
      a.localeCompare(b),
  );
  for (const id of ordered) container.add(id, totals.get(id)!);
}
