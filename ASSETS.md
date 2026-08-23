# Third-Party Assets

Everything in this project is generated in code except the files listed here.

The original rule was **no asset files at all**. It has been relaxed to
**procedural by default, assets where they earn their place** — see the policy
at the bottom.

## Textures

All from [Poly Haven](https://polyhaven.com/), licensed **CC0 1.0 Universal**
(public domain dedication). No attribution is legally required; it is recorded
anyway so the project knows where its bytes came from and can re-source or
re-license them without archaeology.

| Path | Poly Haven asset | Applied to |
| --- | --- | --- |
| `public/textures/hull/` | [`green_metal_rust`](https://polyhaven.com/a/green_metal_rust) | `Materials.hull` — the machine body |
| `public/textures/rusted-steel/` | [`rusty_painted_metal`](https://polyhaven.com/a/rusty_painted_metal) | `Materials.rustedSteel` — cargo and crates |
| `public/textures/deck-plate/` | [`metal_plate`](https://polyhaven.com/a/metal_plate) | `Materials.deckPlate` — the deck surface |
| `public/textures/build-plate/` | [`metal_plate_02`](https://polyhaven.com/a/metal_plate_02) | `Materials.buildPlate` — player-built floors and stairs |

Each set is three 1K JPEGs, about 1.3 MB per material:

- `diffuse.jpg` — albedo, sRGB
- `normal.jpg` — OpenGL-convention tangent-space normals, linear
- `arm.jpg` — ambient occlusion (red), roughness (green), metalness (blue)
  packed into one image, the glTF convention. Three binds the same texture to
  `aoMap`, `roughnessMap` and `metalnessMap` and samples the channel each
  needs, so it costs one request and one GPU upload instead of three.

## Models

| Path | Pack | Licence | Applied to |
| --- | --- | --- | --- |
| `public/models/scavenger.glb` | [RobotExpressive](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) by [Tomás Laulhé](https://www.patreon.com/quaternius) (Quaternius), converted by [Don McCurdy](https://donmccurdy.com/) | **CC0 1.0** | `EnemyVisual` — the scavenger |

453 KB, glTF 2.0 binary: 14 meshes over 2 skins, 43 joints, 14 clips. Five of
those clips carry the whole enemy — `Idle`, `Walking`, `Running`, `Punch`,
`Death` — and `resolveClip` finds them by case-insensitive substring, which is
why `Punch` satisfies `attack` without the pack being renamed. The mapping is
pinned in `tests/unit/enemyvisual.test.ts` so a swap to a pack that names things
differently fails in node rather than as a scavenger standing still while it
sprints at you.

**It is a placeholder and it looks like one.** This is a friendly cartoon robot,
not a wasteland scavenger; it is here because it is genuinely CC0, rigged, and
carries every clip the AI states need. Swapping it is a file copy — see below.

The model is authored in centimetres and imports about 147 units tall.
`fitToCapsule` scales it to the 1.92 m collider and lifts its feet to the
collider's base, so nothing about a replacement's units, height, or origin needs
to match anything.

**Replacing it:** drop a `.glb` at `public/models/scavenger.glb` and it is
picked up on the next boot, with no code change. What it has to satisfy:

- **`.glb`** — one binary file, mesh plus skeleton plus clips, loaded by Three's
  `GLTFLoader` with no conversion step. A pack shipping only FBX or OBJ needs a
  Blender export first.
- Clips reachable from the five AI states. Names need not match; a pack with no
  run clip walks instead of freezing, but one with no death or attack clip is
  the wrong pack.
- CC0, or CC-BY with attribution recorded in this table.

Other CC0 candidates, none of which download without a browser — Poly Pizza
needs an API key, and Quaternius and Kenney publish through pack pages that
render their links client-side or hand off to itch.io — are listed in
`docs/superpowers/specs/2026-08-23-animated-enemy-model-design.md` section 3.

## The policy

**Procedural is the default and the fallback.** `src/art/TextureLoader.ts`
never rejects: a texture that is missing, fails to decode, or was never
requested leaves the material with the procedural maps `TextureFactory` has
always generated. `?notex=1` forces that path.

`src/art/ModelLoader.ts` makes the same promise for the scavenger: a missing
or undecodable `.glb` costs a nicer-looking enemy, never a boot. `?nomodel=1`
forces that path.

This is not defensive dressing. It is what lets the browser harnesses and the
Playwright suite boot with nothing to fetch — deterministic and fast, with no
loading gate to go flaky — and it means a 404 in production costs a
nicer-looking hull rather than a black screen. Every harness passes `notex=1` and
`nomodel=1` for exactly that reason.

**Where assets are worth it:** surfaces and characters — things whose detail is
expensive to fake and cheap to buy, and whose animation is not worth hand-
writing.

**Where they are not:** the machine and the nine build pieces stay procedural.
They are bespoke, aligned to a 2 m grid, and their colliders are derived from
the same geometry — a mismatch between what is drawn and what is solid is the
class of bug that put enemies inside the prow. The dunes stay procedural too,
because they are infinite and scroll.

**Licensing rule:** prefer CC0 (no attribution required). CC-BY is acceptable
but every use must be recorded in this file. Anything more restrictive needs a
deliberate decision, not a download.
