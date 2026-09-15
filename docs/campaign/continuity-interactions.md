# Campaign continuity interaction map

Status: runner map for the continuity and smoothness iteration. This describes
the normal player-facing authority path. Existing chapter QA tools that call
private Game methods or restore prepared story states remain useful focused
fixtures, but they are not evidence for this uninterrupted run.

## Runner rules

- Start with the title screen and a fresh isolated browser profile. Choose
  Story or Survival through the visible campaign chooser.
- Drive keyboard, mouse and visible DOM controls. Read `__game` snapshots only
  to determine whether an observed action settled and to record conservation.
- Never assign campaign phase, facts, inventory, resources, health, world
  distance, simulation time, enemy outcome or build state.
- Long travel may run the real `Game.fixedUpdate(1 / 60)` faster than wall time
  with rendering sampled less often. This advances needs, weather, fuel, power,
  threats and story together. It may not call `world.reset`, a director restore,
  a private arrival method or a debug distance skip.
- Opening, combat, destination movement/interactions, building, crafting,
  death/respawn, saving and loading use normal cadence and controls.
- After every successful in-game save, record an external runner checkpoint.
  Resume by clicking **Continue**, never by loading or rewriting a private save.

## Interaction path and durable observations

| Stage | Player path | Read-only completion evidence | Safe checkpoint |
| --- | --- | --- | --- |
| New campaign | Title **New Game** → visible **Story** or **Survival** button | `campaignProfile`; weapon `infiniteReserve` agrees with chosen profile | No |
| Opening | Move/jump through rooftop and land on the Nomad, or use the authored hold-Escape skip | `opening.phase === 'done'`, player armed, capsule on machine deck | Yes, once no attack is active |
| First-run salvage | Follow HUD, aim reel and use the configured reel/interact controls; open the recovered crate | first-run objective advances; inventory/resource events reflect exact collected contents | Yes after hook/crate interaction closes |
| Radio recovery | The guaranteed first eligible opened salvage chest grants the radio; walk to and use the fixed radio | `earlyRadioDrop.radioFound`; visible Radio panel/status | Yes |
| Tutorial defense | Build/crew the requested manual turret and survive the boarding encounter through normal combat/hook controls | `firstRun.current` advances to complete; encounter actors cleared | Yes after attack clears |
| Wreck One trace | Use Radio **Trace Wreck One** | visible Expedition state changes to approach and destination is active | During stable travel, not approach/braking |
| Story route choice | Expedition route card **Select**, then **Confirm route** | selected route and arrival remain in StoryDirector save projection | During stable travel after selection |
| Destination exploration | Walk the gangway; use E at journal/objective/unique interactables | corresponding journal/objective/unique appears in director projection and UI | Docked only when player has returned off gangway and no scripted attack is live |
| Departure | Return aboard; Radio **Depart** | chapter enters departing/complete and destination releases | After completion returns to normal travel |
| Foundry/automation | Repeat radio/route/interactions; build or use required stations through Build and Inventory/Crafting UI | actual blueprint/fact and serialized piece/resource deltas | Stable travel |
| Quiet Array | Read both calibration records before taking the actuator; archive remains separately optional | tier-one unique and journal archive are durable; powered Helm exposes ±12° | Stable travel after departure |
| Optional chart contact | Plot in powered Helm, follow guidance, dock, claim or explicitly depart | RouteChart active/reward remainder changes through normal interaction | When contact is settled and player is aboard |
| Glass Orchard | Choose route, resolve its ordinary encounter, operate isolators, read required records, recover seed bank/core/governor | objectives, selected/common journals and three uniques durable; tier two and garden blueprint available | Stable departure |
| Garden/home | Build through catalog; water/harvest/rest through E and panels | serialized piece controller state and exact inventory/resource deltas | Stable, no active interaction |
| Meridian | Select route; resolve skiff/gunboat; operate transmitter/archive; read selected/common records; recover solution | Meridian requirements and tier three durable | Stable departure/final checkpoint |
| Ending | Powered Helm two-step commit after safe checkpoint; wait through arrival or visible Skip; **Keep Walking** | Ending phase complete in the same save; simulation resumes | Post-ending save |
| Save/Continue | Escape → **Save** or **Save & Quit**; boot menu **Continue** | menu reports success; newest saved timestamp/slot exists; restored public snapshot matches pre-save durable state | This is the recovery mechanism itself |
| Death recovery | Lose health through ordinary combat, use visible respawn/recovery flow | player returns at valid spawn; no transient encounter reward is duplicated | First stable point after respawn |

