# Basic Enemy Spawner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make travel cost something — scavengers arrive on the deck every 250 m, capped at four aboard, so a player who never touches a debug key is under pressure.

**Architecture:** A pure `EnemySpawner` decides *when* from distance alone and *where* from the deck bounds and the player's position. `Game` binds that decision to `EnemyManager.spawn`. Nothing new enters the save file: the threshold is derived from `distanceTraveled`, which v1 already stores.

**Tech Stack:** TypeScript, Three.js 0.185.1, @dimforge/rapier3d-compat 0.20.0, Vite 8.2.2, Vitest, Playwright.

## Global Constraints

- **No asset files.** No models, textures, audio, or fonts.
- **The machine never moves.** It sits at the world origin; the world scrolls past.
- **Enemies live in machine-space.** Nothing applies the world scroll to them. This is why they spawn on the deck, not on the sand.
- **Definition and runtime instance stay separate types.** Tuning lives in `src/data/enemies.ts`.
- **No React, no Zustand, no audio.**
- **No save schema version bump, and no new save field.**
- Spawn interval **250 m**, concurrent cap **4**, enemy `scavenger`, deck **10 m × 16 m** at `DECK_HEIGHT` 2.4.
- Existing suites must keep passing: **310 unit, 11 e2e, 71 harness checks** (9 drive, 12 combat, 21 build, 29 craft).

## Plan Format Note

Executed inline by the session that wrote it. Tasks give exact files,
interfaces, verification commands, and observable criteria. Test intent is
given in full because the test defines the contract.

---

## File Structure

```
src/enemies/EnemySpawner.ts     When to spawn and where. Pure.

Modified:
  src/data/enemies.ts           SPAWN_INTERVAL_M, MAX_ACTIVE_ENEMIES
  src/game/Game.ts              Owns the spawner, binds it to EnemyManager
  src/main.ts                   ?nospawn=1 URL switch
  tools/combat.mjs              Boots quiet; new arrivals section
  tools/drive.mjs               Boots quiet
  tools/build.mjs               Boots quiet
  tools/craft.mjs               Boots quiet
  tests/e2e/smoke.spec.ts       Boots quiet
  README.md                     Counts, controls, what works

tests/unit/enemyspawner.test.ts
```

### Why the existing harnesses have to change

Every long-running harness travels well past 250 m. Without an opt-out, arrivals
would wander into the middle of `build.mjs`'s wall-containment check and
`craft.mjs`'s save/reload section and break them intermittently — the worst kind
of failure to debug later. A `?nospawn=1` switch keeps those suites measuring
what they were written to measure, and `combat.mjs` re-arms the spawner
explicitly for the one section that tests it.

The screenshot harnesses need no change: `?cam=` presets put the game in free
camera, which already suppresses spawning.

---

## Task 1: The Spawner

Pure, so every rule is testable in node. The two rules worth the most test
attention are the ones that are easy to get subtly wrong: **one spawn per call**
regardless of how far the distance jumped, and **the threshold does not advance
on a refusal**.

**Files:**
- Create: `src/enemies/EnemySpawner.ts`
- Modify: `src/data/enemies.ts`
- Test: `tests/unit/enemyspawner.test.ts`

**Interfaces:**
- Consumes: `Rng` and `hashSeed` from `@/core/math/Random`
- Produces:
  - `SPAWN_INTERVAL_M = 250`, `MAX_ACTIVE_ENEMIES = 4` in `@/data/enemies`
  - `interface SpawnRequest { defId: string }`
  - `interface Bounds { halfWidth: number; halfLength: number; deckY: number }`
  - `interface Vec3Like { x: number; y: number; z: number }`
  - `const SPAWN_EDGE_INSET = 0.6`
  - `function perimeterSpawnPoint(bounds: Bounds, playerPos: Vec3Like, rng: Rng): Vec3Like`
  - `class EnemySpawner` with `get nextSpawnAt(): number`, `update(distance: number, activeCount: number): SpawnRequest | null`, `resync(distance: number): void`, `placementFor(bounds: Bounds, playerPos: Vec3Like): Vec3Like`

> **Addition to spec §5.1:** `placementFor` is a convenience wrapper that feeds
> `perimeterSpawnPoint` this spawner's own RNG, so one seed drives both timing
> and placement and `Game` does not have to own a second `Rng`. The standalone
> pure function stays exported and is what the tests exercise directly.

