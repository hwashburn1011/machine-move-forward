# Cohesive Blender refinement and next gameplay handoff

Status: art implementation complete; final validation is recorded in
[the graphics-v3 delivery](../../art/graphics-v3/README.md). Gameplay expansion is
planning only for this round, as explicitly selected by the user. A01–A13 describe
the completed workflow; FA01–FA05 remain future asset briefs.

## Intended result

Weathered industrial realism, readable at the actual third-person camera, targeting
1080p High on the existing midrange-PC/60 FPS budget. The current player, raider and
scavenger have excessively similar body construction. The walker remains dominated
by broad box surfaces, while some decorative framing crosses its lower room without
collision. Fix primary shapes, material scale and physical consistency together.

Use original Blender geometry and the existing open-source Blender/Three.js/Rapier
pipeline. Preserve existing .blend and runtime assets in versioned backup locations.
Do not replace gameplay with a showcase scene or migrate engines.

## Art direction

- Shared construction language: painted folded steel, graphite castings, rubber
  seals, canvas travel gear, ochre safety accents. Saturated color identifies roles.
- Player: lean desert mechanic, teal field jacket, sand trousers/hood, a fitted
  harness and purposeful travel pack. Give the back as much attention as the front.
- Raider: visibly different armored scavenger, charcoal workwear, asymmetric rust
  armor and utility load. Distinguishable from the player without relying on tint.
- Scavenger: a maintenance automaton with exposed joints, narrow actuator limbs,
  protective cast shells and a recessed sensor. No cloth sleeves or hiking boots.
- Walker: one fabricated vehicle with a serviceable hull, consistent panel rhythm,
  load-bearing leg housings, radiator and exhaust routing, and a reinforced prow.
- Detail hierarchy: silhouette and large volumes first; panel/garment construction
  second; surface wear third. Avoid uniform scratches, exaggerated woven normals,
  luminous eyewear, oversized fasteners and incidental greebles.

## Coordination and ownership

Astra owns this brief, all three characters, shared art corrections, live Blender
MCP review on port 9876, visual acceptance and runtime promotion. Sol owns the
[gameplay expansion plan](2026-09-07-next-gameplay-expansion.md). Luna hard-surface
owns the Blender walker generator/assets. Luna integration owns machine visual
installation, lower-room consistency and its focused regression harness.

Only Astra controls the live Blender connection or schedules browser/GPU captures.
Asset generators run isolated Blender processes. Workers must not clear the user's
open scene, overwrite v2 masters, edit each other's files, or copy unreviewed models
to public/. Keep source assets and evidence separate from runtime payloads.

## Refined implementation tasks

### A01 — Baseline and physical contracts (Astra; first)

Inspect v2 Blender and real-game images; inventory rig names, animated bounds,
weapon sockets, machine coordinates, material counts and runtime texture size.
Read the live MCP scene before changing anything. Record representative comparison
views at fixed camera/light settings. Preserve a v2 rollback for changed runtime files.
Acceptance: defects have concrete locations and comparisons use matching views.

### A02 — Character surface library (Astra; depends A01)

Create versioned deterministic Blender materials for canvas, webbing, leather,
coated steel, bare metal and optics. Use subtle microtexture and broad controlled
variation. Match roughness to material rather than applying metal wear to fabric.
Provide glTF-compatible color/normal/roughness/metalness bindings and real UVs.
Acceptance: cloth reads as cloth at close range without screen-space moire; metal
has stable highlights; lenses are dark glass rather than light-emitting rectangles.

### A03 — Player silhouette and tailoring (Astra; depends A02)

Rebuild torso, shoulder/sleeve transitions, trouser volumes, boots, glove shapes,
head protection and equipment. Use smoothly interpolated sections and localized
fabric compression at elbows/knees; keep seams and folds subordinate to anatomy.
Give harness straps width and attachment points. Pack lid, pockets and straps must
follow its volume. Keep palette teal/sand/graphite, avoid identical paired cubes.
Acceptance: front/side/back plus idle/walk/run and both weapon poses; no floating
pockets, broken joints, floor penetration or lost weapon grip frame.

### A04 — Raider-specific silhouette (Astra; depends A02)

