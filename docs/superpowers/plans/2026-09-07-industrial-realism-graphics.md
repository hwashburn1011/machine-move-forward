# Industrial realism graphics pass

Status: implemented graphics pass, September 7, 2026. The original work packages
below are retained as the design specification. See
[the delivery and verification record](../../art/graphics-v2/README.md) for the
actual assets, checks, performance evidence, and remaining stretch work.

The user selected **weathered industrial realism** and **a midrange gaming PC
at 60 FPS**. The user subsequently authorized Luna to construct Blender assets
from detailed specifications. Sol refined the work and reviewed integration;
Luna built machinery, weapons, stations, and expedition assets and implemented
supporting code; Astra created the characters and salvage equipment, corrected
shared modeling/material defects, and reviewed and integrated the final artwork.

## Intended result

The player should look like a person wearing desert work clothing and protective
equipment. The machine should look manufactured, assembled, repaired, and used.
The wreck should look like an abandoned vehicle with an actual interior. Close
views should reveal seams, fasteners, fabric, layered paint, glass and rubber.
At normal gameplay distance, the same objects must retain clear silhouettes,
readable interactions, stable highlights, and convincing contact with the world.

Use smooth curved surfaces and sufficient geometry for visible contours, with
baked surface detail for smaller features. Simply subdividing the existing box
characters or multiplying the resolution of their current noise textures does
not meet this brief. Keep purposeful hard edges on manufactured plates.

Work in the existing Three.js/Rapier game. Preserve the playable chapter, build
system, combat, saves, and authored pivot/collision contracts while replacing
their visual representation. Runtime path tracing, an engine migration, and
new gameplay chapters are outside this pass.

## What the audit found

- Blender 5.1.0's Blender MCP addon answered both `get_scene_info` and a read-only
  `execute_code` request through `127.0.0.1:9876`. This session exposes the addon
  connection through its documented socket protocol; no named Blender MCP tool
  is directly registered in the current tool catalog.
- The open Blender scene has Cube, Light and Camera, no saved filepath, and
  reports unsaved changes. Implementation must create its own scene/collections
  and save new project files without clearing or overwriting that session.
- The machine reports an RTX 3070, an i9-11900KF (8 cores/16 threads), and about
  16 GB system RAM. Chrome 152.0.7977.76 and Edge 152.0.4191.66 are installed.
  This is useful for local validation, but is not every target player's PC.
- The inspected player pose, radio close view and docked scene show rectangular
  limbs, faceted round parts, stretched/repetitive wear and sparsely detailed
  large surfaces.
- `tools/art/build_assets.py` builds limbs from rigid primitives. Cylinders
  default to 12 sides; bevels use two segments; the shared finish helper does
  not explicitly establish smooth shading on rounded surfaces.
- All nine current authored GLBs have **zero embedded images and zero authored
  normal-map bindings**. They have palette materials and some runtime wear.
  Existing machine/terrain PBR texture sets do exist separately.
- `DefenseModels.prepareAuthoredModel()` replaces the color and normal maps of
  Paint/Steel/Rust materials with generic 128-pixel wear maps. New baked artwork
  will be lost unless this behavior changes first.
- `PropModels.mergePropGeometry()` keeps position, normal and color attributes,
  drops UVs, and converts material colors to vertex colors. Real textured world
  props need a separate atlas-aware batching path. `PropSpawner` also forces
  flat shading, disables frustum culling, and lets every prop batch cast shadows.
- `QualitySettings` advertises GTAO on High/Ultra, but `PostProcessing` has no
  GTAO pass. Contact darkening therefore needs an actual implementation.
- The existing renderer already has HDR targets, ACES output, PMREM sky
  lighting, soft shadow mapping and aggregate render counters. Improve these
  systems instead of adding duplicate pipelines.
- Quality changes currently toggle only part of the pipeline: composer
  resolution/MSAA and several terrain, prop, particle and lamp budgets are not
  fully updated. Terrain ripple normals animate with time and can make solid
  sand appear to swim. The initial sky direction and time-of-day state also
  need to be brought into agreement.

A 1920×1080 High-tier headless baseline loaded the authored assets with no page
errors and recorded 538 aggregate draws and 1,085,056 submitted triangles in
one ordinary traveling-deck frame. These are complete-frame counters, not just
visible model geometry. The browser identified its backend as **SwiftShader**;
its very slow software-rendered timing is not a measurement of the RTX 3070.
See [`runtime evidence`](../../art/graphics-baseline-runtime.json) and
[`baseline game view`](../../art/graphics-baseline-game.png). Hardware frame
time and combat/expanded-build profiles remain implementation-stage checks.

