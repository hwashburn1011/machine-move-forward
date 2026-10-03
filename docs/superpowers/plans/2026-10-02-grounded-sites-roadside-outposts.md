# Grounded destinations and roadside outposts

User priorities: every dockable building must reach the desert floor; occasional early roadside towers hold one or two hostile robots; the Nomad naturally passes them, without warning text or alarms; players can return fire; enemy ranged accuracy improves with proximity.

## Delivery

- [x] Extend all loaded destination families through coherent lower architecture to buried foundations. Preserve deck-height entrances, roofs, floor surfaces and interaction anchors. Inspect ordinary optional stops, survivor stops, gear recovery, mission variants, the finale berth and distant architecture as well as the five main destinations.
- [x] Add sparse, seeded roadside encounters with grounded towers, ordinary damageable robots, visible gunfire, bounded streaming and durable guard health. Respect the opening and protected docking sequences. Keep these separate from the boarding director's departure locks.
- [x] Introduce shared physical aim dispersion for hostile ranged fire. Preserve committed aim and existing windup/cadence. Test distance-dependent hit rates, intervening cover and return fire.
- [x] Review low-angle terrain contact, machine-deck views, native walking clearance, title layout and enemy weapon alignment. Fix defects found in these views.
- [x] Run affected regressions and native performance workloads against frozen final inputs. Keep earlier acceptance reports unchanged.
- [x] Regenerate the Windows candidate, audit its packed dependencies, extract and verify its checksums, boot the actual exported executable and run the matching-engine instrumented pack smoke separately.

## Acceptance boundaries

Foundations are static architecture, with enough buried structure to remain seated through the game's existing lateral docking convention. Their additions must not intrude into gangways, stair routes or walking floors. Raised equipment has load-bearing structure beneath it; a roof-shaped building suspended on invisible supports does not pass.

Outpost placement uses journey distance and its own deterministic randomness. Returning to a save must preserve killed guards, and jumping past a new encounter must not create a close ambush. Frequency is sparse enough to leave calm scavenging stretches. Shooting is physical: a sampled ray can hit the player, scenery or nothing. A missing shot does not secretly apply damage, and cover works in both directions.

The earlier Windows build is retained as historical evidence, not the delivery for this iteration. The owner will create the itch.io account/project later. No upload, account creation or public publication is part of this pass.

## Evidence

New evidence belongs in `test-results/site-grounding`, `test-results/roadside-outposts` and a new Windows candidate directory. Native review fixtures and seeded statistical checks supplement, but do not replace, fresh-player feedback. Preserve the completed roof/floor, machine/audio and earlier progression reports.

Completed at source `9ea7a59eeeb3d7c7992fef66454ded495c3525fd509e03d0643d92fc84d13805`. Runtime acceptance: `test-results/site-grounding/completion.json`. Rebuilt package and standalone evidence: `test-results/windows-beta-grounded/completion.json`.