## First-run control details

The next runner slice follows the current onboarding instructions exactly:

1. **Salvage:** the HUD asks for **F**. The runner may read the live salvage
   target positions and project them through the active camera to steer ordinary
   pointer movement; it may not move a crate or set `reelReady`. Pressing F must
   create the real outbound hook, catch a target within `REEL_RANGE`, return it
   and invoke the normal automatic-open path. The first eligible open is the
   sole authority that grants the radio cache.
2. **Refinery:** a new campaign starts with 260 scrap and its ordinary starting
   structures. Open build with **B**, choose the visible **Stations** catalog tab
   and **Refinery** card, aim at a valid deck cell and place with primary fire.
   Its 80-scrap cost must be observed in the resource delta; the runner may not
   call `BuildSystem.place`.
3. **Components:** walk within interaction reach, press **E**, and click the
   visible **Refine Components** recipe four times. Each recipe consumes eight
   scrap and produces two components. The onboarding gate requires eight total
   refined or currently available components so the following two four-component
   builds remain affordable.
4. **Workbench:** use the same B/catalog/placement path and spend 30 scrap plus
   four components. Existing ammunition recipes remain ordinary workbench
   actions; Story does not need them, while Survival continuity must craft the
   recipe matching the depleted gun.
5. **Manual deck gun:** choose the station card after the tutorial blueprint is
   available, place it for its real cost, walk to it and press E to crew it.
   Mounted context owns aim/fire and E exits. The tutorial boarding encounter
   becomes eligible only after the real crew event.
6. **Boarding and repair:** use normal weapon/turret fire and hook cutting. After
   the encounter, hold E at the highlighted damaged subsystem until the real
   repair completes. A perfect defense legitimately completes the repair gate
   through the existing `boarding-ended` fact; the runner must record which path
   occurred.

Build placement remains camera/raycast authoritative. Reading an empty cell from
the serialized layout may help the runner aim, but setting `selectedPiece`,
calling `place`, teleporting the player or directly positioning the camera is
not acceptable. Pointer-lock mouse motion, WASD, catalog DOM buttons and primary
fire are the allowed placement path.

## Acceleration accounting

Each accelerated travel segment records starting and ending world distance,
simulation time, wall time, fuel, needs, resources, campaign phase and encounter
events. Rendering may be throttled, but fixed steps are never omitted. If an
attack begins, acceleration stops and normal browser input/cadence resumes.

The final duration report separates:

1. rendered wall-clock play;
2. accelerated simulated travel;
3. loading and menu time;
4. estimated unaccelerated travel time; and
5. observed combat/build/exploration time.

The roadmap's 8–15 hour target remains unproven until measured player time,
rather than route distances or fixture duration, supports it.

## Incremental runner boundary

The first runner slice covers a fresh Story selection, the real opening through
physical sprint and jump input, an actual pause-menu save, Save & Quit and
Continue into the same post-opening state. It then aims the reel through the
normal mouse-input path, catches the first drifting salvage with **F**, and
proves the payout, recovered radio and Wreck One signal through a second actual
Save & Quit/Continue. Refinery, components and workbench construction are the
next incremental slice; they must use the catalog, placement ray and station UI
rather than prepared pieces or resource state.

The next accepted low-graphics slice resumes a copied cold-browser profile so
failed automation cannot autosave over its source checkpoint. Through ordinary
catalog, placement-ray, movement, station and crafting input it adds three deck
plates, one refinery, one workbench and one manual deck gun; refines components
four times; and crews the gun. The observed conservation boundary is 86 scrap,
1 component and 4 fuel, with the tutorial boarding vehicle beginning on its
normal 15-second delay. Resolving that boarding fight and the repair objective
remains the next continuity slice.
