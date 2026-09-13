# Gameplay polish: movement, camera and building

Status: implementation plan only. Prepared 12 September 2026 against main
`1cf3835739d7e5318ec9506faaed149c6957c4bc`. This document does not claim that any
of the proposed gameplay changes have shipped.

The user requested a refined task plan for character/combat presentation,
camera/controls, and building/storage/maintenance. Their additional priorities
are direct build selection, useful placement distance, and a sensible response
to combat while building. Sol reviewed the animation/camera implementation;
Astra reviewed building, system boundaries and the combined delivery plan.
Implementation is divided into bounded Luna tasks, with Astra owning Blender
authoring and final visual review. See the [execution backlog](2026-09-12-gameplay-polish-tasks.md).

## Outcome and implementation order

1. Make building comfortable on every deck: a searchable catalog, predictable
   distant placement, clear previews and safe combat interruption.
2. Improve camera obstruction and controls while building the character animation
   assets in parallel. Connect those assets to the existing combat simulation.
3. Add equipment relocation, bulk storage operations and useful maintenance
   feedback; review the combined game before release.

These are improvements to the existing loop. Do not add quests, story scenes,
destinations, unlocks, enemy types, weapons or resource progression. Keep current
damage, ammunition rules, attack/reload durations, enemy speeds, difficulty,
repair prices, machine speed and fuel behavior. The intentional interaction
changes are the build controls/range, relocation without demolition, and build
mode no longer suppressing a ready radio raid. Normal pause remains available.

## What the current code establishes

| Evidence | Consequence for this plan |
| --- | --- |
| `Game.updateBuildMode()` clamps levels to `0..GRID_LEVELS-1`, while `GRID_MIN_LEVEL` is `-2`. The Nomad's lower decks occupy negative grid levels. | Fix both automatic and manual level selection; do not merely increase placement range. |
| `BuildPreview.update()` casts 9 m from the camera and otherwise uses a point 5 m in front of that camera. Its X/Z target is combined with a separately selected level. | Camera setback consumes usable range; machinery and stale floor selection can produce surprising targets. Replace targeting with an explicit deck-plane/occlusion contract. This is a source diagnosis; first implementation task reproduces the user's placement behavior in the browser. |
| `BuildUI` uses grouped text slots and `G` cycles categories. | Keep shortcuts, but make direct category and item selection the primary path. |
| `updateRadioRaids()` requires `!buildMode`; build commands also run before enemy updates. | A new interruption rule needs encounter eligibility and command ordering reviewed, not just a damage-event listener. |
| `machine:damaged` is a rate-limited audio/UI notification. | It cannot be the authoritative source for immediate build interruption. |
| `removeOne()` empties storage/producers, refunds materials and unregisters devices. | Moving equipment must not be implemented as demolish plus place. |
| S-07 already has armed/unarmed locomotion, crouch/jump, weapon sockets and held recoil; mechs have attack/death clips, hit flashes and aim warnings. | Extend the current rigs and feedback rather than replacing delivered systems. |
| Player bullets originate at the camera. Enemy ranged cover checks currently use the animated muzzle. | Cosmetic changes must preserve the combat calculation path; enemy muzzle preservation is a release gate. |
| Camera input is already frame-rate independent and movement interpolates. | Preserve these fixes while replacing the single collision ray. |
| The newest desert-art hardware samples were around 60 FPS; older crowded samples varied. | Measure repeated real combat and long sessions. No unsupported claim that performance is already solved on all hardware. |

## Building experience

### Select a piece directly

`B` enters building with a catalog: visible category tabs, thumbnail cards, names,
costs, a search field and clear locked-item reasons. All existing pieces remain
available under the same unlock rules. Selecting a card enters placement;
the last category/selection is remembered. `G` reopens the catalog. Number keys
remain optional shortcuts for the visible category, not a prerequisite to use it.
Do not add favorites or a new unlock interface in this pass.

The catalog uses a mouse cursor. It suppresses character movement and gameplay
actions while open, but the world continues running. Placement returns to mouse
look and allows normal walking, sprinting, crouching and jumping. No weapon fire,
salvage activation or station use leaks through build controls. Catalog clicks
must not also place a piece or fire a gun when pointer lock returns.

Proposed defaults, resolved through the new binding registry rather than hardcoded
in individual UI components:

