# Animated Enemy Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the box scavenger with a rigged CC0 character whose animation is driven by the AI state that already exists, with the box remaining as the fallback when no model is present.

**Architecture:** A `ModelLoader` that never rejects, mirroring `TextureLoader`. An `EnemyVisual` that owns everything about how one enemy looks — box or skinned clone — so `Enemy` keeps owning only where it is and what it is doing. Clip resolution and capsule-fitting are pure functions, tested in node.

**Tech Stack:** TypeScript, Three.js 0.185.1 (`GLTFLoader` and `SkeletonUtils` from `three/examples/jsm`, no new dependency), Rapier, Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-animated-enemy-model-design.md`

## Global Constraints

- **Procedural is the fallback, not dead code.** With no model file, everything degrades to today's box and every suite passes. See `ASSETS.md`.
- **The capsule does not change.** `CAPSULE_RADIUS` 0.36, `CAPSULE_HALF_HEIGHT` 0.6 — a 1.92 m collider. The model is fitted to it, never the reverse.
- **No new enemy definitions.** `scavenger` stays the only one. One model.
- **The mixer advances on the render step, never the fixed step.** Animation is presentation.
- **Skinned meshes are cloned with `SkeletonUtils.clone`, never `Object3D.clone`.**
- **No save schema change.**
- **No React, no Zustand, no audio.**
- Existing suites must keep passing: **351 unit, 11 e2e, 87 harness checks** (drive 9, combat 28, build 21, craft 29).

---

## Prerequisite: the model file

**RESOLVED.** `public/models/scavenger.glb` is RobotExpressive by Tomás Laulhé
(Quaternius), CC0 1.0, taken from the three.js repository — the one CC0 rigged
character reachable without a browser. Provenance is in `ASSETS.md`. It is a
placeholder and looks like one; swapping it is a file copy.

Originally: **not automatable — see spec section 3.** A human places a CC0
rigged character at `public/models/scavenger.glb`. Candidates and requirements
are in the spec.

**If the file is absent, Tasks 1 and 2 still complete and every suite still
passes** — that is the fallback working. Only Task 3's model-present checks and
the screenshot need it. An implementer who cannot find the file should say so
and stop rather than substitute something.

---

## File Structure

```
src/art/ModelLoader.ts          Loads one glTF. Never rejects.
src/enemies/EnemyVisual.ts      Box or skinned clone; clip resolution; fit maths.

Modified:
  src/enemies/Enemy.ts          Delegates its visual; drops the death topple
  src/enemies/EnemyManager.ts   Passes the loaded model to pooled enemies
  src/game/Game.ts              Loads the model, ?nomodel=1 option
  src/main.ts                   ?nomodel=1 URL switch
  tools/combat.mjs              Fallback and model-present checks
  ASSETS.md                     Model provenance and licence
  README.md                     Counts

tests/unit/enemyvisual.test.ts
public/models/scavenger.glb     Placed by hand, not by this plan
```

---

## Task 1: Clip Resolution, Fit Maths, and the Loader

The two pure functions are where this task's bugs would hide, so they get the
tests. The loader itself is a thin wrapper whose only real requirement is that
it never throws.

**Files:**
- Create: `src/art/ModelLoader.ts`, `src/enemies/EnemyVisual.ts`
- Test: `tests/unit/enemyvisual.test.ts`

**Interfaces:**
- Consumes: `EnemyAIState` from `@/enemies/EnemyAI`
- Produces:
  - `interface LoadedModel { scene: THREE.Group; clips: THREE.AnimationClip[] }`
  - `function loadModel(url: string): Promise<LoadedModel | null>`
  - `type ClipName = string`
  - `function resolveClip(names: readonly string[], state: EnemyAIState): string | null`
  - `interface CapsuleFit { scale: number; yOffset: number }`
  - `function fitToCapsule(modelHeight: number, modelMinY: number, capsuleHeight: number): CapsuleFit`

- [x] **Step 1: Write the failing test**

Create `tests/unit/enemyvisual.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fitToCapsule, resolveClip } from '@/enemies/EnemyVisual';

