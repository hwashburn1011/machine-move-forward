import { migrate } from './migrations';
import type { SaveGameV1 } from './SaveSchema';

const DB_NAME = 'machine-move-forward';
const DB_VERSION = 1;
const STORE = 'saves';

/**
 * IndexedDB-backed saves (handoff section 38).
 *
 * IndexedDB rather than localStorage: saves will eventually carry every
 * structure the player has built, which outgrows localStorage's few megabytes
 * and its synchronous, main-thread-blocking API.
 */
export class SaveManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      // A blocked open otherwise hangs forever with no diagnostic.
      request.onblocked = () => reject(new Error('IndexedDB open blocked by another open tab'));
    });

    // Do not cache a rejected promise, or one transient failure poisons every
    // later save for the rest of the session.
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });

    return this.dbPromise;
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = fn(transaction.objectStore(STORE));
      let result: T;
      let requestSucceeded = false;
      request.onsuccess = () => {
        result = request.result as T;
        requestSucceeded = true;
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      transaction.oncomplete = () => {
        if (requestSucceeded) resolve(result);
        else reject(new Error('IndexedDB transaction completed without a request result'));
      };
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  async save(slot: string, data: SaveGameV1): Promise<void> {
    await this.tx('readwrite', (store) => store.put(data, slot));
  }

  async load(slot: string): Promise<SaveGameV1 | null> {
    const raw = await this.tx<unknown>('readonly', (store) => store.get(slot));
    if (raw === undefined || raw === null) return null;
    return migrate(raw);
  }

  async delete(slot: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(slot));
  }

  async list(): Promise<string[]> {
    const keys = await this.tx<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    return keys.map(String);
  }

  /** Most recently written readable save; the final checkpoint wins exact-time ties. */
  async latestSlot(): Promise<string | null> {
    const db = await this.open();
    const records = await new Promise<readonly SaveCandidate[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      let keys: IDBValidKey[] | null = null;
      let values: unknown[] | null = null;
      keysRequest.onsuccess = () => {
        keys = keysRequest.result;
      };
      valuesRequest.onsuccess = () => {
        values = valuesRequest.result as unknown[];
      };
      const fail = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      keysRequest.onerror = () =>
        reject(keysRequest.error ?? new Error('IndexedDB request failed'));
      valuesRequest.onerror = () =>
        reject(valuesRequest.error ?? new Error('IndexedDB request failed'));
      transaction.onerror = fail;
      transaction.onabort = fail;
      transaction.oncomplete = () => {
        if (!keys || !values || keys.length !== values.length) {
          reject(new Error('IndexedDB save listing was incomplete'));
          return;
        }
        const completedValues = values;
        resolve(keys.map((key, index) => ({ slot: String(key), raw: completedValues[index] })));
      };
    });
    return selectLatestSaveSlot(records);
  }
}

interface SaveCandidate {
  slot: string;
  raw: unknown;
}

/** Pure selection seam used by SaveManager and its corruption/tie regression tests. */
export function selectLatestSaveSlot(records: readonly SaveCandidate[]): string | null {
  let latest: { slot: string; savedAt: number } | null = null;
  for (const candidate of records) {
    let save: SaveGameV1;
    try {
      save = migrate(candidate.raw);
    } catch {
      continue;
    }
    const savedAt =
      typeof save.savedAt === 'number' && Number.isFinite(save.savedAt) && save.savedAt >= 0
        ? save.savedAt
        : 0;
    if (
      !latest ||
      savedAt > latest.savedAt ||
      (savedAt === latest.savedAt && tiePriority(candidate.slot) > tiePriority(latest.slot)) ||
      (savedAt === latest.savedAt &&
        tiePriority(candidate.slot) === tiePriority(latest.slot) &&
        candidate.slot.localeCompare(latest.slot) > 0)
    )
      latest = { slot: candidate.slot, savedAt };
  }
  return latest?.slot ?? null;
}

const tiePriority = (slot: string): number =>
  slot === 'meridian-checkpoint' ? 2 : slot === 'quicksave' ? 1 : 0;
