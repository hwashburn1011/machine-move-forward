# Plan 4 — wrist terminal, HUD, and routine remote management

Parent: [Nomad foundation roadmap](2026-09-21-nomad-foundation-roadmap.md).
Status: implemented locally with the stated menu-pause default. Routine management
is available aboard through Tab. [Delivery evidence](../../campaign/nomad-foundations-delivery.md).

## Presentation

S-07 raises a compact wrist terminal and the interface expands into a readable
screen overlay. Use an original worn industrial electronic design: dark graphite
panels, pale readable text, amber labels/status, restrained cyan data accents,
machined corners, fine wiring/diagram lines, and subtle scan texture. Draw on the
user's dystopian electronic direction without copying a named game's device,
logos, fonts, layout, or fictional branding.

The arm explains the device; it must not force players to read tiny perspective-
distorted text on a wrist mesh. Use accessible DOM text/buttons for the real menu.
Glitches and flicker must never obscure controls; offer reduced motion, scalable
text and contrast sufficient for dim/dusty backgrounds. Do not use bloom as text.

Reuse the existing inventory binding (normally Tab) as direct terminal access.
Use visible tabs and optional remappable shortcuts; do not steal existing M mute,
B build, V shoulder/relocation, or E interaction controls.

## Information structure

| Page | Contents and permitted purpose |
| --- | --- |
| Inventory | Carried inventory, equipped items, selected onboard storage, sorting, Take All and Deposit Matching; explicit capacity/overflow feedback. |
| Character | Actual health, stamina, hydration, nourishment, Story/Survival profile, equipped weapon, magazine/reserve and existing attachments/effective stats. No invented XP, armor, skill tree, or character level. |
| Workshop | Available installed refinery/workbench/stove recipes, missing materials, selected station condition/power, attachment research and equipment changes with existing unlocks. |
| Machine | Fuel, speed, power, condition, three-deck map, owned equipment, production/garden state, storage summaries, maintenance pins and L-12 controls. Physical exceptions show “Go to helm” / “Refuel at generator” with a useful location. |
| Signal & records | Scanner setup/Start/progress, radio messages, current objective, campaign journal and discovered records. Viewing information does not remotely steer or commit a route. |
| Build | Searchable catalog and costs, then a clear transition to existing live world placement/rotation/relocation/demolition. |

Settings, saves and title/quit actions may reuse the terminal's visual shell from
the pause menu, but the actual boot/title screen and Campaigns library remain
accessible without a living avatar or loaded save. A visually consistent shell
must not make recovery/save export depend on wrist animation or model loading.

Keep the play HUD compact: health/ammunition, a concise contextual objective,
reel/interact prompts and urgent alerts. Show scanner progress during scanning.
Put detailed fuel/power/maintenance tables in Machine, with a small warning badge
or contextual gauge when action is needed. Consolidate the overlapping machine
status cards instead of adding a third permanent panel. Preserve directional
damage, enemy windups, reload and real combat cues.

## Onboard access is an intentional rule change

Today, resource access includes the player inventory and crates within six
metres; crafting and several panels depend on a nearby station. Simply putting
those panels inside a terminal would leave the repeated walking largely intact.

For this iteration, introduce explicit contexts:

- **Carried:** player-owned inventory/equipment, available regardless of location.
- **Onboard network:** while the player is aboard the Nomad, valid owned storage
  and installed functional equipment attached to that machine. It grants remote
  routine management on that machine, not world-wide loot access.
- **Nearby field interaction:** a reeled cargo/container or expedition object,
  validated by current reach, ownership and destination rules. It never becomes
  a remote machine store merely because a container UI was once opened.

The new onboard context deliberately replaces the six-metre requirement for
approved terminal operations. Keep the existing local context for world
interactions and callers that need it. Do not globally increase `DEFAULT_REACH`
or remove every proximity guard from `Game.ts`.

Create an explicit endpoint registry: carried inventory, ordinary built storage,
collector output buffers, producer outputs and stations are different kinds.
Only normal eligible storage/carried containers supply crafting inputs; collector
and producer buffers must first use their collection/transfer path. Demolition,
restore, replacement and `BuildSystem.clear()` invalidate issued endpoint handles.

### Action matrix