| Input | Normal play | Build placement / catalog |
| --- | --- | --- |
| B | Enter build catalog | Exit building |
| G | No new action | Open catalog from placement |
| LMB | Fire | Place/confirm; catalog selects cards |
| RMB | Aim | Cancel relocation; with an ordinary preview, return to catalog |
| Q / E | Existing normal bindings | Rotate left/right |
| Mouse wheel | Preserve existing non-build behavior | Rotate by discrete notches; scroll catalog when it owns the pointer |
| Page Up / Page Down | No new action | Select next/previous legal build level |
| Home | No new action | Return floor selection to Auto |
| V | Swap camera shoulder | Select equipment under the reticle for relocation |
| Hold X, 0.6 s | No new action | Explicit demolition with target name, affected-piece count and refund preview |
| Esc | Existing pause/close behavior | Cancel relocation first; otherwise exit building, consuming this press |

Do not leave instant RMB demolition active alongside the new cancel action.
Holding X invokes the existing demolition/refund rules once; release, aim change,
mode exit or an attack cancels the hold. Show cascaded dependent pieces before
confirming demolition. `Esc` used to leave building must not also open pause in
the same event. Browser-reserved keys are handled only while the game/UI owns them.

### Aim where the piece should go

Use a 12 m maximum reach measured from the player's chest to the target footprint
center, not from the offset camera. This is an initial authored constant with
an explicit acceptance case: place valid equipment at roughly 4, 8 and 11 m
without walking next to it. Out-of-range targets stay visible as invalid; they
must not silently jump back next to the player. Reach remains bounded.

Derive Auto level from the actual supporting deck/build floor when available,
with a stable height fallback using `GRID_MIN_LEVEL..GRID_LEVELS-1` (-2 through
2 today). Label the physical decks Lower, Middle and Upper; levels above the
original hull receive a clear additional-level label. On stairs, use hysteresis
and the next grounded landing to avoid oscillating levels. Manual level persists
until Home or exit. Do not rely on mouse wheel for changing storeys.

Resolve the view ray against the selected machine-local floor plane for ordinary
floor equipment and edge extension. Use compatible visible support surfaces
for wall fixtures/edges; roofs and stairs keep their existing anchor semantics.
Convert through the machine's current transform consistently with the grid,
colliders and visual preview. A ray nearly parallel to the plane or directed
away from it produces a clear invalid target, not a synthetic close placement.
An edge extension can use empty space on this plane, then pass existing support
validation. It must not fabricate a floor under a station.

Check reach and line of sight separately. Solid bulkheads, machinery and intervening
floors block placement; ignore the player and preview, not the real obstacle.
Check camera visibility and chest-to-target visibility so a shoulder camera cannot
place through a wall that hides the player. A selected build level is not permission
to build through a ceiling. Existing occupancy, physical clearance, actor overlap,
support, blueprint, resource, reserved-machine and expedition-gangway rules all apply
again at commit. Never trust a preview from an earlier tick.

Perform both LOS checks after grid snapping and orientation are resolved. Test
the segment only up to its endpoint (2 cm tolerance), accepting a terminal hit
on the selected compatible support. The intended floor or fixture wall must not
block its own placement; an earlier ceiling/bulkhead still does. Ignore geometry
behind the endpoint. Exclude preview/self colliders by stable identity rather
than assuming that hidden visuals are absent from physics. Preview and commit
use exactly the same LOS predicate.

The preview shows the actual object, footprint, orientation, deck and distance,
plus the specific blocking reason. Use a symbol/text as well as green/red color.
An invalid object can remain faintly visible through its obstruction for diagnosis,
but is clearly marked blocked. Reuse geometry and clone only owned preview materials;
opening the catalog must not instantiate every detailed model.

### Combat wins over building

Choose automatic exit; do not create a partial-world pause. Fuel, machine motion,
enemy clocks and production continue normally in both catalog and placement.

Build access is denied or interrupted when a live hostile is aboard, a hostile
boarding/gunboat encounter commits to approach/attack, a grapple or damaging
projectile remains active, or hostile damage reaches the player, construction or
machine. Guard against active damage sources before the first hit, rather than
waiting for player health to drop. Presentation-only actors in the distant
crossfire scene and a ship already harmlessly retreating do not count; survivors,
attached hooks and in-flight projectiles still do. Opening, cinematic, death,
mounted-gun and modal-menu states independently disallow build entry.

