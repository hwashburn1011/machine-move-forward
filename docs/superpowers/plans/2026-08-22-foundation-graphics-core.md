# Machine Move Forward — Foundation & Graphics Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milestones 0–2 of *Machine Move Forward* — a fixed-timestep Three.js/Rapier foundation with a fully procedural desert render pipeline, an endlessly scrolling dune world, a machine platform at origin, a third-person shooter controller, two weapons, and one hostile.

**Architecture:** The machine sits permanently at world origin and the world scrolls past it along `-Z`. Simulation runs at a fixed 60Hz with interpolated rendering. Systems communicate through a typed event bus. All visuals are generated in code — no asset files of any kind.

**Tech Stack:** TypeScript, Vite 8.2.2, Three.js 0.185.1, @dimforge/rapier3d-compat 0.20.0, Vitest, Playwright, ESLint, Prettier.

## Global Constraints

- **No downloaded assets.** No model, texture, audio, or font files. Every visual is generated in code at build or boot time. npm packages are permitted.
- **No Blender.** Available but deliberately unused in this pass.
- **Target WebGL2 desktop browsers.** 60 FPS target, 30 FPS minimum acceptable.
- **`machine.position` is `(0, 0, 0)` permanently and is never written to.** The world moves instead.
- **Terrain has no collider.** Nothing can reach the ground.
- **Machine deck and structures are `fixed` Rapier colliders.** Never dynamic.
- **Definition and runtime instance are separate types.** Stats live in data modules under `src/data/`, never inline in logic.
- **No React. No Zustand. No audio library.** Deliberate deviations from the handoff stack — see spec section 8.1.
- **Exact versions:** `three@0.185.1`, `@dimforge/rapier3d-compat@0.20.0`, `vite@8.2.2`.

## Testing Approach

Deterministic logic gets true TDD: seeded RNG, noise, event bus, fixed-timestep accumulator, chunk recycling math, damage calculation, save migrations. These are Tasks 2, 3, 4, 9, 13, and 18.

Rendering and feel cannot be meaningfully unit-tested. Those tasks (5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17) carry an explicit **visual verification** step with concrete observable criteria instead of an assertion, plus a Playwright smoke test in Task 19 that proves the page boots without console errors and the canvas renders non-blank frames.

---

## File Structure

```
index.html                          Vite entry, canvas + HUD root
package.json / tsconfig.json / vite.config.ts / eslint.config.js / .prettierrc
playwright.config.ts / vitest.config.ts

src/main.ts                         Boot: init Rapier wasm, construct Game, start loop

src/game/
  Game.ts                           Owns all systems, wires them, exposes fixedUpdate/render
  GameLoop.ts                       Fixed-timestep accumulator + interpolation alpha
  GameState.ts                      Plain mutable state object (no framework)
  constants.ts                      FIXED_DT, grid size, world speed, chunk dims

src/core/
  events/EventBus.ts                Typed pub/sub
  events/GameEvents.ts              Event name -> payload type map
  math/Random.ts                    mulberry32 seeded PRNG
  math/Noise.ts                     Deterministic value noise + fBm (CPU side)
  renderer/Renderer.ts              WebGLRenderer, tone mapping, shadow config
  renderer/PostProcessing.ts        EffectComposer chain
  renderer/QualitySettings.ts       Quality tiers, per-effect toggles
  physics/PhysicsWorld.ts           Rapier world lifecycle, step, raycast helper
  input/InputManager.ts             Keyboard/mouse state + pointer lock
  debug/DebugOverlay.ts             Stats panel
  debug/DebugActions.ts             Cheats bound to keys

src/art/
  Sky.ts                            Sky dome mesh + PMREM env map baking
  shaders/skyShader.ts              Rayleigh/Mie GLSL
  shaders/terrainShader.ts          Dune surface GLSL
  shaders/heatShimmer.ts            Post-pass GLSL
  shaders/colorGrade.ts             Post-pass GLSL (grade + grain + vignette)
  Fog.ts                            Height-fog injection via onBeforeCompile
  TextureFactory.ts                 Canvas-generated rust/paint/grime/normal maps
  Materials.ts                      Shared material library
  Palette.ts                        Single source of truth for all colors

src/world/
  WorldManager.ts                   Owns scroll, distance, chunk lifecycle
  ChunkManager.ts                   Recycling ring buffer (pure logic, tested)
  TerrainChunk.ts                   One dune mesh + its props
  PropSpawner.ts                    Instanced rocks/debris per chunk
  WorldSeed.ts                      worldSeed + chunkIndex -> deterministic seed

src/machine/
  Machine.ts                        Root group at origin, owns geometry + colliders
  MachineGeometry.ts                Code-built bevelled deck, frame, treads
  MachineMovement.ts                Speed model, drives world scroll rate

src/player/
  Player.ts                         Player entity: transform, stats, collider
  PlayerController.ts               Rapier KinematicCharacterController movement
  PlayerCamera.ts                   Third-person over-the-shoulder rig
  PlayerCombat.ts                   Fire/aim/reload state machine
  PlayerStats.ts                    HP, stamina

src/combat/
  Weapon.ts                         Runtime weapon instance
  HitscanWeapon.ts                  Raycast firing
  DamageSystem.ts                   Damage application (pure, tested)

src/enemies/
  Enemy.ts                          Hostile humanoid entity
  EnemyAI.ts                        navigate/attack state machine
  EnemyManager.ts                   Pool + spawn

src/fx/
  ParticleSystem.ts                 Pooled GPU points
  SandFX.ts                         Drifting sand + tread dust plume
  ImpactFX.ts                       Hit puffs + tracers

src/save/
  SaveManager.ts                    IndexedDB read/write
  SaveSchema.ts                     Versioned SaveGame type
  migrations/index.ts               Version migration chain (tested)

src/data/
  weapons.ts                        WeaponDefinition records
  enemies.ts                        EnemyDefinition records

src/ui/
  HUD.ts                            DOM overlay
  hud.css

tests/unit/                         Vitest
tests/e2e/                          Playwright
```

---

## Plan Format Note

This plan is executed inline by the same session that wrote it, not handed to a
context-free engineer. Tasks therefore specify exact files, interfaces,
verification commands, and observable acceptance criteria, with inline code
reserved for non-obvious approaches (shader math, Rapier configuration,
recycling arithmetic). Routine implementation is described by its interface
contract rather than transcribed in full.

Test code IS given in full for every TDD task, because the test defines the
contract and must be written before the implementation exists.

---

## Task 1: Project Scaffold and Toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `index.html`, `src/main.ts`, `src/game/constants.ts`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: working `npm run dev`, `npm run build`, `npm test`, `npm run lint`; and `src/game/constants.ts` exporting `FIXED_DT`, `MAX_STEPS_PER_FRAME`, `GRID_TILE`, `MACHINE_TILES_X/Z`, `DECK_HEIGHT`, `CHUNK_SIZE_X/Z`, `CHUNKS_AHEAD`, `CHUNKS_BEHIND`, `BASE_MACHINE_SPEED`

- [ ] **Step 1: Install exact dependency versions**

```bash
npm init -y
npm install three@0.185.1 @dimforge/rapier3d-compat@0.20.0
npm install -D vite@8.2.2 typescript @types/three vitest @playwright/test \
  eslint @eslint/js typescript-eslint prettier
```

- [ ] **Step 2: Configure the toolchain**

- `package.json`: set `"type": "module"`; scripts `dev`/`build`/`preview`/`test`/`test:watch`/`test:e2e`/`lint`/`format`. `build` runs `tsc --noEmit && vite build`.
- `tsconfig.json`: ES2022, bundler resolution, `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noEmit`, path alias `@/*` -> `src/*`.
- `vite.config.ts`: `@` alias, `optimizeDeps.exclude: ['@dimforge/rapier3d-compat']` (it inlines its wasm as base64, so no wasm plugin is needed but it must skip pre-bundling), `build.target: 'es2022'`, sourcemaps on.
- `vitest.config.ts`: node environment, same `@` alias, `include: ['tests/unit/**/*.test.ts']`.
- `.prettierrc`: 100 cols, single quotes, semicolons, trailing commas.
- `eslint.config.js`: flat config, `js.configs.recommended` + `tseslint.configs.recommended`, ignore `dist`.
- `.gitignore`: `node_modules`, `dist`, `.vite`, `test-results`, `playwright-report`.

