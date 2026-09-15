/**
 * Small lifecycle guard for warnings owned by a long-running encounter.
 *
 * A token is intentionally opaque to callers.  Reusing an owner name creates a
 * new generation, so a delayed cleanup from the previous encounter cannot
 * clear the new warning.  Ordinary notices replace the owner and invalidate
 * every outstanding token.
 */
export interface WarningToken {
  readonly owner: string;
  readonly generation: number;
}

export interface WarningState {
  readonly text: string | null;
  readonly owner: string | null;
}

export class OwnedWarning {
  private generation = 0;
  private current: { token: WarningToken; text: string } | null = null;

  get state(): WarningState {
    return Object.freeze({
      text: this.current?.text ?? null,
      owner: this.current?.token.owner || null,
    });
  }

  /** Start or replace an owned warning. No expiry is scheduled. */
  claim(owner: string, text: string): WarningToken {
    if (!owner || !text) throw new Error('warning owner and text are required');
    const token = Object.freeze({ owner, generation: ++this.generation });
    this.current = { token, text };
    return token;
  }

  /** Replace an owned warning with an ordinary notice, or clear it. */
  replace(text: string | null): void {
    this.generation += 1;
    this.current = text
      ? { token: Object.freeze({ owner: '', generation: this.generation }), text }
      : null;
  }

  /** Clear only the exact currently active claim. */
  clear(token: WarningToken): boolean {
    if (!this.current || token !== this.current.token) return false;
    this.current = null;
    this.generation += 1;
    return true;
  }

  /** Invalidate all delayed callbacks and clear the warning. */
  reset(): void {
    this.generation += 1;
    this.current = null;
  }
}