Use a dedicated small threat projection, separate from save safety and spawn
eligibility. Source direct hostile state and actual subsystem damage changes;
do not rely on the rate-limited `machine:damaged` cue or a generic damaged-health
flag (an unrepaired but safe machine is still buildable).

On interruption, close the catalog, hide the ghost, cancel demolition/relocation,
return to the last equipped weapon and show `Under attack — build mode closed`.
Preserve movement inputs in placement. Consume pending build/interaction actions
and require held mouse/action buttons to be released before their combat action
can fire. Never automatically fire a weapon from a held placement click. Require
a new B press after the threat clears; do not reopen a menu during combat.
A 2-second threat-free interval prevents flickering entry permission; it affects
only build access, never enemy schedules or player protection.
Reset this interval every fixed tick while any projected source is active,
including an already-active restored encounter. Begin counting simulated seconds
only when all sources are absent; do not infer safety from a missing event.
The guard consumes no director randomness and writes no attack/projectile clocks.

Remove build-only gating from ready radio raids, including catalog state if it
is modeled as an open panel. Keep existing health, encounter, story, destination,
sanctuary and unrelated panel conditions. This deliberately closes the current
indefinite raid delay from staying in build mode. Do not add extra grace,
invulnerability, raid frequency, or change the director's random stream.

Check the guard before commands and on relevant events. An attack that begins
later in a tick cancels all subsequent build commands, but does not roll back a
placement that validly finished before it began. If a cursor catalog loses focus
or pointer lock cannot be reacquired without a gesture, use the game's real pause
handoff and a safe Resume control; do not silently leave the player unable to aim
while the world attacks. Consume the gesture that restores control.

In particular, a threat while the cursor catalog is open must atomically close
building, suppress gameplay actions and enter full pause before the next world
simulation step. Resume requests pointer lock from the user's gesture, then
unpauses only after lock succeeds (or in the explicit browser-test bypass).
Denial or focus loss stays paused and permits retry. Do not resume first and
attempt lock afterward. This is input recovery through the normal pause menu,
not a build mode that permits movement while enemies are frozen. Placement already
holding pointer lock can exit directly to combat without this pause handoff.

### Move equipment without rebuilding it

First-pass relocation covers existing player-built stations, storage, automation
and furniture/fixtures. It does not move the authored Nomad hull, starter machine
geometry, the fixed radio/helm, structural floors/walls/roofs/stairs/rails, or a
piece supporting another piece. Existing demolition remains available separately.

Select a reachable, visible object with V; keep the original live and solid while
a candidate ghost is moved/rotated. On confirm, revalidate destination and commit
atomically to the same instance ID. Preserve exact health, inventory, producer
progress/output, upgrades, fuel accounting, turret cooldown and device state.
Preserve total mass and resources; charge no demolition fee and grant no refund,
new-build credit, craft credit or repair. Do not heal damaged equipment by moving it.

A failed move or canceled preview leaves the original object and contents in place.
Moving a loaded crate must remain legal when the player's inventory is full.
Rebuild occupancy/collision/navigation and update instance-position lookups once
after a successful commit. Keep power registration and stable resource identities;
avoid fake removed/placed events. A dedicated `build:relocated` event carries old
and new placements, without rewards.

Reject a mounted turret, a collector with an active reel/claim, or another
externally occupied device with a specific `In use` reason. Idle but damaged,
unpowered or full devices can move. Validate moving equipment against the player
and other live actors. Serialize only the original or fully committed placement;
preview state is transient. Loading/reset/attack cancels it. Use existing saved
placement fields wherever possible instead of introducing an unnecessary save version.

## Character and combat presentation

Keep the existing S-07 and four mech silhouettes, materials and equipment. Work
from copies of their editable Blender sources, recording clip/bone/socket names
before runtime integration. No new model pack or engine migration is needed.

S-07 needs direction-aware in-place locomotion for aimed forward/back/left/right
travel and blended diagonals, including crouched travel; preserve current unarmed
opening movement. Motion input uses actual self-motion with machine carry removed,
so standing aboard does not trigger a walk cycle. Body turn rates, movement
speeds, gravity and collision remain unchanged. Blend idle, starts/stops, jump and
landing without changing physical movement. Avoid reversing a forward clip as the
final backpedal animation.