- [ ] **Step 1: Add the tuning constants**

Append to `src/data/enemies.ts`, below `ENEMIES`:

```ts
/**
 * Metres of travel between arrivals.
 *
 * Distance rather than time on purpose: it is already the clock the world,
 * the save file, and the debug skip all derive from, so pacing off it needs
 * no state of its own — and standing still stays genuinely safe.
 */
export const SPAWN_INTERVAL_M = 250;

/** Scavengers aboard at once. The pool holds 8, so this never starves it. */
export const MAX_ACTIVE_ENEMIES = 4;
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/enemyspawner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/math/Random';
import {
  EnemySpawner,
  perimeterSpawnPoint,
  SPAWN_EDGE_INSET,
  type Bounds,
} from '@/enemies/EnemySpawner';

const INTERVAL = 250;
const CAP = 4;

const spawner = () => new EnemySpawner('test-seed', INTERVAL, CAP);

/** The real machine: 10m x 16m, deck at 2.4 plus a metre of drop. */
const BOUNDS: Bounds = { halfWidth: 5, halfLength: 8, deckY: 3.4 };
const ORIGIN = { x: 0, y: 0, z: 0 };

describe('pacing', () => {
  it('does not spawn before the first threshold', () => {
    const s = spawner();
    expect(s.nextSpawnAt).toBe(INTERVAL);
    expect(s.update(0, 0)).toBeNull();
    expect(s.update(INTERVAL - 0.1, 0)).toBeNull();
  });

  it('spawns exactly once at the threshold', () => {
    const s = spawner();
    expect(s.update(INTERVAL, 0)?.defId).toBe('scavenger');
    expect(s.update(INTERVAL, 0)).toBeNull();
  });

  it('advances the threshold past the distance that triggered it', () => {
    const s = spawner();
    s.update(INTERVAL, 0);
    expect(s.nextSpawnAt).toBe(INTERVAL * 2);
  });

  it('spawns only once when the distance jumps several intervals', () => {
    const s = spawner();
    // The F7 skip moves 500m at a stroke and a save can load anywhere.
    // Neither may discharge a backlog onto the deck.
    expect(s.update(INTERVAL * 4 + 10, 0)).not.toBeNull();
    expect(s.update(INTERVAL * 4 + 10, 0)).toBeNull();
    expect(s.nextSpawnAt).toBeGreaterThan(INTERVAL * 4 + 10);
  });
});

describe('the concurrent cap', () => {
  it('refuses at the cap', () => {
    const s = spawner();
    expect(s.update(INTERVAL, CAP)).toBeNull();
  });

  it('holds a refused spawn rather than forgetting it', () => {
    const s = spawner();
    s.update(INTERVAL, CAP);
    // Letting four live must not quietly buy the player a lull.
    expect(s.nextSpawnAt).toBe(INTERVAL);
    expect(s.update(INTERVAL, CAP - 1)).not.toBeNull();
  });
});

describe('resync', () => {
  it('takes the next boundary ahead of a loaded distance', () => {
    const s = spawner();
    s.resync(1000);
    expect(s.nextSpawnAt).toBe(1250);
  });

  it('leaves no backlog to discharge', () => {
    const s = spawner();
    s.resync(1000);
    expect(s.update(1000, 0)).toBeNull();
  });

  it('lands strictly ahead even on an exact boundary', () => {
    const s = spawner();
    s.resync(INTERVAL);
    expect(s.nextSpawnAt).toBe(INTERVAL * 2);
  });
});

describe('spawn points', () => {
  it('sits on the deck perimeter, inset from the lip', () => {
    for (let i = 0; i < 32; i++) {
      const p = perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(i));
      const onX = Math.abs(Math.abs(p.x) - (BOUNDS.halfWidth - SPAWN_EDGE_INSET)) < 1e-9;
      const onZ = Math.abs(Math.abs(p.z) - (BOUNDS.halfLength - SPAWN_EDGE_INSET)) < 1e-9;
      // Every point is on one of the four inset edges, and none is off the deck.
      expect(onX || onZ).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(BOUNDS.halfWidth);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(BOUNDS.halfLength);
    }
  });

  it('spawns at the given deck height', () => {
    expect(perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(7)).y).toBe(BOUNDS.deckY);
  });

  it('biases away from the player', () => {
    for (let i = 0; i < 16; i++) {
      // Player pinned at the -Z end: arrivals belong at the far end.
      const p = perimeterSpawnPoint(BOUNDS, { x: 0, y: 0, z: -BOUNDS.halfLength }, new Rng(i));
      expect(p.z).toBeGreaterThan(0);
    }
  });

  it('is reproducible for a given seed', () => {
    const a = perimeterSpawnPoint(BOUNDS, { x: 1, y: 0, z: 2 }, new Rng(99));
    const b = perimeterSpawnPoint(BOUNDS, { x: 1, y: 0, z: 2 }, new Rng(99));
    expect(a).toEqual(b);
  });

  it('drives placement from the spawner's own seed', () => {
    const a = new EnemySpawner('same', INTERVAL, CAP).placementFor(BOUNDS, ORIGIN);
    const b = new EnemySpawner('same', INTERVAL, CAP).placementFor(BOUNDS, ORIGIN);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/enemyspawner.test.ts`
