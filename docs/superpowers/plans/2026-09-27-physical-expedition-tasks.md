# Physical expedition challenges — implementation tasks

Status: implemented through the technical E01–E11 work, with automated and native evidence in [the delivery guide](../../godot-port/physical-expeditions.md). E12's uncoached human campaign acceptance remains pending. The original backlog below is retained as the implementation contract. Relative effort: S = small bounded change, M = several connected changes, L = a substantial gameplay/art slice requiring native review. These are estimates of scope, not elapsed-time promises.

Parent: [five-priority delivery plan](2026-09-27-five-priority-delivery-plan.md).

## Outcome and current evidence

Give each of the five major destinations a recognizable physical activity. The player walks between local controls, sees machinery change, and reaches the existing story rewards. Preserve the campaign's order, route consequences, robot survival model, optional discoveries, and peaceful Meridian ending.

The native game already has seven saved console activities in `godot/scripts/destination_activity.gd`: `gyro`, `power`, `array`, `port`, `starboard`, `transmitter`, and `archive`. Their state is owned by `session.polish.activities`; `campaign.gd` awards existing uniques/objectives. `story_art.gd` currently adds instruments and completion lamps. This work extends those activities instead of inventing another progression system.

Important implementation facts:

- `save_validation.gd` currently bounds activity steps to 0–3, validates the solved Foundry allocation `[2,1,0]`, and validates Array values against `[25,60,85]` with tolerance 2. Extending the state requires deliberate validation and migration.
- `campaign.create_destination()` combines authored visuals, definition colliders, and named interaction anchors. `campaign.nearest()` currently selects any eligible point within 2.5 m; new controls also need unobstructed interaction reach so they cannot be used through closed geometry.
- Current native roots are Wake X19, Foundry X20, and Array/Orchard/Meridian X22, all placed at deck surface Y16.03. Earlier web-era plans with X17 are historical, not current geometry contracts.
- Native ground recovery recognizes destination descendants only while docked. Build validation reserves the active gangway corridor. Preserve those rules and test actual supported paths.
- Existing checkpoint and integration tests teleport to controls and call activity methods. They prove transaction behavior but do not prove a playable walking route or safe moving colliders.
- The wrist contains personal pack/log pages. `Console` is already a separate local site panel with the player camera. Physical control panels must remain in that interface.

## Fixed gameplay boundaries

No major site requires the optional salvage crane, battery bank, quiet drive, an optional workshop completion, a player-built bridge, or a consumable item. Site machinery has its own intact service power or manual mechanism. A zero-inventory player with the legitimate prior story facts can complete and leave every site. Materials used in presentation are captive site components, not inventory deposits or new currencies.

Do not add mandatory timed jumps, rideable physics cranes, combat on detached sites, or walks on the radioactive ground. The existing gangway and a permanent return aisle remain usable throughout every step. Moving equipment may open optional shortcuts or reward bays; it never removes the only route back to the Nomad. Required controls remain reachable from fixed, supported landings.

Preserve route encounter timing and composition in this workstream. Preserve `requiredUniques`, existing journal gates, selected-route testimony, and departure checks. Human seeds stay archive evidence, not food. Meridian retains deliberate helm commitment, a successful durable checkpoint before commitment, the existing final journey, arrival, and Keep Walking continuation.

## Five site designs