The machine-readable asset inventory is
[`graphics-baseline.json`](../../art/graphics-baseline.json). Representative
before images are in `docs/art/chapter-review/` and `docs/art/player-poses-front.png`.

| Current asset | Triangles | Material primitives | Main limitation |
| --- | ---: | ---: | --- |
| Player | 3,760 | 7 | Block-shaped body; 16-bone rigid-part construction |
| Raider | 3,760 | 7 | Same primitive body construction |
| Scavenger | 3,468 | 6 | Simplified mechanical forms |
| Manual gun | 2,404 | 12 | Low detail despite many material draws |
| Boarding skiff | 10,176 | 12 | Only 4 of 12 primitives have UVs |
| Radio | 2,808 | 8 | Box housing and palette materials |
| Relay wreck | 10,476 | 20 | Thin shell, sparse interior, repeated large panels |
| Rifle / shotgun | 1,244 / 1,620 | 6 each | Simple receiver, grips, barrels and attachments |

## Visual standard and material language

Keep the teal/ivory player identity, sage industrial machine paint, ochre
safety markings, and restrained red raider accents. Use a neutral daylight
look-development scene to evaluate the assets, followed by the actual desert
lighting. Warm sunlight and cooler shaded surfaces should reveal shape without
covering every material with an orange filter.

Build a small reusable material library: coated steel, exposed steel, cast
metal, rust, oil/grease, rubber, woven canvas, leather, glass and dusty concrete.
Weathering must follow construction and use: dust on upward-facing ledges,
grime in seams, oil around bearings, exposed metal at worn handles, and rust
around damaged coating. Do not add identical scratches everywhere.

Use real dimensions and coherent detail scale. A panel seam can be a few
millimeters, a bolt head roughly a centimeter, and a fabric weave much smaller.
Geometry earns its cost when it affects silhouette, parallax, a moving part,
or a close interaction. Weave, shallow scratches, most weld texture and tiny
fasteners should generally live in normal/roughness maps at gameplay distance.

Every hero asset needs three reviews: silhouette without textures, neutral PBR
lighting without post effects, and the production game at its real camera
distance. Screenshots in Blender alone do not establish successful delivery.

## Blender and export workflow — Astra

1. Create a dedicated graphics workspace scene and per-asset collections using
   the running MCP connection. Save versioned editable sources under
   `assets/blender/graphics-v2/`. The existing `clear()` generator helper operates
   globally and must not be invoked in the user's live Blender session. Use
   Save Copy to a validated new path rather than replacing the live filepath;
   preserve the current unsaved scene. Review imports go into an Astra-owned
   temporary scene/collection. Restore the original active scene/selection when
   finished, and clean up only data explicitly owned by the graphics job.
2. Use new collection-scoped helpers in `tools/art/graphics_v2/`. Record every
   reusable modeling/export step as a script. Avoid modifying global Blender
   preferences as an import side effect.
3. Model high-detail forms with subdivision, controlled bevels, curved profiles,
   appropriate smooth normals, and deliberate hard edges. For clothing, create
   anatomical volume and cloth topology, then sculpt or simulate folds and bake
   them. Use staged meshes/caches instead of live cloth simulation in the game.
4. Build optimized runtime meshes with clean silhouettes and deformation loops.
   Keep high-detail source, runtime mesh, bake cage and export collection
   separate. Do not decimate away fingers, door contours, muzzle markers or
   important rounded silhouettes.
5. Unwrap every textured surface. Use shared trim sheets for architectural metal
   and reusable parts; use dedicated atlases for characters and close props.
   Inspect seams and texel density with a checker before baking.
6. Bake tangent-space normals, base color, roughness, metalness and occlusion.
   Keep directional scene lighting out of base color. Use sufficient dilation
   around UV islands and verify the result through mip levels.
7. Pack occlusion/roughness/metalness into R/G/B. Base color and emissive are
   color data; normal and packed data maps are linear. Prefer lossless masters
   and inspect compressed normal maps for block artifacts.
8. Export GLB using metres, established axes, named pivots, independent skins,
   and stable animation names. Procedural Blender shader networks must be baked
   into glTF-compatible image maps to survive export.
