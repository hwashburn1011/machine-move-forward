import { describe, expect, it } from 'vitest';
import {
  SCANNER_ACTIVE_SECONDS,
  SCANNER_SAFE_DELAY_SECONDS,
  ScannerSetup,
} from '@/progression/ScannerSetup';

const safe = { powered: true, alive: true, aboard: true, stable: true, encounterActive: false };

describe('ScannerSetup', () => {
  it('requires receiver, module, and an explicit safe start', () => {
    const scanner = new ScannerSetup();
    expect(scanner.start(safe)).toEqual({ ok: false, reason: 'receiver-required' });
    expect(scanner.receive()).toBe(true);
    expect(scanner.start(safe)).toEqual({ ok: false, reason: 'module-required' });
    expect(scanner.install(false)).toBe(false);
    expect(scanner.install(true)).toBe(true);
    expect(scanner.start({ ...safe, powered: false })).toEqual({
      ok: false,
      reason: 'power-required',
    });
    expect(scanner.start(safe)).toEqual({ ok: true, event: 'scan-started' });
  });

  it('pauses without losing progress and emits contact once after a safe delay', () => {
    const scanner = new ScannerSetup();
    scanner.receive();
    scanner.install(true);
    scanner.start(safe);
    scanner.update(100, safe);
    scanner.update(20, { ...safe, aboard: false });
    expect(scanner.snapshot().elapsedS).toBe(100);
    expect(scanner.update(80, safe)).toEqual([]);
    expect(scanner.snapshot().phase).toBe('contact-ready');
    expect(scanner.update(2, { ...safe, powered: false })).toEqual([]);
    expect(scanner.update(1, { ...safe, powered: false })).toEqual(['contact-ready']);
    expect(scanner.update(10, safe)).toEqual([]);
    expect(scanner.consume()).toBe(true);
    expect(scanner.consume()).toBe(false);
  });

  it('round-trips each durable intermediate state and rejects malformed saves', () => {
    const source = new ScannerSetup();
    source.receive();
    source.install(true);
    source.start(safe);
    source.update(SCANNER_ACTIVE_SECONDS / 2, safe);
    const restored = new ScannerSetup();
    restored.restore(source.toSave());
    expect(restored.snapshot()).toMatchObject(source.snapshot());
    restored.restore({ format: 1, phase: 'scanning', elapsedS: Infinity, pendingDelayS: 0 });
    expect(restored.currentPhase).toBe('awaiting-receiver');
    restored.restore(undefined, { signalProgress: 1 });
    expect(restored.currentPhase).toBe('contact-ready');
    expect(restored.snapshot().pendingDelayS).toBe(SCANNER_SAFE_DELAY_SECONDS);
    restored.restore(undefined, { currentDistance: 1_100, signalStartedAt: 0 });
    expect(restored.snapshot().elapsedS).toBe(SCANNER_ACTIVE_SECONDS / 2);
    restored.restore(undefined, { currentDistance: 1_100 });
    expect(restored.snapshot().elapsedS).toBe(0);
    restored.restore({
      format: 1,
      phase: 'contact-ready',
      elapsedS: SCANNER_ACTIVE_SECONDS,
      pendingDelayS: 0,
    });
    expect(restored.update(0.01, safe)).toEqual(['contact-ready']);
    expect(restored.consume()).toBe(true);
    restored.restore({
      format: 1,
      phase: 'scanning',
      elapsedS: SCANNER_ACTIVE_SECONDS,
      pendingDelayS: 0,
    });
    expect(restored.currentPhase).toBe('awaiting-receiver');
  });
});