| Site / fixture | Physical sequence | Visible consequence and traversal | Existing reward/gate retained |
| --- | --- | --- | --- |
| The Wake / `wake` | At the feed breaker, isolate the gyro housing. Walk to the brake lever and arrest the rotor. At the cradle, release the retaining collar and recover the gyro. | Cable lamps extinguish in sequence, the visible rotor slows to rest, and the cradle opens. The player moves around the existing housing on fixed deck; no new mandatory platforming. | Existing three `gyro` operations become three reachable controls; `course-gyro` is recovered once after safe release. |
| Relay Foundry / `foundry` | Allocate the local recovery bus: recovery 2, tracking 1, furnace 0. At a separate gantry pendant, release its travel lock, move the captive service carriage to its marked bay, and latch it. Recover controller and servo at their existing service positions. | A site-owned overhead carriage moves clear of a recovery alcove, cabinet access opens, and bus lamps identify the powered machinery. A fixed side aisle gives a view of the motion and access to both component stations. | Shared `power` activity completes only after the valid allocation and physical latch. Keep `salvage-controller` and `tracking-servo` as separate, idempotent pickups. The optional Nomad crane is unrelated. |
| The Quiet Array / `array` | Read the existing calibration records. Walk to port, central, and starboard service wheels; set each channel using its local ticks. Lock the phase at the existing tuner, then visit the archive and actuator stations. | Three visible antenna pivots track the settings; indicator lines converge when aligned, and the archive shutter opens. Channels retain their current `[25,60,85]` scale/tolerance. Fixed deck connects all service positions. | Keep required calibration journals for the actuator and the existing separate shard/actuator facts. Shared Array activity does not silently award both pickups or waive the original per-reward requirements. |
| Glass Orchard / `orchard-caretaker`, `orchard-cold-vault` | The selected route still supplies one intact isolator. Restore the remaining bus by connecting its captive ground lever, closing a local bypass, and energizing the isolator. Then visit the now-accessible archive bay and selected/common record stations. | A short service shutter or deck-level access leaf opens within the affected outer quadrant; conduit lights trace restored power to seeds or memory. A permanent central aisle remains open. No greenhouse furniture occupies the return spine. | Caretaker route starts port complete; cold-vault starts starboard complete. Preserve both objectives, three uniques, the common plus selected-route record gate for the governor, and inaccessible alternate-route testimony. |
| Last Garden Meridian / `meridian-quiet`, `meridian-cordon` | At the archive cradle, verify the preserved core, engage its captive carrier, and verify readback. At local transmitter controls, check the archive link, align/synchronize the feed, and confirm the bearing. Read the existing accessible records and recover the solution. | The cradle seats visibly and archive lamps appear in sequence; a transmitter feed rotates and the mast signal comes alive. The player walks the garden/bench perimeter on fixed deck. Use the same mechanics on both routes, with their current distinct testimony. | The existing Orchard core fact remains required and is never consumed. Preserve both Meridian objectives and journal gates, either valid objective order unless an existing gate requires otherwise, and one solution reward. No finale fight or new ending gate. |

Prototype **Relay Foundry** first. It exercises local controls, a shared activity serving two rewards, ordered steps, a moving obstacle, safe collision transitions, and a meaningful environmental reveal without involving late-story ending rules. Do not expand all sites until its native traversal review passes.

These are spatial briefs, not approved mesh coordinates. During the prototype, record measured positions against the current imported assets; do not move existing reward anchors or story colliders casually to make a diagram fit.

## Shared implementation contracts — freeze in C02

### One activity authority

`MMFDestinationActivity` remains the public activity authority. A new `godot/scripts/expedition_mechanisms.gd` may hold pure state transitions and definitions; a new `godot/scripts/expedition_mechanism_view.gd` may own scene presentation. Neither directly grants story rewards. `campaign.interact()` remains the reward/objective authority and must independently check the current completed activity, reach, and existing story requirements.

Freeze semantic commands rather than scene-node callbacks that can bypass validation:

```text
request_step(site_id, activity_id, control_id, action_id, value?) ->
  {accepted, reason_code, current_step, changed}

describe_step(site_id) ->
  {activity_id, step_id, label, target_anchor_id, blocked_reason,
   completed, can_interact}
```

All commands recheck docked phase, correct current destination generation, player health, no active threat/cinematic, control existence, proximity, unobstructed reach, prerequisites, and whether motion is already in progress. Reject stale controls from a prior load/site. Accept repeated completed steps as a harmless no-op. An invalid action does not advance the step, consume supplies, move colliders, or award a reward. Target positions are resolved by the current view from stable anchor IDs, never serialized world coordinates.

Guidance workstream G consumes `describe_step()` as read-only data and supplies optional markers. This workstream owns operation text and reachable target selection; G owns marker rendering, player preferences, and general guidance layout. Mark the next actionable control, not an inaccessible reward behind it. Refusal reasons distinguish a wrong step, blocked motion, missing record, and standing out of reach.

Pacing workstream P receives semantic events through the C02 recorder interface:

```text
activity_started(site_id, activity_id, step_id)
activity_step_completed(site_id, activity_id, step_id)
activity_completed(site_id, activity_id)
activity_blocked(site_id, activity_id, reason_code)
site_entered(site_id) / site_returned_aboard(site_id)
```