9. Generate deliberate LOD variants. Simplify topology while retaining UVs,
   material boundaries, rig attachment points and silhouette. Use matching
   skeletons for animated variants.
10. Validate with the real Three.js GLTFLoader, not only Blender's viewport.
    Compare exported bounds, normals, textures, skinning and named nodes before
    replacing a runtime asset. Keep source and last known-good exports.

MCP operations are serialized by Astra. Long baking operations may use an
isolated background Blender process on an explicitly saved source copy, with
results inspected again through the live MCP scene. This prevents a long bake
from making interactive progress invisible.

## Asset briefs and provisional budgets

These are starting allocations for LOD0 at close range, not minimum polygon
counts or guaranteed performance. Spend geometry where the camera shows it.
Large assets use multiple reusable materials/atlases instead of one enormous
unique texture. Confirm the final allocations after the first in-game slice.

| Asset group | Detail brief | Initial LOD0 allocation | Texture allocation |
| --- | --- | ---: | --- |
| Player | Rounded helmet and visor, natural torso/limb proportions, fitted jacket/trousers, shaped gloves and boots, layered straps, seams, pockets, buckles | 35–55k triangles | Two 2K sets; optional 1K accessories |
| Raider | Human proportions and deformation, scarf/mask, different clothing construction, patchwork armor and worn equipment | 25–40k | One or two 2K sets shared across variants |
| Scavenger | Curved cast housings, joint bearings, pistons, cable bundles, recessed optics, service panels | 20–35k | One or two 2K sets |
| Machine | Plate thickness, rolled edges, structural beams, drivetrain, suspension, bearings, tread surfaces, ducts, pipe runs, cable clamps, service hatches | 180–300k total nearby visible exterior | Shared 2K trims and tiles; up to two hero 2K sets |
| Build/station kit | Generator cooling fins, refinery vessels/pipes/gauges, functional workbench tools, storage latches, believable lamps, framed walls/windows/stairs | 8–25k per station; 0.3–2k per repeated structural module | Shared 2K station/structural atlases |
| Radio | Rounded pressed-metal case, grille depth, screws, dial glass, pointer, knob knurling, labels, strap, cable and aerial collars | 8–15k | One 2K set; shared small emissive atlas |
| Weapons | Machined receivers, grips, fasteners, sight glass, charging controls, barrel interior, magazine and pump detail | 10–18k each | One 2K set each or shared weapon atlas |
| Manual gun + six upgrades | Bearing races, trunnions, feed mechanism, shields, cooling jacket, meaningful ram/coil/governor/breech/drum hardware | 20–35k gun; 2–8k per visible upgrade | Shared 2K machinery/weapon trims |
| Boarding skiff | Formed hull, layered track/suspension parts, engine, exhaust, crew seats, rail clamps, gun and cable anchors | 60–100k excluding crew | Two 2K sets plus shared trims |
| Wreck | Thick framed hull, torn edges, bent panels, ribs, sealed joints, usable corridors, machinery, readable salvage history | 120–220k, split into cullable sections | Shared trims plus two or three 2K sets |
| Chests, hook, Gyro, logs | Chest hinges/latches/corner guards, forged hook and swivel, braided cable, precision Gyro rings, convincing paper/containers | 3–10k per close object | Shared 1K/2K prop atlases |
| Rocks, ruins, debris, dry vegetation | Eroded forms, layered stone, broken masonry, plausible scrap clusters, sparse dried plants | 0.5–8k per near variant | Shared 1K/2K atlases with LODs |

Typical LOD targets are approximately 100% / 45% / 15% of LOD0 geometry,
adjusted for silhouette. Start prop transitions around 15m/40m and character
transitions around 12m/30m, then tune by projected size with hysteresis. Never
switch the player's own body to a visibly faceted mesh at the normal camera.

### Character work that cannot be solved by textures

Replace the box body rather than rounding its corners. Give elbows and knees
enough loops and blended weights to bend naturally. Model boots with shaped
soles and toe volume; gloves need recognizable palms/thumbs instead of cubes.
Keep the face protected by the current character concept so detail can focus
on visible gear, proportions and motion.

Maintain root-motion-free gameplay clips. Improve planted feet, weight shift,
pelvis motion, shoulder counter-motion, weapon carry and transitions. Preserve
the gun grip through idle/walk/run and the cable grip through the boarding
mount, traverse and mantle. Cloth motion should be subtle baked motion or
inexpensive secondary bones. A cloth simulation and dozens of physics straps
per actor are unnecessary for this camera.

