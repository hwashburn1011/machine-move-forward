import { describe, expect, it } from 'vitest';
import { conditionLabel } from '@/ui/MachineCondition';

describe('the condition row', () => {
  it('says nothing is wrong when nothing is', () => {
    expect(conditionLabel([])).toBe('Sound');
  });

  it('names the single hurt part rather than a percentage of everything', () => {
    // Handoff section 15 opens by forbidding a global HP bar. A row reading
    // "83%" would be one with extra steps.
    expect(conditionLabel([{ id: 'engine', fraction: 0.71 }])).toBe('Engine 71%');
  });

  it('names the worst and counts the rest', () => {
    expect(
      conditionLabel([
        { id: 'engine', fraction: 0.2 },
        { id: 'leg-front-left', fraction: 0.5 },
        { id: 'leg-rear-left', fraction: 0.9 },
      ]),
    ).toBe('Engine 20% +2');
  });

  it('says STOPPED, not 0%, when the engine is gone', () => {
    expect(conditionLabel([{ id: 'engine', fraction: 0 }])).toBe('ENGINE OUT');
  });

  it('rounds toward the bad news, so 99.6% is not reported as whole', () => {
    expect(conditionLabel([{ id: 'engine', fraction: 0.996 }])).toBe('Engine 99%');
  });
});