- [ ] **Step 3: Write `index.html`**

Full-viewport `<canvas id="game">` plus `<div id="hud">` overlay with `pointer-events: none` and `z-index: 10`. Body margin zero, `overflow: hidden`, background `#0b0705` so the pre-boot frame is dark rather than white.

- [ ] **Step 4: Write the failing toolchain test**

`tests/unit/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FIXED_DT, MAX_STEPS_PER_FRAME, GRID_TILE } from '@/game/constants';

describe('toolchain', () => {
  it('resolves the @ alias and exports a 60Hz fixed timestep', () => {
    expect(FIXED_DT).toBeCloseTo(1 / 60, 10);
  });

  it('caps simulation steps per frame', () => {
    expect(MAX_STEPS_PER_FRAME).toBeGreaterThan(1);
    expect(MAX_STEPS_PER_FRAME).toBeLessThanOrEqual(10);
  });

  it('uses the 2m build grid from the handoff', () => {
    expect(GRID_TILE).toBe(2);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/game/constants`.

- [ ] **Step 6: Write `src/game/constants.ts`**

Exact values:

```ts
export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export const GRID_TILE = 2;              // handoff section 10
export const MACHINE_TILES_X = 5;        // handoff section 49
export const MACHINE_TILES_Z = 8;
export const DECK_HEIGHT = 2.4;
export const CHUNK_SIZE_Z = 64;
export const CHUNK_SIZE_X = 360;
export const CHUNKS_AHEAD = 6;
export const CHUNKS_BEHIND = 2;
export const BASE_MACHINE_SPEED = 7.5;   // m/s
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 8: Write a minimal `src/main.ts` and verify the stack boots**

A `WebGLRenderer` on `#game` rendering a single `MeshNormalMaterial` box, via `setAnimationLoop`. This is throwaway — Task 5 replaces it.

Run: `npm run build`
Expected: `tsc --noEmit` clean, Vite build succeeds.

Run: `npm run dev` and open `http://localhost:5173`
Expected: a shaded cube on a dark background, zero console errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + three + rapier toolchain"
```

---

## Task 2: Seeded Random and Noise

Every world feature must be reproducible from `worldSeed + chunkIndex` so save/load restores an identical world. `Math.random()` is banned in world generation.

**Files:**
- Create: `src/core/math/Random.ts`, `src/core/math/Noise.ts`
- Test: `tests/unit/random.test.ts`, `tests/unit/noise.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `class Rng { constructor(seed: number); next(): number; range(min, max): number; int(min, max): number; pick<T>(items: readonly T[]): T; }` — `int` inclusive both ends
  - `hashSeed(...parts: (string | number)[]): number` — non-negative uint32
  - `valueNoise2D(x, y, seed): number` -> `[-1, 1]`
  - `fbm2D(x, y, seed, octaves = 4): number` -> `[-1, 1]`

- [ ] **Step 1: Write the failing Rng test**

`tests/unit/random.test.ts` covering: identical seed gives identical 20-value sequence; different seeds diverge; 1000 samples stay in `[0, 1)`; `range(-3, 9)` respects bounds; `int(0, 3)` hits all four values across 500 draws; `pick` always returns a member; `hashSeed` is stable, separates `('world',4)` from `('world',5)` and `('a',1)` from `('b',1)`, and returns a non-negative integer below `2**32`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/random.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Random.ts`**

mulberry32 for `Rng`. Coerce the seed with `(seed >>> 0) || 0x9e3779b9` so a zero seed still advances. `hashSeed` is FNV-1a over `String(part)` for each part, mixing a `0x2f` separator byte between parts so `('a','bc')` and `('ab','c')` differ.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/random.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing noise test**

`tests/unit/noise.test.ts` covering: `valueNoise2D` deterministic for identical args; 2000 samples inside `[-1, 1]`; continuity (inputs 0.001 apart differ by less than 0.05); different seeds differ. For `fbm2D`: deterministic; 1000 samples inside `[-1, 1]`; 200 samples across the domain span a range greater than 0.3 (proves it is not constant).

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/unit/noise.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `Noise.ts`**

Integer-lattice hash to `[-1, 1]`, quintic smoothstep `t*t*t*(t*(t*6-15)+10)` for C2 continuity, bilinear interpolation. `fbm2D` sums octaves at doubling frequency and halving amplitude, then divides by total amplitude so the result cannot leave `[-1, 1]` at any octave count. Each octave uses `hashSeed(seed, o)` so octaves are decorrelated.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/unit/noise.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/math tests/unit/random.test.ts tests/unit/noise.test.ts
git commit -m "feat: add seeded PRNG and deterministic value/fBm noise"
```

---

## Task 3: Typed Event Bus

Decouples UI, FX, and gameplay per handoff section 45.

**Files:**
- Create: `src/core/events/GameEvents.ts`, `src/core/events/EventBus.ts`
- Test: `tests/unit/eventbus.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type GameEvents` — event-name-to-payload map, the single source of truth
  - `class EventBus { on<K>(e, fn): () => void; once<K>(e, fn): () => void; off<K>(e, fn): void; emit<K>(e, payload): void; clear(): void; }`
  - `on()` returns its own unsubscribe function

Events defined this milestone: `player:damaged`, `player:died`, `player:respawned`, `weapon:fired`, `weapon:reload-started`, `weapon:reload-finished`, `weapon:equipped`, `weapon:dry-fire`, `combat:hit`, `enemy:spawned`, `enemy:damaged`, `enemy:killed`, `world:chunk-recycled`, `game:save-written`, `game:save-loaded`.

- [ ] **Step 1: Write the failing test**

`tests/unit/eventbus.test.ts` covering: payload delivery; multiple listeners fire in registration order; the returned disposer unsubscribes; `once` fires exactly once across two emits; emitting with no listeners does not throw; a throwing listener is isolated so a later listener still runs; a listener that unsubscribes itself mid-emit does not cause the next listener to be skipped (this is why `emit` iterates a snapshot); `clear()` removes everything.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/eventbus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both files**

`Map<GameEventName, Set<Listener>>`. `emit` iterates `[...set]` so mutation during dispatch is safe, and wraps each call in try/catch logging to `console.error` — one bad listener must not stop the rest of the game reacting.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/eventbus.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/events tests/unit/eventbus.test.ts
git commit -m "feat: add typed event bus"
```

---

## Task 4: Fixed-Timestep Game Loop

Per handoff section 46.

**Files:**
- Create: `src/game/GameLoop.ts`
- Test: `tests/unit/gameloop.test.ts`

**Interfaces:**
- Consumes: `FIXED_DT`, `MAX_STEPS_PER_FRAME`
- Produces:
  - `interface LoopCallbacks { fixedUpdate(dt: number): void; render(alpha: number): void }`
  - `class GameLoop { constructor(cb: LoopCallbacks); advance(frameSeconds: number): void; start(): void; stop(): void; get running(): boolean }`

`advance()` holds all the logic and takes frame time as a parameter, so the loop is fully testable in node without a browser. `start()` is a thin `requestAnimationFrame` wrapper around it.

- [ ] **Step 1: Write the failing test**

`tests/unit/gameloop.test.ts` covering: exactly one step for exactly one `FIXED_DT`; zero steps for half a timestep; two 0.6-timestep frames produce one step; a 3-timestep frame produces 3 steps; every `fixedUpdate` call receives exactly `FIXED_DT` and never a variable delta; a 100-timestep frame is clamped to `MAX_STEPS_PER_FRAME`; after clamping the leftover is discarded so the next single-timestep frame produces exactly one step (no spiral); `render` is called exactly once per `advance` regardless of step count; the interpolation alpha is in `[0, 1)` and equals 0.5 after a 1.5-timestep frame.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/gameloop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GameLoop.ts`**

```ts
advance(frameSeconds: number): void {
  this.accumulator += frameSeconds;
  let steps = 0;
  while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    this.cb.fixedUpdate(FIXED_DT);
    this.accumulator -= FIXED_DT;
    steps++;
  }
  // Spiral-of-death guard: hitting the cap means time is still banked, and
  // keeping it makes the next frame worse. Drop it.
  if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
  this.cb.render(this.accumulator / FIXED_DT);
}
```

