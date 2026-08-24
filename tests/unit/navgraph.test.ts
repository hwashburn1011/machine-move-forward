import { describe, it, expect } from 'vitest';
import { blocksNavigation } from '@/data/build-pieces';

describe('blocksNavigation', () => {
  it('blocks on a wall', () => {
    expect(blocksNavigation('wall')).toBe(true);
  });

  it('does not block on a doorway — the opening has no collider', () => {
    expect(blocksNavigation('doorway')).toBe(false);
  });

  it('blocks on a railing, which boundsRoom does not', () => {
    expect(blocksNavigation('railing')).toBe(true);
  });

  it('does not block on an empty edge', () => {
    expect(blocksNavigation(undefined)).toBe(false);
  });
});
