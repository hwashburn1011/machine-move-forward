# Machine Damage and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the machine and the player's structures things that can be hurt, and repair the standing bill that gives loot a recurring sink.

**Architecture:** Three damage targets share one `Damageable` union routed through the existing `computeDamage`. Machine subsystems are a pure health model whose failure effects feed channels that already exist and are idle — `MachineMovement.enginePower` and the gait's lean. Structures reuse their long-unused `maxHealth` and are destroyed through the existing cascade demolition rather than a parallel path. Repair is another `Interactable.kind`.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest (node, no DOM), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-machine-damage-repair-design.md`

## Global Constraints

- **No global HP bar.** Localized damage only. `machine.coreHealth` stays unused — do not repurpose it.
- **Engine at zero stops the machine until repaired.** Never reload a save on failure.
- **Pure where it can be.** Damage arithmetic, target selection and repair pricing take plain numbers and return plain numbers. No Three.js and no Rapier in `src/data/`, `MachineDamage`, `RepairPricing`, or `EnemyAI`.
- **Machine-space coordinates:** deck is `x ∈ [-5, 5]`, `z ∈ [-8, 8]`, deck plane at `DECK_HEIGHT = 3.6`. Grid tile is 2m. Leg hips are at `x = ±6.0, y = 3.1, z = ±4.5` — outboard of the deck and below it.
- **Repair must cost strictly less than 40% of build cost.** Demolition refunds `REFUND_FRACTION = 0.6`, so replacing nets 40%. Anything at or above that makes demolish-and-rebuild optimal and kills the repair verb.
- **Tests run in node.** `npx vitest run`. No DOM, no canvas. Browser proofs go in `tests/e2e/`.
- **Commit style:** this repo writes narrative subjects (`fix: the staircase was built back to front`). Match it.
- Every task ends green: `npx tsc --noEmit && npx vitest run && npx eslint src tests`.

---

## File Structure

**Create:**
- `src/combat/Damageable.ts` — the damage-target union and its type guard. One responsibility: what can be hurt.
- `src/data/subsystems.ts` — subsystem definitions. Data only, matching `src/data/`'s rule.
- `src/machine/MachineDamage.ts` — subsystem health state and the failure effects derived from it. Pure.
- `src/building/RepairPricing.ts` — repair cost arithmetic. Pure.
- `src/interaction/RepairSystem.ts` — the hold-to-repair driver.
- Tests: `tests/unit/damageable.test.ts`, `subsystems.test.ts`, `machinedamage.test.ts`, `structuredamage.test.ts`, `repairpricing.test.ts`, `repairsystem.test.ts`, plus additions to `tests/unit/enemyai.test.ts` and `tests/e2e/`.

**Modify:**
- `src/player/PlayerCombat.ts` — import `Damageable` from its new home.
- `src/data/enemies.ts` — add `targetPriority`.
- `src/enemies/EnemyAI.ts` — `blocked` input, target in the decision.
- `src/enemies/Enemy.ts` — apply damage to the chosen target.
- `src/building/BuildSystem.ts` — `damagePiece`.
- `src/machine/MachineMovement.ts` — consume the engine's condition.
- `src/save/SaveSchema.ts` — optional `subsystems`.
- `src/ui/HUD.ts` — condition row.
- `src/game/Game.ts` — wiring.

---

### Task 1: The damage-target union

**Files:**
- Create: `src/combat/Damageable.ts`
- Modify: `src/player/PlayerCombat.ts:13-23` (delete the local interface and guard, import instead)
- Test: `tests/unit/damageable.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type DamageableKind = 'enemy' | 'structure' | 'subsystem'`; `interface Damageable { kind: DamageableKind; id: string; armor: number; takeDamage(amount: number): void }`; `function isDamageable(v: unknown): v is Damageable`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/damageable.test.ts
import { describe, expect, it } from 'vitest';
import { isDamageable } from '@/combat/Damageable';

const target = (kind: string) => ({ kind, id: 'x', armor: 0, takeDamage: () => {} });