// A pack that names things the obvious way.
const TYPICAL = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];

describe('clip resolution', () => {
  it('maps every AI state to a clip', () => {
    for (const state of ['idle', 'navigate', 'pursue', 'attack', 'dead'] as const) {
      expect(resolveClip(TYPICAL, state)).not.toBeNull();
    }
  });

  it('maps the states to the clips a player would expect', () => {
    expect(resolveClip(TYPICAL, 'idle')).toBe('Idle');
    expect(resolveClip(TYPICAL, 'navigate')).toBe('Walk');
    expect(resolveClip(TYPICAL, 'pursue')).toBe('Run');
    expect(resolveClip(TYPICAL, 'attack')).toBe('Attack');
    expect(resolveClip(TYPICAL, 'dead')).toBe('Death');
  });

  it('matches case-insensitively', () => {
    expect(resolveClip(['idle', 'WALK'], 'navigate')).toBe('WALK');
  });

  it('matches a substring, since packs prefix their clip names', () => {
    // Real packs ship names like "Armature|CharacterArmature_Walk".
    expect(resolveClip(['Armature|Character_Walk'], 'navigate')).toBe(
      'Armature|Character_Walk',
    );
  });

  it('falls back down the chain when the preferred clip is missing', () => {
    // No Run: a pursuing enemy should walk rather than freeze.
    expect(resolveClip(['Idle', 'Walk'], 'pursue')).toBe('Walk');
  });

  it('falls back to the first clip rather than returning nothing', () => {
    expect(resolveClip(['SomeOddName'], 'attack')).toBe('SomeOddName');
  });

  it('returns null only when there are no clips at all', () => {
    expect(resolveClip([], 'idle')).toBeNull();
  });

  it('does not confuse walk and run when both exist', () => {
    // "Run" is a substring of nothing here, but "Walk" must not win for pursue.
    expect(resolveClip(['Walk', 'Run'], 'pursue')).toBe('Run');
    expect(resolveClip(['Walk', 'Run'], 'navigate')).toBe('Walk');
  });
});

