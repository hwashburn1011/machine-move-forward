import { describe, expect, it } from 'vitest';
import { OwnedWarning } from '../../src/ui/OwnedWarning';

describe('OwnedWarning', () => {
  it('keeps a patrol warning until its owner clears it', () => {
    const warnings = new OwnedWarning();
    const token = warnings.claim('patrol', 'Patrol inbound');
    expect(warnings.state).toEqual({ text: 'Patrol inbound', owner: 'patrol' });
    expect(warnings.clear(token)).toBe(true);
    expect(warnings.state).toEqual({ text: null, owner: null });
  });

  it('invalidates an old owner token when an ordinary notice replaces it', () => {
    const warnings = new OwnedWarning();
    const token = warnings.claim('patrol', 'Patrol inbound');
    warnings.replace('Build mode unavailable');
    expect(warnings.clear(token)).toBe(false);
    expect(warnings.state).toEqual({ text: 'Build mode unavailable', owner: null });
  });

  it('rejects stale tokens when an owner name is reused', () => {
    const warnings = new OwnedWarning();
    const first = warnings.claim('patrol', 'First patrol');
    const second = warnings.claim('patrol', 'Second patrol');
    expect(first).not.toBe(second);
    expect(warnings.clear(first)).toBe(false);
    expect(warnings.state.text).toBe('Second patrol');
    expect(warnings.clear(second)).toBe(true);
  });

  it('reset invalidates delayed cleanup and does not share state', () => {
    const left = new OwnedWarning();
    const right = new OwnedWarning();
    const token = left.claim('encounter', 'Incoming');
    left.reset();
    expect(left.clear(token)).toBe(false);
    right.replace('Other panel');
    expect(left.state.text).toBeNull();
    expect(right.state.text).toBe('Other panel');
  });
});
