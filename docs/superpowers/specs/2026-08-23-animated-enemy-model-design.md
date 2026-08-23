# Machine Move Forward — Animated Enemy Model

**Date:** 2026-08-23
**Status:** Approved
**Builds on:** Milestones 0–4, the enemy spawner, and the CC0 texture pass

---

## 1. Purpose

Scavengers are bevelled boxes that slide. They have working AI, damage, death,
and now pursuit, but nothing about how they look or move communicates any of
it — you cannot tell a navigating scavenger from an attacking one, and a kill
reads as a box tipping over.

This replaces the box with a rigged, animated character driven by the AI state
that already exists.

It is the second and larger half of relaxing the zero-asset rule. The texture
pass dressed surfaces and deliberately avoided a loading gate; this one cannot
avoid it, and building that gate properly is most of the work.

---

## 2. Constraints

Inherited and still binding:

- **The machine never moves.** Enemies live in machine-space.
- **Procedural is the fallback, not dead code** (`ASSETS.md`). The box mesh
  stays and is what renders when no model is loaded.
- **No React, no Zustand, no audio.**
- **Definition and runtime instance stay separate types.**

New and load-bearing:

- **The capsule does not change.** Radius 0.36, half-height 0.6 — a 1.92 m
  collider. The model is fitted to it, never the reverse. Combat ranges, the
  autostep height, the steering probe band, and every harness assertion about
  reach are all tuned against that capsule, and moving it would invalidate work
  that is currently green for reasons unrelated to art.
- **No new enemy definitions.** `scavenger` remains the only one. One model,
  as agreed — variety is a data change once this pipeline exists, and adding it
  now would hide a per-model rigging fault behind "that one looks odd".
- Existing suites must keep passing: 351 unit, 11 e2e, 87 harness checks
  (drive 9, combat 28, build 21, craft 29).

---

## 3. Acquiring the Model — a Manual Prerequisite

**This step cannot be automated, and the implementation must not pretend
otherwise.**

Poly Haven served the texture pass through an open JSON API. There is no
equivalent for models. Poly Pizza's API requires a key; Quaternius and Kenney
publish through pack pages whose download links are rendered client-side or
delegated to itch.io. Probing for direct URLs returned 404s and an API-key
error.

So the model arrives by hand, before implementation starts:

**Candidates, all CC0:**