describe('fitting a model to the capsule', () => {
  const CAPSULE_HEIGHT = 1.92;

  it('scales a model to the capsule height', () => {
    const fit = fitToCapsule(3.84, 0, CAPSULE_HEIGHT);
    expect(fit.scale).toBeCloseTo(0.5, 6);
  });

  it('scales a small model up as readily as a large one down', () => {
    expect(fitToCapsule(0.96, 0, CAPSULE_HEIGHT).scale).toBeCloseTo(2, 6);
  });

  it('puts the feet at the capsule base when the origin is at the feet', () => {
    // Origin already at the feet: nothing to correct.
    expect(fitToCapsule(1.92, 0, CAPSULE_HEIGHT).yOffset).toBeCloseTo(0, 6);
  });

  it('corrects an origin that sits above the feet', () => {
    // Model spans -0.5..1.5 around its origin, so its feet are half a metre
    // below it and it must be lifted by that much, scaled.
    const fit = fitToCapsule(2.0, -0.5, CAPSULE_HEIGHT);
    expect(fit.yOffset).toBeCloseTo(0.5 * fit.scale, 6);
  });

  it('survives a degenerate zero-height model', () => {
    // A model that failed to import must not produce Infinity and poison the
    // whole scene graph.
    const fit = fitToCapsule(0, 0, CAPSULE_HEIGHT);
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.scale).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/enemyvisual.test.ts`
Expected: FAIL — cannot resolve `@/enemies/EnemyVisual`.

- [x] **Step 3: Implement the loader**

Create `src/art/ModelLoader.ts`:

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * One loaded glTF: its scene graph and its animation clips.
 *
 * Mirrors `TextureLoader`. The project generates its visuals in code and still
 * does — a model is an enhancement layered on top, never a dependency.
 */
export interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/**
 * Load a glTF. Never rejects.
 *
 * Null when the file is absent, undecodable, or was never requested. The
 * caller has a working procedural path for exactly that case, and a 404 should
 * cost a nicer-looking scavenger rather than a boot.
 */
export async function loadModel(url: string): Promise<LoadedModel | null> {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    return { scene: gltf.scene, clips: gltf.animations };
  } catch {
    return null;
  }
}
```

- [x] **Step 4: Implement the pure parts of the visual**

Create `src/enemies/EnemyVisual.ts` with the two pure functions first. The
class comes in Task 2 — this step is only what the tests reach.

```ts
import type { EnemyAIState } from './EnemyAI';

/**
 * Clip names to try for each AI state, best first.
 *
 * Ordered rather than exact because clip names vary between packs, and a pack
 * missing one should degrade to a worse-matching clip rather than freeze. A
 * pursuing enemy with no Run clip should walk.
 */
const CLIP_PREFERENCES: Record<EnemyAIState, readonly string[]> = {
  idle: ['idle'],
  navigate: ['walk', 'run'],
  pursue: ['run', 'walk'],
  attack: ['attack', 'punch', 'hit'],
  dead: ['death', 'die'],
};

/**
 * The clip to play for a state, or null when the model has none at all.
 *
 * Matches on substring and ignores case: real packs ship names like
 * `Armature|CharacterArmature_Walk`, and an exact match would find nothing.
 */
export function resolveClip(
  names: readonly string[],
  state: EnemyAIState,
): string | null {
  if (names.length === 0) return null;

  for (const wanted of CLIP_PREFERENCES[state]) {
    const found = names.find((name) => name.toLowerCase().includes(wanted));
    if (found) return found;
  }

  // Something is better than a frozen character in a T-pose.
  return names[0] ?? null;
}

export interface CapsuleFit {
  scale: number;
  yOffset: number;
}

/**
 * Scale and lift a model so it fills the collider and stands on its feet.
 *
 * Derived from the capsule rather than hard-coded, so the drawn character and
 * the solid one cannot drift apart — a mismatch between what is drawn and what
 * is solid is the class of bug that put enemies inside the prow.
 */
export function fitToCapsule(
  modelHeight: number,
  modelMinY: number,
  capsuleHeight: number,
): CapsuleFit {
  // A zero-height model means a failed import. Returning Infinity here would
  // poison every transform downstream, so refuse to scale instead.
  const scale = modelHeight > 1e-6 ? capsuleHeight / modelHeight : 1;
  return { scale, yOffset: -modelMinY * scale };
}
```

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit/enemyvisual.test.ts`
Expected: PASS, 13 tests.

- [x] **Step 6: Verify nothing else moved**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, 364 unit tests.

- [x] **Step 7: Commit**

```bash
git add src/art/ModelLoader.ts src/enemies/EnemyVisual.ts tests/unit/enemyvisual.test.ts
git commit -m "feat: add model loading, clip resolution, and capsule fitting"
```

---

## Task 2: The Visual, Wired Into the Enemy

**Files:**
- Modify: `src/enemies/EnemyVisual.ts`, `src/enemies/Enemy.ts`, `src/enemies/EnemyManager.ts`, `src/game/Game.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `LoadedModel`, `resolveClip`, `fitToCapsule` from Task 1
- Produces:
  - `class EnemyVisual` with `object3D`, `setState(state)`, `update(dt)`, `dispose()`
  - `GameOptions.models?: boolean` — defaults true
  - `EnemyManager` constructor gains a trailing `model: LoadedModel | null` parameter

- [x] **Step 1: Implement the visual class**

Append to `src/enemies/EnemyVisual.ts`:

```ts
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { buildEnemyMesh } from './EnemyMesh';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from './Enemy';

/** Seconds to blend between animation states. */
const CROSS_FADE = 0.18;

/**
 * How one enemy looks: a box, or an animated character.
 *
 * Split from `Enemy` so that class keeps owning only where the enemy is and
 * what it is doing. Everything here is presentation and none of it feeds back
 * into the simulation.
 */
export class EnemyVisual {
  readonly object3D = new THREE.Group();

  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentState: EnemyAIState | null = null;
  private readonly clipNames: string[] = [];

  constructor(model: LoadedModel | null, materials: Materials) {
    if (!model) {
      // The fallback, and the path every harness runs on.
      this.object3D.add(buildEnemyMesh(materials));
      this.object3D.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
      return;
    }

    // SkeletonUtils, never Object3D.clone: a plain clone shares the skeleton,
    // and every pooled enemy then animates as one, holding whichever pose the
    // last mixer to run produced.
    const scene = cloneSkinned(model.scene);

    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const fit = fitToCapsule(size.y, box.min.y, (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) * 2);

    scene.scale.setScalar(fit.scale);
    scene.position.y = fit.yOffset;
    this.object3D.add(scene);
    this.object3D.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);

    this.mixer = new THREE.AnimationMixer(scene);
    for (const clip of model.clips) {
      this.clipNames.push(clip.name);
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  /** Cross-fade to the clip for an AI state. Repeat calls for a state are free. */
  setState(state: EnemyAIState): void {
    if (!this.mixer || state === this.currentState) return;
    this.currentState = state;

    const name = resolveClip(this.clipNames, state);
    const next = name ? this.actions.get(name) : undefined;
    if (!next || next === this.current) return;

    // Death holds its final pose. Left looping, the corpse springs back
    // upright partway through its despawn timer.
    if (state === 'dead') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }

    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, CROSS_FADE, false);
    this.current = next;
  }

  /**
   * Advance the animation.
   *
   * Driven from the render step, where a real frame delta exists. Advancing it
   * on the fixed step instead makes playback stutter whenever frame rate and
   * tick rate disagree, which is most of the time.
   */
  update(dt: number): void {
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
  }
}
```

> **Note on `buildEnemyMesh`:** it currently lives inside `src/enemies/Enemy.ts`.
> Move it and the two capsule constants to a new `src/enemies/EnemyMesh.ts` and
> re-export the constants from `Enemy.ts` if anything else imports them. Leaving
> them in `Enemy.ts` creates a circular import with `EnemyVisual`.

- [x] **Step 2: Delegate from Enemy**

In `src/enemies/Enemy.ts`:

- Replace the `object3D` construction with `this.visual = new EnemyVisual(model, materials)` and expose `get object3D() { return this.visual.object3D; }`.
- The constructor gains a trailing `model: LoadedModel | null` parameter.
- In `fixedUpdate`, after the AI step, call `this.visual.setState(this.state)`.
- In `update(alpha)`, **delete** the `rotation.z` death topple — the death clip replaces it — and **delete** the `object3D.position.y -= CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS` line, which now lives inside `EnemyVisual`. Keep the position lerp and the `rotation.y = facing`.
- `Enemy` needs no mixer tick of its own; `EnemyManager.update` drives it.

- [x] **Step 3: Pass the model through the manager**

In `src/enemies/EnemyManager.ts`:

- The constructor gains a trailing `private readonly model: LoadedModel | null = null`.
- `spawn` passes `this.model` when constructing a pooled `Enemy`.
- `update(alpha)` gains a frame delta so it can advance mixers:

```ts
  update(alpha: number, dt: number): void {
    for (const e of this.pool) e.update(alpha, dt);
  }
```

`Enemy.update(alpha, dt)` forwards `dt` to `this.visual.update(dt)`.

- [x] **Step 4: Wire Game**

In `src/game/Game.ts`:

- `GameOptions` gains `models?: boolean` with the same comment style as `textures`.
- In `create`, after the texture load:

```ts
    const model = options.models === false ? null : await loadModel('models/scavenger.glb');
    game.enemies.setModel(model);
```

Add `EnemyManager.setModel(model)` rather than threading it through the
constructor — `EnemyManager` is built inside `Game`'s constructor, which is
synchronous, and the model is not available until after it.

`setModel` must clear the pool, since pooled enemies were built with the old
visual:

```ts
  /** Swap the model every future enemy is built from. Empties the pool. */
  setModel(model: LoadedModel | null): void {
    this.despawnAll();
    for (const enemy of this.pool) enemy.dispose();
    this.pool.length = 0;
    this.model = model;
  }
```

- In `Game.render`, pass the frame delta: `this.enemies.update(alpha, frameDt);`
- In `src/main.ts`, add `models: params.get('nomodel') !== '1',` beside the `textures` option.

- [x] **Step 5: Verify the fallback path is untouched**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, 364 unit tests.

With `npm run dev` running:
```bash
node tools/drive.mjs && node tools/combat.mjs && node tools/build.mjs && node tools/craft.mjs
```
Expected: 9/9, 28/28, 21/21, 29/29 — unchanged. **These all run the fallback
path**, so if any of them moved, the box visual regressed.

Run: `npm run test:e2e`
Expected: 11 passed.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: drive enemy animation from AI state, box as fallback"
```

---

## Task 3: Proving It, and the Docs

**Files:**
- Modify: `tools/combat.mjs`, `ASSETS.md`, `README.md`

- [x] **Step 1: Add the fallback check**

The suite already runs modelless, but nothing asserts it *deliberately*. Append
to the death section of `tools/combat.mjs`:

```js
// --- The enemy visual ------------------------------------------------------
// This harness boots with nomodel=1, so this is the procedural fallback and it
// must stay a complete enemy, not a degraded one.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.enemies.spawn('scavenger', { x: 0, y: 3.4, z: 2 });
});
await sim(0.5);
const fallbackVisual = await page.evaluate(() => {
  const e = globalThis.__game.enemies.active[0];
  let meshes = 0;
  e.object3D.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes++; });
  return { meshes, visible: e.object3D.visible };
});
check(
  'an enemy renders without a model file',
  fallbackVisual.meshes > 0 && fallbackVisual.visible,
  `${fallbackVisual.meshes} mesh(es)`,
);
```

- [x] **Step 2: Add the shared-skeleton check**

**This is the check that matters.** It is the only thing that catches the
`Object3D.clone` bug, and no unit test can reach it. It requires the model, so
it runs against a second page booted **without** `nomodel=1`:

```js
// --- Animated model, when one is present -----------------------------------
const modelPage = await browser.newPage({ viewport: { width: 640, height: 360 } });
await modelPage.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1', {
  waitUntil: 'load',
});
await modelPage.waitForTimeout(6000);

