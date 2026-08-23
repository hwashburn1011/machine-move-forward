import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from '@/game/GameLoop';
import { FIXED_DT, MAX_STEPS_PER_FRAME } from '@/game/constants';

function makeLoop() {
  const fixedUpdate = vi.fn();
  const render = vi.fn();
  return { loop: new GameLoop({ fixedUpdate, render }), fixedUpdate, render };
}

describe('GameLoop', () => {
  it('runs exactly one fixed step for exactly one timestep of frame time', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT);
    expect(fixedUpdate).toHaveBeenCalledTimes(1);
    expect(fixedUpdate).toHaveBeenCalledWith(FIXED_DT);
  });

  it('runs no fixed step when frame time is below one timestep', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT / 2);
    expect(fixedUpdate).not.toHaveBeenCalled();
  });

  it('accumulates sub-timestep frames until a step is due', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT * 0.6);
    loop.advance(FIXED_DT * 0.6);
    expect(fixedUpdate).toHaveBeenCalledTimes(1);
  });

  it('runs multiple steps for a long frame', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT * 3);
    expect(fixedUpdate).toHaveBeenCalledTimes(3);
  });

  it('always passes exactly FIXED_DT, never a variable delta', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT * 2.7);
    for (const call of fixedUpdate.mock.calls) expect(call[0]).toBe(FIXED_DT);
  });

  it('clamps runaway frame times to MAX_STEPS_PER_FRAME', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT * 100);
    expect(fixedUpdate).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
  });

  it('discards leftover time after clamping so it does not spiral', () => {
    const { loop, fixedUpdate } = makeLoop();
    loop.advance(FIXED_DT * 100);
    fixedUpdate.mockClear();
    loop.advance(FIXED_DT);
    expect(fixedUpdate).toHaveBeenCalledTimes(1);
  });

  it('renders exactly once per advance regardless of step count', () => {
    const { loop, render } = makeLoop();
    loop.advance(FIXED_DT * 3);
    loop.advance(FIXED_DT / 4);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('passes an interpolation alpha in [0, 1)', () => {
    const { loop, render } = makeLoop();
    loop.advance(FIXED_DT * 1.5);
    const alpha = render.mock.calls[0]?.[0] as number;
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('simulates the same total steps whether time arrives in one lump or many', () => {
    const a = makeLoop();
    const b = makeLoop();
    a.loop.advance(FIXED_DT * 4);
    for (let i = 0; i < 8; i++) b.loop.advance(FIXED_DT * 0.5);
    expect(a.fixedUpdate).toHaveBeenCalledTimes(b.fixedUpdate.mock.calls.length);
  });

  it('reports running state before start', () => {
    const { loop } = makeLoop();
    expect(loop.running).toBe(false);
    loop.stop();
    expect(loop.running).toBe(false);
  });
});