Start is the first accepted action, not opening a menu. Emit completion only on an actual durable transition; repeat clicks and restore emit none. Rate-limit repeated blocked notices/events. P owns timestamping, pause-aware durations, session IDs, opt-in/local recording policy, and output files. Site entry/return events let P measure traversal separately from console/motion time. No activity code writes telemetry directly or changes balance.

### Persistence and migration — integrate through C03

Keep the existing activity IDs and their `step`, `values`, and `done` fields. Add a bounded optional per-activity `mechanism` record, format 1, describing committed physical milestones by known IDs. Final exact fields and allowed combinations are frozen in C02; do not hide arbitrary nodes/transforms or animation timers in the save. The activity record is the only physical-progress owner; story facts remain the only reward owner.

- A missing activity means unfinished unless an existing earned story fact or selected-route intact objective proves completion.
- Existing `done:true` remains complete. Open the corresponding machinery and make any still-unclaimed paired reward accessible; never require a returning player to redo new steps.
- Existing `gyro`, isolator, archive, or transmitter `step` 1/2 maps to the equivalent latched physical operation. Preserve each unfinished next step and its original meaning.
- Existing unfinished Foundry/Array `values` remain exactly those values. Restore visible allocation/antenna angles from them; solved-but-uncommitted settings stay solved but uncommitted. Do not reset calibration or infer an unearned reward.
- For old saves missing activity progress, an already recovered member of the shared Foundry or Array activity proves that shared instrument was completed. Open it without awarding the other pickup; the remaining pickup must still satisfy its original requirements.
- Existing route-derived Orchard objectives initialize the corresponding isolator and passage as complete. Never reset them when the destination view is rebuilt.
- Completed/departed sites and final campaign states remain complete. Do not create new mandatory story objective IDs, invent alternate-route journal reads, change rewards, or downgrade a recovered component.
- Validate the optional mechanism version, allowed milestone IDs, ordering, and consistency with legacy fields. Reject malformed/unknown supplied state through the existing validator; migrate valid older shapes before normalizing the new record. Migrate on the trial session used by restore, before publishing it to the live game.

Only stable physical milestones are durable. Motion is a temporary operation from one committed pose to another. A motion completes its milestone after the endpoint and its occupancy guard pass; interrupted motion returns safely to its last committed pose. While motion is active, extend the existing safe-save refusal through the root integration seam rather than serializing a half-moved obstacle. The normal rule still requires returning aboard to save. Pausing/resuming, closing a local panel, or leaving its reach cannot lose completed progress. A load rebuilds all geometry directly at the committed pose before player-placement validation and never replays a reward, old sound, or motion-completion event.

### Art, collision, and lifecycle

Create separate mechanism kits under `assets/native-expedition-mechanisms/` (editable source, provenance/manifest) and `godot/art/expedition-mechanisms-<site>.glb`. Use new build scripts under `tools/art/expedition_mechanisms/`. Reuse the current site art and `story-instruments.glb` materials where practical. Native review must approve any required changes to the existing imported models before replacement.

Each kit exports named static mounts, control anchors, moving pivots, and documented closed/open or initial/final poses in destination-local metres. Include a manifest of interaction positions, collider bounds, sweep volumes, and fixed safe standing points. Names must be unique per site and preserve the existing story anchors. The view uses authored parts when available and a functional simple fallback with the same controls/collision contract if a kit is unavailable.

All collision-bearing mechanism nodes belong under `campaign.destination`, so existing support and teardown ownership applies. Physics changes occur at the appropriate physics boundary, not midway through an input callback. Before beginning or finalizing a move, test the player's capsule against its full swept volume, final volume, and required landing. During motion, keep checking ahead of the moving collider; if the player enters the sweep, hold and resume only once clear. A cancellation returns to the last committed pose only after its return sweep is also clear. Do not crush, displace, damage, or teleport the player as normal operation. Avoid rideable surfaces in this pass. Opening a passage is monotonic once committed; no later step shuts a return route behind the player.

Closing a panel returns captured input and the player camera immediately. Actions must be usable through ordinary remapped interaction controls and local buttons without narrow timing windows. Essential feedback uses shape/motion/text and sound as appropriate, not colour alone. Motion should be short and readable; no idle wait is a puzzle solution.