### Machine and wreck work that cannot be solved by texture resolution

Create actual layered construction: beams supporting the deck, panels attached
to frames, hoses connecting equipment, maintenance access, and recognizable
moving joints. Large blank surfaces need secondary forms and composition.
Keep walkable space open and use repeated construction logic so the machine
remains readable when the player adds floors, walls and stations.

The wreck interior needs distinct cargo, crew and navigation areas around its
existing three logs. Use selected furniture, damaged fittings, restrained
lighting and localized dust to guide the eye. Each area should have a focal
point and navigable negative space; filling every floor area with debris
would hurt both the composition and the chapter.

## Renderer, world and effects work

Preserve authored maps and material intent before importing the new art. Add
texture/geometry compression, quality-specific asset selection, ownership and
disposal, and controlled prefetching. Prefetch the wreck while traveling so
its detailed model does not freeze the docking moment. Preparation includes
GPU texture upload and compilation of the actual material/skinning variants,
not just download and GLB parsing. Keep the current fallback usable while the
detailed resources are being prepared.

Tune the existing sky/environment illumination, sun, exposure and shadow bias
together. Use an actual contact-occlusion pass at a measured resolution on the
appropriate tiers. Validate skinning, transparent surfaces and depth masks.
Retain the existing single tone-mapping/output owner. Keep shadows detailed
near the player and dock; distant bolts do not need to cast shadows.

Use bloom for small emissive sources, lower or disable film grain by default,
and keep heat distortion away from characters, UI and nearby machinery. Fine
materials must remain visible while the camera moves. Do not use blur, heavy
grain or crushed contrast to disguise asset quality.

Give the desert multiple spatial scales: broad color/roughness variation,
wind-aligned dune forms, smaller ripples near the camera, and sparse grouped
rocks/scrap/plants. Reduce obvious repeated red props on a grid. Preserve seed
determinism and chunk seams, collision, scrolling and long-distance stability.
Replace the rooftop opening's most visible simple props as part of the same kit.

Use a small reusable decal/flipbook set for footprints/tread marks, impact
scuffs, sparks, powder, dust and exhaust. Anchor trails in the correct scrolling
frame. Pool effect instances; cap transparent screen coverage; fade cleanly
before recycling. Material-specific hits should make metal, sand and cloth
read differently without obscuring aim or interaction targets.

## Refined implementation tasks

Each packet has one file owner while it is active. Shared integration changes
in `Game.ts`, loaders and export helpers are serialized. Luna must not alter
game balance or author substitute graphics while waiting for Astra's assets.

### G00 — Baseline and repeatable review harness (Sol specification, Luna)

Files: new `tools/art/review-graphics.mjs`, existing review tools and
`src/core/renderer/Renderer.ts` only if instrumentation is missing.

Create fixed-seed cameras for player front/back, deck travel, radio at arm's
length, station row, gun aiming, boarding, wreck exterior/interior, rooftop,
and terrain at low/grazing angles. Include noon and low-sun views, and a combat
stress scene. Record GPU/backend, real drawing-buffer size, scene complexity,
full-frame CPU/rAF timings and available GPU timing. Existing aggregate render
counters should be reused and their reset boundary verified.

Acceptance: identical camera/seed/tier for before/after; explicitly distinguish
software-rendered screenshots, headless timing and a hardware gameplay profile.
No measured 60 FPS claim based on a still image or SwiftShader. Record CPU,
GPU, RAM, browser/version, driver, window size and GPU backend with each run.
Use the named reference configurations in the performance section below.

### G01 — Preserve and transport PBR materials (Luna; depends on G00)

Files: `src/art/DefenseModels.ts`, `ModelLoader.ts`, `TextureLoader.ts`,
`Materials.ts`, `src/world/PropModels.ts`.

Make authored maps authoritative; apply procedural wear only to explicitly
untextured fallback materials. Preserve normal/ORM/emissive maps, UVs, tangents,
texture transforms and color-space assignments. Add a versioned asset manifest
and an atlas-aware prop template path without flattening animated nodes.
Remove forced flat shading from authored props; preserve intentional hard edges
in exported normals. Use one atlas per small instanced archetype, with multiple
material groups only where the visual result justifies their cost.

Acceptance: a diagnostic GLB's distinct color, normal and ORM maps survive
loading; multiple clones share intended resources; fallback remains playable;
props retain UV detail after batching. Add focused material-preservation and
template-ownership regression coverage.