`start()` additionally clamps raw frame time to 250ms so returning from an alt-tab does not deliver an enormous delta.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/gameloop.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/GameLoop.ts tests/unit/gameloop.test.ts
git commit -m "feat: add fixed-timestep game loop with interpolated rendering"
```

---

## Task 5: Palette, Renderer, and Quality Settings

The colour palette is a single module so the whole game is gradeable from one
file. The renderer is configured once, correctly, because tone mapping and
colour space mistakes are invisible until everything looks subtly wrong.

**Files:**
- Create: `src/art/Palette.ts`, `src/core/renderer/QualitySettings.ts`, `src/core/renderer/Renderer.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PALETTE` — frozen record of named `THREE.Color` values: `sandLit`, `sandShadow`, `sandDeep`, `skyZenith`, `skyHorizon`, `sunDisc`, `sunLight`, `bounceLight`, `hullPaint`, `hullDark`, `rust`, `steel`, `accentOrange`, `accentTeal`, `hazard`
  - `type QualityTier = 'low' | 'medium' | 'high' | 'ultra'`
  - `interface QualitySettings { tier; msaaSamples; shadowMapSize; shadowsEnabled; gtao; bloom; heatShimmer; grain; particleBudget; terrainSegments; }`
  - `getQualitySettings(tier: QualityTier): QualitySettings`
  - `detectQualityTier(): QualityTier`
  - `class Renderer { constructor(canvas, quality); readonly three: THREE.WebGLRenderer; readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly sun: THREE.DirectionalLight; resize(): void; setEnvironment(tex: THREE.Texture): void; dispose(): void; }`

- [ ] **Step 1: Write `Palette.ts`**

Warm ochre sand, violet-leaning shadows, hot white-gold sun. Shadow colours must
be *cool*, not just dark sand — that colour-temperature split is most of what
makes desert renders read as sunlit rather than flat.

- [ ] **Step 2: Write `QualitySettings.ts`**

`detectQualityTier()` inspects `renderer.capabilities.maxTextureSize` and
`navigator.hardwareConcurrency` to pick a default. Tiers scale: `msaaSamples`
0/2/4/4, `shadowMapSize` 1024/2048/2048/4096, `terrainSegments` 48/96/128/192,
`particleBudget` 200/800/2000/4000, and boolean gates for `gtao`, `bloom`,
`heatShimmer`, `grain`.

- [ ] **Step 3: Write `Renderer.ts`**

Exact configuration — these settings are the difference between "browser demo"
and "game", so they are specified precisely:

```ts
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality.shadowsEnabled;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

Camera: 55° FOV, near 0.1, far 2000.

The sun is a `DirectionalLight`. Because the machine never leaves origin, its
shadow camera is a **tight fixed box** around the machine rather than a large
volume chasing a moving target:

```ts
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
```

That tight frustum is what buys crisp contact shadows, and it is only possible
because of the origin-locked architecture. Add a low-intensity
`HemisphereLight` tinted `skyHorizon` over `sandLit` as bounce fill.

`resize()` handles `window.innerWidth/Height` and updates camera aspect. Wire it
to a `resize` listener in `main.ts`.

- [ ] **Step 4: Visual verification**

Replace the Task 1 throwaway cube with a grey `MeshStandardMaterial` box on a
large ground plane, lit by the sun.

Run: `npm run dev`
Expected: the box casts a hard-edged shadow with a visibly cool tint against
warm-lit ground; no banding on the gradient; zero console warnings.

- [ ] **Step 5: Commit**

```bash
git add src/art/Palette.ts src/core/renderer src/main.ts
git commit -m "feat: add palette, quality tiers, and configured renderer with tight sun shadows"
```

---

## Task 6: Procedural Sky and Sky-Derived IBL

The highest-leverage visual task in the plan. A real scattering sky plus an
environment map baked from it means every metal surface reflects a sky that
actually exists, which is most of what separates a lit scene from a good one.

**Files:**
- Create: `src/art/shaders/skyShader.ts`, `src/art/Sky.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `PALETTE`, `Renderer`
- Produces:
  - `class Sky { constructor(renderer: THREE.WebGLRenderer); readonly mesh: THREE.Mesh; setSunDirection(dir: THREE.Vector3): void; get environment(): THREE.Texture; get sunColor(): THREE.Color; get horizonColor(): THREE.Color; update(elapsed: number): void; dispose(): void }`

- [ ] **Step 1: Write `skyShader.ts`**

A `BackSide` sphere of radius 1500 with `depthWrite: false`, rendered with a
fragment shader implementing:

- Rayleigh scattering: `beta_R = vec3(5.8e-6, 13.5e-6, 33.1e-6)` scaled up for
  stylisation, giving correct blue zenith and red horizon reddening as the sun
  descends.
- Mie scattering with a Henyey-Greenstein phase function, `g = 0.76`, for the
  bright aureole around the sun.
- A dust term: an extra low-altitude Mie-like scatter tinted toward `sandLit`,
  strongest within ~8° of the horizon. This is what makes it read as *desert*
  sky rather than temperate sky, and it should be strong enough to see.
- A sun disc with a soft limb, sized ~0.53° angular diameter, and clamped so it
  does not blow out to pure white before bloom.

Uniforms: `uSunDirection`, `uTime`, `uRayleigh`, `uTurbidity`, `uDustAmount`,
`uExposure`.

- [ ] **Step 2: Write `Sky.ts` with PMREM baking**

```ts
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
// Bake the sky dome itself into an environment map.
const envScene = new THREE.Scene();
envScene.add(skyMeshClone);
this.envRT = pmrem.fromScene(envScene, 0.04);
scene.environment = this.envRT.texture;
```

**Throttling rule:** re-bake only when the sun direction has moved more than
0.5° since the last bake, and never more than once every 500ms. Baking every
frame would cost more than the rest of the frame combined. Dispose the previous
render target on each re-bake or it leaks GPU memory.

`sunColor` and `horizonColor` are read back from the same scattering maths on
the CPU so the `DirectionalLight` colour and the fog colour match the sky
exactly — mismatched sky and fog is the most common tell of a fake-looking
outdoor scene.

- [ ] **Step 3: Visual verification**

Point the camera at the horizon with the sun low.

Run: `npm run dev`
Expected: a graded sky, warm near the horizon and blue at zenith, with a visible
dust band; the sun disc has a soft aureole; the grey test box from Task 5 now
shows a subtle sky-blue reflection on its upward faces and warm bounce on its
sides. Confirm the re-bake throttle by logging bake count over 10 seconds with a
moving sun — it must be under 20.

- [ ] **Step 4: Commit**

```bash
git add src/art/Sky.ts src/art/shaders/skyShader.ts src/main.ts
git commit -m "feat: add procedural scattering sky with PMREM-baked IBL"
```

---

## Task 7: Height Fog, Procedural Textures, and Material Library

**Files:**
- Create: `src/art/Fog.ts`, `src/art/TextureFactory.ts`, `src/art/Materials.ts`
- Test: `tests/unit/texturefactory.test.ts`

**Interfaces:**
- Consumes: `PALETTE`, `Sky`
- Produces:
  - `applyHeightFog(material: THREE.Material, params: HeightFogParams): void` — injects via `onBeforeCompile`
  - `interface HeightFogParams { color: THREE.Color; density: number; heightFalloff: number; startDistance: number }`
  - `updateFogUniforms(color: THREE.Color): void` — called when the sky changes
  - `TextureFactory.rust(size, seed)`, `.paintedMetal(size, seed, baseColor)`, `.grime(size, seed)`, `.normalFromHeight(heightData, size, strength)` — all return `THREE.DataTexture`
  - `class Materials { readonly hull; readonly hullDark; readonly rustedSteel; readonly deckPlate; readonly accent; readonly glass; dispose(): void }`

- [ ] **Step 1: Write the failing TextureFactory test**

`tests/unit/texturefactory.test.ts` covering, on the raw pixel data rather than
GPU state (no WebGL context in node): `rust(64, 1)` returns `RGBAFormat` data of
length `64*64*4`; identical seeds produce byte-identical data; different seeds
differ; every channel is within `0..255`; alpha is 255 everywhere;
`normalFromHeight` on a flat height field returns approximately `(128, 128, 255)`
at every texel (a flat surface has a straight-up normal).

Build these generating into a plain `Uint8Array` so they are testable in node,
then wrap in `DataTexture`. Avoid `document.createElement('canvas')` in the
generation path for exactly that reason.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/texturefactory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TextureFactory.ts`**

