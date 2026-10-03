# Progression, Patchcoat, and Gatekeeper

Historical delivery record. The subsequent [machine spaces and quiet information iteration](machine-spaces-audio.md) changes the deck layout, placement safety, sound and information presentation, including removing the floating combat captions described below.

Native Godot iteration, 2 October 2026. Status: first playable delivery implemented and verified. The [delivery plan](../superpowers/plans/2026-10-02-beta-progression-ownership-combat.md) records the three agreed priorities and remaining acceptance gates. [Consolidated evidence](results/beta-next-2026-10-02.json) retains the exact frozen source and asset hashes.

## Campaign flow

Opening guidance now follows actual owned components and the next workbench/module cost. Recovered components count immediately. A lifetime refining total no longer sends a player toward a purchase they cannot afford or asks them to refine unnecessarily. A carried scanner module still takes precedence.

At the physical helm, **Fuel & journey preparation** shows tank endurance at the current running-generator load, owned reserve fuel, and operating advice. It does not spend supplies, change operating modes, or promise that a transit estimate includes combat and exploration. Docked mode remains an explicit engineering choice and restores the previous operating plan on departure.

The existing radio queue explains optional crane repair, the earned Salvage drone dock, conserving fuel while docked, and Patchcoat tools. L-12 acknowledges relevant work only when actually recovered. Advice is checked again before display so a completed repair does not leave stale instructions waiting in the queue.

## Collect, restore, personalize

Ordinary unopened salvage cargo can contain **Recovered finish parts**. The hand reel, repaired port claw, and utility drones share this reward path. The added item uses no extra gameplay random draws. Full-storage handling retains the unclaimed contents under the existing cargo rules.

1. Repair the receiver normally, recover three finish parts, and approach an owned workbench.
2. Choose **Restore Patchcoat tools**. This optional transaction consumes three parts and six scrap once.
3. Build an ordinary **Paint trolley** from the existing furnishing catalogue and interact with it.
4. Select an owned furnishing, generator, cargo-locker enamel, or workshop-bench enamel. Compare the fourteen muted finishes in the console's isolated model preview.
5. Apply a changed finish for two scrap. Preview, cancellation, and choosing the already-saved finish do not charge. Returning to the original finish is an ordinary repaint.

Labels, bare metal, rubber, weathering textures, geometry, and collision remain intact. Finishes belong to the selected instance; moving, saving/loading, and reconstruction retain them. Existing furnishing blueprints remain available before tool restoration.

Three optional keepsake projects give an already-owned radio cabinet, memory board, or field chair a named finish. Each costs one recovered finish part and four scrap, including paint, and can be completed once. They are cosmetic ownership rewards; they do not add radio, healing, or navigation abilities. Completed project history remains after dismantling the keepsake.

Equipment service panels now expose **Relocate equipment**. Ordinary construction reach, support, clearance, combat, and undo rules remain authoritative. Canceling leaves the part in place. Fixed structural machine meshes are not detachable.

## Enemy intent and Gatekeeper G-01

Existing enemy controllers retain their damage, drops, navigation, and animation roles. Direction marks and concise captions describe committed ranged fire, Revenant lunges and recovery, Bastion spin-up/venting, Sovereign shield support, and sabotage/theft intent. Transition sounds use the existing bounded audio voice pool.

Gatekeeper keeps its original hull health and alternative solutions. New relay, identity, pressure, and shutter hardware fit the existing carrier. Its fire-control shroud opens with the real cooling vulnerability. Ground warning geometry matches the actual impact radius.

The original line salvo teaches the encounter. After two completed cycles and damage below half hull, an alternating five-point cross salvo gives a longer lock, warning, and cooling window. Disabling the engine still extends cooling. Death receives a fresh lock window; disabling the gun or disrupting tracking cancels marked shots.

Destroying, disarming, or evading Gatekeeper through its legitimate encounter lifecycle records the first outcome once and unlocks the **G-01 service mark**. After restoring Patchcoat tools, apply or remove this small locker stencil at the paint trolley for no material cost. Evasion does not award destruction cargo.

## Compatibility and acceptance