Use the existing humanoid rig but create distinct charcoal garments, asymmetric
shoulder armor, layered chest plates, wraps, protective helmet and salvage load.
Armor follows anatomy and joint clearance. Retain existing collider height/speed.
Acceptance: recognize a raider beside the player in a neutral grayscale silhouette;
animation, hand sockets and enemy clone independence remain intact.

### A05 — Mechanical scavenger (Astra; depends A02)

Replace humanoid clothing geometry with rigid articulated shells, inset actuators,
joint bearings, hoses, segmented feet and a sensor assembly. Weight rigid shells to
their owning bone and route flexible parts across joint motion. Protect silhouette
clarity and preserve the existing navigation/combat capsule and clip contracts.
Acceptance: reads as a machine without color; planted feet throughout all shipped
locomotion clips, no large hoses crossing knees or inaccessible mesh-only targets.

### A06 — Walker broad surfaces (Luna hard-surface; depends A01)

Author `tools/art/graphics_v3/machine.py`, source .blend and staged machine-walker.glb.
Use machine-local coordinates. Roots: MMF_WalkerV3, MMF_HullSkin, MMF_EngineSkin,
MMF_ProwSkin, MMF_DeckTrim and MMF_MachineDetail. Runtime deck remains 10x16 m,
Y=3.6 (surface 3.69), lower floor Y=.6. Stairwell x=-3..-1,z=-2..2 stays open.
Build real plate thickness, panel seams, radiator depth, protected service hatches,
shaped prow ribs, and attached pipe runs. Stay within established solid envelopes.
Acceptance: max 120k LOD0 triangles, bounded palette, embedded maps, no diagonal
beams through rooms; replacement roots have exact names and zero root transform.

### A07 — Articulated running gear (Luna pair; depends A06)

Agree reusable leg shell/foot or hip housing coordinates against MachineLegs before
authoring. Attach to existing IK transforms; do not replace gait or foot targeting.
Use cast bearing housings, exposed piston/boot joints and manufactured foot pads.
Acceptance: full stride at normal and damaged-list poses, floor contact unchanged,
no static artwork floating away from moving legs. If only hip housings are shipped,
record that honestly; do not label it a complete replacement of articulated limbs.

### A08 — Lower-floor collision and visual installation (Luna integration)

Own MachineGeometry.ts, Machine.ts, MachineLegs.ts and MachineDetailModels.ts.
Reproduce the reported overlap. Move decorative structural beams to the ceiling
and split them around the stairwell; large walkable-room obstacles need simple authoritative
collision and matching navigation/build occupancy. Never box-collide the entire
room. Hide only the exact old skins replaced by valid authored roots. Preserve
gate motion, damage/repair targets, lamps, deck slabs, stairs and fallback visuals.
Acceptance: walk down/up, traverse the room, approach walls/equipment, crouch/jump,
and repeat with model loading disabled; camera and enemy routes remain usable.

### A09 — Full pack consistency review (Astra; after A02–A08)

Review the existing radio, chest, hook, guns, turret, skiff, wreck, stations,
structural building pieces, terrain and effects beside the new assets. Correct
material-scale, palette or mounting defects that conflict with this brief. Preserve
already-good models instead of gratuitous rebuilds. Record retained assets and
specific corrections; do not claim that retained assets were newly modeled.

### A10 — Portable export and integration (Astra; after visual approval)

Export to assets/graphics-v3/staging with preserved root names, rigs, animations,
UVs and sockets. Produce Meshopt/WebP runtime assets in optimized/, preserving
source PNG masters and maps. Validate real Three.js image decoding, glTF schema,
triangle bounds, sockets, movement and ground contact before public/ promotion.
Character working ceilings: player/raider 60k each, scavenger 50k. Budgets are
ceilings, not goals. Prefer fewer materials and reused maps over tiny mesh details.

### A11 — Blender and game art review (Astra; after A10)

Create an owned live Blender review scene through MCP, leaving the user's scene
and filepath intact. Save a separate editable review .blend. Render a neutral
three-character lineup and walker view. Compare in the real game at 1080p in
daylight and at least one darker condition, at gameplay distance and close range.
Acceptance requires inspecting the actual pictures and correcting defects, not
merely generating a screenshot or reporting triangle counts.

### A12 — Regression and performance gate (Astra + Luna; after integration)