### G02 — Blender workbench and bake/export template (Astra)

Files: new `tools/art/graphics_v2/` and `assets/blender/graphics-v2/`.

Create collection-scoped modeling helpers, a neutral material test scene,
reference dimensions, high/runtime/cage/LOD collections, texture-bake helpers,
and a repeatable GLB export manifest. Record source tool versions and asset
provenance. Validate a curved painted-metal part, a cloth sample and a glass
instrument against the production viewer.

Acceptance: actual GLB export contains the expected images/maps, smooth curved
normals and sharp panel edges; repeatable rebuild does not clear unrelated
objects or modify the user's Blender preferences.

### G03 — Compression, caching and LOD loading (Luna; G01 + G02)

Files: `ModelLoader.ts`, `TextureLoader.ts`, `QualitySettings.ts`, new asset
manifest/LOD helpers and local decoder files under `public/`.

Use Meshopt geometry/animation compression and KTX2/Basis texture compression
where measured useful. Wire the decoders before selecting compressed assets;
detect GPU support before KTX2 loads. Package workers/WASM locally. Preserve
named nodes, skins and pivots during optimization. Keep validated uncompressed
fallbacks, shared material ownership, bounded worker counts, and safe disposal.
Warm the actual upcoming scene's GPU resources and shader variants before the
approach finishes. Expose readiness/failure to the integration layer and retain
a visible, playable fallback instead of blocking simulation on asset readiness.

Acceptance: production preview loads offline from local resources; no decoder
404s; switching tiers and loading/resetting worlds does not leak textures or
duplicate animation mixers; LOD switches preserve placement and interactions.

### G04 — Lighting, contact and image clarity (Luna plumbing, Astra look)

Files: `Renderer.ts`, `PostProcessing.ts`, `QualitySettings.ts`, `Sky.ts`,
`Fog.ts`, `shaders/colorGrade.ts`, `shaders/heatShimmer.ts`, `building/LampLights.ts`.

Implement real tier-controlled contact occlusion, tune its depth/normal path,
and profile the total cost with the current shimmer prepass and MSAA. Refine
sky/sun/ambient balance, near shadow coverage, exposure, practical lamps, bloom,
grain and distortion using material test objects. Consider half-resolution
effects and a lower render scale before increasing every shadow allocation.
Update AO on camera switches, resize and disposal. Unify the initial sky/sun
state with time-of-day changes so the first F10 step has no discontinuity.
Start with AO at half resolution on High; if depth/post costs are excessive,
retain useful contact shading and remove heat shimmer first.

Acceptance: cloth, coated steel, bare metal and rubber remain distinguishable
in light and shade; grounded boots and machinery contacts read clearly; no
black AO halos, bright-sky bleed, double tonemapping, highlight shimmer or
incorrect skinned shadows. Check height fog through both the HDR composer and
post bypass: the current fog patch runs after `colorspace_fragment` and manually
converts its color to sRGB, while the composer uses a linear HDR target. Move
fog blending into a consistent scene-linear stage if those paths disagree.
Low tier must disable the expensive passes fully.

### G05 — First complete quality slice (Astra; G01 + G02 + G03 + G04 + G17)

Produce the new player, radio, a two-meter deck sample, and one attached weapon
at the proposed final quality. Integrate through the real game and review the
same close and gameplay cameras with post effects both enabled and bypassed.

Acceptance: visible improvement in body form, round contours, surface detail,
material separation and lighting at ordinary zoom. Pass grip/feet tests and
the initial performance envelope. If the character still reads as assembled
boxes, rebuild its forms before extending that approach to other characters.
This is an internal quality checkpoint, not a new user permission gate.

### G06 — Player rig and motion integration (Luna; Astra's G05 rig)

Files: `PlayerVisual.ts`, `PlayerGait.ts`, `art/HeldItem.ts`, weapon model data,
targeted visual tests.

Integrate the authored skeleton, clips and LODs; blend movement poses against
real movement speed. Preserve right-hand attachment axes and grip origin;
support cosmetic secondary motion only where stable. Retain gameplay capsule,
camera framing, movement speed and combat timing.

Acceptance: both weapons fit idle/walk/run; no inverted facing, duplicated
skinning or visible elbow collapse; boots remain grounded; existing movement,
aiming and weapon tests still measure meaningful physical points.

### G07 — Machine hull and drivetrain (Astra; G05 standard)

