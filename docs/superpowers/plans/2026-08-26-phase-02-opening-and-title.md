# Phase 2 — The Opening & Title Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the game a front door — a title screen over the live walking
machine — and a story hook in the first sixty seconds: chased by scavengers
across a rooftop, cornered on a ledge, the player jumps onto the machine
below, and the moment they land it starts walking.

**Architecture:** A small pure state machine (`OpeningDirector`) drives four
phases: `title → rooftop → landed → done`. The rooftop is a static building at
a fixed world position beside the machine, which idles at throttle 0 until the
player lands — so nothing scrolls during the chase and no moving-platform
carry is needed anywhere. The title screen is a DOM overlay in `src/ui/` over
the running renderer, using the existing free-camera preset machinery for its
background shot.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest (node, no
DOM), Playwright, DOM/CSS for menus.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Phase 2)

**Status:** READY FOR FINAL PASS — gets a short design confirmation before
execution, per roadmap §7.

**Depends on:** nothing new. Independent of Phase 1 (damage/repair).

## Global Constraints

- Fixed 60Hz simulation; typed event bus; stats and definitions in
  `src/data/`; the machine never moves from the origin.
- Every task ends green: `npx tsc --noEmit && npx vitest run && npx eslint
  src tests`. Tests run in node — no DOM, no canvas; browser proof lives in
  `tools/` harnesses and `tests/e2e/`.
- Asset policy: free open-source web assets, MVP-scale, CC0 preferred, CC-BY
  recorded in `ASSETS.md`. Loaders never reject; every harness boots
  assetless (`notex=1`, `nomodel=1`).
- **Existing harnesses must stay green.** The game currently boots straight
  into gameplay; every harness and e2e test depends on that. The title
  screen and opening are therefore *opt-out by URL param* (see Design
  decisions) and every harness boot string gains the param in this phase.
- Commit style: narrative lowercase subjects (`feat: the machine walks`).

---

## Design Decisions

