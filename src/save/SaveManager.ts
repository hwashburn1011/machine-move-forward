import type { SaveGameV1 } from './SaveSchema';
import { SaveExportCodec, validateSaveForExport } from './SaveExportCodec';
import { sanitizeCampaignProfile, type CampaignProfile } from '@/game/CampaignProfile';

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
    const save = validateSaveForExport(data);
    await this.tx('readwrite', (store) => store.put(save, slot));
  }

  async listEntries(): Promise<readonly SaveEntry[]> {
    const records = await this.readRecords();
    const entries: SaveEntry[] = [];
    for (const record of records) {
      try {
        const save = validateSaveForExport(record.raw);
        const system = record.slot === 'quicksave' || record.slot === 'meridian-checkpoint';
        const name =
          typeof save.saveName === 'string' && save.saveName.trim()
            ? save.saveName.trim()
            : system
              ? record.slot === 'quicksave'
                ? 'Quick save'
                : 'Meridian checkpoint'
              : 'Unnamed campaign';
        entries.push(
          Object.freeze({
            slot: record.slot,
            name,
            savedAt: save.savedAt,
            seed: save.seed,
            profile: sanitizeCampaignProfile(save.profile),
            distanceTraveled: save.distanceTraveled,
            chapterLabel: chapterLabel(save),
            system,
          }),
        );
      } catch {
        /* corrupt rows are not selectable */
      }
    }
    entries.sort(
      (a, b) =>
        b.savedAt - a.savedAt ||
        tiePriority(b.slot) - tiePriority(a.slot) ||
        a.slot.localeCompare(b.slot),
    );
    return Object.freeze(entries);
  }

  async createSnapshot(name: string, data: SaveGameV1): Promise<string> {
    const save = validateSaveForExport(data);
    const requestedName = SaveExportCodec.decode(SaveExportCodec.encode(name, save)).name;
    return this.writeSnapshot(requestedName, save);
  }

  async preserveQuicksave(name: string): Promise<string | null> {
    const save = await this.load('quicksave');
    if (!save) return null;
    return this.createSnapshot(name, save);
  }

  async preserveContinue(name: string): Promise<string | null> {
    const source = await this.latestSlot();
    if (!source) return null;
    const save = await this.load(source);
    return save ? this.createSnapshot(name, save) : null;
  }

  async exportSlot(slot: string): Promise<string> {
    const save = await this.load(slot);
    if (!save) throw new Error('Save slot not found');
    const row = (await this.listEntries()).find((entry) => entry.slot === slot);
    return SaveExportCodec.encode(row?.name ?? save.saveName ?? 'Unnamed campaign', save);
  }

  async importNew(text: string): Promise<string> {
    const decoded = SaveExportCodec.decode(text);
    return this.createSnapshot(decoded.name, decoded.save);
  }

  private async writeSnapshot(name: string, source: SaveGameV1): Promise<string> {
    const db = await this.open();
    const save = structuredClone(source);
    return new Promise<string>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const read = store.getAll();
      let write: IDBRequest | null = null;
      let writeSucceeded = false;
      let slot = '';
      read.onsuccess = () => {
        try {
          const used = new Set<string>();
          for (const raw of read.result as unknown[]) {
            try {
              const existing = validateSaveForExport(raw);
              if (existing.saveName) used.add(existing.saveName.trim());
            } catch {
              /* corrupt rows do not reserve a name */
            }
          }
          let cleanName = name;
          let index = 2;
          while (used.has(cleanName)) {
            const suffix = ` (${index++})`;
            cleanName = `${name.slice(0, Math.max(1, 80 - suffix.length)).trimEnd()}${suffix}`;
          }
          save.saveName = cleanName;
          slot = `campaign:${newUuid()}`;
          write = store.add(save, slot);
          write.onsuccess = () => {
            writeSucceeded = true;
          };
          write.onerror = () => reject(write?.error ?? new Error('Snapshot write failed'));
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
      read.onerror = () => reject(read.error ?? new Error('Snapshot listing failed'));
      transaction.oncomplete = () =>
        write && writeSucceeded
          ? resolve(slot)
          : reject(new Error('Snapshot transaction incomplete'));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Snapshot transaction failed'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Snapshot transaction aborted'));
    });
  }

  async load(slot: string): Promise<SaveGameV1 | null> {
    const raw = await this.tx<unknown>('readonly', (store) => store.get(slot));
    if (raw === undefined || raw === null) return null;
    return validateSaveForExport(raw);
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
    return selectLatestSaveSlot(await this.readRecords());
  }

  private async readRecords(): Promise<readonly SaveCandidate[]> {
    const db = await this.open();
    return new Promise<readonly SaveCandidate[]>((resolve, reject) => {
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
  }
}

export interface SaveEntry {
  slot: string;
  name: string;
  savedAt: number;
  seed: string;
  profile: CampaignProfile;
  distanceTraveled: number;
  chapterLabel: string;
  system: boolean;
}

function newUuid(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID) return randomUUID.call(globalThis.crypto);
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function chapterLabel(save: SaveGameV1): string {
  const story = save.world.story as unknown as Record<string, unknown> | undefined;
  const ending = story?.ending as Record<string, unknown> | undefined;
  if (ending?.phase === 'complete') return 'Meridian ending complete';
  if (story?.chapterComplete === true) return 'Chapter One complete';
  return story ? 'Expedition in progress' : 'Opening journey';
}

interface SaveCandidate {
  slot: string;
  raw: unknown;
}

/** Pure selection seam used by SaveManager and its corruption/tie regression tests. */
export function selectLatestSaveSlot(records: readonly SaveCandidate[]): string | null {
  let latest: { slot: string; savedAt: number } | null = null;
  for (const candidate of records) {
    if (candidate.slot.startsWith('campaign:')) continue;
    let save: SaveGameV1;
    try {
      save = validateSaveForExport(candidate.raw);
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