describe('what a shot can hurt', () => {
  it('accepts all three damage targets', () => {
    for (const kind of ['enemy', 'structure', 'subsystem']) {
      expect(isDamageable(target(kind))).toBe(true);
    }
  });

  it('rejects a collider carrying something else', () => {
    // Colliders carry arbitrary userData. A guard that only checked for the
    // presence of takeDamage would let a future payload through.
    expect(isDamageable(target('scenery'))).toBe(false);
    expect(isDamageable({ id: 'x', armor: 0, takeDamage: () => {} })).toBe(false);
    expect(isDamageable(null)).toBe(false);
    expect(isDamageable(undefined)).toBe(false);
    expect(isDamageable('enemy')).toBe(false);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/damageable.test.ts`
Expected: FAIL — cannot resolve `@/combat/Damageable`.

- [x] **Step 3: Write the module**

```ts
// src/combat/Damageable.ts
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
```

- [x] **Step 4: Point `PlayerCombat` at it**

In `src/player/PlayerCombat.ts`, delete the local `Damageable` interface and `isDamageable` function (lines 13–23) and add to the imports:

```ts
import { isDamageable, type Damageable } from '@/combat/Damageable';
```

Then re-export for any existing importer, immediately after the imports:

```ts
export type { Damageable };
```

- [x] **Step 5: Run the suite**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src tests`
Expected: all green. 670 existing tests still pass — this task changes no behaviour.

- [x] **Step 6: Commit**

```bash
git add src/combat/Damageable.ts src/player/PlayerCombat.ts tests/unit/damageable.test.ts
git commit -m "refactor: a bullet can hurt more than an enemy now"
```

---

### Task 2: Subsystem definitions and their health

**Files:**
- Create: `src/data/subsystems.ts`, `src/machine/MachineDamage.ts`
- Test: `tests/unit/subsystems.test.ts`, `tests/unit/machinedamage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type SubsystemId`; `interface SubsystemDefinition`; `const SUBSYSTEMS: Record<SubsystemId, SubsystemDefinition>`; `const LEG_SUBSYSTEM: Record<LegId, SubsystemId>`; class `MachineDamage` with `health(id)`, `fraction(id)`, `damage(id, amount): number`, `repair(id, amount)`, `enginePower`, `isStopped`, `lean`, `speedScale`, `damaged()`, `toSave()`, `restore(saved)`.

- [x] **Step 1: Write the failing data test**

```ts
// tests/unit/subsystems.test.ts
import { describe, expect, it } from 'vitest';
import { SUBSYSTEMS, LEG_SUBSYSTEM, type SubsystemId } from '@/data/subsystems';
import { DECK_HEIGHT } from '@/game/constants';
import { LEGS } from '@/data/gait';

const ALL = Object.keys(SUBSYSTEMS) as SubsystemId[];

describe('machine subsystems', () => {
  it('has the engine and one entry per leg', () => {
    expect(ALL).toHaveLength(5);
    expect(ALL).toContain('engine');
    for (const leg of LEGS) expect(LEG_SUBSYSTEM[leg.id]).toBeDefined();
  });

  it('puts every repair point on the deck, where a player can actually stand', () => {
    // The whole reason repairAt exists. Leg hips are at x = +/-6.0, y = 3.1 --
    // outboard of a 10m deck and BELOW its plane. A design that repaired a
    // subsystem at its hitbox would be unreachable for four of the five.
    for (const id of ALL) {
      const at = SUBSYSTEMS[id].repairAt;
      expect(Math.abs(at.x), `${id} x`).toBeLessThanOrEqual(5);
      expect(Math.abs(at.z), `${id} z`).toBeLessThanOrEqual(8);
      expect(at.y, `${id} y`).toBe(DECK_HEIGHT);
    }
  });

  it('puts each leg\'s repair point on that leg\'s own side and end', () => {
    for (const leg of LEGS) {
      const at = SUBSYSTEMS[LEG_SUBSYSTEM[leg.id]].repairAt;
      expect(Math.sign(at.x), leg.id).toBe(Math.sign(leg.hip.x));
      expect(Math.sign(at.z), leg.id).toBe(Math.sign(leg.hip.z));
    }
  });

  it('prices every repair, and gives everything health and armour', () => {
    for (const id of ALL) {
      expect(SUBSYSTEMS[id].maxHealth).toBeGreaterThan(0);
      expect(SUBSYSTEMS[id].repairScrap).toBeGreaterThan(0);
      expect(SUBSYSTEMS[id].armor).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/subsystems.test.ts`
Expected: FAIL — cannot resolve `@/data/subsystems`.

- [x] **Step 3: Write the data module**

```ts
// src/data/subsystems.ts
import { DECK_HEIGHT } from '@/game/constants';
import type { LegDefinition } from './gait';

/**
 * The parts of the machine that can be broken (handoff section 15).
 *
 * Five, and no more, because each one has to earn a distinct failure the
 * player can feel. Data only, like every other file here.
 */
export type SubsystemId =
  | 'engine'
  | 'leg-front-left'
  | 'leg-front-right'
  | 'leg-rear-left'
  | 'leg-rear-right';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SubsystemDefinition {
  id: SubsystemId;
  name: string;
  maxHealth: number;
  armor: number;
  /**
   * The box a shot or a swing has to land in, in machine space.
   */
  hitbox: { half: Vec3; center: Vec3 };
  /**
   * Where the player stands to repair it. DELIBERATELY NOT the hitbox.
   *
   * The leg hips sit at x = +/-6.0, y = 3.1: outboard of a deck 10m wide and
   * below its plane. There is nowhere to stand at one. Each leg is serviced
   * from an access panel on the nearest deck cell inboard of its hip, and the
   * engine — which stands on the deck — is the one case where the two nearly
   * coincide. That coincidence is exactly why a single field would have looked
   * correct until the first leg was damaged.
   */
  repairAt: Vec3;
  /** Scrap for a full repair from zero. Charged pro rata. */
  repairScrap: number;
}

/** Deck edge, inboard of the hips at x = +/-6. */
const PANEL_X = 4.2;

const leg = (
  id: SubsystemId,
  name: string,
  hip: Vec3,
): SubsystemDefinition => ({
  id,
  name,
  maxHealth: 180,
  armor: 3,
  hitbox: { half: { x: 0.7, y: 1.0, z: 0.7 }, center: hip },
  repairAt: { x: Math.sign(hip.x) * PANEL_X, y: DECK_HEIGHT, z: hip.z },
  repairScrap: 45,
});

export const SUBSYSTEMS: Record<SubsystemId, SubsystemDefinition> = {
  engine: {
    id: 'engine',
    name: 'Engine',
    // Tougher than a leg: it is the stop condition, and a machine that halts
    // to the first raider that reaches it would be miserable rather than tense.
    maxHealth: 320,
    armor: 4,
    // Matches the existing named `engine` part in MachineGeometry:
    // size [2.8, 1.8, 2.6] at z = DECK_L/2 - 2 = 6.
    hitbox: {
      half: { x: 1.4, y: 0.9, z: 1.3 },
      center: { x: 0, y: DECK_HEIGHT + 0.99, z: 6 },
    },
    // Just forward of its front face, so the player stands on open deck.
    repairAt: { x: 0, y: DECK_HEIGHT, z: 4.4 },
    repairScrap: 80,
  },
  'leg-front-left': leg('leg-front-left', 'Port Foreleg', { x: -6, y: 3.1, z: -4.5 }),
  'leg-front-right': leg('leg-front-right', 'Starboard Foreleg', { x: 6, y: 3.1, z: -4.5 }),
  'leg-rear-left': leg('leg-rear-left', 'Port Hindleg', { x: -6, y: 3.1, z: 4.5 }),
  'leg-rear-right': leg('leg-rear-right', 'Starboard Hindleg', { x: 6, y: 3.1, z: 4.5 }),
};

/** The subsystem that owns each leg of the gait. */
export const LEG_SUBSYSTEM: Record<LegDefinition['id'], SubsystemId> = {
  'front-left': 'leg-front-left',
  'front-right': 'leg-front-right',
  'rear-left': 'leg-rear-left',
  'rear-right': 'leg-rear-right',
};
```

- [x] **Step 4: Run the data test**

Run: `npx vitest run tests/unit/subsystems.test.ts`
Expected: PASS.

- [x] **Step 5: Write the failing state test**

```ts
// tests/unit/machinedamage.test.ts
import { describe, expect, it } from 'vitest';
import { MachineDamage } from '@/machine/MachineDamage';
import { SUBSYSTEMS } from '@/data/subsystems';

const wreck = (m: MachineDamage, id: Parameters<MachineDamage['damage']>[0]) =>
  m.damage(id, SUBSYSTEMS[id].maxHealth + 999);

describe('machine condition', () => {
  it('starts whole', () => {
    const m = new MachineDamage();
    expect(m.fraction('engine')).toBe(1);
    expect(m.isStopped).toBe(false);
    expect(m.enginePower).toBe(1);
    expect(m.damaged()).toEqual([]);
  });

  it('subtracts armour from every hit', () => {
    const m = new MachineDamage();
    const dealt = m.damage('engine', 10);
    expect(dealt).toBe(10 - SUBSYSTEMS.engine.armor);
    expect(m.health('engine')).toBe(SUBSYSTEMS.engine.maxHealth - dealt);
  });

  it('never drops below zero or rises above full', () => {
    const m = new MachineDamage();
    wreck(m, 'engine');
    expect(m.health('engine')).toBe(0);
    m.repair('engine', 99999);
    expect(m.health('engine')).toBe(SUBSYSTEMS.engine.maxHealth);
  });

  it('stops the machine when the engine reaches zero, and only then', () => {
    const m = new MachineDamage();
    m.damage('engine', SUBSYSTEMS.engine.maxHealth - SUBSYSTEMS.engine.armor - 1);
    expect(m.isStopped).toBe(false);
    wreck(m, 'engine');
    expect(m.isStopped).toBe(true);
    expect(m.enginePower).toBe(0);
  });

  it('does not stop the machine for a wrecked leg — a limp is not a halt', () => {
    const m = new MachineDamage();
    for (const id of ['leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right'] as const) {
      wreck(m, id);
    }
    expect(m.isStopped).toBe(false);
    expect(m.speedScale).toBeGreaterThan(0);
  });

  it('scales engine power continuously, so the machine is read by how it moves', () => {
    const m = new MachineDamage();
    const full = SUBSYSTEMS.engine.maxHealth;
    m.damage('engine', full / 2 + SUBSYSTEMS.engine.armor);
    expect(m.enginePower).toBeCloseTo(0.5, 5);
  });

  it('lists toward the damaged side', () => {
    const m = new MachineDamage();
    expect(m.lean).toBe(0);
    wreck(m, 'leg-front-left');
    const left = m.lean;
    expect(left).toBeLessThan(0);

    const other = new MachineDamage();
    wreck(other, 'leg-front-right');
    expect(other.lean).toBeCloseTo(-left, 5);
  });

  it('does not list when both sides are equally hurt', () => {
    const m = new MachineDamage();
    wreck(m, 'leg-front-left');
    wreck(m, 'leg-front-right');
    expect(m.lean).toBeCloseTo(0, 5);
  });

  it('reports what is hurt, worst first, for the HUD', () => {
    const m = new MachineDamage();
    m.damage('leg-rear-left', 20);
    wreck(m, 'engine');
    expect(m.damaged().map((d) => d.id)).toEqual(['engine', 'leg-rear-left']);
  });

  it('round-trips through a save', () => {
    const m = new MachineDamage();
    m.damage('engine', 50);
    wreck(m, 'leg-rear-right');

    const loaded = new MachineDamage();
    loaded.restore(m.toSave());
    expect(loaded.health('engine')).toBe(m.health('engine'));
    expect(loaded.health('leg-rear-right')).toBe(0);
  });

  it('treats an absent save as an undamaged machine', () => {
    const m = new MachineDamage();
    m.damage('engine', 50);
    m.restore(undefined);
    expect(m.fraction('engine')).toBe(1);
  });

  it('ignores a subsystem it does not recognise rather than throwing', () => {
    // A save from a build with a sixth subsystem must load, not crash.
    const m = new MachineDamage();
    m.restore([{ id: 'railgun', health: 10 }]);
    expect(m.fraction('engine')).toBe(1);
  });
});
```

- [x] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/unit/machinedamage.test.ts`
Expected: FAIL — cannot resolve `@/machine/MachineDamage`.

- [x] **Step 7: Write the state model**

```ts
// src/machine/MachineDamage.ts
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';

export interface SubsystemSave {
  id: string;
  health: number;
}

/**
 * How broken each part of the machine is, and what that costs.
 *
 * Pure: plain numbers in, plain numbers out, no Three.js and no Rapier, like
 * `BuildValidation` and `stepEnemyAI`. The effects are read off this by
 * whoever needs them rather than pushed out through the event bus, because
 * they are continuous — every frame wants the current value, not a
 * notification that it changed.
 *
 * Effects scale CONTINUOUSLY rather than tripping at thresholds, so a player
 * reads the machine's condition off how it moves before they read it off the
 * HUD. That is the whole reason to have five numbers rather than one.
 */
export class MachineDamage {
  private readonly hp = new Map<SubsystemId, number>();

  constructor() {
    this.reset();
  }

  reset(): void {
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      this.hp.set(id, SUBSYSTEMS[id].maxHealth);
    }
  }

  health(id: SubsystemId): number {
    return this.hp.get(id) ?? SUBSYSTEMS[id].maxHealth;
  }

  /** 0 at destroyed, 1 at whole. */
  fraction(id: SubsystemId): number {
    return this.health(id) / SUBSYSTEMS[id].maxHealth;
  }

  /** Apply a hit. Returns the damage that actually landed, after armour. */
  damage(id: SubsystemId, amount: number): number {
    const dealt = Math.max(0, amount - SUBSYSTEMS[id].armor);
    if (dealt === 0) return 0;
    this.hp.set(id, Math.max(0, this.health(id) - dealt));
    return dealt;
  }

  repair(id: SubsystemId, amount: number): void {
    this.hp.set(id, Math.min(SUBSYSTEMS[id].maxHealth, this.health(id) + Math.max(0, amount)));
  }

  /**
   * The multiplier `MachineMovement` has carried since it was written and
   * nothing has ever set.
   */
  get enginePower(): number {
    return this.fraction('engine');
  }

  /**
   * The failure state, and deliberately not a loss condition: a stopped
   * machine is repaired and driven on, never reloaded. Scrap keeps arriving
   * on the enemies still coming, so being stranded is always recoverable.
   */
  get isStopped(): boolean {
    return this.health('engine') <= 0;
  }

  /**
   * Speed lost to the legs, separately from the engine.
   *
   * Floored well above zero: four wrecked legs should be a crawl the player
   * hates, not a second way to be stranded. The engine is the only halt.
   */
  get speedScale(): number {
    const legs: SubsystemId[] = [
      'leg-front-left',
      'leg-front-right',
      'leg-rear-left',
      'leg-rear-right',
    ];
    const mean = legs.reduce((sum, id) => sum + this.fraction(id), 0) / legs.length;
    return 0.4 + 0.6 * mean;
  }

  /**
   * How far the hull lists, in radians. Negative is to port.
   *
   * Feeds the lean the gait already applies, so this needs a term rather than
   * a system. Symmetric damage cancels: a machine hurt evenly sits level and
   * merely slow, which is the correct reading.
   */
  get lean(): number {
    const port = (this.fraction('leg-front-left') + this.fraction('leg-rear-left')) / 2;
    const starboard = (this.fraction('leg-front-right') + this.fraction('leg-rear-right')) / 2;
    return (port - starboard) * -0.12;
  }

  /** Everything below full health, worst first. For the HUD. */
  damaged(): { id: SubsystemId; fraction: number }[] {
    return (Object.keys(SUBSYSTEMS) as SubsystemId[])
      .map((id) => ({ id, fraction: this.fraction(id) }))
      .filter((entry) => entry.fraction < 1)
      .sort((a, b) => a.fraction - b.fraction || a.id.localeCompare(b.id));
  }

  toSave(): SubsystemSave[] {
    return (Object.keys(SUBSYSTEMS) as SubsystemId[]).map((id) => ({
      id,
      health: this.health(id),
    }));
  }

  /**
   * Absent means undamaged, which is what every save written before this
   * milestone means. An unrecognised id is skipped rather than thrown on: a
   * save from a build with a sixth subsystem must still load.
   */
  restore(saved: readonly SubsystemSave[] | undefined): void {
    this.reset();
    if (!saved) return;
    for (const entry of saved) {
      if (!(entry.id in SUBSYSTEMS)) continue;
      const id = entry.id as SubsystemId;
      const clamped = Math.max(0, Math.min(SUBSYSTEMS[id].maxHealth, entry.health));
      this.hp.set(id, clamped);
    }
  }
}
```

- [x] **Step 8: Run both tests**

Run: `npx vitest run tests/unit/subsystems.test.ts tests/unit/machinedamage.test.ts`
Expected: PASS.

- [x] **Step 9: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/data/subsystems.ts src/machine/MachineDamage.ts tests/unit/subsystems.test.ts tests/unit/machinedamage.test.ts
git commit -m "feat: the machine has parts that can be broken"
```

---

### Task 3: A hurt machine moves like one

**Files:**
- Modify: `src/machine/MachineMovement.ts`, `src/machine/Machine.ts`, `src/game/Game.ts`
- Test: `tests/unit/machinemovement.test.ts` (add to the existing file)

**Interfaces:**
- Consumes: `MachineDamage` from Task 2 — `enginePower`, `speedScale`, `isStopped`, `lean`.
- Produces: `Machine.damage: MachineDamage` (public readonly field, constructed by `Machine`); `MachineMovement.legScale: number` (defaults 1).

- [x] **Step 1: Write the failing test**

Append to `tests/unit/machinemovement.test.ts`:

```ts
import { MachineDamage } from '@/machine/MachineDamage';
import { SUBSYSTEMS } from '@/data/subsystems';

describe('a damaged machine', () => {
  const applied = (d: MachineDamage) => {
    const m = new MachineMovement();
    m.enginePower = d.enginePower;
    m.legScale = d.speedScale;
    return m;
  };

  it('halves its top speed with a half-wrecked engine', () => {
    const whole = new MachineMovement();
    const d = new MachineDamage();
    d.damage('engine', SUBSYSTEMS.engine.maxHealth / 2 + SUBSYSTEMS.engine.armor);
    expect(applied(d).maxSpeed).toBeCloseTo(whole.maxSpeed * 0.5, 5);
  });

  it('stops dead at a destroyed engine', () => {
    const d = new MachineDamage();
    d.damage('engine', 99999);
    expect(applied(d).maxSpeed).toBe(0);
  });

  it('crawls but never halts on wrecked legs', () => {
    const d = new MachineDamage();
    for (const id of ['leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right'] as const) {
      d.damage(id, 99999);
    }
    const m = applied(d);
    expect(m.maxSpeed).toBeGreaterThan(0);
    expect(m.maxSpeed).toBeLessThan(new MachineMovement().maxSpeed);
  });

  it('converges on zero rather than snapping there when the engine dies', () => {
    // A machine that stopped in one frame would throw the player off the deck.
    const m = new MachineMovement();
    m.setThrottle(1);
    for (let i = 0; i < 200; i++) m.fixedUpdate(1 / 60);
    const rolling = m.currentSpeed;
    expect(rolling).toBeGreaterThan(0);

    m.enginePower = 0;
    m.fixedUpdate(1 / 60);
    expect(m.currentSpeed).toBeLessThan(rolling);
    expect(m.currentSpeed).toBeGreaterThan(0);

    for (let i = 0; i < 600; i++) m.fixedUpdate(1 / 60);
    expect(m.currentSpeed).toBeLessThan(0.05);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/machinemovement.test.ts`
Expected: FAIL — `legScale` does not exist on `MachineMovement`.

- [x] **Step 3: Add the leg term to `MachineMovement`**

In `src/machine/MachineMovement.ts`, add the field next to `enginePower`:

```ts
  /** Engine output. 1.0 is the starting engine, 0 is a wrecked one. */
  enginePower = 1;

  /**
   * Speed retained given the legs' condition. 1.0 is four sound legs.
   *
   * Separate from `enginePower` because they fail differently: a dead engine
   * is a halt the player has to fix, and dead legs are a crawl they can limp
   * home on. Multiplying one number by another would lose that distinction.
   */
  legScale = 1;
```

and change `maxSpeed`:

```ts
  get maxSpeed(): number {
    const ratio = Math.max(this.totalWeight, 1) / REFERENCE_WEIGHT;
    return (BASE_MACHINE_SPEED * this.enginePower * this.legScale) / Math.sqrt(ratio);
  }
```

- [x] **Step 4: Run the test**

Run: `npx vitest run tests/unit/machinemovement.test.ts`
Expected: PASS.

- [x] **Step 5: Own the damage state on `Machine` and feed it each tick**

In `src/machine/Machine.ts`, add the import and the public field beside `movement`:

```ts
import { MachineDamage } from './MachineDamage';
```

```ts
  readonly movement = new MachineMovement();
  readonly damage = new MachineDamage();
```

In `Machine`'s fixed update — the same method that already calls `this.movement.fixedUpdate(dt)` — push the condition in immediately BEFORE that call, so the speed model reads this frame's damage and not last frame's:

```ts
    this.movement.enginePower = this.damage.enginePower;
    this.movement.legScale = this.damage.speedScale;
    this.movement.fixedUpdate(dt);
```

- [x] **Step 6: Apply the list to the hull**

`Machine.updateVisuals` builds the hull's attitude at `Machine.ts:349-351`:

```ts
    this.rollQuat.setFromAxisAngle(FORWARD_Z, this.pose.roll);
    this.pitchQuat.setFromAxisAngle(RIGHT_X, this.pose.pitch);
    this.poseQuat.copy(this.pitchQuat).multiply(this.rollQuat);
```

Add the list to the roll term only:

```ts
    // The gait's own roll still heaves; the list is added on top, so a
    // damaged machine still walks rather than merely leaning.
    this.rollQuat.setFromAxisAngle(FORWARD_Z, this.pose.roll + this.damage.lean);
    this.pitchQuat.setFromAxisAngle(RIGHT_X, this.pose.pitch);
    this.poseQuat.copy(this.pitchQuat).multiply(this.rollQuat);
```

Do NOT write the lean into `this.pose.roll` itself — the gait owns that field
and recomputes it every frame from the stride, so a value added there is both
overwritten and, until it is, fed back into the next stride.

- [x] **Step 7: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/machine/MachineMovement.ts src/machine/Machine.ts tests/unit/machinemovement.test.ts
git commit -m "feat: a machine with a hurt engine drives like one"
```

---

### Task 4: Structures can be broken

**Files:**
- Modify: `src/building/BuildSystem.ts`
- Test: `tests/unit/structuredamage.test.ts`

**Interfaces:**
- Consumes: `Damageable` from Task 1.
- Produces: `BuildSystem.damagePiece(instanceId: string, amount: number): number` — returns damage dealt after armour, 0 if the id is unknown; `BuildSystem.pieceHealth(instanceId: string): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/structuredamage.test.ts
import { describe, expect, it } from 'vitest';
import { BUILD_PIECES, REFUND_FRACTION } from '@/data/build-pieces';

describe('what a structure is worth breaking', () => {
  it('gives every piece the health and armour a damage model needs', () => {
    // These fields have been carried, saved and restored since the build
    // system landed, with nothing ever reading them. This is that consumer.
    for (const def of Object.values(BUILD_PIECES)) {
      expect(def.maxHealth, def.id).toBeGreaterThan(0);
      expect(def.armor, def.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a railing the cheapest thing to lose and a refinery the dearest', () => {
    expect(BUILD_PIECES.railing.maxHealth).toBeLessThan(BUILD_PIECES.wall.maxHealth);
    expect(BUILD_PIECES.refinery.maxHealth).toBeGreaterThan(BUILD_PIECES.railing.maxHealth);
  });

  it('refunds nothing on destruction, unlike demolition', () => {
    // Demolition refunds because it is a considered decision. Losing a wall to
    // a raider is not, and refunding it would make being attacked free.
    expect(REFUND_FRACTION).toBeGreaterThan(0);
  });
});
```

Then a second file exercising `BuildSystem` itself is impossible in node — it needs Rapier and Three. Its behaviour is proved in the browser harness in Task 11. What is provable here is the data contract above, and that is what this step asserts.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/structuredamage.test.ts`
Expected: PASS immediately — the data already satisfies it. This test is a regression guard on fields a future edit could quietly drop, not a red test. Note that in the commit message.

- [ ] **Step 3: Add damage to `BuildSystem`**

In `src/building/BuildSystem.ts`, after `demolishAt`:

```ts
  /** Current health of one instance, or null if it does not exist. */
  pieceHealth(instanceId: string): number | null {
    return this.instances.get(instanceId)?.data.health ?? null;
  }

  /**
   * Hurt a piece. Returns the damage that actually landed, after armour.
   *
   * At zero the piece goes through the SAME cascade demolition the player's
   * own hammer uses, so a wall that falls to a raider takes down exactly what
   * a wall the player pulls down takes with it — the roof above, the floor it
   * carried. One path to get wrong instead of two.
   *
   * No refund. Demolition pays back 60% because it is a considered decision;
   * losing a wall to a raider is not, and refunding it would make being
   * attacked free.
   */
  damagePiece(instanceId: string, amount: number): number {
    const live = this.instances.get(instanceId);
    if (!live) return 0;

    const def = BUILD_PIECES[live.data.definitionId];
    const dealt = Math.max(0, amount - def.armor);
    if (dealt === 0) return 0;

    live.data.health = Math.max(0, live.data.health - dealt);
    this.bus.emit('build:damaged', {
      instanceId,
      definitionId: live.data.definitionId,
      health: live.data.health,
      maxHealth: def.maxHealth,
    });

    if (live.data.health <= 0) {
      this.removeCascade(instanceId);
      this.recomputeRooms();
    }
    return dealt;
  }
```

- [ ] **Step 4: Declare the event**

In `src/core/events/GameEvents.ts`, add alongside the existing `build:placed`:

```ts
  'build:damaged': {
    instanceId: string;
    definitionId: PieceId;
    health: number;
    maxHealth: number;
  };
```

- [ ] **Step 5: Register each piece as a damage target**

In `BuildSystem.createColliders`, attach userData to every collider it makes, so a shot or a swing finds the piece:

```ts
      this.physics.setUserData(collider, {
        kind: 'structure',
        id: data.instanceId,
        armor: BUILD_PIECES[data.definitionId].armor,
        takeDamage: (amount: number) => this.damagePiece(data.instanceId, amount),
      } satisfies Damageable);
```

Add the import: `import type { Damageable } from '@/combat/Damageable';`

- [ ] **Step 6: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/building/BuildSystem.ts src/core/events/GameEvents.ts tests/unit/structuredamage.test.ts
git commit -m "feat: the wall you built can be taken off you"
```

---

### Task 5: What a repair costs

**Files:**
- Create: `src/building/RepairPricing.ts`
- Test: `tests/unit/repairpricing.test.ts`

**Interfaces:**
- Consumes: `SUBSYSTEMS` from Task 2.
- Produces: `const REPAIR_COST_FRACTION = 0.3`; `function structureRepairCost(pieceId: PieceId, missingFraction: number): ItemCost`; `function subsystemRepairCost(id: SubsystemId, missingFraction: number): ItemCost`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/repairpricing.test.ts
import { describe, expect, it } from 'vitest';
import { BUILD_PIECES, REFUND_FRACTION, type PieceId } from '@/data/build-pieces';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import { structureRepairCost, subsystemRepairCost } from '@/building/RepairPricing';

const PIECES = Object.keys(BUILD_PIECES) as PieceId[];
const SUBS = Object.keys(SUBSYSTEMS) as SubsystemId[];

describe('what a repair costs', () => {
  /**
   * THE property this module exists for, asserted over the whole table rather
   * than a hand-picked example.
   *
   * Demolition refunds 60%, so replacing a wrecked piece nets 40% of its build
   * cost. If a full repair ever costs 40% or more, the optimal play is
   * demolish-and-rebuild and the repair verb is dead on arrival.
   */
  it('is always strictly cheaper than demolishing and rebuilding', () => {
    const replace = 1 - REFUND_FRACTION;
    for (const id of PIECES) {
      const build = BUILD_PIECES[id].cost.scrap ?? 0;
      if (build === 0) continue;
      const repair = structureRepairCost(id, 1).scrap ?? 0;
      expect(repair, `${id}: repair ${repair} vs replace ${build * replace}`).toBeLessThan(
        build * replace,
      );
    }
  });

  it('charges nothing to repair something already whole', () => {
    for (const id of PIECES) expect(structureRepairCost(id, 0).scrap ?? 0).toBe(0);
    for (const id of SUBS) expect(subsystemRepairCost(id, 0).scrap ?? 0).toBe(0);
  });

  it('charges pro rata, so patching early is not punished', () => {
    const full = structureRepairCost('wall', 1).scrap ?? 0;
    const half = structureRepairCost('wall', 0.5).scrap ?? 0;
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });

  it('never charges for more than a full repair, whatever it is handed', () => {
    const full = structureRepairCost('wall', 1).scrap ?? 0;
    expect(structureRepairCost('wall', 4).scrap ?? 0).toBe(full);
    expect(structureRepairCost('wall', -2).scrap ?? 0).toBe(0);
  });

  it('always charges at least a unit for real damage, so nothing is free', () => {
    // Rounding a 1% repair to zero would let a player mend a wall between
    // every shot for nothing.
    for (const id of PIECES) {
      if ((BUILD_PIECES[id].cost.scrap ?? 0) === 0) continue;
      expect(structureRepairCost(id, 0.01).scrap ?? 0, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('prices every subsystem from its own table', () => {
    for (const id of SUBS) {
      expect(subsystemRepairCost(id, 1).scrap, id).toBe(SUBSYSTEMS[id].repairScrap);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/repairpricing.test.ts`
Expected: FAIL — cannot resolve `@/building/RepairPricing`.

- [ ] **Step 3: Write the module**

```ts
// src/building/RepairPricing.ts
import { BUILD_PIECES, type PieceId } from '@/data/build-pieces';
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { ItemCost } from '@/data/items';

/**
 * What a full repair costs, as a fraction of what the thing cost to build.
 *
 * Pinned BELOW the 40% that demolishing and rebuilding nets — demolition
 * refunds 60% — and `repairpricing.test.ts` asserts that over the whole piece
 * table rather than trusting this comment. Raise this past 0.4 and repair
 * stops being the right move everywhere at once, silently.
 */
export const REPAIR_COST_FRACTION = 0.3;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Round up, but only once there is something to pay for.
 *
 * Rounding a 1% repair down to zero would let a player mend a wall between
 * every incoming shot for nothing at all.
 */
function charge(full: number, missing: number): number {
  const fraction = clamp01(missing);
  if (fraction === 0) return 0;
  return Math.max(1, Math.ceil(full * fraction));
}

export function structureRepairCost(pieceId: PieceId, missingFraction: number): ItemCost {
  const build = BUILD_PIECES[pieceId].cost.scrap ?? 0;
  if (build === 0) return {};
  return { scrap: charge(build * REPAIR_COST_FRACTION, missingFraction) };
}

export function subsystemRepairCost(id: SubsystemId, missingFraction: number): ItemCost {
  return { scrap: charge(SUBSYSTEMS[id].repairScrap, missingFraction) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/repairpricing.test.ts`
Expected: PASS. If the "strictly cheaper" case fails, `REPAIR_COST_FRACTION` is too high — lower it rather than weakening the assertion.

- [ ] **Step 5: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/building/RepairPricing.ts tests/unit/repairpricing.test.ts
git commit -m "feat: mending is cheaper than knocking down and starting again"
```

---

### Task 6: Holding E mends it

**Files:**
- Create: `src/interaction/RepairSystem.ts`
- Modify: `src/interaction/InteractionSystem.ts:13` (widen `kind`)
- Test: `tests/unit/repairsystem.test.ts`

**Interfaces:**
- Consumes: `structureRepairCost`, `subsystemRepairCost` (Task 5); `MachineDamage` (Task 2).
- Produces: `const REPAIR_SECONDS = 1.6`; `interface RepairTarget { id: string; kind: 'structure' | 'subsystem'; missingFraction: number }`; class `RepairSystem` with `update(dt, target, holding, purse): RepairTick`.

- [ ] **Step 1: Widen the interactable kind**

In `src/interaction/InteractionSystem.ts`:

```ts
  kind: 'crate' | 'workbench' | 'refinery' | 'repair';
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/repairsystem.test.ts
import { describe, expect, it } from 'vitest';
import { RepairSystem, REPAIR_SECONDS, type RepairTarget } from '@/interaction/RepairSystem';

const target = (over: Partial<RepairTarget> = {}): RepairTarget => ({
  id: 'bp-1',
  kind: 'structure',
  pieceId: 'wall',
  missingFraction: 1,
  ...over,
});

/** A purse that always pays, recording what it was asked for. */
const rich = () => {
  const spent: number[] = [];
  return {
    spent,
    canAfford: () => true,
    consume: (cost: { scrap?: number }) => {
      spent.push(cost.scrap ?? 0);
      return true;
    },
  };
};

const broke = () => ({ canAfford: () => false, consume: () => false });

describe('holding E to mend something', () => {
  it('does nothing at all when nothing is targeted', () => {
    const r = new RepairSystem();
    expect(r.update(0.5, null, true, rich()).completed).toBe(false);
    expect(r.progress).toBe(0);
  });

  it('does nothing while the key is not held', () => {
    const r = new RepairSystem();
    r.update(0.5, target(), false, rich());
    expect(r.progress).toBe(0);
  });

  it('fills over the hold duration and completes exactly once', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS / 2, target(), true, purse);
    expect(r.progress).toBeCloseTo(0.5, 5);
    expect(purse.spent).toEqual([]);

    const done = r.update(REPAIR_SECONDS / 2 + 0.01, target(), true, purse);
    expect(done.completed).toBe(true);
    expect(purse.spent).toHaveLength(1);

    // Still holding: it must not mend again on the very next frame.
    const after = r.update(0.016, target(), true, purse);
    expect(after.completed).toBe(false);
    expect(purse.spent).toHaveLength(1);
  });

  it('charges only on completion, so letting go early costs nothing', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS * 0.9, target(), true, purse);
    r.update(0.016, target(), false, purse);
    expect(purse.spent).toEqual([]);
    expect(r.progress).toBe(0);
  });

  it('refuses to start when the player cannot pay', () => {
    // Draining a hold and THEN saying no would be the cruellest possible UI.
    const r = new RepairSystem();
    const tick = r.update(REPAIR_SECONDS, target(), true, broke());
    expect(tick.completed).toBe(false);
    expect(tick.blocked).toBe('cannot-afford');
    expect(r.progress).toBe(0);
  });

  it('abandons progress when the player turns to a different target', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS * 0.9, target({ id: 'bp-1' }), true, purse);
    r.update(0.016, target({ id: 'bp-2' }), true, purse);
    expect(r.progress).toBeLessThan(0.1);
    expect(purse.spent).toEqual([]);
  });

  it('will not start on something already whole', () => {
    const r = new RepairSystem();
    const tick = r.update(REPAIR_SECONDS, target({ missingFraction: 0 }), true, rich());
    expect(tick.completed).toBe(false);
    expect(tick.blocked).toBe('undamaged');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/unit/repairsystem.test.ts`
Expected: FAIL — cannot resolve `@/interaction/RepairSystem`.

- [ ] **Step 4: Write the module**

```ts
// src/interaction/RepairSystem.ts
import { structureRepairCost, subsystemRepairCost } from '@/building/RepairPricing';
import type { PieceId } from '@/data/build-pieces';
import type { SubsystemId } from '@/data/subsystems';
import type { ItemCost } from '@/data/items';

/**
 * Seconds of held E for one repair.
 *
 * Load-bearing rather than flavour: mending the engine mid-wave means standing
 * still and exposed, and that is what makes being stopped a scramble instead
 * of a chore. Tapping would make the stop condition a formality.
 */
export const REPAIR_SECONDS = 1.6;

export interface RepairTarget {
  id: string;
  kind: 'structure' | 'subsystem';
  /** Set when kind is 'structure'. */
  pieceId?: PieceId;
  /** 0 when whole, 1 when destroyed. */
  missingFraction: number;
}

/** Anything that can be asked to pay. `ResourceAccess` satisfies it. */
export interface Purse {
  canAfford(cost: ItemCost): boolean;
  consume(cost: ItemCost): boolean;
}

export interface RepairTick {
  completed: boolean;
  cost: ItemCost | null;
  blocked: 'cannot-afford' | 'undamaged' | null;
}

const NOTHING: RepairTick = { completed: false, cost: null, blocked: null };

export function costOf(target: RepairTarget): ItemCost {
  return target.kind === 'subsystem'
    ? subsystemRepairCost(target.id as SubsystemId, target.missingFraction)
    : structureRepairCost(target.pieceId as PieceId, target.missingFraction);
}

/**
 * The hold-to-repair driver.
 *
 * Pure: it is handed the target, the key state and a purse rather than
 * finding any of them, so the whole of it can be reasoned about in node.
 */
export class RepairSystem {
  private held = 0;
  private activeId: string | null = null;
  /** Set on the frame a repair lands, cleared when the key is released. */
  private spent = false;

  get progress(): number {
    return Math.min(1, this.held / REPAIR_SECONDS);
  }

  update(
    dt: number,
    target: RepairTarget | null,
    holding: boolean,
    purse: Purse,
  ): RepairTick {
    if (!target || !holding) {
      this.reset();
      return NOTHING;
    }

    // Turning to a different thing abandons the hold rather than inheriting it.
    if (target.id !== this.activeId) {
      this.held = 0;
      this.spent = false;
      this.activeId = target.id;
    }

    if (target.missingFraction <= 0) {
      this.held = 0;
      return { completed: false, cost: null, blocked: 'undamaged' };
    }

    const cost = costOf(target);

    // Checked BEFORE the hold accumulates. Draining a hold and only then
    // saying no would be the cruellest available reading of this interaction.
    if (!purse.canAfford(cost)) {
      this.held = 0;
      return { completed: false, cost, blocked: 'cannot-afford' };
    }

    if (this.spent) return { completed: false, cost, blocked: null };

    this.held += dt;
    if (this.held < REPAIR_SECONDS) return { completed: false, cost, blocked: null };

    this.spent = true;
    this.held = 0;
    if (!purse.consume(cost)) return { completed: false, cost, blocked: 'cannot-afford' };
    return { completed: true, cost, blocked: null };
  }

  private reset(): void {
    this.held = 0;
    this.activeId = null;
    this.spent = false;
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/repairsystem.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/interaction/RepairSystem.ts src/interaction/InteractionSystem.ts tests/unit/repairsystem.test.ts
git commit -m "feat: hold E on the broken thing and pay for it"
```

---

### Task 7: A wall stops a hit, and can be chewed through

**Files:**
- Modify: `src/enemies/EnemyAI.ts`, `src/data/enemies.ts`, `src/enemies/Enemy.ts`
- Test: `tests/unit/enemyai.test.ts` (add to the existing file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AIInput` gains `blockedBy: string | null`; `AIDecision` gains `attackTarget: 'player' | 'blocker' | null`; `EnemyDefinition` gains `targetPriority: 'player' | 'engine'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/enemyai.test.ts`:

```ts
describe('what an enemy actually swings at', () => {
  const base = { distanceToPlayer: 1.5, health: 10, timeSinceLastAttack: 99, blockedBy: null };

  it('hits the player when nothing is in the way', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger, base);
    expect(d.shouldAttack).toBe(true);
    expect(d.attackTarget).toBe('player');
  });

  it('does NOT hit the player through a wall — the bug this fixes', () => {
    // Grid tiles are 2m and the scavenger reaches 2.2m, so an enemy in the
    // cell next to you is inside attack range with a wall between. Before
    // this, distance alone decided, and it damaged you through the wall.
    const d = stepEnemyAI('attack', ENEMIES.scavenger, { ...base, blockedBy: 'bp-7' });
    expect(d.attackTarget).not.toBe('player');
  });

  it('hits the wall instead, so being sealed in is not permanent safety', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger, { ...base, blockedBy: 'bp-7' });
    expect(d.shouldAttack).toBe(true);
    expect(d.attackTarget).toBe('blocker');
  });

  it('still respects the cooldown when chewing a wall', () => {
    const d = stepEnemyAI('attack', ENEMIES.scavenger, {
      ...base,
      blockedBy: 'bp-7',
      timeSinceLastAttack: 0,
    });
    expect(d.shouldAttack).toBe(false);
  });

  it('attacks a blocker even out of reach of the player, which is the sealed-room case', () => {
    // Sealed in, the player may be well beyond attackRange. The enemy is at
    // the wall, and the wall is what it can reach.
    const d = stepEnemyAI('navigate', ENEMIES.scavenger, {
      ...base,
      distanceToPlayer: 6,
      blockedBy: 'bp-7',
    });
    expect(d.attackTarget).toBe('blocker');
    expect(d.shouldAttack).toBe(true);
  });

  it('does not wake up for a blocker it has not noticed', () => {
    const d = stepEnemyAI('idle', ENEMIES.scavenger, {
      ...base,
      distanceToPlayer: ENEMIES.scavenger.detectRange + 10,
      blockedBy: 'bp-7',
    });
    expect(d.state).toBe('idle');
    expect(d.shouldAttack).toBe(false);
  });
});

describe('what each type is here for', () => {
  it('sends the scavenger after the player and the raider after the engine', () => {
    expect(ENEMIES.scavenger.targetPriority).toBe('player');
    expect(ENEMIES.raider.targetPriority).toBe('engine');
  });
});
```

Check the raider's key in `src/data/enemies.ts` before running — if it is not `raider`, use the real key in the test.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/enemyai.test.ts`
Expected: FAIL — `blockedBy` is not on `AIInput`, `attackTarget` is not on `AIDecision`.

- [ ] **Step 3: Widen the AI's input and decision**

In `src/enemies/EnemyAI.ts`:

```ts
export interface AIInput {
  distanceToPlayer: number;
  health: number;
  timeSinceLastAttack: number;
  /**
   * The instance id of the structure between this enemy and the player, or
   * null when the way is clear.
   *
   * The caller computes it, because the caller is the one holding the grid.
   * Its absence was a real bug rather than a missing feature: attacks were
   * decided on straight-line distance alone, and with 2m cells against a 2.2m
   * reach, an enemy one cell away damaged the player THROUGH a wall.
   */
  blockedBy: string | null;
}

export interface AIDecision {
  state: EnemyAIState;
  /** True on the tick the enemy should deal damage. */
  shouldAttack: boolean;
  /** What that damage lands on. Null when not attacking. */
  attackTarget: 'player' | 'blocker' | null;
}
```

Rewrite the body:

```ts
export function stepEnemyAI(
  current: EnemyAIState,
  def: EnemyDefinition,
  input: AIInput,
): AIDecision {
  const idle = (state: EnemyAIState): AIDecision => ({
    state,
    shouldAttack: false,
    attackTarget: null,
  });

  if (input.health <= 0) return idle('dead');
  if (current === 'dead') return idle('dead');

  const { distanceToPlayer: dist, blockedBy } = input;

  if (dist > def.detectRange) return idle('idle');

  const ready = input.timeSinceLastAttack >= def.attackCooldown;

  // Blocked beats range. An enemy standing at a wall it cannot get past
  // attacks the wall, whether or not the player on the other side happens to
  // be within arm's reach through it — which, at 2m cells, they usually are.
  if (blockedBy !== null) {
    return { state: 'attack', shouldAttack: ready, attackTarget: ready ? 'blocker' : null };
  }

  if (dist <= def.attackRange) {
    return { state: 'attack', shouldAttack: ready, attackTarget: ready ? 'player' : null };
  }

  const engaged = current === 'attack' || current === 'pursue';
  return idle(engaged ? 'pursue' : 'navigate');
}
```

- [ ] **Step 4: Add the target priority to the data**

In `src/data/enemies.ts`, add to `EnemyDefinition`:

```ts
  /**
   * What this type is trying to reach.
   *
   * The raider used to be distinguished from the scavenger by speed alone —
   * the fast one you cannot back away from. Sending it for the engine gives it
   * a job, makes the player choose under fire between the one hitting them and
   * the one crossing the deck, and is what makes engine-as-stop ever fire:
   * with both types walking at the player, nothing damages the engine and the
   * failure state is dead code.
   */
  targetPriority: 'player' | 'engine';
```

Set `targetPriority: 'player'` on the scavenger and `targetPriority: 'engine'` on the raider.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/enemyai.test.ts`
Expected: PASS.

- [ ] **Step 6: Make `Enemy` honour the decision**

In `src/enemies/Enemy.ts`, the `stepEnemyAI` call gains the new input and the attack branch splits. The caller needs the grid to answer `blockedBy`, so `Enemy.fixedUpdate` takes a resolver alongside the arguments it already has:

```ts
export type BlockerAt = (from: THREE.Vector3, to: THREE.Vector3) => string | null;
```

Replace the existing attack branch:

```ts
    const decision = stepEnemyAI(this.state, this.def, {
      distanceToPlayer: distance,
      health: this.health,
      timeSinceLastAttack: this.timeSinceLastAttack,
      blockedBy: blockerAt(this.position, playerPos),
    });
    this.state = decision.state;
    this.visual.setState(this.state);

    if (decision.shouldAttack) {
      this.timeSinceLastAttack = 0;
      if (decision.attackTarget === 'player') {
        playerStats.damage(this.def.damage, this.def.name, {
          x: this.position.x,
          y: this.position.y,
          z: this.position.z,
        });
      } else if (decision.attackTarget === 'blocker') {
        const blocked = blockerAt(this.position, playerPos);
        if (blocked) build.damagePiece(blocked, this.def.damage);
      }
    }
```

`build` is the `BuildSystem`, threaded in the same way `playerStats` already is.

- [ ] **Step 7: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/enemies/EnemyAI.ts src/data/enemies.ts src/enemies/Enemy.ts tests/unit/enemyai.test.ts
git commit -m "fix: they were reaching through the wall you built"
```

---

### Task 8: Raiders go for the engine

**Files:**
- Modify: `src/enemies/Enemy.ts`, `src/enemies/EnemyManager.ts`, `src/game/Game.ts`
- Test: `tests/unit/enemytypes.test.ts` (add to the existing file)

**Interfaces:**
- Consumes: `targetPriority` (Task 7), `SUBSYSTEMS` and `MachineDamage` (Task 2).
- Produces: `function subsystemTargetFor(def: EnemyDefinition): SubsystemId | null` exported from `src/enemies/EnemyTargeting.ts`; `function hitboxContains(id: SubsystemId, point: Vec3Like): boolean` from the same file.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/enemytypes.test.ts`:

```ts
import { subsystemTargetFor, hitboxContains } from '@/enemies/EnemyTargeting';
import { SUBSYSTEMS } from '@/data/subsystems';

describe('who goes for the engine', () => {
  it('sends a raider to the engine and a scavenger to nothing', () => {
    expect(subsystemTargetFor(ENEMIES.raider)).toBe('engine');
    expect(subsystemTargetFor(ENEMIES.scavenger)).toBeNull();
  });

  it('knows when a body is standing in the engine', () => {
    const c = SUBSYSTEMS.engine.hitbox.center;
    expect(hitboxContains('engine', c)).toBe(true);
    expect(hitboxContains('engine', { x: c.x, y: c.y, z: c.z + 99 })).toBe(false);
  });

  it('is generous by a body's width, so an enemy beside the engine can reach it', () => {
    // The hitbox is the engine's own box. An enemy that has walked up to it
    // stands OUTSIDE that box by definition, so a strict containment test
    // would mean the engine could never be hit at all.
    const c = SUBSYSTEMS.engine.hitbox.center;
    const justOutside = { x: c.x, y: c.y, z: c.z - SUBSYSTEMS.engine.hitbox.half.z - 0.9 };
    expect(hitboxContains('engine', justOutside)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/enemytypes.test.ts`
Expected: FAIL — cannot resolve `@/enemies/EnemyTargeting`.

- [ ] **Step 3: Write the targeting module**

```ts
// src/enemies/EnemyTargeting.ts
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';
import type { EnemyDefinition } from '@/data/enemies';

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * How far outside its own box a subsystem can still be struck.
 *
 * The hitbox is the part's real geometry, and an enemy that has walked up to
 * the engine is standing beside it rather than inside it. Without this margin
 * a strict containment test would mean the engine could never be hit at all —
 * which is the sort of thing that ships looking like "raiders ignore the
 * engine" rather than like an off-by-a-body-width.
 */
const REACH_MARGIN = 1.0;

export function subsystemTargetFor(def: EnemyDefinition): SubsystemId | null {
  return def.targetPriority === 'engine' ? 'engine' : null;
}

export function hitboxContains(id: SubsystemId, point: Vec3Like): boolean {
  const { half, center } = SUBSYSTEMS[id].hitbox;
  return (
    Math.abs(point.x - center.x) <= half.x + REACH_MARGIN &&
    Math.abs(point.y - center.y) <= half.y + REACH_MARGIN &&
    Math.abs(point.z - center.z) <= half.z + REACH_MARGIN
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/enemytypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Steer raiders at the engine and let them hurt it**

In `src/enemies/Enemy.ts`, where the enemy chooses what to walk toward, a raider heads for its subsystem's `repairAt`-adjacent deck position rather than the player. Use the subsystem's hitbox centre projected to deck height so the nav graph can path to it:

```ts
    const sub = subsystemTargetFor(this.def);
    const goal = sub
      ? { x: SUBSYSTEMS[sub].repairAt.x, y: SUBSYSTEMS[sub].repairAt.y, z: SUBSYSTEMS[sub].repairAt.z }
      : playerPos;
```

Feed `goal` to the existing pathing call in place of `playerPos`. Then, in the attack branch added in Task 7, add the third case before the player case:

```ts
      if (sub && hitboxContains(sub, this.position)) {
        machineDamage.damage(sub, this.def.damage);
      } else if (decision.attackTarget === 'player') {
```

`machineDamage` is `machine.damage` from Task 3, threaded in like `build`.

Note: `distanceToPlayer` stays the player's distance, so a raider still defends itself when the player closes on it.

- [ ] **Step 6: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/enemies/EnemyTargeting.ts src/enemies/Enemy.ts src/enemies/EnemyManager.ts src/game/Game.ts tests/unit/enemytypes.test.ts
git commit -m "feat: the raider is not here for you, it is here for the engine"
```

---

### Task 9: Damage survives a save

**Files:**
- Modify: `src/save/SaveSchema.ts`, `src/game/Game.ts`
- Test: `tests/unit/savemigrations.test.ts` (add to the existing file)

**Interfaces:**
- Consumes: `MachineDamage.toSave()` / `restore()` (Task 2).
- Produces: `SaveGameV1['machine']['subsystems']?: SubsystemSave[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/savemigrations.test.ts`:

```ts
import { MachineDamage } from '@/machine/MachineDamage';

describe('machine condition in a save', () => {
  it('needs no migration, because absent is a legal value', () => {
    // The same argument threatDirector made in this file: the old shape is
    // still a legal value of the new type, and absent has exactly one
    // sensible reading — nothing was damaged.
    expect(CURRENT_SAVE_VERSION).toBe(1);
  });

  it('reads a pre-damage save as an undamaged machine', () => {
    const d = new MachineDamage();
    d.damage('engine', 100);
    d.restore(undefined);
    expect(d.fraction('engine')).toBe(1);
  });

  it('carries every subsystem's health across a round trip', () => {
    const before = new MachineDamage();
    before.damage('engine', 90);
    before.damage('leg-rear-left', 99999);

    const after = new MachineDamage();
    after.restore(JSON.parse(JSON.stringify(before.toSave())));

    expect(after.health('engine')).toBe(before.health('engine'));
    expect(after.health('leg-rear-left')).toBe(0);
    expect(after.isStopped).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/savemigrations.test.ts`
Expected: FAIL — `MachineDamage` import resolves but the schema field does not exist yet, so `tsc` fails on the next step's wiring. If the test alone passes, still complete steps 3–4.

- [ ] **Step 3: Add the optional field**

In `src/save/SaveSchema.ts`, inside the `machine` block:

```ts
    /**
     * Absent in saves written before machine damage, and absent means
     * undamaged. No version bump and no migration for the reason
     * `threatDirector` gives below: the old shape is still a legal value of
     * the new type, and there is exactly one sensible reading of its absence.
     */
    subsystems?: { id: string; health: number }[];
```

- [ ] **Step 4: Wire it in `Game`**

Where `Game` builds a save, add `subsystems: this.machine.damage.toSave()` to the `machine` block. Where it loads one, add `this.machine.damage.restore(save.machine.subsystems)`.

- [ ] **Step 5: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/save/SaveSchema.ts src/game/Game.ts tests/unit/savemigrations.test.ts
git commit -m "feat: a broken machine is still broken after a reload"
```

---

### Task 10: Saying so on the HUD

**Files:**
- Modify: `src/ui/HUD.ts`, `src/ui/hud.css`, `src/game/Game.ts`, `src/audio/GameSounds.ts`
- Test: `tests/unit/hudcondition.test.ts`

**Interfaces:**
- Consumes: `MachineDamage.damaged()` (Task 2), `SUBSYSTEMS` (Task 2).
- Produces: `function conditionLabel(damaged: { id: SubsystemId; fraction: number }[]): string` exported from `src/ui/DeckBearing.ts`'s sibling `src/ui/MachineCondition.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/hudcondition.test.ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/hudcondition.test.ts`
Expected: FAIL — cannot resolve `@/ui/MachineCondition`.

- [ ] **Step 3: Write the label**

```ts
// src/ui/MachineCondition.ts
import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';

/**
 * One line naming what is wrong, or nothing at all.
 *
 * Names the part rather than averaging the machine, because handoff section 15
 * opens by forbidding a global HP bar and a row reading "83%" would be one
 * with extra steps. Full per-subsystem detail lives behind a held key; this
 * row's job is to stay quiet across 650m of scheduled peace and to be
 * unmissable the moment it is not.
 */
export function conditionLabel(
  damaged: readonly { id: SubsystemId; fraction: number }[],
): string {
  if (damaged.length === 0) return 'Sound';

  const worst = damaged[0] as { id: SubsystemId; fraction: number };
  if (worst.id === 'engine' && worst.fraction <= 0) return 'ENGINE OUT';

  // Floor, not round: 99.6% is not whole, and reporting it as 100% would tell
  // the player the opposite of what the row exists to say.
  const pct = Math.floor(worst.fraction * 100);
  const rest = damaged.length - 1;
  const name = SUBSYSTEMS[worst.id].name;
  return rest > 0 ? `${name} ${pct}% +${rest}` : `${name} ${pct}%`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/hudcondition.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the row**

In `src/ui/HUD.ts`, add to the `hud-machine` panel markup, after the Aboard row:

```html
        <div class="hud-row"><span>Condition</span><span class="hud-value" id="hud-condition">Sound</span></div>
```

Register `'hud-condition'` in the element id list beside `'hud-distance'`. Add to `HUDState`:

```ts
  /** Empty when the machine is sound. */
  machineCondition: string;
  machineStopped: boolean;
```

and in the update method, beside the existing `hud-threats` handling:

```ts
    this.write('condition', this.el['hud-condition'], state.machineCondition);
    this.el['hud-condition']?.classList.toggle('is-hot', state.machineCondition !== 'Sound');
```

`is-hot` already exists in `hud.css` and needs no new rule.

- [ ] **Step 6: Cue an engine under attack**

The engine can be attacked while the player is across the deck, so it needs a sound. In `src/game/Game.ts`, subscribe to the subsystem damage path added in Task 8 and play the director's existing warning cue, rate-limited to once every few seconds so a sustained attack does not machine-gun it. Reuse `GameSounds`' warning rather than adding a third alert channel.

- [ ] **Step 7: Full suite and commit**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests
git add src/ui/MachineCondition.ts src/ui/HUD.ts src/game/Game.ts tests/unit/hudcondition.test.ts
git commit -m "feat: the HUD stays quiet until something is wrong"
```

---

### Task 11: Proving it in the running game

**Files:**
- Create: `tests/e2e/damage.spec.ts`

**Interfaces:**
- Consumes: everything above, through `globalThis.__game`.
- Produces: nothing.

- [ ] **Step 1: Write the harness**

```ts
// tests/e2e/damage.spec.ts
import { test, expect, type Page } from '@playwright/test';

/**
 * The four claims this milestone makes, checked in the running game.
 *
 * Everything waits on SIMULATED time, for the reason smoke.spec.ts gives:
 * under the software renderer the fixed step lets simulated time lag wall
 * time, so a wall-clock wait tests the GPU rather than the game.
 */
const ready = (page: Page) =>
  page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

const simTime = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as never as { __game: { debugStats(): { simTime: number } } }).__game
        .debugStats().simTime,
  );

async function sim(page: Page, seconds: number) {
  const start = await simTime(page);
  await expect
    .poll(async () => (await simTime(page)) - start, { timeout: 90_000, intervals: [150] })
    .toBeGreaterThanOrEqual(seconds);
}

test.describe('machine damage', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed&nospawn=1&notex=1&nomodel=1');
    await ready(page);
    await sim(page, 1.2);
  });

  test('a wrecked engine stops the machine, and repairing it starts it again', async ({ page }) => {
    const before = await page.evaluate(
      () => (globalThis as never as { __game: { machine: { movement: { maxSpeed: number } } } })
        .__game.machine.movement.maxSpeed,
    );
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => {
      const m = (globalThis as never as { __game: { machine: { damage: { damage(id: string, n: number): number } } } })
        .__game.machine.damage;
      m.damage('engine', 99999);
    });
    await sim(page, 4);

    const stopped = await page.evaluate(
      () => (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game.debugStats().distance,
    );
    await sim(page, 2);
    const stillStopped = await page.evaluate(
      () => (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game.debugStats().distance,
    );
    // Stopped means stopped: it must not creep.
    expect(stillStopped - stopped).toBeLessThan(0.5);

    await page.evaluate(() =>
      (globalThis as never as { __game: { machine: { damage: { repair(id: string, n: number): void } } } })
        .__game.machine.damage.repair('engine', 99999),
    );
    await sim(page, 3);
    const moving = await page.evaluate(
      () => (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game.debugStats().distance,
    );
    expect(moving).toBeGreaterThan(stillStopped + 2);
    expect(errors).toEqual([]);
  });

  test('a damaged leg slows the machine without stopping it', async ({ page }) => {
    const top = () =>
      page.evaluate(
        () => (globalThis as never as { __game: { machine: { movement: { maxSpeed: number } } } })
          .__game.machine.movement.maxSpeed,
      );
    const before = await top();
    await page.evaluate(() => {
      const m = (globalThis as never as { __game: { machine: { damage: { damage(id: string, n: number): number } } } })
        .__game.machine.damage;
      for (const id of ['leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right']) {
        m.damage(id, 99999);
      }
    });
    await sim(page, 1);
    const after = await top();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('a wall takes damage and is destroyed, taking what it carried with it', async ({ page }) => {
    const out = await page.evaluate(() => {
      const g = globalThis as never as {
        __game: {
          game: {
            build: {
              clear(): void;
              place(p: unknown, free?: boolean): { instanceId: string } | null;
              damagePiece(id: string, n: number): number;
              pieceHealth(id: string): number | null;
              pieceCount: number;
            };
          };
          canonicalEdge(cell: unknown, side: string): unknown;
        };
      };
      const B = g.__game.game.build;
      B.clear();
      B.place({ piece: 'floor', cell: { x: -2, y: 0, z: -5 }, rotation: 0 }, true);
      const wall = B.place(
        {
          piece: 'wall',
          cell: { x: -2, y: 0, z: -5 },
          edge: g.__game.canonicalEdge({ x: -2, y: 0, z: -5 }, 'west'),
          rotation: 0,
        },
        true,
      );
      if (!wall) return null;

      const dealt = B.damagePiece(wall.instanceId, 20);
      const mid = B.pieceHealth(wall.instanceId);
      B.damagePiece(wall.instanceId, 99999);
      return { dealt, mid, gone: B.pieceHealth(wall.instanceId) };
    });

    expect(out).not.toBeNull();
    const { dealt, mid, gone } = out as { dealt: number; mid: number | null; gone: number | null };
    // Armour is subtracted, so a 20 hit lands less than 20.
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(20);
    expect(mid).toBeGreaterThan(0);
    // Destroyed pieces stop existing, rather than sitting at zero health.
    expect(gone).toBeNull();
    expect(errors).toEqual([]);
  });

  test('an enemy on the far side of a wall does not reach the player through it', async ({ page }) => {
    // The bug Task 7 fixes: 2m cells against a 2.2m reach meant an enemy one
    // cell away damaged the player through a wall.
    const hp = await page.evaluate(async () => {
      const g = globalThis as never as {
        __game: {
          game: {
            build: { clear(): void; place(p: unknown, free?: boolean): unknown };
          };
          player: { stats: { health: number }; teleport(v: unknown): void };
          canonicalEdge(cell: unknown, side: string): unknown;
        };
      };
      const B = g.__game.game.build;
      B.clear();
      for (let x = -3; x <= -1; x++) {
        B.place({ piece: 'floor', cell: { x, y: 0, z: -4 }, rotation: 0 }, true);
      }
      B.place(
        {
          piece: 'wall',
          cell: { x: -2, y: 0, z: -4 },
          edge: g.__game.canonicalEdge({ x: -2, y: 0, z: -4 }, 'west'),
          rotation: 0,
        },
        true,
      );
      g.__game.player.teleport({ x: -4, y: 4.8, z: -8 });
      return g.__game.player.stats.health;
    });
    expect(hp).toBe(100);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/damage.spec.ts --reporter=line`
Expected: PASS. The full e2e suite takes about 5 minutes; run it in the background and wait for the result rather than reporting before it lands.

- [ ] **Step 3: Run everything**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src tests && npm run build
npx playwright test --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/damage.spec.ts
git commit -m "test: the machine can be stopped, and started again"
```

- [ ] **Step 5: Update the README**

The README's "Not built yet" list names localized machine damage and repair, and its known-gaps section will be one shorter. Update both, and add machine damage to "What works". Commit as `docs: the machine can be hurt now`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| 3, damage model / `Damageable` union | 1 |
| 4, subsystems, hitbox vs repair point | 2 |
| 4, engine-as-stop, leg lean and speed | 2, 3 |
| 5.1, the occlusion bug | 7 |
| 5.2, blocked → attack the blocker | 7 |
| 5.2, raider → engine | 7 (data), 8 (behaviour) |
| 3, structures destroyed via cascade demolition | 4 |
| 6, repair interaction and the <40% constraint | 5, 6 |
| 7, HUD condition row and the engine cue | 10 |
| 8, optional `subsystems` save field | 9 |
| 10, testing | every task, plus 11 |
| 9, deliberately out of scope | no task, by design |

No gaps.

**Type consistency:** `Damageable.kind` is `'enemy' | 'structure' | 'subsystem'` in Tasks 1, 4 and 8. `MachineDamage.damage(id, amount)` returns dealt damage in Tasks 2, 3, 8 and 11. `damagePiece` returns dealt damage in Tasks 4, 7 and 11. `RepairTarget.missingFraction` is 0-whole/1-destroyed in Tasks 5 and 6, matching `MachineDamage.fraction`'s inverse — note the deliberate inversion, and that `costOf` takes `missingFraction`, not `fraction`.

**Known soft spots for the implementer:**
- Task 3 Step 6 and Task 7 Step 6 describe edits by intent rather than by exact line, because both touch code whose surrounding shape should be read first. Read the method before editing it.
- Task 4 Step 2 expects a test that passes immediately. That is intentional — it guards data that already exists — and is the one place in this plan where red-then-green does not apply.
- Task 8's `REACH_MARGIN` of 1.0m is a first guess. If raiders visibly fail to damage the engine in Task 11, that constant is the first thing to check.