**The machine waits; the world does not scroll during the chase.** The
architecture pins the machine at the origin and scrolls the world past it, so
"the machine walks past below and you jump on" would make the rooftop a
moving platform: a kinematic collider translated every step, with the
player's and every chasing enemy's `carry` fed from it — three systems
touched to sell four seconds. Instead the machine sits at throttle 0
(`MachineMovement.setThrottle(0)` exists and converges smoothly), idling
beside a **static** building. The chase happens on solid, unmoving ground;
the player jumps, lands on the deck, and the landing is what pushes the
throttle to 1 — the machine visibly starts walking underneath them, which is
the exact story beat requested ("he jumps onto the machine and from there it
starts moving forward"). The building then recedes with the scrolling world.
The rejected moving-platform variant is recorded here so nobody re-derives
it; it becomes worth doing only if a later authored opening needs a moving
jump.

**Where the building stands.** The machine's deck is `x ∈ [-5, 5]`, deck
surface at `DECK_SURFACE_Y = 3.69`. The building sits at `x ≈ +11` (clear of
the +50 build envelope is impossible — it is inside it, but the opening is
over before the player can build, and the building despawns), footprint
about 10m × 10m, roof at `y ≈ 6.6` (one storey above the deck: a committed
jump with fall, not a hop). The ledge corner overhangs toward the machine so
the horizontal gap from ledge to deck edge is ~2.5m — clearable from a
running jump at `PLAYER_JUMP_HEIGHT = 1.1` and walk speed, measured in the
harness, not assumed. The building scrolls away with the world after
departure by translating its kinematic body by the world's scroll delta each
step (only after the player has left it, so nothing stands on it while it
moves).

**The chase is real gameplay, not a cutscene.** The player spawns at the far
corner of the roof; two scavengers spawn between them and the stairs' stub
(a blocked door — flavour geometry), so the only way out is the ledge. The
existing `EnemyManager` pursue AI walks them at the player. The player is
unarmed until they land (weapons granted on landing) so the answer is run.
Scavengers left on the roof when the machine departs are despawned by the
existing lost-in-the-desert rule once the roof scrolls away.

**Landing detection.** The player is `landed` when grounded
(`player.isGrounded`) with position inside the deck bounds
(`|x| ≤ 5, |z| ≤ 8, y` within a metre of `DECK_SURFACE_Y`). Falling to the
sand instead triggers the existing `LOST_IN_THE_DESERT_S` death, and respawn
during the `rooftop` phase restarts the player on the roof rather than the
deck.

**Title screen wraps the existing boot.** `main.ts` currently calls
`game.start()` immediately. With this phase, boot pauses in `title` phase:
the sim runs (so the background is the machine walking at full stride, shot
from the existing `far` free-camera preset), enemy spawns are off, and the
HUD is hidden. Menu: **New Game** (fresh state, then the rooftop opening),
**Continue** (loads the existing IndexedDB save, skips the opening, straight
to `done`; hidden when no save exists), **Settings** (volume, quality tier —
the two switches that already exist as runtime toggles). `Esc` during play
opens the same menu with Resume in place of New Game.

**Opt-outs.** `?nomenu=1` boots straight into gameplay exactly as today
(title skipped, opening skipped) — every harness and Playwright test adds
it. `?opening=1` forces the rooftop opening even with `nomenu` (for the
opening harness). During the rooftop phase a `Skip` prompt (hold Esc 1s)
teleports the player to the deck and completes the opening; the opening
plays on New Game only.

## Open Questions (with recommended defaults)

1. **Does the opening end with a title card?** Recommended: yes — the game's
   name fades over the first seconds of the machine walking after landing.
   Cheap (DOM), big mood payoff.
2. **Is the player armed on the roof?** Recommended: no (run, don't fight);
   weapons granted on landing. If playtests feel bad, granting the rifle
   with no ammo is the fallback.

## Asset Needs

| Need | Candidates | Licence | Fallback |
| --- | --- | --- | --- |
| Rooftop clutter (AC unit, antenna, vents) | poly.pizza search "air conditioner", "antenna", "vent" (Kenney, Quaternius) | CC0 only | bare procedural roof — clutter is dressing |
| Building shell | none — built procedurally like the machine (`bevelledBox`), because the roof is standable and its collider must derive from its geometry | — | is the primary |
| Title screen type | system font stack in CSS (matches HUD) | — | — |
| Sounds (chase sting, jump whoosh, landing clang, throttle-up) | synthesised in `SoundBank` per audio policy | — | is the primary |

## File Structure

**Create:**
- `src/game/OpeningDirector.ts` — the pure phase state machine: inputs in,
  phase + one-shot effects out. No Three, no Rapier, no DOM.
- `src/world/RooftopSet.ts` — builds the building's meshes and colliders,
  scrolls itself after departure, despawns when far behind.
- `src/ui/TitleScreen.ts` — DOM overlay: menu, settings, skip prompt, title
  card. Reads/writes nothing but its own DOM; all game effects via
  callbacks handed in.
- `tests/unit/openingdirector.test.ts`
- `tools/opening.mjs` — browser harness: drives New Game → chase → jump →
  landing → throttle-up, asserts each transition.

**Modify:**
- `src/main.ts` — `nomenu`/`opening` params; hand `hudRoot` a sibling root
  for the title screen.
- `src/game/Game.ts` — own `OpeningDirector` + `RooftopSet`; spawn logic for
  the rooftop phase; throttle control; weapons-on-landing; respawn-to-roof.
- `src/core/events/GameEvents.ts` — `opening:phase` event.
- `src/ui/hud.css` — title screen styles (same file, matching idiom).
- `tools/*.mjs`, `tests/e2e/*.ts`, `playwright.config.ts` boot URLs — add
  `nomenu=1`.

---

### Task 1: The opening state machine

**Files:**
- Create: `src/game/OpeningDirector.ts`
- Test: `tests/unit/openingdirector.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type OpeningPhase = 'title' | 'rooftop' | 'landed' | 'done'`;
  class `OpeningDirector` with `phase: OpeningPhase`,
  `begin(mode: 'new-game' | 'continue' | 'skipped')`,
  `update(input: OpeningInput): OpeningEffect[]`, `toSave()/restore()`.
  `interface OpeningInput { playerGrounded: boolean; playerPos: Vec3Like;
  skipHeld: boolean; dt: number }`;
  `type OpeningEffect = 'spawn-rooftop' | 'grant-weapons' | 'throttle-up' |
  'show-title-card' | 'teardown-rooftop'`.

- [ ] **Step 1: Write the failing test.** Cases: starts in `title`;
  `begin('continue')` and `begin('skipped')` jump straight to `done` with no
  effects; `begin('new-game')` enters `rooftop` emitting `spawn-rooftop`;
  landing on the deck (grounded inside `|x|≤5, |z|≤8`, `y` within 1m of
  `DECK_SURFACE_Y`) transitions to `landed` emitting `grant-weapons` and
  `throttle-up` exactly once; grounded on the ROOF (y ≈ 6.6) does NOT count
  as landed; `skipHeld` accumulating 1.0s of `dt` completes from `rooftop`;
  `landed` proceeds to `done` after the title-card delay, emitting
  `show-title-card` then `teardown-rooftop`; effects never repeat on
  subsequent updates; save/restore round-trips `done` (a reloaded finished
  game never replays the opening).

```ts
// tests/unit/openingdirector.test.ts — core shape
import { describe, expect, it } from 'vitest';
import { OpeningDirector } from '@/game/OpeningDirector';
import { DECK_SURFACE_Y } from '@/game/constants';

const onDeck = { playerGrounded: true, playerPos: { x: 0, y: DECK_SURFACE_Y, z: 0 }, skipHeld: false, dt: 1 / 60 };
const onRoof = { ...onDeck, playerPos: { x: 11, y: 6.6, z: 0 } };

it('lands only on the deck, not on the roof it jumped from', () => {
  const d = new OpeningDirector();
  d.begin('new-game');
  expect(d.update(onRoof)).toEqual([]);
  expect(d.phase).toBe('rooftop');
  const effects = d.update(onDeck);
  expect(effects).toContain('throttle-up');
  expect(d.phase).toBe('landed');
  expect(d.update(onDeck)).not.toContain('throttle-up'); // one-shot
});
```

- [ ] **Step 2: Run it, watch it fail** (`npx vitest run
  tests/unit/openingdirector.test.ts` — cannot resolve module).
- [ ] **Step 3: Implement** — a phase field, a set of already-fired effects,
  deck-bounds test in one place with the constants imported, a skip
  accumulator, a title-card timer (`TITLE_CARD_DELAY_S = 2`).
- [ ] **Step 4: Run to green, full suite, commit** —
  `feat: the opening knows where it is`.

---

### Task 2: The rooftop set

**Files:**
- Create: `src/world/RooftopSet.ts`
- Test: additions to `tools/opening.mjs` (Task 5); pure parts (ledge and
  spawn coordinates as exported constants) asserted in
  `tests/unit/openingdirector.test.ts`.

**Interfaces:**
- Consumes: `PhysicsWorld` (fixed colliders API, same one
  `Machine`/`BuildSystem` use), `Materials`.
- Produces: class `RooftopSet` with `build()`, `scroll(deltaZ: number)`,
  `readonly playerSpawn: Vec3`, `readonly enemySpawns: Vec3[]`,
  `readonly gone: boolean`, `dispose()`; exported constants
  `ROOFTOP_ROOF_Y`, `ROOFTOP_LEDGE`, used by tests and `Game`.

- [ ] **Step 1: Build the shell procedurally** — building at `x ≈ +11`,
  10×10m footprint, roof slab collider at `ROOFTOP_ROOF_Y = 6.6`, parapet
  walls on three sides (blocking retreat), the ledge corner open toward the
  machine, a blocked stair-stub doorway for flavour. Reuse the machine's
  `bevelledBox` idiom and `Materials.hull`-family surfaces.
- [ ] **Step 2: Scrolling-away behaviour** — `scroll(deltaZ)` translates
  group and colliders; `gone` once 80m behind; `dispose()` frees both.
  Called by `Game` only after the opening's `teardown-rooftop` effect.
- [ ] **Step 3: Wire visual dressing behind the model loader** — optional
  CC0 roof clutter via `loadModel`, never blocking, per asset policy.
- [ ] **Step 4: Full suite, commit** —
  `feat: a rooftop to be chased across`.

---

### Task 3: Title screen and menus

**Files:**
- Create: `src/ui/TitleScreen.ts`
- Modify: `src/ui/hud.css`
- Test: `tests/e2e/title.spec.ts` (new-game flow, continue hidden without a
  save, `nomenu=1` boots straight in).

**Interfaces:**
- Consumes: callbacks `{ onNewGame, onContinue, onSettings(change), hasSave:
  () => Promise<boolean> }` handed from `Game`.
- Produces: `class TitleScreen { show(mode: 'boot' | 'pause'): void;
  hide(): void; showTitleCard(text: string): void; showSkipHint(): void }`.

- [ ] **Step 1: DOM + CSS** — full-screen overlay in the HUD idiom (same
  palette variables as `hud.css`), game name as styled text, menu list
  keyboard- and mouse-navigable. Background is simply the live canvas.
- [ ] **Step 2: Wire the free camera for the backdrop** — while in `title`
  phase, `Game` uses the existing `far` free-camera preset and machine
  throttle 1, HUD hidden, spawns off; leaving `title` restores the player
  rig. This reuses `freeCamera` plumbing already in `Game`/`main.ts`.
- [ ] **Step 3: Settings panel** — volume (AudioEngine master), quality tier
  (existing `nextQualityTier` machinery); persisted to `localStorage`,
  applied on boot. Small on purpose; Phase 15 grows it.
- [ ] **Step 4: Pause menu reuse** — `Esc` in play shows `mode: 'pause'`
  (Resume/Settings/Quit-to-title). Pointer lock released and re-taken.
- [ ] **Step 5: e2e, full suite, commit** —
  `feat: the game has a front door`.

---

### Task 4: Wiring the opening into Game

**Files:**
- Modify: `src/game/Game.ts`, `src/main.ts`,
  `src/core/events/GameEvents.ts`
- Test: `tests/unit/openingdirector.test.ts` already covers the logic; the
  wiring is proven in Task 5's harness.

**Interfaces:**
- Consumes: everything above.
- Produces: `game.opening: OpeningDirector` (exposed on `__game` for
  harnesses); `'opening:phase': { phase: OpeningPhase }` bus event;
  `GameOptions.menu?: boolean` and `GameOptions.forceOpening?: boolean`.

- [ ] **Step 1: Params and boot flow** — `nomenu=1` ⇒ `begin('skipped')`
  exactly reproduces today's boot. Otherwise boot into `title`; New Game ⇒
  `begin('new-game')`; Continue ⇒ load save then `begin('continue')`.
- [ ] **Step 2: Rooftop phase effects** — on `spawn-rooftop`: build
  `RooftopSet`, teleport player to `playerSpawn`, spawn two scavengers at
  `enemySpawns` via `EnemyManager`, hold `machine.movement.setThrottle(0)`,
  strip weapons. On `throttle-up`: `setThrottle(1)`, grant rifle+shotgun
  (the current default loadout path). On `teardown-rooftop`: begin
  scrolling the set with the world's per-step delta until `gone`.
- [ ] **Step 3: Respawn-to-roof** — while phase is `rooftop`, death respawns
  at `playerSpawn` (restart the chase) rather than mid-deck.
- [ ] **Step 4: Update every harness and e2e boot URL** with `nomenu=1`
  (`tools/drive.mjs`, `build.mjs`, `craft.mjs`, `combat.mjs`, `shoot.mjs`
  callers, `tests/e2e/*`). Run each.
- [ ] **Step 5: Full suite, commit** —
  `feat: the story starts on a rooftop with nowhere left to run`.

---

### Task 5: The opening harness

**Files:**
- Create: `tools/opening.mjs`

- [ ] **Step 1: Script the happy path** — boot `?opening=1&nolock=1&notex=1&
  nomodel=1&nosound=1`; assert phase `rooftop`; assert machine speed ≈ 0;
  drive the player along the roof (existing input-injection idiom from
  `drive.mjs`), assert both scavengers pursue (positions converge); jump
  from the ledge; assert phase reaches `landed` then `done`; assert machine
  speed rises toward `BASE_MACHINE_SPEED`; assert weapons granted.
- [ ] **Step 2: The miss path** — jump short deliberately; assert
  lost-in-the-desert death fires and respawn lands back on the roof with
  phase still `rooftop`.
- [ ] **Step 3: The skip path** — hold Esc; assert completion and teleport.
- [ ] **Step 4: Wire into the README's harness table, full suite, commit** —
  `feat: the leap is measured, not assumed`.

---

## Interfaces Other Phases Rely On

- `OpeningPhase` / `'opening:phase'` bus event — Phase 9 (radio & Chapter 1)
  attaches the premise to the opening's completion; Phase 15 replaces the
  placeholder chase with the authored version behind the same
  `OpeningDirector` phases.
- `TitleScreen` with `show('boot' | 'pause')` — Phase 15 grows Settings and
  onboarding inside this component rather than a new one.
- `GameOptions.menu` / `?nomenu=1` — every future harness and test boots
  with it.
- `RooftopSet`'s pattern (static set piece + scroll-away + despawn) is the
  template Phase 9's story destinations follow at larger scale.