Teardown must disconnect signals, cancel callbacks/tweens, free colliders once, and invalidate the destination generation. Scene restoration must build mechanisms before camera/player recovery checks. Departure/load/restart must never leave invisible walls, stale controls, duplicate assets, or stale ground-boundary anchors.

## Executable task backlog

All tasks start unchecked. C tasks are shared master-plan gates: C01 baseline/source manifest; C02 interfaces/schema/ownership freeze; C03 migration integration; C04 integrated checkpoint/native review; C05 uncoached campaign acceptance; C06 release handoff. Shared files are edited only by the root integrator or an explicitly reserved owner.

| ID | Work and owner | Dependencies | Effort | Deliverable and acceptance |
| --- | --- | --- | --- | --- |
| E01 | **Gameplay planner:** measure each native site and define the operation graph, safe aisle, anchor contract, and G/P semantic interfaces for C02 to freeze. | C01 | S | Data/anchor manifest under `docs/godot-port/` plus schema examples. Existing facts, route grants, journal gates and exact reward paths are mapped. Identify any authored collision/art conflicts before implementation. |
| E02 | **Activity state worker:** implement pure mechanism transitions and migration helpers in new `expedition_mechanisms.gd`; add focused `tests/expedition_mechanism_state.gd`. Root owns the small activity/session/validator integration in C03. | E01, C02 | M | Every valid old step/value/done combination, earned paired reward, route-granted objective, and malformed new state has round-trip coverage. Out-of-order/repeated commands cannot advance or duplicate rewards. No new mandatory consumable/resource requirement. |
| E03 | **Scene interaction worker:** build the common view/actor, guarded collider motion, semantic targets, local interaction routing, restore and teardown in new `expedition_mechanism_view.gd`. Root wires campaign/main/story-art. | E01, E02 | M | Current destination/proximity/line-of-sight and stale-generation tests pass; occupied swept volume refuses safely; close/pause/load/exit cannot strand input, camera, or player. Simple functional art fallback works. |
| E04 | **Foundry slice owner + art worker:** build the local gantry kit and full Foundry sequence. Keep controller and servo as separately claimed rewards. | E02, E03 | L | `foundry` checkpoint completes through walking and local controls with no optional equipment and empty supplies. Valid bus alone cannot bypass the gantry; final latch cannot bypass the bus. Clear permanent return route in every state; both rewards collected at most once. |
| E05 | **Independent QA worker:** review Foundry prototype and correct it before expansion. | E04 | M | Native player-view capture of entrance, each control, carriage motion, both pickups and return; input-driven walking proof; reload after every stable milestone; quit/load during pending motion; occupied-sweep refusal; repeated load/restart teardown check. Record why the challenge is readable without coaching. |
| E06 | **Wake slice owner:** split the gyro sequence across breaker/brake/cradle and add rotor/cradle presentation. | E05 | M | `wake` has a legible first expedition task, no new opening prerequisite, no ground exposure, and no reward before ordered safe release. Old partial gyro saves resume at the matching remaining control. |
| E07 | **Array slice owner:** implement three reachable local wheels, visible antenna changes, existing journal clues and final lock. | E05 | L | `array` can be solved from the existing clues through actual controls; settings survive close/load; exact tolerance edges and missing-journal refusals pass; archive shard recovery cannot bypass actuator journal gates. No unreachable wheel or blind required adjustment. |
| E08 | **Orchard slice owner:** create mirrored isolator controls and safe archive access changes for both approaches. | E05 | L | Both Orchard fixtures begin with exactly the route's intact bus and traverse to every permitted control/record/reward. Test old one-isolator and one-reward saves, empty inventory, the central return route, and no alternate-route-record softlock. |
| E09 | **Meridian slice owner:** add physical archive seating and transmitter synchronization while preserving objective independence and ending authority. | E05, E08 | L | Both Meridian fixtures complete with the preserved core and route records. No core consumed, no new ending prerequisite, no duplicate solution. Old one-objective saves finish normally; final-bearing checkpoint, durable commitment failure, arrival and same-save continuation stay valid. |
| E10 | **Checkpoint/test worker:** extend focused physical-state fixtures and real-input traversal harness; root reserves checkpoint/integration edits. | E06, E07, E08, E09 | M | Seven docked story starts plus final-bearing remain valid. Add test-only partial-state variants, not a sprawling new user menu. Current-stage tasks remain unfinished and prior-stage facts complete. Per-preset save namespaces and normal campaign bytes remain unchanged. |
| E11 | **QA/performance worker:** native visual/input/lifecycle and performance review; root integrates final fixes and submits evidence to C04. | E10, C03 | M | All five sites and both late route variants pass player-view traversal, camera/clearance, standard/wide aspect review, and repeated load/leave cycles. P recorder receives correct events; G markers follow the actionable step. Compare frame times/resource counts with C01, especially first-seen animation/material loads. |
| E12 | **Root + playtest coordinator:** assess challenge pacing in C05's uninterrupted campaign and publish the player-facing guide/evidence for C06. | E11, C04 | S | Record discovery time, control errors, return route clarity, and unnecessary waits; fix observed blockers. Distinguish automatic fixture evidence from human playtest findings. No claim of successful uncoached testing without an actual observer/player session. |

