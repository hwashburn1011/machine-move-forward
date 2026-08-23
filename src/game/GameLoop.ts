import { FIXED_DT, MAX_STEPS_PER_FRAME } from './constants';

export interface LoopCallbacks {
  fixedUpdate(dt: number): void;
  render(alpha: number): void;
}

/**
 * Fixed-timestep loop with interpolated rendering (handoff section 46).
 *
 * `advance()` holds all the logic and takes frame time as an argument, which
 * keeps the loop fully testable in node. `start()` is a thin rAF wrapper.
 */
export class GameLoop {
  private accumulator = 0;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(private readonly cb: LoopCallbacks) {}

  get running(): boolean {
    return this.rafId !== null;
  }

  advance(frameSeconds: number): void {
    this.accumulator += frameSeconds;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.cb.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }

    // Spiral-of-death guard: hitting the cap means time is still banked, and
    // carrying it forward only makes the next frame worse. Drop it.
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.cb.render(this.accumulator / FIXED_DT);
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();

    const tick = (now: number) => {
      // Cap raw frame time so returning from an alt-tab does not deliver a
      // multi-second delta.
      const frameSeconds = Math.min((now - this.lastTime) / 1000, 0.25);
      this.lastTime = now;
      this.advance(frameSeconds);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
