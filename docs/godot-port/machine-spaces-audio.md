# Machine spaces and quiet information

Native Godot iteration, 2 October 2026. This follows the verified [progression, ownership, and combat delivery](beta-progression-ownership-combat.md). The [implementation plan](../superpowers/plans/2026-10-02-machine-spaces-audio.md) records the scope. This iteration is implemented and verified; [the frozen completion report](results/machine-spaces-audio-2026-10-02.json) contains the evidence and limits.

## Living aboard

The fixed dressing is reduced from twenty-four assemblies to ten. The upper generator, locker and drum form a supply group; the middle deck keeps edge maintenance benches, a paired pressure manifold, one drive pump and two engineering cabinets. One supply chest remains below. The rest is deliberately open. Functional machinery, stairs, helm, receiver, and player-built structures stay intact. The old props' collision is removed along with their visible meshes.

Ordinary furniture, storage, workbenches, refineries and generators can stand on any of the three permanent decks without first buying another floor. Multiple ordinary stations remain allowed. New and moved construction must have support, avoid solid machinery, preserve reachable stairs/controls and the player's exit, and leave drone launch and loaded-cargo landing space clear. A real doorway can keep an enclosure accessible. Access checks run in small frame budgets; placement waits while a cold check is pending.

Three recovered modules use physical service connections:

| Module | Connection | Build cell |
| --- | --- | --- |
| Quiet-drive | D1 / lower drive deck | `(2, -2, 2)` |
| Battery bank | D2 / middle service deck | `(2, -1, 2)` |
| Freight salvage crane | D3 / upper starboard mount | `(5, 0, -2)` |

These thin, bolted socket plates are part of the permanent machine. Selecting a recovered module guides the build preview to its connection and explains which deck to approach. Its mounting orientation is fixed. Reach, materials, existing progression requirements and ordinary safety checks still apply. The original port recovery claw remains a separate early repair. Drone docks remain freely placeable where their actual loaded flight space is clear; lower decks' overhead structure usually prevents a safe launch.

The recovered drive, battery bank and crane have separately authored Blender models with muted finishes, readable service faces, fitted feet, pipework, brackets and fasteners. At D3, the freight crane extends a physical jib beyond the hull so its cable and held load clear the upper deck. Its real collision and cargo clearance are checked during installation and later construction. Existing cranes away from D3 retain their compact folded shape, cable tip and collision footprint. Grounded heavy pallets now use their own measured dimensions when settling onto dunes.

Old saves retain existing equipment wherever it was built. New placements and deliberate relocations use the connections. Safe undo can restore an unchanged legacy module position without charging again. The game does not delete or silently relocate player construction.

## A calmer soundscape

Rifle and shotgun clips have a rounded attack and more low-mid body, with reduced sharp high-frequency energy and lower playback gain. Three original, finite musical phrases use sparse low keys and lower harmony. Music begins after sustained calm, fades gently, and leaves long intervals with no music. Threats and actual cinematic dialogue fade it away; a silent log entry does not. Pausing holds its timing, and muting/loading cannot unexpectedly restart an old tail. Music has its own Settings slider.

The abstract approach alarm and advance director announcement are removed. Enemy mechanisms use restrained sounds from their actual locations. Committed aim/lunge directions, shell marks, shutters, animations and health indications remain; floating command captions and central encounter banners are gone. Combat schedules, damage and attack timing are unchanged.

For audition: [weapon comparison](../../assets/deck-audio/weapon-comparison.wav) plays old/new rifle, then old/new shotgun; [score excerpts](../../assets/deck-audio/original-score-preview.wav) present the three pieces at default runtime gains. Signal measurements verify levels and waveform quality; they are not a substitute for the player's listening preference.

## Information on the wrist

Open the wrist with the configured Terminal key (Tab by default), then **LOG**. It contains the current course, needed supplies, machine-space guide, recovered story records/transmissions, and local action receipts. Frequent salvage/build receipts have a separate thirty-two-entry history, so they do not displace the sixty-four-entry story archive. Both survive saves; old saves default to an empty local history.

Routine notices are silent and no longer appear across the world view. Explicit menu actions answer inside that page for that particular station, and their explanations remain in the local log. Switching to another workbench cannot inherit the previous bench's result. Loading another campaign clears temporary feedback. Actual dialogue subtitles, aimed/reached interaction prompts, placement explanations and the hit reticle remain available. Field task text and location markers are optional in Settings and default off. Existing explicit preferences are preserved.

Station and construction screens share the S–07 / Linekeeper identity, restrained phosphor colors and a clear source label. Personal pages use the physical wrist screen; reached equipment uses a near-field equipment interface.

## Compatibility and verification

Native save format remains version 1. New local receipts are bounded and validated before restoration. Tests compare every campaign field except the deliberately recorded receipt when an operation fails, and separately verify the exact explanation; failure logging cannot conceal a partial purchase or changed ending state.

This iteration uses isolated saves and keeps prior verified reports separate. Evidence under `test-results/deck-audio` records 36 clean runtime suites with 11,391 checks, another 41 checks of construction against the compiled machine, 39 offline audio assertions, and 59 native visual views. Initial diagnostics remain archived, including obsolete synchronous-placement fixtures, the former warning expectation, and an incomplete exterior furnishing stress layout. The final furnishing workload fits all fifty pieces on the three permanent decks using ordinary access checks.

All sixteen native performance workloads passed on an RTX 3070 / i9-11900KF at 1920×1080 High, Forward+ Vulkan, 4× MSAA, uncapped with VSync off. The worst workload's 95th-percentile frame time was 7.183 ms. One construction frame reached 37.209 ms; no sampled frame exceeded 50 ms and final runs emitted no engine diagnostics. The 180-second home workload included fifty independently painted furnishings and three powered drone docks, recovered over five hundred item units, and entered two musical phrases. Its frame-time p95 was 5.925 ms; streamed chunks stayed at 27 and collision-cache entries at 32 in the final minute. The separate 45-second freight workload completed five real grounded cargo deliveries, and the later Guardian workload exercised a live cross salvo.

These are funded, scripted workloads on this computer, with three seconds of warmup and uncontrolled OS/driver caches. Historical timing comparisons are observational; the furnishing layout changed. They do not establish low-spec performance, perceived audio quality, or complete V1 acceptance. Full later-campaign and human playtesting remain necessary. At this iteration's close, the player requested a further roof-detail pass and moving-camera investigation of flashing machine and visitable-building floors; that work follows this frozen report.