## Ownership and delegation schedule

Use at most the available three worker slots alongside the root. First pair an isolated pure-state worker with an art/anchor worker while root handles campaign/menu/restore seams. After E05, site art and data can run in parallel in distinct kit/config files; serialize shared activity changes through root. The third worker can maintain the new traversal/state harness and review finished slices independently.

Root retains `main.gd`, `session.gd`, `save_validation.gd`, `campaign.gd`, `destination_activity.gd`, `story_art.gd`, `ui.gd`, `building.gd`, `ground_boundary.gd`, `playtest_checkpoints.gd`, and existing integration/checkpoint tests unless explicitly handed off. This prevents E, guidance, construction and pacing workers from overwriting the same seams. Site workers should contribute isolated kit/config modules and focused tests first. No broad edits to the old TypeScript campaign or generated definition JSON without identifying and reserving its authoritative generator.

## Required verification matrix

1. **State and reward authority:** real actions refuse wrong order, wrong site, out-of-reach/occluded/stale controls and unfinished instruments. Reward and objective calls independently enforce their gates. Repeating a control/pickup or reopening the menu is harmless. Both members of shared activities stay individually collectible.
2. **Migration:** pre-polish save, each legacy partial step, unfinished arbitrary calibration values, solved uncommitted values, completed activity with one unclaimed reward, earned reward with absent activity, route-granted isolator, completed/ending campaign, invalid version/ID/order and repeated round trips. No new story fact or journal is invented.
3. **Physical path:** walk from Nomad across the gangway to every required control and back through ordinary movement input. Test capsule and camera clearance, not just point samples. No ground-boundary recovery should occur on the intended route. Direct point teleportation may support state tests but cannot substitute for this evidence.
4. **Motion/lifecycle:** stand inside each sweep/final volume, open/close menus, pause, move out of reach, return aboard, attempt save, load a different checkpoint and restart the same one while motion is pending. Last committed progress survives; geometry settles/restores safely; no invisible blocker or stale callback remains. Teardown after every site and repeated configure/load cycles leaves bounded actors/colliders/resources.
5. **Resource/route safety:** empty pack and zero optional equipment at each site still allow completion; legitimate prior story facts remain necessary. Both Orchard and Meridian routes retain their record/objective differences. Optional sites, route radar unlock after Array, later hardware discoveries and construction gangway protection still work.
6. **Native presentation:** inputs reach the local site panel, closing it restores player control, and the personal wrist never becomes a remote machine controller. Controls are legible at the existing 1440×900 and 1200×900 review sizes. Photographs or wide debug cameras supplement, never replace, normal player-view inspection.
7. **Journey evidence:** P records active interaction versus traversal and waiting without double-counting pause/reload; G presents one reachable next target and correct refusals. C05 evaluates enjoyment/readability with an uninterrupted run; checkpoint success alone does not establish expedition pacing.

Existing suites to retain/adapt: `story_polish.gd`, `playtest_checkpoints.gd`, `integration.gd`, `later_expeditions.gd`, and the native wrist/menu, save and workshop traversal regressions identified by C01. Tests use isolated save directories and `test_mode`; never overwrite the user's campaign or terminate a live play session to collect evidence.