Run changed-machine unit tests, asset checks, appropriate existing movement,
weapon, first-run and chapter browser harnesses, typecheck/lint/build. Measure
travel and eight-enemy+skiff stress on hardware Chrome at 1080p High, sequentially.
Report frame distributions, backend, draw/triangle/texture counts and errors.
Use ~60 FPS/16.7 ms as a target with honest measurement uncertainty; do not infer
GPU headroom from a vsync-capped average. Fix regressions before delivery.

### A13 — Delivery and future-task handoff (Astra + Sol)

Write docs/art/graphics-v3/README.md with actual scope, source/rebuild commands,
before/after media, tests, measured limitations and rollback. Final gameplay plan
must identify task dependencies, file ownership, save migration strategy, gameplay
acceptance and integration checkpoints for Luna workers. Leave new gameplay
features marked planned, not implemented. Show the finished artwork to the user.

## Future gameplay artwork packets — planned, not part of this round's exports

These close the asset dependencies in Sol's gameplay plan. Astra owns the art
direction, final geometry corrections and visual acceptance. Luna may construct
the repeatable meshes from these packets. Coordinate the exact marker names with
the consuming task before the first export; do not let separate workers invent
different runtime filenames, pivots or collision dimensions.

Each packet follows the same sequence: (1) dimensioned blockout with collision
proxies, (2) broad silhouette review in the game camera, (3) shaped production
mesh and consistent edge widths, (4) UVs/material atlas and localized wear,
(5) exported neutral/active/damaged states where required, (6) real loader and
interaction verification. Editable sources go in a new expansion art directory;
runtime GLBs are promoted only after both gameplay and artwork accept the contract.

### FA01 — Navigation helm (feeds NAV-04)

Build a sloped control pedestal within a 1.2 m wide × .75 m deep × 1.35 m high
envelope, with the base at local Y=0. Use a pressed sage housing, separate dark
instrument recess, protected analog bearing dial, two route indicator lamps,
guarded rotary selector, and a visible gyro cartridge behind a service cover.
The gyro must appear installed when its story fact is present. Keep the main
interaction face legible from two metres; fine dial lettering is decoration,
while route selection remains accessible DOM UI.

Required nodes: `HelmRoot`, `GyroInstalled`, `HelmPowerLamp`, `HelmInteract`.
Own the Blender generator/source/export; NAV-04 owns powered behavior and route UI.
Working ceiling 15k triangles, four material primitives, one 1K color/normal/ORM
set where practical. Test interaction from the open deck side, power on/off,
missing gyro, legacy-complete save, and placement clear of the lower-room ramp.
Review the fixed machine anchor with NAV-04 before authoring; this is not a new
movable build piece in the first release.

### FA02 — Relay Foundry expedition (feeds NAV-01/NAV-03/NAV-04)

Start from a 14×10 m local walkable footprint with floor at Y=0 and the machine
approaching its west entrance. NAV-01 must lock the final footprint, gangway and
collider definition before detail work. Keep an unobstructed two-metre entrance
lane and a clearly readable return sightline. Arrange three spaces: receiving
bay, disused machine shop, and raised equipment alcove. Use existing stair/ramp
support if elevation is accepted; do not invent a platform the controller cannot
reach. Place the salvage controller and tracking servo at separate inspectable
workstations so exploration has a visible progression.

Blender construction: welded base frame; thick deck panels; partial enclosing
walls with readable door cuts; overhead gantry; stripped machinery and cable
trays; a distinct relay mast visible from the travel camera. Dress to support the
foundry's purpose, not with random crates. Reuse the walker's fabrication palette
with more settled sand and oxidized seams. Broken edges belong on actual exposed
plate thickness; keep destruction out of the player corridor.

Required roots: `FoundryRoot`, `Gangway`, `EntryAnchor`, `ExitSightline`,
`SalvageController`, `TrackingServo`, and one marker per agreed journal id.
The model's marker positions must equal the Destination definition, not merely
look nearby. Working ceiling 150k triangles, 16 material primitives, 2K atlases
for major surfaces with shared trim. Test floor samples, capsule corridor, all
interactables, two collection orders, return path and model-disabled fallback.
No new puzzle logic, NPCs or additional chapter states are implied by the artwork.

### FA03 — Ranged gunboat (feeds GUN-01/GUN-02)