Expected: FAIL — cannot resolve `@/enemies/EnemySpawner`.

- [ ] **Step 4: Implement**

Create `src/enemies/EnemySpawner.ts`:

```ts
import { hashSeed, Rng } from '@/core/math/Random';
import { MAX_ACTIVE_ENEMIES, SPAWN_INTERVAL_M } from '@/data/enemies';

/**
 * Distance-driven arrivals (spec 2026-08-23-enemy-spawner-design.md).
 *
 * Pure: plain numbers in, a decision out, no Three.js and no Rapier. This is
 * NOT the threat director — there is no escalation curve and no wave
 * composition here, and adding a fake one would only have to be unpicked when
 * the real director arrives.
 */

export interface SpawnRequest {
  defId: string;
}

export interface Bounds {
  halfWidth: number;
  halfLength: number;
  /** World Y to place arrivals at. */
  deckY: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Metres in from the deck lip, so arrivals land on the deck and not the edge. */
export const SPAWN_EDGE_INSET = 0.6;

/** Candidate points considered per spawn, one per octant of the perimeter. */
const OCTANTS = 8;

export class EnemySpawner {
  private readonly rng: Rng;
  private threshold: number;

  constructor(
    seed: string,
    private readonly intervalM: number = SPAWN_INTERVAL_M,
    private readonly maxActive: number = MAX_ACTIVE_ENEMIES,
  ) {
    this.rng = new Rng(hashSeed(seed, 'enemy-spawner'));
    this.threshold = this.boundaryAfter(0);
  }

  /** The distance at which the next arrival is due. */
  get nextSpawnAt(): number {
    return this.threshold;
  }

  /**
   * One decision per call. Null when it is not yet time, or the deck is full.
   *
   * At most one spawn however far the distance jumped: a 500m debug skip or a
   * save loaded at 10km must not discharge a backlog onto the deck at once.
   */
  update(distance: number, activeCount: number): SpawnRequest | null {
    if (distance < this.threshold) return null;

    // Refused, not forgotten: the threshold deliberately does not advance, so
    // the held arrival lands as soon as one of the four dies. Advancing here
    // would reward the player for letting them live.
    if (activeCount >= this.maxActive) return null;

    this.threshold = this.boundaryAfter(distance);
    return { defId: 'scavenger' };
  }

  /** Re-derive the threshold from a distance. Used on save load. */
  resync(distance: number): void {
    this.threshold = this.boundaryAfter(distance);
  }

  /**
   * `perimeterSpawnPoint` fed from this spawner's own RNG, so one seed drives
   * both timing and placement.
   */
  placementFor(bounds: Bounds, playerPos: Vec3Like): Vec3Like {
    return perimeterSpawnPoint(bounds, playerPos, this.rng);
  }

  /** The first interval boundary strictly ahead of `distance`. */
  private boundaryAfter(distance: number): number {
    return (Math.floor(distance / this.intervalM) + 1) * this.intervalM;
  }
}

/**
 * A deck-edge point, biased away from the player.
 *
 * One candidate per octant with jitter inside it, rather than free sampling:
 * fixed octants mean coverage never depends on how lucky the RNG was, and the
 * jitter stops arrivals landing on the same eight marks forever. Taking the
 * furthest candidate costs nothing and removes the case where a scavenger
 * materialises inside the player's face.
 */
export function perimeterSpawnPoint(
  bounds: Bounds,
  playerPos: Vec3Like,
  rng: Rng,
): Vec3Like {
  let best: Vec3Like = pointOnPerimeter(bounds, 0);
  let bestDistance = -1;

  for (let i = 0; i < OCTANTS; i++) {
    const point = pointOnPerimeter(bounds, (i + rng.next()) / OCTANTS);
    const d = Math.hypot(point.x - playerPos.x, point.z - playerPos.z);
    if (d > bestDistance) {
      bestDistance = d;
      best = point;
    }
  }

  return best;
}

/** `t` in [0,1) walked around the inset deck edge from the -X/-Z corner. */
function pointOnPerimeter(bounds: Bounds, t: number): Vec3Like {
  const hw = Math.max(0, bounds.halfWidth - SPAWN_EDGE_INSET);
  const hl = Math.max(0, bounds.halfLength - SPAWN_EDGE_INSET);
  const w = hw * 2;
  const l = hl * 2;

  let s = (((t % 1) + 1) % 1) * ((w + l) * 2);

  if (s < w) return { x: -hw + s, y: bounds.deckY, z: -hl };
  s -= w;
  if (s < l) return { x: hw, y: bounds.deckY, z: -hl + s };
  s -= l;
  if (s < w) return { x: hw - s, y: bounds.deckY, z: hl };
  s -= w;
  return { x: -hw, y: bounds.deckY, z: hl - s };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit/enemyspawner.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add src/enemies/EnemySpawner.ts src/data/enemies.ts tests/unit/enemyspawner.test.ts
git commit -m "feat: add distance-driven enemy spawner"
```