Create modular detailed exterior, rails/gate, undercarriage, track and machinery
kit. Export moving wheel/joint/piston parts and shared trims with stable anchors.
Keep detail below/outside usable deck space and build-system boundaries.

Acceptance: machine reads as supported assembled machinery from deck and side;
tracks and suspension look coherent in motion; the docking gate retains its
existing clearance and movement; no visible surface contradicts a walkable
floor or solid railing.

### G08 — Stations and structural construction kit (Astra; G07 trims)

Create detailed generator, refinery, workbench, storage, lamp and structural
modules. Add gauge faces, switches, vents, handles, tubing, latches, seams,
window frames and stair tread detail at plausible scale. Reuse components and
atlases while preserving distinct silhouettes for the player's decisions.

Acceptance: built pieces tile in every supported rotation/storey, texture scale
is consistent across pieces, station use points remain accessible, and an
expanded player build stays within the proposed draw/material budgets.

### G09 — Guns, upgrades, skiff and salvage equipment (Astra)

Finish both weapons and the manual gun; rebuild the boarding vehicle, its
mounted gun, cable anchors, salvage chest/hook and the six upgrade attachments.
Use the asset briefs above and the established animation origins.

Acceptance: recoil/aim/crew and muzzle locations match the mechanics; upgrades
read clearly at deck distance; cable and hook endpoints coincide with visible
hardware; an opened chest and damaged vehicle remain visually understandable.

### G10 — Raider and scavenger assets/animation (Astra)

Rebuild both enemies with clearly different anatomy/construction, improved
deformation, and the existing idle/walk/run/climb/attack/death clip semantics.
Reuse the player's pipeline, not an identical silhouette with a color swap.

Acceptance: clips work on independently cloned skins; hands follow the cable;
attack intent remains readable; silhouettes and optics identify enemy types in
sun, shade and dust; combat timings and hit capsules remain unchanged.

### G11 — Relay wreck and interior dressing (Astra)

Create detailed structural shell and cullable interior modules; add the three
distinct areas, original story props, Course Gyro presentation, gangway and
framed openings. Use restrained decay with believable causes.

Acceptance: preserve the existing X=-6 and X=2 local openings, Z=-1..1 clear
route, floor Y=0, gyro point and named interaction nodes. Read all logs, collect
the Gyro, cross both ways and reload on the wreck with the actual exported art.

### G12 — Desert, opening and world prop art (Astra)

Build an atlas-compatible set of six to eight rocks, four scrap/debris clusters,
several industrial ruin sections, three or four dry plant groups, and improved
rooftop-opening set pieces. Produce terrain detail maps and a small decal/
effect atlas. Use consistent scale and material treatment with the machine.

Acceptance: variants are recognizable at close range but combine without
obvious repetition; large ruins have smooth/broken forms appropriate to their
material; low LODs retain readable silhouettes; opening jump/readability stays
intact.

### G13 — World placement, terrain and prop rendering (Luna; G01 + G12)

Files: `world/PropModels.ts`, `PropSpawner.ts`, `TerrainChunk.ts`,
`ChunkManager.ts`, `RooftopSet.ts`, `art/shaders/terrainShader.ts`.

Integrate Astra's atlases/terrain parameters, instance by compatible geometry
and material group, add projected-size/distance LODs, and improve deterministic
clustered placement. Provide near/mid/far terrain detail with seam-safe world
coordinates. Freeze structural sand ripples in world space, keeping motion in
airborne dust and heat. Keep current High terrain tessellation until silhouette
comparisons justify more. Avoid one material or mesh per small decoration.
Recompute instance bounds and enable frustum culling; limit shadow casting to
nearby large props. Preserve the existing eight-meter machine corridor on
either side. Use seeded open-dune, scrub-wash, wreck-field and industrial-trail
clusters without a visible 64-meter chunk rhythm.

Acceptance: repeatable seeds, no chunk seams or obvious pop rows, no texture
sliding during world reset/scroll, stable collision, and bounded resource counts
through a long forward run. Propose <=35 main-pass decor draws and <=12 large
visible shadow-casting props for High, revising those numbers only from captures.

### G14 — Visible effects integration (Luna; Astra's G12 effects art)

Files: `fx/ParticleSystem.ts`, `SandFX.ts`, `ImpactFX.ts`, `TrackMarks.ts`,
`art/BoardingEffects.ts`; event wiring through a single integration owner.