fBm-driven, all seeded via `Rng`/`fbm2D` from Task 2. Rust is patchy orange-brown
over steel with high-frequency speckle; painted metal is a base colour with
subtle panel-scale value variation plus edge wear; grime is a low-frequency dark
multiply mask. `normalFromHeight` uses a Sobel operator, encoding to
`(x*0.5+0.5, y*0.5+0.5, z*0.5+0.5)`.

Set `colorSpace = THREE.SRGBColorSpace` on colour maps and leave normal/roughness
maps in linear. Getting this wrong is the classic washed-out-materials bug.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/texturefactory.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `Fog.ts`**

Three.js built-in `FogExp2` is uniform in height, which looks wrong over dunes.
Inject a height-aware term instead:

```ts
material.onBeforeCompile = (shader) => {
  shader.uniforms.uFogColor = fogColorUniform;      // shared, so one update hits all
  shader.uniforms.uFogDensity = { value: params.density };
  shader.uniforms.uFogHeightFalloff = { value: params.heightFalloff };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', HEIGHT_FOG_PARS)
    .replace('#include <fog_fragment>', HEIGHT_FOG_MAIN);
};
```

`HEIGHT_FOG_MAIN` computes optical depth as
`density * exp(-heightFalloff * worldY) * distance`, then
`mix(gl_FragColor.rgb, uFogColor, 1.0 - exp(-opticalDepth))`.

Crucially, `fogColorUniform` is a **single shared uniform object** referenced by
every material, so `updateFogUniforms` from the sky is one assignment rather
than a walk over the scene graph.

- [ ] **Step 6: Implement `Materials.ts`**

Shared `MeshStandardMaterial` instances so the whole machine is a handful of
materials rather than one per piece — this matters directly for the draw-call
budget. Each gets `applyHeightFog` and picks up `scene.environment` automatically.

- [ ] **Step 7: Visual verification**

Run: `npm run dev`
Expected: distant geometry dissolves into a fog colour that matches the horizon;
looking up, the fog thins with altitude; test box materials show rust and paint
detail with correct, non-washed-out colour.

- [ ] **Step 8: Commit**

```bash
git add src/art/Fog.ts src/art/TextureFactory.ts src/art/Materials.ts tests/unit/texturefactory.test.ts
git commit -m "feat: add height fog, procedural texture factory, and material library"
```

---

## Task 8: Dune Terrain Shader and Terrain Chunk

**Files:**
- Create: `src/art/shaders/terrainShader.ts`, `src/world/TerrainChunk.ts`, `src/world/WorldSeed.ts`
- Test: `tests/unit/worldseed.test.ts`

**Interfaces:**
- Consumes: `fbm2D`, `hashSeed`, `PALETTE`, `applyHeightFog`, `CHUNK_SIZE_X/Z`
- Produces:
  - `chunkSeed(worldSeed: string, chunkIndex: number): number`
  - `class TerrainChunk { constructor(quality); readonly mesh: THREE.Mesh; rebuild(chunkIndex: number, worldSeed: string): void; setZ(z: number): void; update(elapsed: number): void; dispose(): void }`

Terrain is purely visual — **no collider, no CPU height sampling**. Per spec
section 3.4 and the global constraints.

- [ ] **Step 1: Write and pass the `WorldSeed` test**

`tests/unit/worldseed.test.ts`: `chunkSeed` is stable for the same inputs,
differs for adjacent chunk indices, differs for different world seeds, and
returns a non-negative integer. Implement as `hashSeed(worldSeed, chunkIndex)`.

Run: `npx vitest run tests/unit/worldseed.test.ts`
Expected: FAIL, then PASS after implementing.

- [ ] **Step 2: Write `terrainShader.ts`**

A `MeshStandardMaterial` extended via `onBeforeCompile` (so it keeps PBR
lighting and IBL rather than being a bespoke unlit shader):

- **Vertex:** dune displacement from two fBm octave sets — large slow dunes plus
  a medium ridge term using `1.0 - abs(noise)` for sharp crests. Recompute the
  normal analytically from finite differences of the same function so lighting
  matches the displaced surface.
- **Fragment:**
  - Wind ripples: high-frequency directional sinusoid modulated by fBm,
    perturbing the normal, scrolling slowly on `uTime`. Fade ripple strength
    with distance to avoid shimmer aliasing at range.
  - Slope-based colour: mix `sandLit` -> `sandShadow` -> `sandDeep` by slope,
    with crests slightly desaturated and lighter (wind-scoured) and troughs
    darker and warmer.
  - Anisotropic glint: a sharp specular term along the ripple direction, gated
    to crest facing, giving the sparkle real sand has under low sun.

Uniforms: `uTime`, `uChunkOffset` (world Z of the chunk, so noise is continuous
across chunk seams), `uRippleStrength`, `uDetailFade`.

**Seam rule:** noise must be sampled in *world* space using `uChunkOffset`, not
local chunk space, or every chunk boundary will show a visible discontinuity.
This is the single most likely bug in this task.

- [ ] **Step 3: Implement `TerrainChunk.ts`**

One `PlaneGeometry` of `CHUNK_SIZE_X` x `CHUNK_SIZE_Z` at
`quality.terrainSegments` resolution, rotated flat, `receiveShadow = true`,
`castShadow = false` (terrain casting into itself is expensive and invisible).
Geometry is created once and reused; `rebuild()` only updates the
`uChunkOffset` uniform and re-seeds props. Never rebuild geometry per recycle.

- [ ] **Step 4: Visual verification**

Run: `npm run dev`
Expected: rolling dunes with visible wind ripples and crest glints; place two
chunks adjacent and confirm **no visible seam** at the boundary; ripples drift
slowly over time; dunes fade correctly into the fog.

- [ ] **Step 5: Commit**

```bash
git add src/art/shaders/terrainShader.ts src/world/TerrainChunk.ts src/world/WorldSeed.ts tests/unit/worldseed.test.ts
git commit -m "feat: add procedural dune terrain with wind ripples and crest glints"
```

---

## Task 9: Chunk Recycling and World Manager

The core of the world-scroll architecture. The recycling arithmetic is pure and
fully unit-tested; the Three.js binding is thin.

**Files:**
- Create: `src/world/ChunkManager.ts`, `src/world/WorldManager.ts`, `src/world/PropSpawner.ts`
- Test: `tests/unit/chunkmanager.test.ts`

**Interfaces:**
- Consumes: `CHUNK_SIZE_Z`, `CHUNKS_AHEAD`, `CHUNKS_BEHIND`, `TerrainChunk`, `EventBus`
- Produces:
  - `interface ChunkSlot { slotId: number; chunkIndex: number; z: number }`
  - `class ChunkManager { constructor(chunksAhead, chunksBehind, chunkSizeZ); get slots(): readonly ChunkSlot[]; advance(distanceTraveled: number): ChunkSlot[]; reset(distanceTraveled: number): void }` — `advance` returns the slots that were recycled this call
  - `class WorldManager { constructor(scene, quality, bus, worldSeed); readonly distanceTraveled: number; fixedUpdate(dt: number, speed: number): void; update(elapsed: number): void; reset(distance: number): void; get activeChunkCount(): number }`

- [ ] **Step 1: Write the failing ChunkManager test**

`tests/unit/chunkmanager.test.ts` covering:

- Constructs `chunksAhead + chunksBehind + 1` slots.
- At distance 0, slot Z positions are evenly spaced by `chunkSizeZ`, spanning
  from `+chunksAhead * size` down to `-chunksBehind * size`.
- Advancing by less than one chunk recycles nothing and returns an empty array.
- Advancing by exactly one chunk size recycles exactly one slot.
- Advancing by `2.5` chunk sizes recycles exactly 2 slots.
- A recycled slot's `chunkIndex` increases by exactly the number of slots — it
  is moved to the far end of the ring, not renumbered arbitrarily.
- Chunk Z positions always stay within `[-chunksBehind*size - size, chunksAhead*size + size]`
  no matter how far you advance (proves nothing drifts to infinity — the whole
  point of the architecture).
