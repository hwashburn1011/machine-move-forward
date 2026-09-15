# Campaign progression

The current campaign begins with the Wreck One radio signal, continues through the Relay Foundry, and offers the optional Quiet Array expedition after the Foundry is complete. Quiet Array contains two calibration journals and an independent ANNIKA archive shard; the course actuator is gated by the two calibration readings, while the archive can be recovered on its own.

The powered Helm limits actuator steering to ±12 degrees and throttle to 35–100%. The route uses the actual global X coordinate across three reusable world bands. Three optional physical contacts can appear along the route: water caches, salvage wrecks, and memorials. Rewards use exact partial transfer counts and save their remainder. Unclaimed supplies remain available until an explicit departure.

Approach guidance can be cancelled safely. Expeditions require power and a safe, attack-free commitment; raids pause while the player is docked. The Quiet Array currently resumes the recurring raid loop after departure. Its story presents S-07 as a benevolent AI preserving human records; the fate of humanity remains uncertain.

Glass Orchard and Last Garden are planned future chapters. The full campaign is not complete, and the current Quiet Array implementation has no special ambush sequence or free 360-degree steering feature.

See the [campaign direction](../superpowers/plans/2026-09-14-campaign-direction.md), [refined tasks](../superpowers/plans/2026-09-14-campaign-direction-tasks.md), and [asset pipeline](../../assets/quiet-array/README.md).

## Verification

- [Runtime report](validation/runtime-qa.json): 35 checks, including both signed steering approaches through thousands of real fixed steps, committed save/load, exact partial reward conservation, all three contact kinds, legacy migration, and 100 reuse cycles with stable scene/physics counts.
- [Visual and movement report](validation/visual-review.json): six checks, including 150 real movement steps across the Quiet Array gangway, all authored sites, and the powered Helm with an available contact.
- The 20-second local medium-quality 1920×1080 sample averaged 60.02 FPS, with 12.30 ms p95 render work and no frame intervals above 33 ms. This hardware-accelerated Chrome fixture measures a moving camera in the streamed world; it is not a guarantee for all hardware or an eight-enemy combat benchmark.
- Browser fixtures shorten story setup and directly position review cameras. They are distinct from an uninterrupted campaign playthrough. Screenshots intentionally retain the HUD, which may show the fixture's unrelated tutorial objective.
- All 1,257 unit tests across 130 files passed, along with lint and the production TypeScript/build check. The existing [chapter/tactics browser suite](validation/chapter-tactics.json) passed 52/52 with no runtime errors.

![Quiet Array in the game](validation/quiet-array-overview.png)

![Powered Helm with a route contact](validation/helm-unlocked-contact.png)