Integrate dust, exhaust, sparks and impact scuffs with pooling, shared atlases,
distance fading and material-specific choices. Tie intensity to actual travel,
engine/weapon activity and impact events. Use stable seeded variation where
tests require repeatability.

Acceptance: effects do not obscure the aiming point or radio/chest cues; no
per-frame allocations or scene/resource growth; trails follow the scrolling
world correctly and stop or fade appropriately on pause/docking/reset.

### G15 — Machine, station and expedition asset integration (Luna)

Files: `MachineGeometry.ts`, `Machine.ts`, `BuildPieceGeometry.ts`,
`BuildSystem.ts`, `DefenseModels.ts`, `ExpeditionModels.ts`, destination visual
code; small `Game.ts` wiring owned only by this packet.

Replace visual factories with Astra's exported modules while retaining their
existing collision definitions and gameplay anchors. Keep code fallbacks;
ensure selection outlines, damage tint, preview ghosts, broken equipment and
upgrade attachments still address the correct visible parts.

Acceptance: existing build, repair, power, combat and chapter checks pass on
both the authored and fallback paths; exported decorative meshes never replace
the trusted navigation/collider model indiscriminately.

### G16 — Profile, optimize and finish (Sol review, Luna execution, Astra QA)

Files: quality/LOD settings, exporter presets, review/validation tools and
documentation; targeted edits to hotspots identified by measurements.

Profile normal deck travel, an expanded machine, active boarding and the wreck
on hardware. Tune resolution, shadow casters, AO, material primitives, LODs,
texture formats and effect overdraw in that order according to actual evidence.
Finish the authored/fallback screenshot matrix and an uninterrupted playable
opening-to-wreck-departure visual review.

Acceptance: publish before/after frames and performance captures at identical
resolution/tier/route. Run meaningful model/material/rig checks plus the
existing unit, build, lint and gameplay browser suites. Report any remaining
hardware or hands-on review gap explicitly.

### G17 — Make quality settings match actual work (Luna; before G05)

Files: `QualitySettings.ts`, `Renderer.ts`, `PostProcessing.ts`, the quality
integration method in `Game.ts`, terrain/prop/particle/lamp pool owners.

Separate settings that can change live from settings that need safe pool
reconstruction or a clearly indicated reload. Update composer pixel ratio,
recreate targets when MSAA changes, and resize all post buffers. Apply or
truthfully disclose changes to terrain detail, prop counts, particle capacity
and lamp pool size. Reuse G03 asset-tier selection and G04 effect controls.

Acceptance: Low → High → Ultra → Low changes the actual drawing buffer, sample
counts and declared budgets. Repeated switches leave no orphan targets or
duplicated pools. Capture effective resolution and settings in G00 reports;
post bypass keeps consistent exposure and a supported fallback image.

## Sequencing and agent boundaries

1. Sol locks G00/G01/G03/G04 contracts; Luna takes G00/G01 while Astra builds G02.
2. One Luna handles loader/compression work; another handles renderer plumbing.
   Complete G17 after those shared files are released, then Astra completes G05
   and tunes the final look. Shared files are assigned to
   one owner and integration points are agreed before editing.
3. After G05 passes, Astra builds the machine/stations, then guns/skiff/enemies,
   then wreck/world assets. Luna integrates accepted exports in small batches
   and develops G13/G14 against agreed manifests.
4. Astra is the only writer to the Blender MCP session and art source files.
   Sol performs an independent plan/budget review at major handoffs. Keep one
   browser/GPU acceptance job at a time.
5. Finish with G16. Archive evidence and record the delivered art manifest and
   any deliberately deferred polish. Do not label a render-only prototype as
   a completed in-game graphics pass.

## Performance and acceptance envelope

Use **1920×1080 at effective pixel ratio 1** for the primary midrange target.
Offer higher-resolution/high-end presets separately. The existing High tier
can select device pixel ratio 2; a 1080p window must not silently turn into a
4K performance claim. Keep user-adjustable quality and a usable low tier.

Use the available **RTX 3070 + i9-11900KF + 16 GB RAM + hardware-accelerated
Chrome on Windows** as the named local reference. Record the actual browser and
driver versions at test time. A proposed broader midrange floor is **RTX 3060
desktop + Ryzen 5 5600 + 16 GB RAM at 1080p**. That floor requires a run on that
configuration or a comparable named external test machine; it must not be
claimed from the faster local CPU/GPU or from software rendering. If that test
machine is unavailable, report local results and leave the broader hardware
qualification explicitly provisional.

