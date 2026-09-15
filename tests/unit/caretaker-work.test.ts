import { describe, expect, it } from 'vitest';
import { chooseCaretakerJob } from '@/companion/CaretakerWork';

describe('caretaker work planner', () => {
  it('prioritizes watering a reachable garden with one unit', () => {
    expect(
      chooseCaretakerJob({
        crates: [
          { id: 'crate', reachable: true, items: [{ itemId: 'water', count: 2 }], spaceByItem: {} },
        ],
        producers: [],
        gardens: [{ id: 'garden', reachable: true, water: 0 }],
      }),
    ).toEqual({
      kind: 'water-garden',
      sourceId: 'crate',
      targetId: 'garden',
      itemId: 'water',
      count: 1,
    });
  });
  it('stores finished reachable producer output and never mutates snapshots', () => {
    const input = {
      crates: [{ id: 'crate', reachable: true, items: [], spaceByItem: { greens: 2 } }],
      producers: [{ id: 'condenser', reachable: true, output: { itemId: 'greens', count: 1 } }],
      gardens: [],
    };
    expect(chooseCaretakerJob(input)).toEqual({
      kind: 'store-output',
      sourceId: 'condenser',
      targetId: 'crate',
      itemId: 'greens',
      count: 1,
    });
    expect(input.crates[0]!.items).toEqual([]);
  });
});