- Advancing a total distance in one call and in many small calls produces
  identical final slot state (determinism under variable frame rate).
- `reset(distance)` reproduces the exact state that incremental advancing to
  that distance produces — this is what makes save/load work.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/chunkmanager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChunkManager.ts`**

Pure logic, no Three.js import. A ring buffer where a slot's world Z is derived
from its chunk index and total distance:

```ts
z = chunkIndex * chunkSizeZ - distanceTraveled
```

When `z < -(chunksBehind + 1) * chunkSizeZ`, the slot is behind the machine and
gets `chunkIndex += slotCount`, jumping it to the far end of the ring. Loop
until no slot qualifies. `reset()` recomputes indices directly from distance
rather than replaying advances.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/chunkmanager.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Implement `WorldManager.ts` and `PropSpawner.ts`**

`WorldManager` owns one `TerrainChunk` per slot, accumulates
`distanceTraveled += speed * dt` in `fixedUpdate`, applies slot Z to each mesh,
and on recycle calls `rebuild()` plus emits `world:chunk-recycled`.

`PropSpawner` scatters rocks and debris per chunk using `chunkSeed`, via a
single `InstancedMesh` per prop type per chunk. Handoff section 39 requires
instancing; one draw call per rock would be a hard failure. Instance transforms
are regenerated on recycle from the new chunk's seed.

- [ ] **Step 6: Visual verification**

Run: `npm run dev` with a debug key that jumps distance forward by 500m.
Expected: dunes scroll toward and past the camera smoothly; recycling is
invisible — no pop, no seam, no flicker; props appear ahead and pass by; draw
call count stays flat as distance grows (check in Task 18's overlay, or
temporarily log `renderer.info.render.calls`).

- [ ] **Step 7: Commit**

```bash
git add src/world tests/unit/chunkmanager.test.ts
git commit -m "feat: add chunk recycling ring buffer and scrolling world manager"
```

---

## Task 10: Rapier Physics World

**Files:**
- Create: `src/core/physics/PhysicsWorld.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `initRapier(): Promise<void>` — must be awaited before any physics construction
  - `class PhysicsWorld { constructor(); readonly world: RAPIER.World; step(): void; addFixedBox(halfExtents, position, userData?): RAPIER.Collider; addCharacter(radius, halfHeight, position): { body; collider; controller }; raycast(origin, dir, maxDistance, filterCollider?): RaycastHit | null; removeCollider(c): void; removeBody(b): void; get bodyCount(): number; dispose(): void }`
  - `interface RaycastHit { point: THREE.Vector3; normal: THREE.Vector3; distance: number; collider: RAPIER.Collider; userData: unknown }`

- [ ] **Step 1: Implement `PhysicsWorld.ts`**

```ts
import RAPIER from '@dimforge/rapier3d-compat';

let ready = false;
export async function initRapier(): Promise<void> {
  if (ready) return;
  await RAPIER.init();   // resolves the inlined base64 wasm
  ready = true;
}
```

World gravity `(0, -22, 0)` — heavier than real gravity, which reads better for
a third-person shooter and matches the chunky machine feel. Set
`world.timestep = FIXED_DT` so physics advances in lockstep with the simulation
and never runs its own variable step.

`addCharacter` creates a `kinematicPositionBased` rigid body with a capsule
collider and a `KinematicCharacterController`, configured:

```ts
controller.setUp({ x: 0, y: 1, z: 0 });
controller.enableAutostep(0.45, 0.2, true);   // step onto deck plates and stairs
controller.enableSnapToGround(0.4);           // no floating over small gaps
controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
controller.setApplyImpulsesToDynamicBodies(false);
```

`raycast` wraps `world.castRayAndGetNormal`, converting to `THREE.Vector3` and
resolving `userData` from a `Map<colliderHandle, unknown>` the class maintains —
Rapier colliders cannot carry arbitrary JS payloads directly.

- [ ] **Step 2: Wire into `main.ts`**

`await initRapier()` before constructing `Game`. Show a simple "LOADING" div
during the await and remove it after, so the first paint is not a blank canvas.

- [ ] **Step 3: Verification**

Add a temporary fixed ground box and a character capsule; log its Y each step.
Expected: the capsule settles on the box and stays there, Y stable to within
0.001 across 300 steps — no sink, no jitter, no drift.

- [ ] **Step 4: Commit**

```bash
git add src/core/physics src/main.ts
git commit -m "feat: add Rapier physics world with character controller factory"
```

---

## Task 11: Machine Geometry and Colliders

The machine is the hero object. It must read well in silhouette against a bright
sky, because that is how the player sees it 90% of the time.

**Files:**
- Create: `src/machine/MachineGeometry.ts`, `src/machine/Machine.ts`, `src/machine/MachineMovement.ts`
- Test: `tests/unit/machinemovement.test.ts`

**Interfaces:**
- Consumes: `Materials`, `PhysicsWorld`, `GRID_TILE`, `MACHINE_TILES_X/Z`, `DECK_HEIGHT`, `BASE_MACHINE_SPEED`
- Produces:
  - `buildBevelledPanel(w, h, d, bevel): THREE.BufferGeometry`
  - `buildMachineMeshes(materials): THREE.Group`
  - `class Machine { constructor(scene, physics, materials); readonly group: THREE.Group; readonly movement: MachineMovement; get deckBounds(): THREE.Box3; fixedUpdate(dt): void; update(elapsed): void }`
  - `class MachineMovement { get currentSpeed(): number; get targetSpeed(): number; setThrottle(v: number): void; fixedUpdate(dt: number): void; totalWeight: number; enginePower: number }`

- [ ] **Step 1: Write and pass the MachineMovement test**

`tests/unit/machinemovement.test.ts`: speed starts at zero and accelerates toward
target; never exceeds `maxSpeed`; `maxSpeed` decreases as `totalWeight` rises and
increases with `enginePower`; throttle of 0 decelerates toward zero without
crossing below it; speed is deterministic given identical dt sequences.

Run: `npx vitest run tests/unit/machinemovement.test.ts`
Expected: FAIL, then PASS.

Weight is not punishing at this stage (handoff section 14) — it exists so the
tradeoff hooks are present for later milestones.

- [ ] **Step 2: Implement `MachineGeometry.ts`**

`buildBevelledPanel` produces a rounded-edge box. Bevelled edges catch a
specular highlight along every silhouette line, which is what makes code-built
geometry read as manufactured metal instead of programmer boxes. This one helper
does most of the visual work in the task.

`buildMachineMeshes` assembles the 5x8-tile (10m x 16m) starting machine from
handoff section 49:

- A deck of bevelled plates at `DECK_HEIGHT`, with a subtle plate grid so scale
  is readable.
- A heavy chassis frame beneath, darker, with visible cross-members.
- Tread assemblies down both long sides — large, chunky, clearly load-bearing.
- A forward prow with an angled plough, the strongest silhouette element.
- Perimeter railings (thin, so they read as detail not mass).
- Equipment blocks for the starting loadout: engine, small generator, fuel tank,
  workbench, two storage crates, collector, one light hardpoint. These are
  non-interactive props this milestone; later milestones make them functional.
- One accent-orange element (hazard stripe on the prow) as a focal point against
  all the ochre and steel.

All meshes `castShadow = true`, `receiveShadow = true`. Merge static geometry
sharing a material via `BufferGeometryUtils.mergeGeometries` to hold draw calls
down.

- [ ] **Step 3: Implement `Machine.ts`**

`group.position.set(0, 0, 0)` at construction and **never written again** —
enforce with a comment and a dev-only assertion in `fixedUpdate` that
`group.position.lengthSq() === 0`. This constraint is load-bearing for the
entire architecture, so it gets a guard rather than a convention.

Colliders: one `fixed` cuboid for the deck surface, plus fixed cuboids for the
tread housings, prow, and each equipment block, so the player collides with real
obstacles. Never dynamic.

- [ ] **Step 4: Visual verification**

Run: `npm run dev`, orbit the machine.
Expected: a chunky industrial crawler with a strong readable silhouette against
the sky; bevel highlights visible along edges; the hazard stripe draws the eye;
shadows land crisply on the deck; the whole thing looks *built*, not
prototyped. This is criterion 5 of the spec — judge it honestly.

- [ ] **Step 5: Commit**

