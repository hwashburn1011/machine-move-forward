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

**Nothing is committed here yet.** The code path is in place and the slot is
empty; enemies currently draw as the procedural box everywhere, which is the
fallback working rather than a bug.

| Path | Pack | Licence | Applied to |
| --- | --- | --- | --- |
| `public/models/scavenger.glb` | _not yet chosen_ | must be CC0, or CC-BY recorded here | `EnemyVisual` — the scavenger |

The file arrives by hand. There is no open API for CC0 characters the way Poly
Haven serves textures: Poly Pizza needs a key, and Quaternius and Kenney publish
through pack pages whose download links are rendered client-side or handed off
to itch.io. Candidates, all CC0, are listed in
`docs/superpowers/specs/2026-08-23-animated-enemy-model-design.md` section 3 —
Quaternius' Ultimate Modular Men, Animated Men Pack, and Universal Animation
Library.

Requirements on whatever is chosen:

- **`.glb`** — one binary file, mesh plus skeleton plus clips, loaded by Three's
  `GLTFLoader` with no conversion step. A pack shipping only FBX or OBJ needs a
  Blender export first.
- Clips covering idle, walk, run, attack, and death. Names need not match:
  `resolveClip` matches on case-insensitive substring and falls back down a
  chain, so `Armature|CharacterArmature_Walk` resolves and a pack with no run
  clip walks instead of freezing. A pack with no death or attack clip is the
  wrong pack.
- Any height and any origin. `fitToCapsule` scales the model to the 1.92 m
  collider and lifts its feet to the collider's base, so the drawn character and
  the solid one cannot drift apart.

Drop the file in and it is picked up on the next boot, with no code change.
`?nomodel=1` forces the box, and `tools/combat.mjs` prints a visible `SKIP` line
for its two model checks while the slot is empty.

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