const hasModel = await modelPage.evaluate(
  () => globalThis.__game.enemies.hasModel === true,
);

if (!hasModel) {
  console.log('SKIP  animated model checks -- public/models/scavenger.glb not present');
} else {
  // Two enemies, deliberately driven into different AI states: one far away
  // and idle, one on top of the player and attacking.
  const poses = await modelPage.evaluate(async () => {
    const g = globalThis.__game;
    g.game.player.stats.invulnerable = true;
    g.game.enemies.despawnAll();
    g.game.player.teleport({ x: 0, y: 3.6, z: 2 });
    g.game.enemies.spawn('scavenger', { x: 0, y: 3.4, z: 3.5 });
    g.game.enemies.spawn('scavenger', { x: -4, y: 3.4, z: -7 });
    return true;
  });
  void poses;

  // Let them settle into their states and let the mixers run.
  await modelPage.waitForTimeout(4000);

  const result = await modelPage.evaluate(() => {
    const g = globalThis.__game;
    const [a, b] = g.enemies.active;
    const bonesOf = (e) => {
      const out = [];
      e.object3D.traverse((o) => { if (o.isBone) out.push(o.position.y + o.rotation.x); });
      return out;
    };
    const skinned = (e) => {
      let n = 0;
      e.object3D.traverse((o) => { if (o.isSkinnedMesh) n++; });
      return n;
    };
    const pa = bonesOf(a);
    const pb = bonesOf(b);
    const differing = pa.filter((v, i) => Math.abs(v - (pb[i] ?? 0)) > 1e-4).length;
    return { states: [a.aiState, b.aiState], skinnedA: skinned(a), differing, bones: pa.length };
  });

  check('an enemy renders as a skinned mesh', result.skinnedA > 0, `${result.skinnedA}`);
  check(
    'two enemies in different states hold different poses',
    result.differing > 0,
    `states ${result.states.join('/')}, ${result.differing} of ${result.bones} bones differ`,
  );
}
await modelPage.close();
```

`EnemyManager` needs `get hasModel(): boolean { return this.model !== null; }`
for the skip condition.

**The skip is deliberate, and it must print.** A silently-skipped check reads
as a passing one, which is how a broken model pipeline ships green.

- [x] **Step 3: Screenshot**

With the model in place:

```bash
node tools/combat.mjs enemy-model.png
```

Confirm the scavenger faces the player, stands on the deck rather than in it,
and is roughly player height. Delete the PNG afterwards; it is not committed.

- [x] **Step 4: Update the docs**

In `ASSETS.md`, add a **Models** section above the policy, recording the pack
actually used, its licence, its URL, and the path. Follow the table style of
the Textures section.

In `README.md`, update the combat harness line to the count `node tools/combat.mjs`
actually reports, and the `npm test` line to what `npm test` reports.

- [x] **Step 5: Full verification**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
node tools/drive.mjs && node tools/combat.mjs && node tools/build.mjs && node tools/craft.mjs
```

