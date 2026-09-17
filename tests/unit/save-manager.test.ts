import { describe, expect, it } from 'vitest';
import { SaveExportCodec } from '@/save/SaveExportCodec';
import { SaveManager, selectLatestSaveSlot } from '@/save/SaveManager';
import type { SaveGameV1 } from '@/save/SaveSchema';
import { ThreatDirector } from '@/enemies/ThreatDirector';

const save = (savedAt: number): SaveGameV1 => ({
  version: 1,
  savedAt,
  seed: 'test',
  distanceTraveled: 0,
  player: {
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    inventory: [],
    equipment: { currentWeapon: '', weapons: [] },
  },
  machine: { structures: [], devices: [], fuel: 1, coreHealth: 100, navigationTier: 0 },
  progression: { unlocks: [] },
  world: { chunkIndex: 0, threatDirector: null },
});

describe('SaveManager completion and latest-save ordering', () => {
  it('chooses the newest readable save and the Meridian checkpoint on exact ties', () => {
    expect(
      selectLatestSaveSlot([
        { slot: 'quicksave', raw: save(20) },
        { slot: 'meridian-checkpoint', raw: save(20) },
        { slot: 'older', raw: save(10) },
        { slot: 'corrupt', raw: { version: 99, savedAt: 100 } },
      ]),
    ).toBe('meridian-checkpoint');
    expect(
      selectLatestSaveSlot([{ slot: 'legacy', raw: { ...save(1), savedAt: undefined } }]),
    ).toBe('legacy');
    expect(selectLatestSaveSlot([{ slot: 'campaign:uuid', raw: save(999) }])).toBe(null);
  });

  it('falls back past a newer v1 row that migration accepts but restore validation rejects', () => {
    const corrupt = save(20);
    (corrupt.progression as unknown as { firstRun: unknown }).firstRun = {
      completed: 7,
      counters: {},
    };
    expect(
      selectLatestSaveSlot([
        { slot: 'quicksave', raw: corrupt },
        { slot: 'meridian-checkpoint', raw: save(10) },
      ]),
    ).toBe('meridian-checkpoint');
  });

  it('selects and stores a fresh system save with inactive Infinity deadlines', async () => {
    const current = save(30);
    current.world.threatDirector = new ThreatDirector('fresh-system-save').toSave();
    expect(
      selectLatestSaveSlot([
        { slot: 'meridian-checkpoint', raw: save(20) },
        { slot: 'quicksave', raw: current },
      ]),
    ).toBe('quicksave');

    const { manager, request, transaction, written } = managerWithTransaction();
    const pending = manager.save('quicksave', current);
    await Promise.resolve();
    expect(written()?.world.threatDirector?.sanctuaryReleaseAt).toBeNull();
    request.onsuccess?.({} as Event);
    transaction.oncomplete?.({} as Event);
    await expect(pending).resolves.toBeUndefined();
  });

  it('preserves the latest readable system slot without mutating its source', async () => {
    const manager = new SaveManager();
    const source = save(11);
    let captured: SaveGameV1 | null = null;
    manager.latestSlot = async () => 'quicksave';
    manager.load = async () => structuredClone(source);
    manager.createSnapshot = async (name, data) => {
      expect(name).toBe('Before new game');
      captured = structuredClone(data);
      data.player.position.x = 50;
      return 'campaign:preserved';
    };
    await expect(manager.preserveContinue('Before new game')).resolves.toBe('campaign:preserved');
    expect(captured).toEqual(source);
    expect(source.player.position.x).toBe(0);
  });

  it('orders library rows by timestamp with deterministic system-slot ties', async () => {
    const manager = new SaveManager();
    const snapshot = { ...save(30), saveName: 'Newest' };
    (manager as unknown as { readRecords: () => Promise<unknown[]> }).readRecords = async () => [
      { slot: 'campaign:z', raw: snapshot },
      { slot: 'quicksave', raw: save(20) },
      { slot: 'campaign:a', raw: { ...save(20), saveName: 'Same time' } },
      { slot: 'meridian-checkpoint', raw: save(20) },
    ];
    expect((await manager.listEntries()).map((entry) => entry.slot)).toEqual([
      'campaign:z',
      'meridian-checkpoint',
      'quicksave',
      'campaign:a',
    ]);
  });

  it('resolves a write only after its transaction completes', async () => {
    const { manager, request, transaction } = managerWithTransaction();
    let settled = false;
    const pending = manager.save('slot', save(1) as never).then(() => {
      settled = true;
    });
    await Promise.resolve();
    request.result = undefined;
    request.onsuccess?.({} as Event);
    await Promise.resolve();
    expect(settled).toBe(false);
    transaction.oncomplete?.({} as Event);
    await pending;
    expect(settled).toBe(true);
  });

  it('rejects when a transaction aborts after request success', async () => {
    const { manager, request, transaction } = managerWithTransaction();
    const pending = manager.save('slot', save(1) as never);
    await Promise.resolve();
    request.onsuccess?.({} as Event);
    transaction.onabort?.({} as Event);
    await expect(pending).rejects.toThrow('aborted');
  });

  it('rejects a snapshot when its write request succeeds but the transaction aborts', async () => {
    const { manager, transactions } = snapshotHarness();
    const pending = manager.createSnapshot('Before storm', save(1));
    await flushMicrotasks();
    const tx = transactions[0]!;
    tx.read.result = [];
    tx.read.onsuccess?.({} as Event);
    expect(tx.write).toBeTruthy();
    tx.write!.onsuccess?.({} as Event);
    tx.transaction.onabort?.({} as Event);
    await expect(pending).rejects.toThrow('aborted');
  });

  it('performs zero IndexedDB transactions for a malformed import', async () => {
    let transactions = 0;
    const manager = new SaveManager();
    (manager as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise = Promise.resolve({
      transaction: () => {
        transactions++;
        throw new Error('must not write');
      },
    } as unknown as IDBDatabase);
    await expect(
      manager.importNew(
        JSON.stringify({
          format: 'machine-move-forward-save',
          formatVersion: 1,
          name: 'bad',
          save: { ...save(1), progression: { unlocks: [], firstRun: { completed: 7 } } },
        }),
      ),
    ).rejects.toThrow();
    expect(transactions).toBe(0);
  });

  it('clones the source before assigning the snapshot name and writing', async () => {
    const { manager, transactions } = snapshotHarness();
    const source = save(1);
    const pending = manager.createSnapshot('Archive', source);
    await flushMicrotasks();
    const tx = transactions[0]!;
    tx.read.result = [];
    tx.read.onsuccess?.({} as Event);
    expect(tx.added?.saveName).toBe('Archive');
    expect(source.saveName).toBeUndefined();
    tx.added!.player.position.x = 99;
    expect(source.player.position.x).toBe(0);
    tx.write!.onsuccess?.({} as Event);
    tx.transaction.oncomplete?.({} as Event);
    await expect(pending).resolves.toMatch(/^campaign:/);
  });

  it('allocates distinct names and slots for concurrent same-name snapshots', async () => {
    const { manager, transactions } = snapshotHarness();
    const first = manager.createSnapshot('Archive', save(1));
    const second = manager.createSnapshot('Archive', save(2));
    await flushMicrotasks();
    expect(transactions).toHaveLength(2);

    const one = transactions[0]!;
    one.read.result = [];
    one.read.onsuccess?.({} as Event);
    expect(one.added?.saveName).toBe('Archive');
    one.write!.onsuccess?.({} as Event);
    one.transaction.oncomplete?.({} as Event);
    const firstSlot = await first;

    const two = transactions[1]!;
    two.read.result = [structuredClone(one.added!)];
    two.read.onsuccess?.({} as Event);
    expect(two.added?.saveName).toBe('Archive (2)');
    two.write!.onsuccess?.({} as Event);
    two.transaction.oncomplete?.({} as Event);
    const secondSlot = await second;
    expect(secondSlot).not.toBe(firstSlot);
  });

  it('imports a valid export through the atomic snapshot transaction', async () => {
    const { manager, transactions } = snapshotHarness();
    const pending = manager.importNew(SaveExportCodec.encode('Imported', save(4)));
    await flushMicrotasks();
    const tx = transactions[0]!;
    tx.read.result = [];
    tx.read.onsuccess?.({} as Event);
    expect(tx.added).toMatchObject({ seed: 'test', saveName: 'Imported' });
    tx.write!.onsuccess?.({} as Event);
    tx.transaction.oncomplete?.({} as Event);
    await expect(pending).resolves.toMatch(/^campaign:/);
  });
});

function managerWithTransaction() {
  const request = { result: undefined, error: null } as unknown as IDBRequest & {
    result: unknown;
  };
  let written: SaveGameV1 | null = null;
  const transaction = {
    error: null,
    objectStore: () => ({
      put: (value: SaveGameV1) => {
        written = structuredClone(value);
        return request;
      },
    }),
  } as unknown as IDBTransaction;
  const db = { transaction: () => transaction } as unknown as IDBDatabase;
  const manager = new SaveManager();
  (manager as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise = Promise.resolve(db);
  return { manager, request, transaction, written: () => written };
}

interface SnapshotTransaction {
  transaction: IDBTransaction;
  read: IDBRequest & { result: unknown[] };
  write: IDBRequest | null;
  added: SaveGameV1 | null;
}

function snapshotHarness() {
  const transactions: SnapshotTransaction[] = [];
  const db = {
    transaction: () => {
      const read = { result: [], error: null } as unknown as IDBRequest & {
        result: unknown[];
      };
      const state = {
        transaction: null as unknown as IDBTransaction,
        read,
        write: null,
        added: null,
      } as SnapshotTransaction;
      const store = {
        getAll: () => read,
        add: (value: SaveGameV1) => {
          state.added = structuredClone(value);
          state.write = { result: undefined, error: null } as unknown as IDBRequest;
          return state.write;
        },
      } as unknown as IDBObjectStore;
      const transaction = {
        error: null,
        objectStore: () => store,
        abort: () => transaction.onabort?.({} as Event),
      } as unknown as IDBTransaction;
      state.transaction = transaction;
      transactions.push(state);
      return transaction;
    },
  } as unknown as IDBDatabase;
  const manager = new SaveManager();
  (manager as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise = Promise.resolve(db);
  return { manager, transactions };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}