| Action | Terminal behavior |
| --- | --- |
| Read inventory/character/journal | Available through carried/preserved facts; no remote world control. |
| Transfer from onboard crate/collector | Allowed aboard, against an explicitly selected valid container ID; capacity and actual accepted count remain authoritative. |
| Craft/refine/cook | Allowed aboard using an installed valid station of the required kind, its actual power-role requirements/condition/unlock, and the explicit onboard input context. |
| Weapon research/attachments | Same above plus existing chapter, safety and attachment restrictions. No free research unlock. |
| Collect production/garden output; water garden | Approved aboard through existing transactional methods with exact costs/capacity/growth state. No growth or production time advances while paused. |
| L-12 mode/priority | Remote aboard after recruitment and required dock/availability checks. Initial physical restoration/recruitment remains a world interaction. |
| Machine status/pin | View and locate any known onboard system; no direct mutation by the diagram. |
| Manual subsystem repair | Terminal explains cost/location and pins the service point. The physical repair hold remains for this iteration; no instantaneous healing from paused UI. |
| Scanner Start | Allowed after physical module installation and a valid safe start boundary; scanning begins when gameplay resumes. |
| Helm course/steering/route commitment | Physical helm only; terminal can show current route and discovered information. |
| Deposit fuel into machine | Physical generator/port only, using carried fuel. Terminal transfers from owned storage to carried inventory are distinct from refuelling. |
| Build selection | Catalog can be used in terminal; placement starts only after closing/resuming into the existing build context. Threat guards remain active. |
| Field salvage/site rewards/unique records | Existing physical proximity and completion rules; never pull them through the onboard network. |

The player must actually be aboard for onboard actions; distance to the Nomad
alone is insufficient, particularly on a docked platform, opening roof or sand.
Stable structure/container IDs identify endpoints. Revalidate on every command,
not just when rendering the page. Destroyed, detached, replaced, full or offline
targets reject cleanly and refresh the displayed reason.

Use the existing machine-presence predicate and supported bounds. Pass the exact
station instance ID into crafting: the current `stationPowered` callback can
fall back to any station, which is insufficient for a selected terminal target.
Validate kind, ownership, condition, unlock and power **where that station has a
power role**. The basic workbench currently has none; do not invent a new draw.

Retain the 20-slot carried inventory and existing stack limits. Craft input and
output ownership must be explicit: consume carried/eligible stored inputs in a
deterministic order and produce into the selected valid destination only if the
entire atomic exchange can succeed. Do not silently consume producer buffers
as crafting ingredients before their existing collection step.

The current local `ResourceAccess.exchange` can spread output among sources.
The new selected-destination transaction must plan on cloned containers: validate
all endpoints, remove inputs in deterministic order, fit the complete result in
the selected destination, then commit all clones together. Failure changes none.
Adapt `BuildSystem.waterGarden`/`harvestGarden`, which currently call local resource
access internally. Replace claim-then-deposit producer collection with an atomic
claim-to-destination operation so a failed deposit leaves the output untouched.

## Pause and command lifecycle

Existing ordinary inventory panels suppress player input while the world runs;
`Game.pause()` freezes simulation but also opens the title pause screen. The
terminal needs an intentional modal lifecycle, not another scattered boolean.

Recommended policy: entering the terminal freezes machine travel, enemies,
projectiles, damage, needs, fuel use, producers, research clocks, scanner time,
weather and encounter timers. Cosmetic arm/UI transitions may use UI time. A
render transition must not advance simulation to make the hand finish moving.

Read-only pages can be opened during combat as a pause. Actions retain their
specific safety restrictions. Paused state alone is not permission to research,
place, repair or start a story event during an active encounter.

Many current Game callbacks reject `state.paused`. Add a narrow, validated
terminal-command capability for allowed inventory/crafting/configuration actions.
Do not remove all pause checks or temporarily unpause simulation around a click.
Instant, authorized item transactions can occur while paused; timed work remains
frozen and resumes normally after closing. No hidden combat steps may execute.

Open: close incompatible panels, cancel transient interaction holds safely,
capture return context/focus, acquire pause ownership, release pointer lock,
switch input to menu, and show the selected terminal page.

Do not reuse `closePanels()`'s generic control-reclaim path unchanged: it can open
a temporary TitleScreen pause and resume immediately. Give the terminal one
explicit pause owner and defined handoffs to settings/saves/title. L-12 mode and
priority commands may be instant, but movement/jobs and research timers stay frozen.
Validate the recruited caretaker's exact live powered dock before a work command.

Close: invalidate endpoint tokens, hide/dispose active panel handlers, clear held
combat/build inputs, restore appropriate input/focus, and request pointer lock
through a permitted user gesture. Resume only after control is recovered; on
failure remain paused with a clear click-to-resume affordance. Escape backs out
one modal layer predictably. Visibility/tab loss and repeated open/close cannot
create a stuck pause or fire a held shot on return.

Do not open the terminal over the signal cinematic, rooftop cutscene, ending,
death transition, or asset-loading ownership. Their existing pause/skip/recovery
controls remain available. A scanner at 100% starts its short reveal delay only
after the terminal closes and all safe-boundary rules permit it.

Do not save selected tab, DOM focus or animation progress as campaign state.
Settings/accessibility choices belong to SettingsStore; actual gameplay changes
and an optional validated operations pin use their existing save authorities.
Revalidate an operations pin against restored machine nodes and clear stale pins.
Build selection also needs a handoff: queue the chosen item, close/resume and
recover pointer control, then enter the existing placement path. Never call a
placement/demolition mutation while the catalog still owns a paused terminal.