Expected: `drive` 9/9, `build` 21/21, `craft` 29/29, combat at its new count,
11 e2e, lint and build clean.

- [x] **Step 6: Walk the success criteria** — all seven confirmed

Against spec section 11, confirm each of the seven. Criterion 6 — everything
degrades to the box with no model present — is checked by temporarily renaming
`public/models/scavenger.glb`, running `node tools/combat.mjs`, confirming the
model checks SKIP and everything else passes, then renaming it back.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "test: prove the enemy visual, and that pooled enemies pose independently"
```

---

## Self-Review Notes

**Spec coverage.** Section 3 acquisition → the Prerequisite section; 4.1 loader
→ Task 1 step 3; 4.2 visual → Task 1 step 4 and Task 2 step 1; 4.3 `Enemy`
integration → Task 2 step 2; 4.4 `Game` → Task 2 step 4; section 5 animation
mapping → Task 1's `CLIP_PREFERENCES`, tested in step 1, with the death clamp in
Task 2 step 1; section 6 fitting → `fitToCapsule`, tested; section 7 performance
→ the model is loaded once and cloned per pooled enemy in `EnemyVisual`'s
constructor, never per spawn; section 8 persistence → no task touches the save;
section 9 testing → Task 1 step 1 and Task 3; section 10 out-of-scope → no task
adds variety, ragdoll, IK, attack-timed damage, or LOD; section 11 criteria →
Task 3 step 6.

**Type consistency.** `LoadedModel` is defined once in `ModelLoader.ts` and
imported by `EnemyVisual`, `Enemy`, `EnemyManager`, and `Game`. `EnemyAIState`
comes from `EnemyAI` throughout. `resolveClip` and `fitToCapsule` keep the same
signatures in the tests and both implementation steps. `update(alpha, dt)` is
the signature in `Enemy`, `EnemyManager`, and `Game.render` alike.

**Known risk — the circular import.** `EnemyVisual` needs `buildEnemyMesh` and
the capsule constants, both currently inside `Enemy.ts`, which will import
`EnemyVisual`. Task 2 step 1 moves them to `EnemyMesh.ts` for that reason. An
implementer who skips the move will hit a confusing runtime `undefined` rather
than a clean compile error, because circular ES module imports resolve to
partially-initialised bindings.

**Known risk — the pool.** `EnemyManager` builds enemies lazily and keeps them.
`setModel` must empty the pool, or enemies constructed before the model arrives
keep their boxes forever and the model silently never appears.

**Deliberate gap.** The animated-model harness checks need a file this plan
cannot fetch. They skip loudly rather than fail, so the suite is honest in both
states — but a green run with the model absent has NOT tested the model path,
and Task 3 step 6 is what closes that.