```bash
git add src/machine tests/unit/machinemovement.test.ts
git commit -m "feat: add code-built machine geometry, colliders, and speed model"
```

---

## Task 12: Input, Player Controller, and Camera

**Files:**
- Create: `src/core/input/InputManager.ts`, `src/player/PlayerStats.ts`, `src/player/Player.ts`, `src/player/PlayerController.ts`, `src/player/PlayerCamera.ts`
- Test: `tests/unit/playerstats.test.ts`

**Interfaces:**
- Consumes: `PhysicsWorld`, `EventBus`, `DECK_HEIGHT`
- Produces:
  - `class InputManager { constructor(canvas); isDown(action: InputAction): boolean; consumePressed(action: InputAction): boolean; get lookDelta(): {x, y}; get wheelDelta(): number; requestPointerLock(): void; get pointerLocked(): boolean; endFrame(): void; dispose(): void }`
  - `type InputAction = 'forward'|'back'|'left'|'right'|'jump'|'sprint'|'crouch'|'fire'|'aim'|'reload'|'interact'|'contextual'|'inventory'|'build'|'slot1'..'slot5'`
  - `class PlayerStats { health; maxHealth; stamina; maxStamina; damage(n, source): void; heal(n): void; get alive(): boolean }`
  - `class Player { readonly object3D: THREE.Object3D; readonly stats: PlayerStats; readonly position: THREE.Vector3; fixedUpdate(dt, input, camera): void; respawn(): void }`
  - `class PlayerCamera { readonly camera: THREE.PerspectiveCamera; setAimed(b: boolean): void; fixedUpdate(dt, input, targetPos): void; update(alpha): void; get forward(): THREE.Vector3 }`

- [ ] **Step 1: Write and pass the PlayerStats test**

Damage reduces health and clamps at 0; heal clamps at max; `alive` flips false at
0; damage emits `player:damaged` with correct `remaining`; crossing to 0 emits
`player:died` exactly once even under repeated damage.

Run: `npx vitest run tests/unit/playerstats.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 2: Implement `InputManager.ts`**

Full control map from handoff section 8. Track held keys in a `Set`, and
edge-triggered presses in a second set drained by `consumePressed`, so a single
keypress cannot fire twice across two fixed steps at high frame rates.

Pointer lock on canvas click; accumulate `movementX/Y` and zero it in
`endFrame()`. Ignore input entirely when not pointer-locked, except the click
that acquires the lock.

- [ ] **Step 3: Implement `PlayerCamera.ts`**

Third-person over-the-shoulder: a yaw/pitch rig with the camera at a shoulder
offset (`+0.55` right, `+1.65` up, `-3.2` back), pitch clamped to `[-70°, 75°]`.

Aiming (RMB) narrows FOV from 55° to 38° and tightens the shoulder offset —
smoothly, over ~120ms. Camera position lerps toward its goal with a
frame-rate-independent smoothing factor `1 - Math.pow(0.001, dt)`; **yaw and
pitch do not smooth at all**, because smoothed aim feels unresponsive and this is
a shooter.

Cast a short ray from the player toward the camera goal and pull the camera in on
a hit, so the machine's own structures never clip through frame.

- [ ] **Step 4: Implement `Player.ts` and `PlayerController.ts`**

Movement is camera-relative. Walk 4.5 m/s, sprint 7.5 m/s, crouch 2.2 m/s. Jump
sets a vertical velocity giving roughly a 1.1m apex under the world's -22 gravity.
Gravity accumulates into a vertical velocity that is zeroed on grounded contact
(read `controller.computedGrounded()`).

Apply `controller.computeColliderMovement(collider, desired)` then
`controller.computedMovement()`, and write the result to the kinematic body via
`setNextKinematicTranslation`.

Store `previousPosition` each fixed step and have `update(alpha)` lerp the visual
`object3D` between previous and current — without this the player visibly stutters
whenever frame rate and tick rate disagree.

Respawn: if `position.y < -20` (fell off the deck), respawn at deck centre and
emit `player:respawned`.

- [ ] **Step 5: Verification**

Run: `npm run dev`
Expected: WASD moves camera-relative; the player walks the full deck without
catching on plate seams; jumping lands cleanly; sprint is clearly faster;
walking into the prow and equipment blocks stops the player rather than passing
through; falling off the side triggers a respawn on deck; camera never clips
into machine geometry; **no jitter at any frame rate** — verify by capping the
tab to 30 FPS in devtools and confirming motion stays smooth.

- [ ] **Step 6: Commit**

```bash
git add src/core/input src/player tests/unit/playerstats.test.ts
git commit -m "feat: add input manager, third-person camera, and player controller"
```

---

## Task 13: Weapons and Damage

**Files:**
- Create: `src/data/weapons.ts`, `src/combat/DamageSystem.ts`, `src/combat/Weapon.ts`, `src/combat/HitscanWeapon.ts`, `src/player/PlayerCombat.ts`
- Test: `tests/unit/damage.test.ts`, `tests/unit/weapon.test.ts`

**Interfaces:**
- Consumes: `PhysicsWorld.raycast`, `EventBus`, `Rng`
- Produces:
  - `interface WeaponDefinition { id; name; weaponClass; damage; fireRate; magazineSize; reloadTime; spread; aimSpread; recoil; range; pellets; ammoType }` — exactly the handoff section 18 shape plus `pellets` and `aimSpread`
  - `WEAPONS: Record<string, WeaponDefinition>` with `rifle` and `shotgun`
  - `computeDamage(base, distance, range, falloffStart, armor): number`
  - `class Weapon { readonly def; ammoInMag; reserveAmmo; get canFire(): boolean; get reloading(): boolean; tryFire(now): boolean; startReload(now): void; fixedUpdate(dt, now): void }`
  - `class PlayerCombat { readonly current: Weapon; equip(id): void; fixedUpdate(dt, input, camera, physics): void }`

- [ ] **Step 1: Write and pass the damage test**

`computeDamage`: full damage inside `falloffStart`; linear falloff from
`falloffStart` to `range`; zero beyond `range`; armor subtracts before falloff;
result never negative; deterministic.

- [ ] **Step 2: Write and pass the weapon test**

`tryFire` respects `fireRate` (a second call inside the interval returns false);
decrements `ammoInMag`; returns false at zero ammo; `startReload` moves the
correct amount from reserve and never exceeds `magazineSize` or reserve;
reloading blocks firing; reload completes after exactly `reloadTime`; a shotgun
definition with `pellets: 9` reports 9 rays per shot.

Run: `npx vitest run tests/unit/damage.test.ts tests/unit/weapon.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 3: Write `src/data/weapons.ts`**

Rifle: damage 24, fireRate 9/s, mag 30, reload 2.1s, spread 0.9°, aimSpread 0.25°,
recoil 0.35, range 120, pellets 1. Shotgun: damage 11 x 9 pellets, fireRate 1.4/s,
mag 6, reload 3.2s, spread 4.5°, aimSpread 3.0°, recoil 1.4, range 35, pellets 9.

Definitions are data only. No logic in this file.

- [ ] **Step 4: Implement `HitscanWeapon.ts` and `PlayerCombat.ts`**

Fire from the camera along its forward vector with spread applied as a random
cone offset (seeded `Rng`, so recoil patterns are reproducible for testing).
Raycast via `PhysicsWorld`, emit `combat:hit` with point and normal, resolve
`userData` to find a damageable target, and apply `computeDamage`.

Recoil kicks camera pitch up per shot and recovers over ~250ms. Fire the
`weapon:fired`, `weapon:dry-fire`, `weapon:reload-started`, and
`weapon:reload-finished` events — the HUD and FX subscribe rather than being
called directly.

Keys 1 and 2 equip rifle and shotgun via `consumePressed`.

- [ ] **Step 5: Verification**

Run: `npm run dev`
Expected: LMB fires at the correct cadence; RMB visibly tightens spread; R
reloads with the correct delay and refuses to fire during it; ammo counts behave;
firing at the deck leaves hits at the crosshair position; shotgun produces a
spread of 9 distinct impacts.

- [ ] **Step 6: Commit**

```bash
git add src/data src/combat src/player/PlayerCombat.ts tests/unit/damage.test.ts tests/unit/weapon.test.ts
git commit -m "feat: add data-driven hitscan weapons, damage falloff, and combat state"
```