---

## Task 2: Wiring, and Keeping the Existing Suites Quiet

The spawner does nothing until `Game` calls it. This task also adds the
`?nospawn=1` switch and applies it to every long-running harness, because the
moment spawning is live those suites start travelling into arrivals they were
never written to expect.

**Files:**
- Modify: `src/game/Game.ts`, `src/main.ts`, `tools/drive.mjs`, `tools/build.mjs`, `tools/craft.mjs`, `tools/combat.mjs`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `EnemySpawner`, `perimeterSpawnPoint`'s `Bounds` from Task 1
- Produces:
  - `GameOptions.enemySpawns?: boolean` — defaults true
  - `Game.spawner: EnemySpawner` (readonly field)
  - `Game.enemySpawnsEnabled: boolean` — mutable, so a harness can re-arm it

- [ ] **Step 1: Wire the spawner into Game**

In `src/game/Game.ts`, add to the imports beside the other enemy import:

```ts
import { EnemySpawner, type Bounds } from '@/enemies/EnemySpawner';
```

Add to `GameOptions`:

```ts
  /** Distance-driven arrivals. Off for harnesses that must travel undisturbed. */
  enemySpawns?: boolean;
```

Add the fields, beside `readonly enemies: EnemyManager;`:

```ts
  readonly spawner: EnemySpawner;
  /** Mutable so a harness can arm it for the one section that tests it. */
  enemySpawnsEnabled: boolean;
```

In the constructor, immediately after `this.enemies = new EnemyManager(...)`:

```ts
    this.spawner = new EnemySpawner(seed);
    this.enemySpawnsEnabled = options.enemySpawns ?? true;
```

In `fixedUpdate`, replace:

```ts
    this.machine.fixedUpdate(dt);
    this.world.fixedUpdate(dt, this.machine.speed);
```

with:

```ts
    this.machine.fixedUpdate(dt);
    this.world.fixedUpdate(dt, this.machine.speed);
    // After the world moves, so the distance the spawner reads is this tick's.
    if (!this.freeCamera) this.updateSpawns();
```

Add the method, directly above the `// --- Interaction and panels ---` section header:

