# Plan 2 — recognizable salvage cargo and convincing fuel handling

Parent: [Nomad foundation roadmap](2026-09-21-nomad-foundation-roadmap.md).
Status: implemented locally. Astra authored/reviewed Blender assets; Luna delivered
bounded UI/state adapters and tests. [Delivery evidence](../../campaign/nomad-foundations-delivery.md).

## Design outcome

From a normal third-person camera, a player should recognize a passing recoverable
cargo package, know where the reel attaches, and see that it has been selected.
The fuel item and refill equipment should clearly read as a canister and a fuel
system, with appropriate handles, cap, nozzle, connection and level feedback.

Cargo remains recovered from the Nomad. It is not an invitation to walk onto the
radioactive ground. Do not place a required canister or receiver as a ground pickup.

## Cargo art and interaction contract

Current runtime files `salvage-chest.glb` and `forged-hook.glb` are integrated
authored meshes, not animated collections of individually addressable parts.
`SalvageModels.ts` clones them. The current chest footprint is approximately
1.6 × 1.1 × 1.16 m; current reel acquisition is within 34 m and roughly a 22-degree
cone. Preserve these gameplay dimensions unless a measured readability problem
requires a separately reviewed range/size change.

Model a robust freight crate in Blender with reinforced corners, legible latches,
straps, skid rails, a strong lid profile, a conspicuous tow loop, and a restrained
amber beacon/reflective marking. Wear must leave useful contrast on its upper
faces. Add visible cargo bundling where appropriate. Any support or suspension
hardware must explain how the package is presented without implying an extra mechanic.

Use a shared cargo shell and a small set of cosmetic panel/strap variants. Do not
label a random mixed-loot box “FUEL” unless the contents actually guarantee fuel.
The first receiver reward may use a truthful receiver-bearing cue only once its
guaranteed award is bound to that acquired crate; missed boxes must not consume
or advertise an already exhausted unique reward.

UI cues follow the actual reel target. Provide a restrained bracket/icon and
distance, an unambiguous “Reel cargo” prompt with the user's bound key, and clear
acquired/reeling/ready/full-inventory states. Out-of-range or obstructed targets
must not look collectible. Limit off-screen indication to a useful nearby candidate;
avoid a screen full of markers for scenery or a constant loud beacon sound.

## Fuel art and authority contract

- Keep the existing `fuel` item and `generator` build ID. No new fuel grades or
  gas-can inventory conversion economy in this pass.
- Model a recognizable industrial canister: shaped handle recess, cap, spout,
  panel embossing, protective seams, readable FUEL marking and restrained wear.
  Use the same object language in the inventory icon and any held/refuelling view.
- Remodel the generator and its visible fuel tank/connection. The current
  generator collision half-extents are `(0.85, 0.65, 0.72)`; stay inside that
  envelope or explicitly update the reviewed collider, reservation and nav data.
- Export `FuelPort`, `FuelGauge`, `StatusLamp` and approach/service markers, then
  wire only the markers that runtime actually consumes. A node name alone does
  not make a functional interaction.
- Tank/gauge state reads `MachinePower`/saved `machine.fuel`. Do not create a
  second per-model fuel amount or display each generator as a separate full tank
  if the simulation uses one shared reserve.
- Manual refuelling remains a physical approach and interaction. Show carried
  fuel and expected accepted amount; consume only what the tank accepts. Fuel in
  onboard storage can be transferred to inventory through the later terminal,
  but the terminal itself cannot deposit it in the generator.
  The current `depositFuel()` can also consume nearby crates through ResourceAccess;
  moving to carried fuel is an explicit change. Use the carried Container for
  this physical transaction and test the new boundary, rather than assuming the
  existing method is already carried-only.
- If adding a canister/nozzle handling animation, commit the fuel transaction
  once at an explicit event. Interrupt/cancel/death/load cannot consume twice or
  gain fuel without payment. Preserve the simple existing interaction as fallback.
- Keep engine/ambient audio soft; one subtle confirmation may accompany a transfer.
  Do not add another always-on hum to advertise an active generator.

## Tasks

| ID | Owner | Work | Acceptance |
| --- | --- | --- | --- |
| C-01 | Astra | Capture baseline chest/hook/fuel/generator at actual camera distance and light/weather conditions; establish silhouettes and shared materials. | Reference sheet distinguishes reel cargo from scenery and fuel gear from ordinary storage. |
| C-02 | Astra | Author improved cargo, hook, canister and generator/port in Blender. Keep editable masters, anchors, colliders, LODs and optimization manifests. | Smooth silhouettes and readable functional details; no enlarged hooks/straps crossing the physical access path. |
| C-03 | Luna + Astra | Wire reel candidate cues, model states and receiver tutorial wording to the authoritative selected crate. | Prompt matches target and reach; ignored crates can be recovered later; no false reward/category promises. |
| C-04 | Luna + Astra | Wire fuel gauge/port, inventory icon and physical transfer feedback to current fuel methods. Add handling pose only after the transaction boundary is tested. | Partial fill, empty inventory, full tank, repeated input and cancel behave exactly once; visual amount matches saved amount. |
| C-05 | Luna + Astra | Run a fresh ordinary-input recovery path, fuel-empty emergency crawl, full inventory, save/Continue and fallback-art checks. | First-time player can recognize/reel cargo without entering sand; receiver guarantee and all partial loot remain intact. |
| C-06 | Astra | Complete in-game readability review with the expanded Nomad, then adjust beacon size/contrast and service clearance. | Readable at 720p and 1080p, normal and max FOV, daytime/dim light/dust; no reliance on zoomed beauty shots. |

Suggested starting art budgets, confirmed against assembled-game profiling:
chest up to five meshes/~10k triangles, hook up to two/~4k, generator up to
five/~20k. Use shared/baked fine detail rather than adding many tiny mesh objects.
Glow should not obscure the outline or wash out the nearby stairs.

## Tests and integration boundaries

- Keep reward selection, `loot:collected`, radio bonus ledger, reel selection,
  crate ownership, and tank-cap logic authoritative in their existing systems.
- Test zero/partial/full container acceptance, lost target, repeated input,
  container relocation, missing assets, and full/empty tank reloads.
- A locked or empty decorative crate should not receive the recoverable marker.
- Preserve root names/scale/forward axis expected by the current hook and model
  wrappers, or change the wrapper and authored export together.
- Do not confuse reeled cargo with the separate `route-salvage-wreck.glb`
  expedition asset. Its Gangway/Reward markers belong to destination traversal.

Primary files: `src/salvage/SalvageField.ts`, `Reel.ts`, `HookModel.ts`,
`src/art/SalvageModels.ts`, `src/game/Game.ts` (`depositFuel` and target cues),
`src/data/items.ts`, `src/machine/MachinePower.ts`,
`src/building/BuildPieceGeometry.ts`, authored station registration,
`tools/art/graphics_v2/salvage.py`, and new reproducible fuel/cargo art scripts.
Existing `reel`, fuel-recovery, early-radio, inventory-transfer and machine-power
tests supply regression coverage; add only the meaningful new boundary cases.