Initial planning budgets, to be revised from measured G05 scenes:

- Aim for 60 FPS sustained ordinary play; report median, p95 and p99 complete
  frame times. Aim for median <=16.7ms and p95 <=20ms, with transient load/compile
  hitches identified separately. A 60 FPS label requires hardware evidence.
- Approximately 1.5 million visible scene triangles in typical play, with an
  initial stress ceiling around 2.5 million. Count shadow/depth passes separately
  as well as total submitted work; polygon count alone is not the bottleneck.
- Aim for <=350 ordinary and <=500 stress total submitted draw calls across
  the complete frame, improving on the 538-call ordinary baseline while adding
  richer models. Shared materials alone do not merge separate meshes.
- Plan roughly 384–512 MiB of resident material textures at the target tier;
  separately account for shadow maps, HDR/MSAA/post targets and environment maps.
  Measure runtime residency, not only PNG/GLB download size.
- Prefer 2K hero textures, 1K small assets and shared atlases; reserve 4K maps
  for measured close-view needs. Prefetch chapter art, use mipmaps/anisotropy,
  and check compression against moving close views.
- Budget at most a small measured slice of frame time for AO/bloom/distortion.
  Do not increase light/shadow counts merely because meshes become detailed.

Use a stress route with the moving world, one skiff, eight enemies, 20–30 built
pieces, six powered lamps and combat effects. Measure at least 60 seconds after
warmup, and include the wreck crossing, shader/asset first-use hitches and a
one-kilometer chunk-recycling pass separately. Record aggregate triangles for
shadow/depth/post work as well as main-camera visible geometry.

Review at 1080p gameplay distance and close inspection: no faceted curved
silhouettes, obvious UV seams, stretched wear, cloth/armor intersections,
disconnected grips, floating boots, mip shimmer, clipping decorative collision,
LOD flashes, wrong power-state lamps, or obstructed interactables. Confirm the
machine gate, stairs, both wreck doors, gun sights and all radio interactions.

## Free tools and asset fallback

Blender is the primary modeling, UV, baking, rigging and review tool. Use the
open glTF pipeline with local Three.js decoders; use glTF Transform and Meshopt
for inspection/optimization and KTX2/Basis for texture delivery when justified.
Pin introduced tool versions when implementation begins.

Create the distinctive machine, radio, wreck, weapons and upgrade hardware in
Blender. If natural human anatomy cannot meet G05 efficiently, evaluate a
MakeHuman/MPFB core base, then author the clothing, equipment, topology, rig and
materials for this game. Verify Blender 5.1 compatibility before adding an
addon; this is a fallback route, not a claim it is currently installed.

For surface scans or background rocks that exceed what procedural authoring
can achieve efficiently, select individual compatible CC0 assets from Poly
Haven or ambientCG. Adapt them to the same scale, palette and texel density.
Record exact source URL, license, downloaded variant and modifications in
`ASSETS.md`. Asset-library licensing does not automatically cover a site's API
service or unrelated community uploads. No paid generation service is needed.

References checked for this plan:

- [Blender glTF material and normal export documentation](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html)
- [Blender 5.1 manual](https://docs.blender.org/manual/en/5.1/index.html)
- [Three.js GLTFLoader decoder integration](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js KTX2Loader support detection](https://threejs.org/docs/pages/KTX2Loader.html)
- [glTF Transform CLI inspection and optimization](https://gltf-transform.dev/cli)
- [Poly Haven asset license](https://polyhaven.com/license)
- [ambientCG asset license](https://docs.ambientcg.com/license/)
- [MakeHuman/MPFB core asset and tool licenses](https://static.makehumancommunity.org/about/license.html)

## Deliverables

- Detailed editable Blender sources, repeatable scoped scripts and high-detail
  masters, optimized runtime meshes, LODs, baked map masters and final exports.
- Integrated player, enemies, machine, stations, guns, skiff, radio, wreck,
  salvage props, world kit and effects at one coherent visual standard.
- A production-compatible material/asset pipeline, usable quality tiers,
  measured performance results and retained gameplay fallbacks.
- Matching before/after in-game views, movement/animation review, complete
  regression results, source/license records and rebuilding instructions.

Completion means the game itself looks convincingly better while moving and
playing within the measured target envelope. Model count, texture size, and a
beautiful Blender still are supporting evidence rather than the definition.
