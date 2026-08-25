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
| `public/textures/sand/` | [`aerial_sand`](https://polyhaven.com/a/aerial_sand) | The dunes, via the terrain shader — **not** a material slot, see below |

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
| `public/models/player.glb` | [Soldier.glb](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) ("Vanguard"), via the three.js examples | **Mixamo / Adobe — NOT CC0** | `PlayerVisual` — the player character |
| `public/models/scavenger.glb` | [RobotExpressive](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) by [Tomás Laulhé](https://www.patreon.com/quaternius) (Quaternius), converted by [Don McCurdy](https://donmccurdy.com/) | **CC0 1.0** | `EnemyVisual` — the scavenger |
| `public/models/props/wreck.glb` | [Ship Wreck](https://poly.pizza/m/4qia78IBmZ) by [Kenney](https://kenney.nl/) | **CC0 1.0** | `PropSpawner` — hulls half-buried in the dunes |
| `public/models/props/containers.glb` | [Shipping Container Structure](https://poly.pizza/m/ebmepOXDRd) by Quaternius | **CC0 1.0** | `PropSpawner` — container stacks |
| `public/models/props/debris.glb` | [Debris Pile](https://poly.pizza/m/WrIiMMxyEP) by Quaternius | **CC0 1.0** | `PropSpawner` — rubble scatter |
| `public/models/weapons/rifle.glb` | [Assault Rifle](https://poly.pizza/m/K2lXTYFSLC) by Quaternius | **CC0 1.0** | `PlayerVisual` — the Scrapline AR, in the player's right hand |
| `public/models/weapons/shotgun.glb` | [Shotgun](https://poly.pizza/m/ZmPTnh7njL) by Quaternius | **CC0 1.0** | `PlayerVisual` — the Dust Breaker |

The three prop packs are 456 KB together, one mesh apiece, no textures at all —
both authors colour by material rather than by map. `PropModels` merges each
pack's primitives into a single geometry and bakes the material colours into
vertex colours on the way, so a pack keeps its palette at one draw call and can
be drawn by an `InstancedMesh`. They are authored in centimetres and scaled up
by a node, which is baked in at the same time.

**What was inspected and rejected**, so nobody repeats it:

| candidate | licence | why not |
| --- | --- | --- |
| [Modular Ruins Pack](https://poly.pizza/m/F2LAK03B0r) (Quaternius) | CC0 | 8 MB and 95 pieces, of which the usable ones are a handful. Gothic arches, stag statues, bookcases and overgrown walls — a medieval monastery kit, not a desert. Worth revisiting for its plain masonry if the scatter ever needs stone. |
| Skyscraper, Factory, Apartment (Poly by Google) | CC-BY | These are the pieces that would actually read as a swallowed CITY. Ruled out deliberately: CC0 only, so the project carries no attribution obligations. |
| [Blaster Kit](https://kenney.nl/assets/blaster-kit) (Kenney) | CC0 | Downloaded, unpacked and looked at before being rejected: 18 guns, GLB, 300–900 triangles, real-world scale, textbook pipeline fit. They are Nerf blasters — bright orange, purple and lime plastic — and this game is rust and dust. A model whose palette has to be fought is not cheaper than one that fits. |
| [Hook and chain](https://poly.pizza/m/dBp9m8k9kTi) (Zacharylll) | CC-BY | The best-shaped grappling hook found anywhere, and unusable for the same reason the Poly by Google city pieces are. Nothing CC0 came close, so the reel's hook is built in code instead — `src/salvage/HookModel.ts`, out of the same `bevelledBox` the machine is, which is also why it matches the hull it is thrown from. |

453 KB, glTF 2.0 binary: 14 meshes over 2 skins, 43 joints, 14 clips. Five of
those clips carry the whole enemy — `Idle`, `Walking`, `Running`, `Punch`,
`Death` — and `resolveClip` finds them by case-insensitive substring, which is
why `Punch` satisfies `attack` without the pack being renamed. The mapping is
pinned in `tests/unit/enemyvisual.test.ts` so a swap to a pack that names things
differently fails in node rather than as a scavenger standing still while it
sprints at you.

**The player model is Mixamo's, and that needs a decision.** Adobe grants a
royalty-free licence to *use* Mixamo characters in a project, including
commercially. Redistributing the raw `.glb` — which is what committing it to a
public repository does — is the part their terms do not clearly permit. three.js
ships this exact file in its own MIT repository, and plenty of projects follow
suit, but that is common practice rather than a licence. It was taken knowingly,
on the instruction to use anything free to use, and it is flagged here so the
decision is visible rather than buried. Swapping it is a file copy: drop any
rigged `.glb` with idle/walk/run clips at `public/models/player.glb`.

**The weapons carry no textures at all**, like the prop packs: the authors
colour by material, and the names they use — `Wood`, `Metal`, `DarkMetal`,
`Black` — are already a worn-firearm palette that needs no help to sit in a
desert. Between them they are 130 KB and about 2300 triangles.

Neither is a special case in code. `HeldItem` measures whatever model it is
given, scales it to the real length in `data/weapon-models.ts`, and turns its
long axis — the barrel — to face the way the character does, so swapping either
one is a file copy exactly like the characters. The bone they hang off is found
by name-fragment matching for the same reason `resolveClip` matches animations
that way: the two rigs this project already ships name their hands
`mixamorig:RightHand` and `Hand.R`.

**The scavenger is a placeholder and it looks like one.** This is a friendly cartoon robot,
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
class of bug that put enemies inside the prow.

**The dunes were on that list and have come off it.** They said "the dunes stay
procedural too, because they are infinite and scroll", and the shape still is:
the height field, the ripples, the slope colour and the glint are all code, and
scrolling infinite terrain is exactly why. What changed is the SURFACE, on the
instruction to use real textures where they raise the graphics. An aerial sand
scan now supplies grain and large-scale blotching that procedural noise was
never going to fake convincingly.

It is bound differently from every other set here and that is the interesting
part. A terrain chunk is 360m by 64m, so its own UVs would stretch one 1k tile
the length of the world; the shader samples the scan in WORLD space instead, at
two scales, and uses it as a detail term around 1.0 rather than as albedo. The
scan is pale desert beige and this desert is deliberately not — multiplied in
directly it would drag every art-directed colour toward the photograph's. So
the palette keeps the hue and the photograph only says where sand is coarser,
finer, scoured or banked.

**Licensing rule:** prefer CC0 (no attribution required). CC-BY is acceptable
but every use must be recorded in this file. Anything more restrictive needs a
deliberate decision, not a download.

## Audio

**No sample files, by the same rule.** Every sound is synthesised at runtime
out of oscillators and filtered white noise — `src/audio/SoundBank.ts` holds the
recipes and is pure data, `src/audio/AudioEngine.ts` is the only thing in the
project that knows WebAudio exists.

A rifle shot is a filtered noise burst with a fast decay whether it comes out
of a WAV or out of an oscillator, and the WAV brings a licence, a download, a
loading state and a decode with it. A sample earns its place here when a
synthesised version cannot be made to read — not before. When one does, it
arrives as a new `source` kind in `SoundBank` rather than as a special case
somewhere else, and it goes in the table above like any other asset.

`?nosound=1` boots silent, and `M` mutes. Every browser harness except
`combat.mjs` runs silent; `combat.mjs` keeps audio on precisely so that the one
thing a unit test cannot reach — whether a real `AudioContext` was obtained and
a real node graph got built — is measured against a real browser.