Native save format remains version 1. Old saves default to original finishes, unrestored tools, and no invented guardian outcome. Validation rejects unknown palettes, unsupported piece finishes, inconsistent project receipts, duplicate attached keepsakes, or an unearned service mark before replacing the live session. All tests use isolated saves.

The earned-supply actor runs at normal simulation speed with damage enabled, collects spawned cargo through the live hook, walks supported routes, and performs paid production transactions. Its reached API actions and programmatic aiming are recorded; it is an automated actor, not an uncoached human playtest. Prepared checkpoints and funded furnishing stress fixtures are used only for their stated correctness/rendering workloads.

Still required for complete V1 acceptance: uncoached story-comprehension and difficulty playtests, uninterrupted later-campaign economy/pacing, broader player-built drone routes, and representative lower-spec hardware testing.

## Verification

The frozen runtime passed 10,951 checks across 27 affected suites. The first combined pass exposed five outdated or incomplete test contracts: the trolley's new functional description, the changed sword caption, resource metadata comparison, the added title warm-up stage, and cold-load/shutdown handling in the guardian fixture. Corrected tests retain their original behavioral checks; the resource comparator adds six checks for shared materials, changed properties, and malformed containers. Their targeted rerun produced no engine diagnostics. Initial logs are retained alongside final evidence.

Forty-two native views were inspected across the paint/workbench/helm screens, representative original/painted models, service mark, enemy tells, and Gatekeeper hardware/attack states. Both 1440×810 and 1200×675 paint screens contain the whole preview and Apply control without scrolling. These are agent-inspected native renders, not human usability acceptance.

The continuous earned-supply case completed the opening through Wake in 486.148 seconds of wall time and 438 seconds of active simulation. It walked 165.12 metres through ordinary input, paid the opening's 228-scrap bill, used the full scan duration, survived the first defense, read all three Wake records, recovered the gyro, and departed. Remaining supplies were 90 scrap, 8 carried fuel and 33.72 tank fuel; player health was 52 and engine health 320. The tutorial carrier retreated alive, so no destruction bounty funded this run. Three saves succeeded, source/art inputs remained unchanged, and personal saves were untouched. This default-seed case rolled a 58-scrap first crate; lower-yield seeds and exploratory human dwell remain untested.

Separate save profiling used synthetic 2-, 300- and 900-piece homes. All serialized campaigns restored their finishes. Median main-thread autosave request time was 0.12, 1.091 and 3.582 milliseconds respectively; the 900-piece maximum was 3.814 milliseconds. Worker completion is asynchronous; its 900-piece median wall time was 48.315 milliseconds.

Fifteen sequential native rendering workloads completed at 1920×1080, High Forward+ Vulkan with 4× MSAA, uncapped and VSync off, on an RTX 3070 / i9-11900KF. Thirteen repeat the previous 18-second scenarios, one exercises the later Gatekeeper pattern for 45 seconds, and one runs all 50 furnishings with independently painted materials and three powered drone docks for 180 seconds. The worst 95th-percentile frame time across these workloads was 8.152 milliseconds. One construction frame took 35.326 milliseconds; there were no frames above 50 milliseconds or engine diagnostics. These are prepared workloads with an invulnerable actor, not whole-game or lower-spec certification.

The first crowded home fixture held cargo at obstructed landing pads. Its failed workload is retained under `test-results/beta-next/performance/blocked-home`. The corrected fixture retains all furnishings and uses legal pads with clear cargo space; it recovered 361 item units, with a 6.130-millisecond frame-time 95th percentile and a 13.122-millisecond maximum. World chunks stayed at 27; the collision-shape cache warmed to 32 and stayed there for the last minute. Static memory peaked at about 300 MiB and renderer-reported video memory stayed near 2.07 GiB during this sample. This establishes the tested clear-layout workload; cargo landing clearance in arbitrary player builds remains a placement-usability concern for the next iteration.

The user has queued two follow-ups after this delivery: a purposeful three-deck machine layout with guided major-system installation and protected circulation, then a calmer audio mix, intermittent ambient music, and information presented through credible machine/wrist-terminal sources.
