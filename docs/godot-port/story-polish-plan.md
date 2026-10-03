# Native campaign polish — implementation plan

Scope: the existing single-player campaign, its five destinations and ending. Preserve Three.js, current combat balance, the scanner cinematic, physical refuelling/helm and radioactive-ground boundary. Native saves must remain loadable. No new resource grind or survival mode.

## 1. Journey direction and pacing

- J1 — Add a native journey service with bounded, prioritised transmission queue. Persist delivered message IDs; never repeat arrival/reward transmissions after reload. Pause delivery during cinematics, menus, death and attacks; expire obsolete destination messages.
- J2 — Author departure, docking and discovery text for all five existing stops. Explain the practical purpose of the reward using established story facts; do not invent voiced characters or additional plot branches. Display speaker, caption and a quiet radio chirp. Archive delivered transmissions in Records.
- J3 — Show a concise load recap and a current-destination brief in Signal. After two minutes without an objective change, optionally offer one useful contextual reminder. Reset reminders on progress; expose a setting to disable them.
- J4 — Protect a short, bounded quiet interval after a major journey transmission from *random* boarding escalation. Scripted routes, initial boarding and the 100% scanner cinematic keep their existing schedule. Record elapsed and distance evidence in testing; do not claim accelerated tests are a full playthrough.
- Acceptance: save/load does not repeat key beats; hints respect settings; menus/cinematics do not consume caption time; the next task is visible even if a transmission was missed.

## 2. Five destination activities

- D1 — Shared activity controller: serialisable partial progress, locally operated controls, readable instructions and feedback. Validate destination, docking, proximity, threat and existing story prerequisites on every action, not merely when opening the panel. No consumable cost, time limit or permanent failure.
- D2 — The Wake: safely release the gyro in order (isolate feed, arrest rotor, release cradle). Wrong order explains the missing step without wiping progress.
- D3 — Relay Foundry: route a limited three-unit supply to the recovery and tracking circuits; disconnect the idle furnace. Display allocation and overload explicitly before committing.
- D4 — Quiet Array: tune three relay channels to a visible calibration trace. Show target ticks and received coherence; keyboard-accessible sliders and a separate lock action. Keep the existing journal prerequisites.
- D5 — Glass Orchard: restore each existing isolator through grounding, bypass and energising. Retain the route's already-restored isolator. Illuminate completed isolator instruments and preserve the existing seed/archive gates.
- D6 — Meridian: verify the archive, synchronise the transmitter and confirm the bearing using recovered components. Preserve existing records, archive requirements and ending checkpoint.
- D7 — Decorate existing interactable anchors with compact Blender-built instruments. Fit within existing machinery footprints; do not introduce obstructions across elevated walkways. Existing completed saves bypass already-earned rewards; unfinished interactions persist.
- Acceptance: every chapter is completable through real controls; leaving a console prevents remote completion; failed attempts never duplicate rewards; old completed chapters never become locked again.

## 3. Combat readability

- C1 — Use distinct labelled visuals for Revenant windup and Bastion vent exposure. Reflect existing state transitions exactly; preserve attack durations and damage calculations.
- C2 — Add brief armour-hit / exposed-hit / elimination feedback based on actual damage outcome, with different colour and text so colour is not the only cue.
- C3 — Display the incoming grapple side and deck context while a hook is active. Remove warnings when the hook is cut or the ship retreats.
- C4 — Pool positional enemy shot, grapple and footstep sounds with bounded range and gain. Reuse existing sound assets and keep the machine's quiet ambient mix. No per-frame audio allocations; cap concurrent spatial voices.
- Acceptance: combat definitions remain unchanged; cues cannot reveal inactive enemies; UI clears after death/load; muted audio stays muted; warning text agrees with live grapple state.

## 4. A machine that reflects the journey

- P1 — Keep existing helm actuator/governor upgrades. Add an archive instrument beside the receiver and a compact preserved-seed terrarium mounted to existing hardware. Use independently named Blender parts so rewards control visibility rather than duplicate models.
- P2 — Physical progress changes only when its real campaign fact is earned. Give each chapter reward an entry explaining what became available. L–12's optional reactions acknowledge machinery, records and seeds without adding quest gates.
- P3 — Build a detailed, bevelled instrument kit: wrist casing, gyro panel, power router, array tuner, isolator and archive instruments, seed terrarium. Bolts, sockets, recessed screens, mounting plates and material contrasts should make their function legible.
- P4 — Save editable Blender source, reproducible builder, optimised GLB and a rendered contact sheet. Merge static geometry by material within named components. Inspect renders and native placement; keep assets original and self-contained.
- Acceptance: unlocked physical equipment persists, is anchored rather than floating and does not block stairs; inspecting it agrees with the campaign's actual reward state.

## 5. Wrist terminal usability

- U1 — Responsive electronic frame, clear page headings and restrained cyan/amber status hierarchy. Use Blender-authored physical wrist hardware; use native Godot Controls for readable, scalable interactive text rather than baking controls into images.
- U2 — Three-deck equipment schematic: selectable markers, player location, selected piece health/power/deck, service action and locate action. Label orientation and stairs; use actual structure positions and deck heights.
- U3 — Build catalogue category filters and persistent favourites. Keep material cost, unlock state and placement controls visible. Preserve aimed placement, rotation, attack cancellation and move/storage semantics.
- U4 — Research/attachment comparisons: show current effects versus candidate effects and costs, while retaining the existing powered-station, completion and fit/remove validation.
- U5 — Signal brief, transmission history, progress manifest and console activity page. All actions must remain keyboard accessible and closing a menu must suppress accidental firing.
- Acceptance: no horizontal clipping at 16:9 and 4:3; long labels wrap; deck selection uses real structure data; blocked service/build/research actions cannot bypass their existing rules.

## Delivery and verification

Order: shared state/validation and assets → journey/activity logic → feedback/progress → terminal integration → regression checks and visual review.

Tests: retain native integration, input parity, traversal and audit suites; update campaign fixtures to solve new activities rather than skipping them. Add targeted checks for activity persistence/range/order, old-save compatibility, transmission idempotence, optional reminders, physical reward states, spatial audio bounds and terminal filters/map selection. Run GPU captures of the terminal and physical kit, inspect them and address visible defects. All automated saves use isolated test directories. Document results and any remaining manual-play limitations; do not claim a complete normal-speed campaign playthrough from fast-forward tests.
