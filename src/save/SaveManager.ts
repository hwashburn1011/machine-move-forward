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
      request.onblocked = () =>
        reject(new Error('IndexedDB open blocked by another open tab'));
    });

    // Do not cache a rejected promise, or one transient failure poisons every
    // later save for the rest of the session.
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });

    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = fn(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
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
}