Layer bounded upper-body aim after base locomotion, with a two-hand weapon grip.
The rifle follows aim pitch and the supporting hand remains on the foregrip;
pelvis/root do not twist with the camera. Reload poses own the support hand while
active. The camera ray remains the player's authoritative shot. No aim assist,
headshot rule, animation-driven root motion or movement penalty is introduced.

Author rifle and shotgun reload presentations that fit the existing whole-magazine
reloads. Do not turn the shotgun into a per-shell mechanic. Clip playback follows
the authoritative reload progress/duration and existing interruption rules; the
animation never awards ammunition or delays fire. Add a presentation snapshot
or explicit cancel notification where the existing event pair cannot describe
equip/death/load transitions. Cosmetic hooks must be safe during pause, building,
focus loss, respawn and interrupted reloads.

Foot planting uses two bounded, read-only ground samples per local player update,
with visual ankle/knee/pelvis adjustments. Test both authored Nomad stairs and
player-built stairs. Respect machine transforms and grounded state. Blend out on
jump, missing support or unreachable steps. Never move the capsule, alter grounded
state, climb a higher step or change the player's world position through IK.

Give the existing enemies distinct physical responses: Warden shoulder recoil and
contained hits; Bastion heavier recoil absorption and weighty collapse; Revenant
clear blade follow-through and agile reactions; Sovereign restrained movement with
drone recoil and a controlled fall. Keep existing aim warnings, flashes, damage
directions and readable silhouettes. Hit reactions are additive and cosmetic:
no stagger/stun, knockback, attack cancellation or additional invulnerability.
Death poses remain noninteractive and honor current collider/pool retirement.

Attack effects must line up with existing damage/release ticks. Where an attack
has no existing windup, do not add one for a longer animation: the impact pose
occurs at the original tick and follow-through comes after it. Faster bursts must
not wait for an earlier recoil animation to finish.

### Critical enemy muzzle boundary

The current ranged ray and cover checks use the animated enemy muzzle. Replacing
that with a guessed rest-pose/chest origin would change which shots are blocked.
Before modifying affected animations, record baseline origin/target/cover results
through every current clip and firing state. Preserve an authoritative transform
path driven by the original clip/socket data, independent of new cosmetic layers
(a transform-only original socket chain is acceptable; a second skinned mesh is not).
New visual muzzle transforms drive tracers and flashes only. Maintain the original
barrel obstruction check, committed aim target, hit counts and damage ticks.
Do not promote a changed enemy clip until deterministic parity and cover cases pass.

Preserve original mixer action selection/reset/crossfades, render-time advancement,
pool reset and the order in which fixed updates sample that hierarchy. Today the
raycast reads the muzzle before `visual.attack()` starts the release animation;
later burst shots can sample that animation after intervening render frames.
A bone-only original hierarchy with its own unchanged clips/mixer is the fallback
if extracted socket tracks cannot reproduce parent animation. It carries no mesh.
Test shot origins immediately before raycasts at 30/60/144 rendered FPS with fixed
60 Hz simulation, including three-shot bursts. No authoritative shot reads the new
cosmetic skeleton. Do not quietly replace existing render/fixed coupling with a
different clock as part of this presentation pass.

## Camera and control comfort

Use a volume sweep for the third-person camera with radius derived conservatively
from the near plane at the supported FOV/aspect, not merely a center ray. Ignore
the player's own collider and nonblocking sensors; keep real machine/build geometry.
Resolve initial overlap and both anchor-to-goal and previous-to-candidate motion.
Retract immediately on obstruction; ease outward more slowly with hysteresis.
Run final collision validation after interpolation so smoothing cannot carry the
rendered camera through a wall. Reset history after teleport/load/cinematic handoff.

Close-camera fading applies only to local-player body and held equipment, using
owned materials/dither and hysteresis. Restore original material opacity/emission
and preserve other characters and shared assets. No whole-machine transparency,
new post-processing pass or global shadow disable is needed.

Default shoulder remains right; V swaps sides through a collision-tested path.
Keep aim yaw/pitch unchanged and keep firing along the actual camera center ray.
The camera's changed location can naturally change visibility around a corner;
do not promise identical hits on occluded objects from two different viewpoints.
Shoulder preference persists locally. Mounted gun and cinematic cameras ignore the
shoulder/FOV controls and restore the normal camera cleanly afterward.

Settings are device preferences, not campaign progression. Preserve existing
volume, ambience and quality values on migration. Add:

- Look sensitivity 0.25–3.0 times the current default, with reset.
- Hip vertical FOV 50–80 degrees, default 55. Preserve the default 38-degree aim
  FOV by scaling `tan(FOV/2)` with the original 38/55 optical ratio; do not apply
  the hip setting to cinematics or mounted guns.
- Context-aware keyboard and mouse-button rebinding for supported gameplay/build
  actions, with reset and conflict explanations. Preserve existing aliases where
  valid. Escape/menu recovery and browser-reserved shortcuts cannot be removed.

Bindings are resolved for normal play, placement, catalog, mounted gun and menus.
Duplicate keys across exclusive contexts are legal (V shoulder/relocate; E use/rotate).
Conflicts within the same context need an explicit replace/swap action; no silent
overwrites. Held inputs are tracked physically and rearmed on release across
contexts. Menus/text fields never fire gameplay actions. All visible hints and
tutorial controls render from action IDs; do not leave stale literal keys in the HUD.
Preserve raw mouse response and existing 30/60/120/144 Hz tests. Invert-Y and
controller support are outside this iteration unless separately requested.

## Storage and maintenance

Add Take All and Deposit Matching to an already open storage/collector panel.
Take All moves what fits into the player, leaving overflow in the source.
Deposit Matching transfers only carried item types present in that destination
when the action begins, with a clear label; it must not silently distribute items
to every nearby crate. Existing click-stack and shift-click-one remain available.
Sort explicitly compacts stacks and orders by category, display name and stable
ID; never auto-sort beneath a moving cursor. No new capacity or crafting reach.
Batch actions are atomic with respect to a simulation command, preserve totals,
and emit no loot/story rewards. Close/invalidate a panel when its storage vanishes
or falls outside the existing interaction rules.

Use the current interaction system's chosen target for a lightweight highlight
and prompt. Preserve line of sight, range and repair-versus-use priority; the glow
must not select a different object. Distinguish decorative models from usable
equipment and mark inaccessible damaged machinery at its existing service panel.

Improve the current machine HUD with a compact expandable status view: tank amount
and empty-tank crawl, supply/demand and shed consumers, worst damaged systems and
their service-deck labels. Show missing repair materials and unpowered station
reasons from real state. Reuse current interaction/repair prices and fuel recovery
instructions. Do not add remote repair, remote refueling, auto-deposit or another
constant warning sound. Fuel updates cannot depend solely on `power:changed`, which
does not fire for every fuel change. Show transient notifications with deduplication.

## Shared acceptance and evidence

Use real-browser scenarios and deterministic unit checks, not just model viewers
or screenshots of synthetic poses. The task backlog specifies owners and tests.
Keep player saves isolated during QA.

- Building: all three physical decks, upper extensions, stairs, deck edges,
  distant valid targets, blocked LOS, full inventories and relocated devices.
- Combat handoff: catalog/placement/relocation/demolition interrupted by infantry,
  boarding, gunboat telegraph, machine damage and remaining shells; held controls
  and failed pointer-lock reacquisition; ready raids still start while building.
- Combat parity: paired seeded scenarios with unchanged movement, shot/reload/damage
  times, quantities, cover results, loot, death retirement and encounter pacing
  except the documented build-only eligibility change.
- Camera and art: interior corners, beams, lowest ceilings, shoulder changes,
  recoil/reload, stairs, death/respawn and the existing opening/cinematic transitions.
- Lifecycle: 100 catalog/preview/relocation cycles and at least a 10-minute repeated
  build/fight/save loop. Resource counts settle after pool warmup; no growing
  geometries/materials/colliders, duplicated power consumers or retained UI listeners.
- Performance: sequential before/after hardware Chrome runs at 1080p High and
  representative Medium, normal deck/rapid turns/eight-mech dense-ruin scenes.
  At least three 30-second samples per scenario, with p95/p99 and slow-frame counts,
  CPU/GPU context and hardware recorded. Target 60 FPS on the existing midrange
  target; investigate a repeatable >5% regression rather than quoting one good run.
- Run lint, full unit suite, production build, affected browser suites and the
  existing opening/signal/boarding/save/expedition regressions. Assets need valid
  glTF, correct bounds/socket names and no missing fallback path.

Completion means all backlog acceptance checks pass, Astra reviews gameplay
captures against the original character references and new motion briefs, and the
change log honestly lists any remaining limitations. This planning request itself
ends with reviewed documents; it does not start implementation or a new deployment.