---

## Task 14: Enemy and AI

**Files:**
- Create: `src/data/enemies.ts`, `src/enemies/Enemy.ts`, `src/enemies/EnemyAI.ts`, `src/enemies/EnemyManager.ts`
- Test: `tests/unit/enemyai.test.ts`

**Interfaces:**
- Consumes: `PhysicsWorld`, `EventBus`, `Materials`, `computeDamage`
- Produces:
  - `interface EnemyDefinition { id; name; maxHealth; moveSpeed; damage; attackRange; attackCooldown; armor }`
  - `type EnemyAIState = 'idle' | 'navigate' | 'attack' | 'pursue' | 'dead'`
  - `class Enemy { readonly id: string; readonly stats; readonly object3D; get state(): EnemyAIState; takeDamage(n): void; fixedUpdate(dt, playerPos): void; update(alpha): void }`
  - `class EnemyManager { spawn(defId, position): Enemy; get active(): readonly Enemy[]; fixedUpdate(dt, playerPos): void; update(alpha): void; despawnAll(): void }`

MVP AI only, per handoff section 32: `navigate`, `attack`, `pursue` (plus `idle`
and `dead`). No navmesh — direct steering toward the player with capsule
collision, which is correct for one hostile on a flat deck. Navmesh work is
deferred to the boarding milestone, exactly as the handoff instructs.

- [ ] **Step 1: Write and pass the AI state machine test**

Pure state-transition function tested without physics: `idle` -> `navigate` when
the player is within detection range; `navigate` -> `attack` within
`attackRange`; `attack` -> `pursue` when the player leaves attack range but stays
detected; any state -> `dead` at zero health; `dead` never transitions out;
attack respects `attackCooldown` (no damage twice inside the interval).