## Tasks

| ID | Owner | Work | Acceptance |
| --- | --- | --- | --- |
| W-01 | Sol + Astra | Freeze page structure, remote action matrix, pause default/reply, physical exceptions, storage scope and safety restrictions. Draw a readable desktop layout and state flow. | Every existing menu/action has one home; no implied skill/armor system or unintended remote helm/fuelling. |
| W-02 | Luna | Define pure terminal snapshots and validated commands, including carried/onboard/nearby contexts and stable endpoint IDs. Extend resource-access APIs explicitly. | Tests prove scope isolation, capacity/atomicity, deterministic source order and rejection of stale/off-machine/world-loot targets. |
| W-03 | Luna | Build the semantic terminal shell, tabs, focus trap, keyboard operation, tooltips, text scaling, reduced-motion option and cached updates. Reuse existing view models/components. | No clipped essential controls at 1280×720; accessible text/buttons; no hidden duplicate input listeners or whole-DOM rebuilding every frame. |
| W-04 | Astra + Luna | Integrate one modal/pause/input controller with Game, TitleScreen, pointer lock, input bindings, build session and cinematic ownership. Add a narrow paused-terminal command path. | Simulation stays frozen throughout navigation and commands; closing resumes safely, with no delayed shots, input leaks or modal dead ends. |
| W-05 | Luna + Astra | Move inventory, storage, recipe, attachment, garden/producer and caretaker interactions into approved terminal pages using existing mutation authorities. Keep physical shortcuts where useful. | Routine operations work anywhere aboard; no walk-to-workbench requirement remains for approved terminal crafting; offboard access and forbidden actions reject. |
| W-06 | Luna + Astra | Embed the corrected MachineOperations projection and three-deck map; add pins, explicit blockers and L-12 priorities. | Correct expanded-layout coordinates, deduplicated nodes, truthful availability and no instant repair/refuel/steering. |
| W-07 | Astra | Author the wrist device in Blender and fit to S-07's existing forearm rig. Add a short raise/lower pose coordinated with aiming, reload, damage and death. | No detached device or animation snap; opening never grants reload completion; reduced-motion/fallback menus work without the model. |
| W-08 | Astra + Luna | Consolidate live HUD, objective/scanner presentation and contextual alerts; carry consistent visuals into settings and campaign library. | Essential combat/reel cues remain readable; detailed machine tables no longer crowd the play view. |
| W-09 | Luna + Astra | Run interaction, pause, input, inventory/economy, station-power, save and browser acceptance matrix; profile repeated terminal use. | No leaks or stale targets, precise resource ledger, successful keyboard-only use and cold Continue with equivalent gameplay state. |

## Required verification cases

- Open during travel, low fuel, scan, reload, combat, build catalog, and supported
  physical panel transitions. Reject or transfer ownership according to the matrix.
- Pause for a measured wall-clock interval: all simulation clocks/resources and
  actor poses remain unchanged; only authorized UI transactions differ.
- Craft/transfer with empty/full inventory, multiple stores, insufficient inputs,
  offline/destroyed station, and stale IDs. Repeated clicks neither duplicate nor
  lose resources. Owning a station is still required.
- View machine info offboard, then attempt onboard transfer/crafting: clearly
  unavailable. Nearby field pickup still works through its physical interaction.
- Attempt terminal fuel deposit, course commitment and direct repair: unavailable;
  go to the physical control and verify the existing action remains usable.
- Run build-catalog-to-placement with combat beginning at resume; preserve the
  existing threat exit and placement validation.
- Open/close at scanner 99.9% and at pending 100%; never skip, restart, or duplicate
  the crossfire scene and never run it behind a paused terminal.
- Validate load/export/import, audio mute/pause, focus restoration, pointer-lock
  failure, resizing, alternate key bindings, reduced motion, and missing wrist art.

## Primary existing authorities and components

`src/game/Game.ts`, `GameState.ts`, `src/core/input/InputManager.ts`, `Bindings.ts`,
`src/core/settings/SettingsStore.ts`, `src/items/Container.ts`,
`ContainerTransfer.ts`, `ResourceAccess.ts`, `src/crafting/CraftingSystem.ts`,
`src/building/BuildSystem.ts`, `src/player/PlayerStats.ts`, `Needs.ts`,
`PlayerCombat.ts`, `src/companion/CaretakerDirector.ts`.

Reuse/adapt `InventoryUI`, `FieldworkUI`, `HomeLifeUI`, `CaretakerUI`, `BuildCatalog`,
`BuildUI`, `MachineStatusView`, `MachineOperationsUI`, `RadioUI`, `CampaignLogUI`,
`SaveLibraryUI`, `TitleScreen`, and `HUD`. Add a callback-only terminal shell and
pure access/controller modules instead of embedding more independent business
rules in UI components. One integration owner edits Game and save wiring.
