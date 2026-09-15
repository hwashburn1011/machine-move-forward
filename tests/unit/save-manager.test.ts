import { describe, expect, it } from 'vitest';
import { SaveManager, selectLatestSaveSlot } from '@/save/SaveManager';

const save = (savedAt: number) => ({
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
});

function managerWithTransaction() {
  const request = { result: undefined, error: null } as unknown as IDBRequest & {
    result: unknown;
  };
  const transaction = {
    error: null,
    objectStore: () => ({ put: () => request }),
  } as unknown as IDBTransaction;
  const db = { transaction: () => transaction } as unknown as IDBDatabase;
  const manager = new SaveManager();
  (manager as unknown as { dbPromise: Promise<IDBDatabase> }).dbPromise = Promise.resolve(db);
  return { manager, request, transaction };
}