```ts
  /**
   * Distance-driven arrivals.
   *
   * Deliberately NOT suppressed while a panel is open: Milestone 4 decided the
   * simulation keeps running behind panels, and making the crafting screen a
   * safe room by accident would contradict that quietly.
   */
  private updateSpawns(): void {
    if (!this.enemySpawnsEnabled) return;
    if (this.state.playerDead) return;

    const request = this.spawner.update(
      this.world.distanceTraveled,
      this.enemies.activeCount,
    );
    if (!request) return;

    const bounds: Bounds = {
      halfWidth: this.machine.deckBounds.max.x,
      halfLength: this.machine.deckBounds.max.z,
      // A metre above the deck plane, so they settle onto it rather than
      // through it — the same trick `deckSpawn` uses for the player.
      deckY: this.machine.deckBounds.min.y + 1.0,
    };
    const at = this.spawner.placementFor(bounds, this.player.worldPosition);
    this.enemies.spawn(request.defId, new THREE.Vector3(at.x, at.y, at.z));
  }
```

In `loadFrom`, immediately after `this.world.reset(save.distanceTraveled);`:

```ts
    // Derived from distance, so a load re-derives it rather than restoring it.
    this.spawner.resync(save.distanceTraveled);
```

- [ ] **Step 2: Add the URL switch**

In `src/main.ts`, in the `Game.create({ ... })` options object, after
`bypassPointerLock: params.get('nolock') === '1',`:

```ts
  enemySpawns: params.get('nospawn') !== '1',
```

Then expose the spawner on the debug handle, in the `__game` object literal
after `enemies: game.enemies,`:

```ts
  spawner: game.spawner,
```

- [ ] **Step 3: Quiet the harnesses that must travel undisturbed**

In each of `tools/drive.mjs`, `tools/build.mjs`, `tools/craft.mjs`, and
`tools/combat.mjs`, change the goto line from:

```js
await page.goto('http://localhost:5173/?nolock=1&quality=low', { waitUntil: 'load' });
```

to:

```js
// Arrivals are tested in tools/combat.mjs and nowhere else: everywhere else
// they would wander into a check that was written on a quiet deck.
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1', { waitUntil: 'load' });
```

In `tests/e2e/smoke.spec.ts`, change:

```ts
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed');
```

to:

```ts
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed&nospawn=1');
```

- [ ] **Step 4: Verify nothing regressed**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, and 324 unit tests passing.

Run, with `npm run dev` already serving:
```bash
node tools/drive.mjs && node tools/combat.mjs && node tools/build.mjs && node tools/craft.mjs
```
Expected: 9/9, 12/12, 21/21, 29/29 — unchanged, because every one of them now
boots quiet.

Run: `npm run test:e2e`
Expected: 11 passed.

- [ ] **Step 5: Confirm it works in the real game**

Run `npm run dev`, open `http://localhost:5173/`, take control, and wait. At
~7 m/s the first scavenger should appear on the deck edge after roughly 35
seconds, away from where you are standing. Press F3 to watch the `activeEnemies`
line climb, and confirm it never passes 4.

Expected: arrivals on the deck, never mid-air, never on top of you.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: spawn scavengers on the deck as the machine travels"
```

---

## Task 3: Proving It, and the README

**Files:**
- Modify: `tools/combat.mjs`, `README.md`

**Interfaces:**
- Consumes: `Game.spawner`, `Game.enemySpawnsEnabled` from Task 2

- [ ] **Step 1: Add the arrivals section to the combat harness**

Append to `tools/combat.mjs`, immediately before the `if (outShot) {` block at
the end:

```js
// --- Distance-driven arrivals ---------------------------------------------
// This harness boots with ?nospawn=1 so every check above ran on a quiet deck.
// Arm the spawner here, aligned to the distance already covered, and make the
// player invulnerable: four scavengers on a 16m deck would otherwise kill them
// mid-section and suppress the very spawns being measured.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.state.godMode = true;
  g.player.stats.invulnerable = true;
  g.enemySpawnsEnabled = true;
  g.spawner.resync(g.world.distanceTraveled);
});
await sim(0.5);
check('the deck starts clear', (await stats()).enemies === 0, `${(await stats()).enemies} aboard`);

/** Jump the world forward, the way distance actually accrues, only faster. */
const travel = (metres) =>
  page.evaluate(
    (m) => globalThis.__game.world.reset(globalThis.__game.world.distanceTraveled + m),
    metres,
  );

await travel(260);
await sim(0.5);
check(
  'travelling far enough spawns a scavenger',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);

// Cross five more thresholds. The cap should stop the last two.
for (let i = 0; i < 5; i++) {
  await travel(260);
  await sim(0.5);
}
check(
  'no more than four are aboard at once',
  (await stats()).enemies === 4,
  `${(await stats()).enemies} aboard`,
);