| Pack | Contents | Format |
| --- | --- | --- |
| [Quaternius — Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) | 11 characters, 24 animations | FBX, OBJ, **glTF**, Blend |
| [Quaternius — Animated Men Pack](https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT) | 4 characters, walk/run/punch/die | FBX, **GLB** |
| [Quaternius — Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | Animation set, 60–70% CC0 | OBJ, FBX, **glTF** |

**Requirements on whatever is chosen:**

- **`.glb` preferred** — one binary file, mesh plus skeleton plus clips, loaded
  by Three's `GLTFLoader` with no conversion. A pack shipping only FBX/OBJ
  needs a Blender export step, which is work this spec does not cover.
- Must contain clips that map to the five AI states (section 5). A pack with no
  death or attack clip is the wrong pack.
- Licence must be CC0, or CC-BY with attribution recorded in `ASSETS.md`.
- Placed at `public/models/scavenger.glb`.

**If no suitable model is in place, implementation stops and says so.** Every
suite still passes in that state, because the box is the fallback — which is
precisely why the fallback is not optional.

---

## 4. Components

### 4.1 `src/art/ModelLoader.ts`

Mirrors `TextureLoader`: never rejects, returns what it got.

```ts
export interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Null when the file is absent, undecodable, or was never requested. */
export function loadModel(url: string): Promise<LoadedModel | null>;
```

`GLTFLoader` comes from `three/examples/jsm/loaders/GLTFLoader.js`, already
available — no new dependency.

### 4.2 `src/enemies/EnemyVisual.ts`

Owns everything about how one enemy looks, so `Enemy` keeps owning only where
it is and what it is doing.

```ts
export class EnemyVisual {
  /** The box when `model` is null, a skinned clone when it is not. */
  constructor(model: LoadedModel | null, materials: Materials);
  readonly object3D: THREE.Group;
  /** Cross-fade to the clip for an AI state. Idempotent per state. */
  setState(state: EnemyAIState): void;
  /** Advance the mixer. Called from the render step, not the fixed step. */
  update(dt: number): void;
  dispose(): void;
}
```

**Skinned meshes must be cloned with `SkeletonUtils.clone`**, not
`Object3D.clone`. A plain clone shares the skeleton between instances, and
eight scavengers then animate as one — every pose identical, driven by
whichever mixer updated last. This is the single most likely bug in the task.

**The mixer advances on the render step**, where a frame delta exists, not the
fixed step. Animation is presentation: driving it at 60 Hz fixed while
rendering at another rate makes playback stutter independently of the
simulation.

### 4.3 `Enemy` integration

`Enemy` delegates its visual to `EnemyVisual` and calls `setState` when the AI
state changes. Two things are deleted rather than kept:

- the `rotation.z` death topple in `update` — the death clip replaces it
- direct `buildEnemyMesh` use — it moves behind `EnemyVisual`

Position and yaw interpolation stay exactly as they are.

### 4.4 `Game`

`Game.create` already awaits Rapier and now the textures; the model joins that
line, behind the same style of option (`GameOptions.models`, default true) and
the same `?nomodel=1` escape hatch. `EnemyManager` receives the loaded model
and hands it to each pooled `Enemy`.

---

## 5. Animation

Five AI states already exist. The mapping is one clip each:

| AI state | Clip | Notes |
| --- | --- | --- |
| `idle` | Idle | Out of detection range |
| `navigate` | Walk | Approaching |
| `pursue` | Run | Engaged and closing |
| `attack` | Attack | Loops while in range; not synced to the damage tick |
| `dead` | Death | Plays once and holds its final pose |

**Death clamps rather than loops** — `LoopOnce` with `clampWhenFinished`, or the
corpse springs back upright partway through the 2.5 s despawn timer.

**The attack clip is not synchronised to the damage tick.** Damage timing is
`attackCooldown` in the definition and is already tested; making the animation
authoritative would couple a data-driven number to an artist's keyframes. The
clip is feedback, not mechanism.

Clip names vary between packs, so resolution is by **case-insensitive substring
match with a fallback chain** (`run` → `walk` → first clip). A pack missing a
clip degrades to a worse-matching one rather than throwing.

---

## 6. Fitting the Model to the Capsule

The collider is 1.92 m tall, centred on `position`. Models arrive at arbitrary
scale with their origin usually at the feet.

On load, once: measure the model's bounding box, scale uniformly so its height
matches the capsule, and offset it so its feet sit at the capsule's bottom.
Derived from the capsule constants rather than hard-coded, so the two cannot
drift apart.

`Enemy.update` already applies `object3D.position.y -= CAPSULE_HALF_HEIGHT +
CAPSULE_RADIUS`. That offset moves into `EnemyVisual`, where the rest of the
fitting lives, rather than being split across two files.

---

## 7. Performance

Eight pooled enemies, at most four active. Each active one is a skinned mesh
plus an `AnimationMixer`. Skinning is per-vertex GPU work on a low-poly
character — negligible beside the 400k+ triangles already drawn.

The model is loaded **once** and cloned per pooled enemy at construction, not
per spawn. Cloning a skinned hierarchy mid-combat is exactly the hitch the pool
exists to avoid.

Budget: the current build is 3.5 MB of JS plus 4.1 MB of textures. A low-poly
CC0 character is typically well under 2 MB. If the chosen pack is larger than
that, prefer a single character export over a whole-pack file.

---

## 8. Persistence

**None.** No save schema change. Which model an enemy wears is presentation and
is rebuilt from the pool on load.

---

## 9. Testing

**Unit** (`tests/unit/enemyvisual.test.ts`) — the parts that are pure logic:

- Clip resolution: exact name, case-insensitive substring, fallback chain, and
  a clip set missing everything still yields something rather than throwing
- Fit maths: a model of arbitrary height scales to the capsule height, and its
  feet land at the capsule's base
- State-to-clip mapping covers all five states

**Harness** (`tools/combat.mjs`) — what unit tests cannot see:

- With a model absent, enemies still spawn, pursue, take damage, and die
  (the fallback path, which is what the whole suite runs on)
- Model present: an enemy's visual is a skinned mesh, and two live enemies in
  different AI states hold **different poses** — the assertion that catches
  the shared-skeleton bug, which no unit test can reach

**Screenshot** — one frame with a scavenger mid-attack, to confirm the model
faces the player, stands on the deck rather than in it, and is the right size
beside the player capsule.

---

## 10. Out of Scope

**No enemy variety.** One model.

**No ragdoll.** The death clip plays and the corpse despawns on the existing
timer.

**No inverse kinematics, no foot planting.** Feet will slide on slopes. The
deck is flat and this is a low-poly game.

**No attack-timed damage.** Section 5.

**No LOD.** Four active low-poly characters do not need it.

---

## 11. Success Criteria

1. Scavengers render as animated characters rather than boxes.
2. Their animation tells you what they are doing: idle, walking, running,
   attacking, dead.
3. Two enemies in different states hold visibly different poses.
4. A killed scavenger plays its death animation and holds the final pose until
   it despawns.
5. The model matches the capsule: feet on the deck, roughly player height.
6. With no model file present, everything above degrades to today's box and
   every suite still passes.
7. All existing tests and harnesses still pass.
