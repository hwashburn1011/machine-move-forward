/**
 * Anything a shot can hurt.
 *
 * One union rather than three parallel systems, because everything that deals
 * damage should route through one `computeDamage` and one armour term. The
 * `kind` is what tells the hit handler which subsystem owns the target; it is
 * NOT a hint, and the guard checks it exhaustively — colliders carry arbitrary
 * `userData`, so a guard that merely sniffed for `takeDamage` would happily
 * hand a bullet to whatever a later milestone parks there.
 */
export type DamageableKind = 'enemy' | 'structure' | 'subsystem';

export interface Damageable {
  kind: DamageableKind;
  id: string;
  armor: number;
  takeDamage(amount: number): void;
}

const KINDS: readonly string[] = ['enemy', 'structure', 'subsystem'];

export function isDamageable(v: unknown): v is Damageable {
  if (typeof v !== 'object' || v === null) return false;
  const candidate = v as Partial<Damageable>;
  return (
    typeof candidate.kind === 'string' &&
    KINDS.includes(candidate.kind) &&
    typeof candidate.takeDamage === 'function'
  );
}
