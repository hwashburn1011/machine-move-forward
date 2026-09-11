import { hashSeed, Rng } from '@/core/math/Random';

export const MECH_BOARDERS = ['revenant', 'warden', 'bastion', 'sovereign'] as const;
export type MechBoarder = (typeof MECH_BOARDERS)[number];
export interface RadioRaidSave {
  wave: number;
  remaining: number;
}
export interface RadioRaidPlan {
  side: 'port' | 'starboard';
  crew: readonly [MechBoarder, MechBoarder];
}

/** One ship at a time, with a real-time breather even when the walker is stopped. */
export class RadioRaids {
  private wave = 0;
  private remaining = 24;
  private inFlight = false;

  update(dt: number, safe: boolean, seed: number | string): RadioRaidPlan | null {
    if (this.inFlight || !safe) return null;
    this.remaining = Math.max(0, this.remaining - (Number.isFinite(dt) ? Math.max(0, dt) : 0));
    return this.remaining === 0 ? this.plan(seed) : null;
  }

  private plan(seed: number | string): RadioRaidPlan {
    // A shuffled four-model bag per two waves makes every mech appear without
    // repeating the same pair. Reloading cannot reroll an imminent encounter.
    const rng = new Rng(hashSeed(seed, 'radio-raids', Math.floor(this.wave / 2)));
    const bag = [...MECH_BOARDERS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    const start = (this.wave % 2) * 2;
    const sideRng = new Rng(hashSeed(seed, 'radio-side', this.wave));
    return {
      side: sideRng.next() < 0.5 ? 'port' : 'starboard',
      crew: [bag[start]!, bag[start + 1]!],
    };
  }

  started(): void {
    this.inFlight = true;
  }
  finished(seed: number | string): void {
    if (!this.inFlight) return;
    this.inFlight = false;
    this.wave++;
    this.remaining = new Rng(hashSeed(seed, 'radio-rest', this.wave)).range(75, 115);
  }
  toSave(): RadioRaidSave {
    return { wave: this.wave, remaining: this.remaining };
  }
  restore(save?: Partial<RadioRaidSave>): void {
    this.inFlight = false;
    this.wave = Number.isSafeInteger(save?.wave) && save!.wave! >= 0 ? save!.wave! : 0;
    this.remaining =
      typeof save?.remaining === 'number' && Number.isFinite(save.remaining)
        ? Math.min(115, Math.max(0, save.remaining))
        : 24;
  }
}

export const SIGNAL_BATTLE_SECONDS = 17;
export function signalBattleCaption(seconds: number): string {
  if (seconds < 4) return 'SIGNAL 100%  /  CROSSFIRE · STARBOARD BOW';
  if (seconds < 8) return 'HUMAN CONVOY: “Taking fire! They’re coming alongside!”';
  if (seconds < 12) return 'REVENANT  /  CONTACT ACQUIRED';
  return 'They saw us. Keep moving. Watch the rails.';
}