Run: `npx vitest run tests/unit/enemyai.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 2: Implement the enemy**

Geometry is code-built from bevelled panels — a scavenger silhouette,
deliberately different in proportion from the player so it is identifiable at a
glance and in shadow. Uses the shared character controller from Task 10.

`takeDamage` emits `enemy:damaged`; reaching zero emits `enemy:killed`, switches
to `dead`, disables the collider, and plays a short collapse before despawn.

Pool enemies in `EnemyManager` rather than constructing per spawn, per handoff
section 39.

- [ ] **Step 3: Verification**

Run: `npm run dev` and spawn an enemy with the Task 18 debug key.
Expected: the enemy walks to the player, stops at attack range, damages the
player on cooldown, takes visible damage, and dies to roughly the expected shot
count for each weapon (about 5 rifle body shots).

- [ ] **Step 4: Commit**

```bash
git add src/enemies src/data/enemies.ts tests/unit/enemyai.test.ts
git commit -m "feat: add hostile enemy with navigate/attack/pursue AI"
```

---

## Task 15: Particles and Combat FX

**Files:**
- Create: `src/fx/ParticleSystem.ts`, `src/fx/SandFX.ts`, `src/fx/ImpactFX.ts`

**Interfaces:**
- Consumes: `EventBus`, `QualitySettings.particleBudget`, `PALETTE`
- Produces:
  - `class ParticleSystem { constructor(scene, maxParticles, texture?); emit(opts: EmitOptions): void; update(dt): void; get liveCount(): number; dispose(): void }`
  - `class SandFX { constructor(scene, quality); update(dt, speed): void }`
  - `class ImpactFX { constructor(scene, bus, quality); update(dt): void }`

- [ ] **Step 1: Implement `ParticleSystem.ts`**

A single `THREE.Points` with a preallocated `BufferGeometry` sized to
`particleBudget`. Position, velocity, life, size, and colour live in typed
arrays; dead particles are swapped to the tail rather than spliced. Draw range is
set to `liveCount` so dead particles cost nothing.

Custom shader material with additive blending for sparks, normal blending for
dust. Soft-edged round sprites generated procedurally — a radial falloff computed
in the fragment shader, not a texture file.

Zero allocation in `update`. Allocating per particle per frame is the standard
way this system becomes the frame budget.

- [ ] **Step 2: Implement `SandFX.ts`**

Two effects. Drifting sand: particles spawned in a volume around the camera,
velocity biased along `+Z` (the apparent wind from forward motion), density
scaling with machine speed, recycled when they leave the volume. Tread dust: a
denser continuous plume from both tread assemblies, kicked backward and upward,
which is the main thing that sells the machine as actually moving.

- [ ] **Step 3: Implement `ImpactFX.ts`**

Subscribes to `combat:hit` and `weapon:fired`. On hit: a puff oriented along the
surface normal, plus sparks on metal. On fire: a brief muzzle flash light
(a pooled `PointLight`, reused, never constructed per shot) and a tracer streak.

- [ ] **Step 4: Verification**

Run: `npm run dev`
Expected: visible sand streaming past that intensifies with speed; dust plumes
behind the treads; muzzle flash lights the deck briefly; impacts spark against
the machine. Frame time must not regress measurably — check the Task 18 overlay
before and after enabling FX.

- [ ] **Step 5: Commit**

```bash
git add src/fx
git commit -m "feat: add pooled GPU particle system with sand, dust, and impact FX"
```

---

## Task 16: Post-Processing Stack

**Files:**
- Create: `src/art/shaders/heatShimmer.ts`, `src/art/shaders/colorGrade.ts`, `src/core/renderer/PostProcessing.ts`
- Modify: `src/core/renderer/Renderer.ts`

**Interfaces:**
- Consumes: `Renderer`, `QualitySettings`
- Produces:
  - `class PostProcessing { constructor(renderer, scene, camera, quality); render(dt: number): void; resize(w, h): void; setEnabled(effect, on): void; dispose(): void }`

- [ ] **Step 1: Implement the chain**

Order matters and is specified exactly:

1. `RenderPass` into an MSAA render target — `new THREE.WebGLRenderTarget(w, h, { samples: quality.msaaSamples, type: THREE.HalfFloatType })`. HalfFloat is required or bloom will band badly.
2. `GTAOPass` — contact darkening. Gated by `quality.gtao`.
3. `UnrealBloomPass` — threshold ~0.85 so **only** the sun and emissives bloom. A low threshold that blooms the bright sand is the single most common way a desert scene turns to mush.
4. Heat shimmer `ShaderPass` — screen-space UV distortion from scrolling fBm, strength ramped by screen Y so it concentrates near the horizon and leaves the deck alone. Subtle: max offset around 0.0035 UV.
5. Colour grade `ShaderPass` — lift shadows toward violet, push highlights toward warm ochre, slight saturation boost, then film grain and vignette. All in one pass, because each extra full-screen pass costs real bandwidth.
6. `OutputPass` — handles tone mapping and colour space conversion. **Move tone mapping here**: when a composer is active, `renderer.toneMapping` must not also be applied, or it is applied twice.

Import paths are `three/examples/jsm/postprocessing/*.js`, all bundled with the
`three` package — no additional dependency.

- [ ] **Step 2: Verification**

Toggle each effect individually with debug keys.
Expected: GTAO visibly darkens the deck where equipment blocks meet it; bloom
affects the sun and muzzle flashes but leaves lit sand crisp; heat shimmer
wobbles the horizon without touching the deck; the grade warms highlights and
cools shadows; disabling all effects returns a correctly exposed, non-double-tone-mapped
image. Frame time increase from the full stack must stay under 4ms at 1080p.

- [ ] **Step 3: Commit**

```bash
git add src/core/renderer/PostProcessing.ts src/art/shaders/heatShimmer.ts src/art/shaders/colorGrade.ts src/core/renderer/Renderer.ts
git commit -m "feat: add post-processing stack with GTAO, selective bloom, heat shimmer, and grade"
```

---

## Task 17: HUD

**Files:**
- Create: `src/ui/HUD.ts`, `src/ui/hud.css`

**Interfaces:**
- Consumes: `EventBus`, `GameState`
- Produces: `class HUD { constructor(root: HTMLElement, bus: EventBus); update(state: GameState): void; dispose(): void }`

- [ ] **Step 1: Implement the HUD**

Plain DOM, per spec section 8.1. Elements from handoff section 43: player HP,
ammo (`mag / reserve`), equipped weapon name, crosshair, machine speed, distance
travelled. Interaction prompt and threat warning slots exist but stay hidden this
milestone.

Styling matches the art direction: industrial, high-contrast, warm amber on dark
translucent panels, monospace numerals. Uses a system font stack — **no font
files**, per the global constraints.

The HUD is event-driven for discrete changes (weapon equipped, reload started)
and polled once per frame for continuous values (HP, speed, distance). Never
touch the DOM for a value that has not changed — cache the last rendered value
and compare. Per-frame DOM writes for unchanged numbers cause real layout cost.

Crosshair reacts to state: it expands with current spread and pulses on hit.

- [ ] **Step 2: Verification**

Run: `npm run dev`
Expected: all values update correctly and legibly against both bright sky and
dark deck; crosshair expands while moving and tightens when aiming; no layout
shift as numbers change (fixed-width numerals).

- [ ] **Step 3: Commit**

```bash
git add src/ui
git commit -m "feat: add DOM HUD overlay"
```

---

## Task 18: Debug Overlay and Actions

Handoff section 57 asks for these early, because they save enormous time later.

**Files:**
- Create: `src/core/debug/DebugOverlay.ts`, `src/core/debug/DebugActions.ts`

**Interfaces:**
- Consumes: `Renderer`, `PhysicsWorld`, `WorldManager`, `EnemyManager`, `Game`
- Produces:
  - `class DebugOverlay { constructor(root); update(sources: DebugSources): void; toggle(): void; get visible(): boolean }`
  - `class DebugActions { constructor(game); handleInput(input): void }`

- [ ] **Step 1: Implement the overlay**

Toggled with F3. Displays: FPS (rolling 60-frame average) and frame time in ms,
draw calls, triangles, programs, physics body count, active enemies, active
chunks, distance travelled, machine speed and weight, particle live count,
quality tier. Values from `renderer.info` and the systems directly.

Update at 5Hz, not per frame. A per-frame debug overlay measurably distorts the
FPS number it is reporting.

- [ ] **Step 2: Implement the debug actions**

From handoff section 57, the subset meaningful at this milestone: F4 spawn enemy
ahead of the player, F5 give rifle ammo, F6 toggle god mode, F7 jump distance
forward 500m, F8 cycle quality tier, F9 toggle post-processing, F10 cycle time of
day (drives the sun vector and exercises the sky re-bake).

- [ ] **Step 3: Verification**

Run: `npm run dev`, press F3.
Expected: overlay shows plausible values; FPS reads at or near display refresh;
draw calls stay flat while distance climbs (proves instancing and chunk reuse are
working); every debug key performs its action.

- [ ] **Step 4: Commit**

```bash
git add src/core/debug
git commit -m "feat: add debug overlay and debug action keys"
```

---

## Task 19: Save/Load Skeleton and Integration

**Files:**
- Create: `src/save/SaveSchema.ts`, `src/save/migrations/index.ts`, `src/save/SaveManager.ts`, `src/game/GameState.ts`, `src/game/Game.ts`, `tests/e2e/smoke.spec.ts`, `playwright.config.ts`
- Modify: `src/main.ts`
- Test: `tests/unit/savemigrations.test.ts`

**Interfaces:**
- Consumes: everything
- Produces:
  - `interface SaveGameV1 { version: 1; seed: string; distanceTraveled: number; player: {...}; machine: {...}; progression: {...}; world: {...} }` — the handoff section 38 shape, with fields for unbuilt systems present but empty
  - `CURRENT_SAVE_VERSION = 1`
  - `migrate(raw: unknown): SaveGameV1` — throws a typed error on unrecoverable data
  - `class SaveManager { save(slot, data): Promise<void>; load(slot): Promise<SaveGameV1 | null>; delete(slot): Promise<void>; list(): Promise<string[]> }`
  - `class Game { constructor(canvas, hudRoot); start(): void; stop(): void; fixedUpdate(dt): void; render(alpha): void; saveTo(slot): Promise<void>; loadFrom(slot): Promise<boolean> }`

- [ ] **Step 1: Write and pass the migration test**

`tests/unit/savemigrations.test.ts`: a valid v1 save round-trips unchanged; an
object with no `version` throws; a version above `CURRENT_SAVE_VERSION` throws
with a clear "save from a newer version" message; a v1 save missing an optional
field gets a sensible default; migration is pure (does not mutate its input).

The migration chain exists with only one version in it. That is deliberate —
handoff section 38 requires schema versioning from the start, and retrofitting
it after the first save format ships is what makes save systems painful.

Run: `npx vitest run tests/unit/savemigrations.test.ts`
Expected: FAIL, then PASS.

- [ ] **Step 2: Implement `SaveManager.ts`**

IndexedDB, not localStorage, per handoff section 38. One object store keyed by
slot name. Wrap the request-based API in promises. Handle a blocked or failed
`open` by rejecting with a clear error rather than hanging forever.

- [ ] **Step 3: Implement `GameState.ts` and `Game.ts`**

`GameState` is a plain mutable object — no framework, per spec section 8.1.

`Game` constructs and owns every system, wires the event bus, and implements
`LoopCallbacks`. `fixedUpdate` order matters:

```
input -> player -> combat -> enemies -> machine -> world -> physics.step -> fx
```

Physics steps after the kinematic bodies have set their next translations, and FX
last so it reacts to the state the frame actually ended in.

`render(alpha)` interpolates visual transforms, then calls `PostProcessing.render`.

F1 saves to slot `quicksave`, F2 loads it. Loading calls `WorldManager.reset` and
`ChunkManager.reset` with the saved distance, which is exactly what the Task 9
determinism test proves works.

- [ ] **Step 4: Write the Playwright smoke test**

`playwright.config.ts` runs `npm run dev` as its `webServer` against
`http://localhost:5173`.

`tests/e2e/smoke.spec.ts`:
- Page loads with zero `console.error` and zero uncaught page errors.
- The canvas exists and has non-zero dimensions.
- A screenshot after 3 seconds is not a uniform colour — sample the buffer and
  assert real variance, which catches a blank or all-black render.
- Click to acquire pointer lock, press W for 500ms, and assert distance
  travelled increased (read via a `window.__game` debug handle exposed in dev).
- Fire a shot and assert `weapon:fired` incremented a counter on that handle.
- Press F1 then F2 and assert no errors and the game still renders.

- [ ] **Step 5: Run the full verification suite**

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

Expected: lint clean, `tsc --noEmit` clean, all unit tests pass, e2e smoke passes.

- [ ] **Step 6: Manual acceptance against the spec**

Walk spec section 9 explicitly and confirm each of the six criteria, including
criterion 5 — take a screenshot and judge honestly whether it reads as a real
game. Also confirm the three handoff milestone acceptance gates: player moves and
jumps on the machine with no jitter (M1); the machine appears to travel
indefinitely (M1); shooting reliably kills the enemy and feels responsive (M2).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add versioned IndexedDB save/load, Game orchestrator, and e2e smoke test"
```

---

## Self-Review Notes

**Spec coverage.** Every spec section maps to a task: 3.1 tight shadows -> Task 5;
3.2 sky -> Task 6; 3.3 PMREM IBL -> Task 6; 3.4 dunes -> Task 8; 3.5 fog -> Task 7;
3.6 post stack -> Task 16; 3.7 machine and procedural textures -> Tasks 7 and 11;
3.8 particles -> Task 15; 4 architecture -> Tasks 3, 4, 19; 4.1 world scroll ->
Task 9; 5 physics -> Tasks 10, 11, 12; 6 deliverables -> Tasks 11-19; 7 testing ->
distributed, e2e in Task 19; 8 stack -> Task 1.

**Deferred-scope check.** No task implements build mode, inventory, crafting,
resource collection, enemy vehicles, boarding, turrets, localized machine damage,
repair, threat director, loot, navigation, or audio. Confirmed against spec 6.1.

**Type consistency.** `fixedUpdate(dt)` and `update(alpha)` are used uniformly
across Player, Enemy, Machine, and World. `EventBus.on` returns a disposer
everywhere. `chunkSeed(worldSeed, chunkIndex)` has one signature, used by
`TerrainChunk` and `PropSpawner`. `computeDamage` has one signature, used by both
`PlayerCombat` and `Enemy`.

**Known risk.** Task 8's world-space noise sampling is the most likely source of a
visible defect (chunk seams). Its verification step calls this out specifically.