await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.spawner.resync(g.world.distanceTraveled);
});
await sim(0.5);
await travel(500);
await sim(0.5);
check(
  'a 500m skip produces one arrival, not two',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);
```

- [ ] **Step 2: Run the harness**

Run: `node tools/combat.mjs`
Expected: **16/16 checks passed**.

- [ ] **Step 3: Update the README**

Three edits.

Under `## What works`, replace the bullet reading `- One hostile with a
navigate/attack/pursue AI` with:

```
- One hostile with a navigate/attack/pursue AI, boarding the deck every 250m of
  travel and capped at four at once
```

Under `## Testing`, change:

```
npm test             # 310 unit tests (deterministic logic)
```

to the count `npm test` actually reports (324 if nothing else changed), and
change the combat harness line:

```
node tools/combat.mjs                               # 12 combat checks
```

to:

```
node tools/combat.mjs                               # 16 combat and spawner checks
```

Then add a line below the harness block:

```
Every harness except `combat.mjs` boots with `?nospawn=1`. They all travel far
enough to attract arrivals, and a scavenger wandering into a wall-containment
or save-reload check is a failure that only reproduces sometimes.
```

Under `## Not built yet`, the threat director stays listed — this spawner is
not it. No edit needed there.

- [ ] **Step 4: Full verification**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
node tools/drive.mjs && node tools/combat.mjs && node tools/build.mjs && node tools/craft.mjs
```

Expected: `drive` 9/9, `combat` 16/16, `build` 21/21, `craft` 29/29, 11 e2e,
324 unit, lint and build clean.

- [ ] **Step 5: Walk the success criteria**

Against spec section 10, confirm each:

1. A player who never touches a debug key is attacked while travelling — Task 2 step 5
2. Scavengers appear on the deck, never mid-air, never inside the player — Task 1 point tests plus Task 2 step 5
3. No more than four aboard at once — combat harness
4. A 500 m skip produces one arrival — combat harness
5. Loading a save produces no backlog — `resync` tests
6. Screenshot and hero shots still empty of enemies — run `node tools/shoot.mjs spawn-check.png 6000 "?nolock=1&cam=far"`, confirm the frame is clean, then delete the file
7. All existing tests and harnesses still pass — step 4

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: measure spawner arrivals, cap, and skip behaviour"
```

---

## Self-Review Notes

**Spec coverage.** Section 3 pacing → Task 1 steps 1 and 4, tested in step 2;
section 4 placement → Task 1 `perimeterSpawnPoint`; section 5.1 spawner → Task
1; 5.2 constants → Task 1 step 1; 5.3 Game → Task 2 step 1; section 6
suppression → Task 2 step 1 (`freeCamera`, `playerDead`, cap) with the
panel-open decision recorded in the method comment; section 7 persistence →
Task 2 step 1 `resync` on load, and no schema touched anywhere in this plan;
section 8 out-of-scope → nothing in any task adds escalation, enemy variety, a
`ThreatDirector`, or a navmesh; section 9 testing → Task 1 step 2 and Task 3
step 1; section 10 criteria → Task 3 step 5.

**Deferred-scope check.** No task changes `EnemyAI`, adds an enemy definition,
alters `moveSpeed`, or touches pathing. The spawner only decides when and where.

**Type consistency.** `Bounds`, `Vec3Like`, and `SpawnRequest` are defined once
in `EnemySpawner.ts` and imported by `Game`. `nextSpawnAt` is a getter in the
class, the tests, and the plan text. `enemySpawnsEnabled` is spelled the same in
`Game`, `main.ts`, and `combat.mjs`. `placementFor` is the only name used for
the seeded wrapper.

**Known risk.** Task 2 makes spawning live everywhere at once, which is why its
step 3 quiets the four long harnesses and the e2e suite in the same commit as
the wiring. Splitting those into separate commits would leave one commit where
`build.mjs` and `craft.mjs` fail intermittently.

**One deliberate gap.** Spec section 5.1 describes `resync` as covering "save
load and the F7 skip". Only save load calls it. The skip is handled by the
one-spawn-per-call rule instead, which is what success criterion 4 actually
asks for — a 500 m skip should produce one arrival, and resyncing would produce
none.