Create a broad, armored 9×3.4 m desert vehicle with a low closed crew compartment,
one elevated forward weapon and a rear engine block visible from either side.
Unlike the open boarding skiff, use a closed silhouette, deep lateral armor and
one clear vulnerable machinery zone. This model supplies no boardable deck.
Match its exact hull bounds to GUN-02's collider and 18 m combat lane before
surface detail. Muzzle and engine targets must remain visible from the player's
normal gun height on both port and starboard approaches.

Required graph: `GunboatRoot`, `GunboatGunYaw` -> `GunboatGunPitch` ->
`GunboatMuzzle`, `WeaponDamageAnchor`, `EngineDamageAnchor`, `EngineExhaust`,
`WeaponDisabled`, and `EngineDisabled`. Model the weapon's cradle, recoil sleeve,
barrel cooling, armored power feed, radiator and recessed engine vents. Disabled
states visibly expose or displace existing parts without changing their damage
ids. Keep optional smoke sockets empty; pooled runtime FX owns emitted particles.
Working ceiling 80k triangles, six material primitives, 2K hull/1K weapon maps.
Test both attack lanes, maximum traverse, blocked muzzle, engine/weapon target
rays and all terminal states. Hull/weapon/engine damage remains GUN-01 logic.

### FA04 — Automatic salvage collector (feeds SAL-02)

Build inside one 2×2 m cell: body ≤1.6×1.6 m, height ≤1.6 m, base at Y=0.
Use a guarded cable drum, motor/gearbox, outboard guide rollers, replaceable hook
and a clearly bounded receiving bin. The mechanism faces the cell's forward edge;
an animated boom must not sweep the player's walking aisle or imply harvesting
from the opposite side of the machine. Keep service access on the inboard face.

Nodes: `CollectorRoot`, `DrumPivot`, `GuidePivot`, `HookExit`, `BufferLamp`,
`CollectorInteract`, `ControllerInstalled`. Give the full-buffer condition a
distinct lamp/indicator state that supplements SAL-02's UI text. The six-slot
buffer is logical inventory, not six required physical crates. Working ceiling
22k triangles, four material primitives, one 1K atlas. Test four build rotations,
ghost placement, cast/reel/idle animation, no power, full buffer and demolition.
Never let cosmetic motion grant, open or consume a salvage claim.

### FA05 — Automatic defensive turret (feeds AUT-01/AUT-02)

Use a compact sensor-directed single gun to distinguish it from the broad manual
deck gun. Fit the footprint/collider agreed by SPEC-01, initially ≤1.4×1.4 m and
1.6 m tall. Build a bolted pedestal, slewing race, narrow cradle, protected feed,
short barrel and separate optical tracker. Preserve visual aim exactly through
the runtime yaw/pitch pivots. The sensor indicates tracking; it is not a laser
that introduces another damage path.

Nodes: `AutoTurretRoot`, `TurretYaw`, `TurretPitch`, `Muzzle`, `TrackerHead`,
`PowerLamp`, `ServoInstalled`. Reuse the named pivot convention where AUT-02 uses
the shared aiming adapter, while keeping the loader's model id distinct from the
manual gun. Working ceiling 20k triangles, four material primitives, one 1K atlas.
Test four rotations, yaw limits, pitch extremes, occlusion from the machine hull,
no-power state, damage tint, build preview and saved aim restoration. Retain the
manual gun's existing model and research appearance unchanged.

### Future packet acceptance and order

FA01 and FA02 follow NAV-01; FA03 follows GUN-01's dimensions/target contract;
FA04 and FA05 follow SPEC-01's piece definitions. Their construction can overlap
pure gameplay work, but one integration owner promotes each asset. Pair every
export with an automated node/bounds check and an inspected real-game image.
Use fallback prototypes for development, then replace them before the integrated
release gate. None of these five future assets is represented as finished in the
current character/walker refinement delivery.

## Execution order and checkpoints

A01 -> A02 -> A03/A04/A05 -> A09 -> A10 -> A11 -> A12 -> A13.
A06/A07/A08 run alongside character work, with their interface agreed first.
Sol's gameplay planning is independent; implementation starts in a later round.

The graphics pass is complete only after model promotion, visual inspection,
collision correction and the focused runtime/performance checks. Extra chapters,
new vehicles and automated devices are not silently added during art work.
