import { describe, expect, it } from 'vitest';
import { formatControlText } from '@/ui/ControlLabels';

describe('control label formatting', () => {
  it('formats complete control tokens with the active resolver', () => {
    const text = formatControlText(
      'Reel [F], refuel [E], then [B]uild.',
      (action) => ({ contextual: 'R', interact: 'Use', build: 'Build' })[action] ?? action,
    );
    expect(text).toBe('Reel [R], refuel [Use], then [Build]uild.');
  });

  it('does not alter ordinary prose or unknown bracketed text', () => {
    const text = formatControlText('The Emitter and [Unknown] remain unchanged.', () => 'X');
    expect(text).toBe('The Emitter and [Unknown] remain unchanged.');
  });

  it('formats hold prompts and inventory hints', () => {
    const text = formatControlText(
      'Hold [Hold E] to repair. Open [Tab] inventory.',
      (action) => ({ interact: 'Use', inventory: 'I' })[action] ?? action,
    );
    expect(text).toBe('Hold [Use] to repair. Open [I] inventory.');
  });
});
