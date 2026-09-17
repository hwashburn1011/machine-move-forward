# Feel, pacing and earned campaign detail

This iteration gives ordinary threats and radio boarding raids one quiet/warning
schedule, makes earned navigation hardware and preservation choices visible on
the Nomad, and adds repeatable sustained-play diagnostics. It includes the pending
[campaign library and workshop work](library-workshop-delivery.md). No chapter,
ending, enemy roster, weapon statistics, movement speed or combat reward was added
or changed.

## Implemented tasks

| Area | Delivered work |
| --- | --- |
| Feel | Prepared boarding crew reuse, skeleton ownership cleanup, normal-input sustained route, audio capture/metrics, and emergency-fuel HUD spacing. |
| Pacing | Shared ordinary/radio director; Story/Survival quiet intervals; one warning before approach; transactional scene start; legacy delay migration; saved deadline and route-queue preservation. |
| Cohesion | Original Blender actuator, calibration unit, Meridian cartridge and heading needle on the existing Helm; record, seed and core exhibits on the existing keepsake shelf; descriptions tied to actual discoveries. |

Sol refined and reviewed the contracts; Luna handled bounded implementation and
diagnostic tasks. Astra authored the Blender kit and integrated/reviewed the final
runtime changes. The [task plan](../superpowers/plans/2026-09-16-feel-pacing-cohesion.md)
preserves the original design and proposed validation matrix.

## Encounter behavior

| Profile | Recovery after resolution | Subsequent calm | Warning distance |
| --- | ---: | ---: | ---: |
| Story | 250 m | 400–1,100 m | 140 m |
| Survival | 200 m | 300–800 m | 140 m |

Both encounter lanes use these distances. Low speed lengthens the real-time
breather; stopped distance does not spend it. Existing health, panel, destination,
sanctuary and encounter-ownership checks remain authoritative. A warning held by an
unsafe state is not repeated. A rejected spawn returns to recovery without
announcing a battle that never started.

Old saves preserve their current absolute deadline. Their positive legacy radio
delay drains once under the existing safety rule; completed new raids no longer
create an independent second timer. A lane change waits for an active encounter to
finish and keeps queued scripted route vehicles. An unfinished ordinary wave is
still released correctly if the story requests radio mode during its contact phase.

## Physical campaign memory

The [editable Blender kit](../../assets/progression/README.md) is original project
art. Its optimized GLB is 2,095,380 bytes and 30,704 triangles for the entire kit,
with zero glTF errors or warnings. The number includes mutually exclusive exhibits
and hardware hidden until earned.

Existing recovered facts drive each part independently. The needle follows actual
heading, and emission follows Helm power. Selected known journals show a record
cassette; the human seed bank shows sealed seed samples; ANNIKA/Orchard memories
show a protected core. Clearing the selection hides the physical exhibit. The
objects add no save owner, physics, resource, bonus or interaction menu. Existing
Campaign Record and Home Life state remain authoritative, including relocation
and save restoration. Missing art keeps the original functional Helm/shelf.

![Earned Helm hardware and shelf exhibits](../../assets/progression/previews/progression-kit.png)

## Evidence and limits

The full local suite passed **184 files / 1,659 tests**, followed by clean ESLint,
TypeScript, production build and both new GLB validators. The build retains its
existing large-bundle advisory.

The High 1280×720 run completed more than 1,800 sampled simulation seconds,
67 route cycles started and 801 reached waypoints. It recorded no runtime errors
or blocked route; the old harness retained its scheduled time-limit exit as one
raw driver exception. Across 106,748 frame intervals, p50 was 16.7 ms, p95 16.8 ms,
p99 33.3 ms, and the longest was 266.7 ms. There were 95 intervals above 50 ms and
18 above 100 ms. Occasional stalls remain.

Five boarding encounters resolved. At normal loaded speed, warning-to-engagement
took approximately 20.25 seconds and recovery-to-calm 36.13 seconds. After fuel
depleted normally, emergency crawl stretched those intervals to approximately
101.21 and 180.71 seconds respectively. This verifies that the pacing follows
travel distance in the real game rather than an independent raid timer. Health
changed from 62 to 49 through ordinary combat; the harness did not replenish it.
Renderer geometry/texture counts warmed from 530/672 to 573/675 and remained
stable through the latter part of the run; this is not a census of all owners.

A separate three-minute **Medium 1920×1080** route used the maximum 80° hip FOV
and 3× sensitivity, including the normal shoulder-swap binding and stair traversal.
It completed without route or runtime errors. Across 11,444 frame intervals,
p50/p95 were 16.7 ms and p99 was 16.8 ms; the maximum was 100.1 ms. This is a
different-quality boundary check, not a before/after comparison with High.
The separate camera matrix passed 11 captures, covering both shoulders in hip and
aim views at the galley and middle stair mouth, with normal descent and ascent.
No camera/control production change was needed for those cases.

The normal-input cohesion run passed **41 checks**: approach/use the earned Helm,
build a shelf for exactly five scrap, select Record/Seeds/Core, clear it, leave
Core selected, commit real Save & Quit, then cold Continue. Inventory, recovered
facts and selected shelf identity matched. Earlier failed attempts remain as
driver evidence: one walked into the back of the Helm, one tried obstructed build
targets, and one demanded overly precise camera alignment while the correct shelf
was already highlighted. The passing route uses the clear aisle and validates the
actual placement preview and visible exhibit.

The fuel hint now preserves its line break through key-label formatting. Machine
and maintenance cards share a vertical layout with a 16 px gap, allowing the first
card to grow naturally. The DOM/CSS check measured the same gap with the hint both
hidden and expanded; a fixed offset had still overlapped by 1.48 px.

Captured engine/deck output measured −50.43 dBFS RMS and −36.57 dBFS peak; combat
measured −33.46 dBFS RMS and −8.09 dBFS peak. All four clips contained zero decoded
samples at the clipping threshold. The pause clip stayed below −60 dBFS for its
entire captured tail. Source levels are preserved in the review files.

The final measured packets and checks are listed in the accompanying
`feel-pacing-cohesion-validation` directory. Raw browser profiles, full route
reports and intermediate failures remain locally under `test-results` rather than
being published as player saves.

The sustained route uses ordinary Continue, keyboard movement, relative mouse
look, aiming, firing and reloading, with normal damage and costs. It grants no
resources, teleports no player, and does not accelerate simulation. It repeats a
known upper-deck/stair corridor; it is not a human playthrough of every room,
weapon, mission or difficulty. The source profile is cloned before use.

Frame measurements are local instrumented Chromium/D3D11 samples on an RTX 3070
and i9-11900KF. They include diagnostic screenshot/recording overhead and are not
a promise of locked 60 FPS on all midrange computers. A baseline run used an older
middle-deck route that crossed machinery, so its timeouts remain driver failures
and its aggregate timing is not an identical-route improvement benchmark.

Focused regression coverage includes 30/60/120/144 FPS input cadence and
catch-up frames (`camera-input`), both profiles and encounter lanes
(`threat-pacing`, `threatdirector`, `game-threat-pacing`, `radio-raids`), warning
ownership (`owned-warning`, `hud-warning`), saves/build moves/sanitization
(`home-life`, `buildrestore`), and 100 owned-emission lifecycle cycles
(`progression-visuals`). These tests complement browser evidence; they do not
claim hundreds of rendered encounters.

Audio reports measure actual captured output without normalizing it. They can
establish level, clipping and paused silence. **Human listening was not performed
by this automation.** The retained clips support a later headphone/speaker check
of fatigue, masking, warning clarity and reload cues. The broader proposed matrix
of every weapon, eight-enemy combat and two complete encounters in every lane and
profile is not inferred from elapsed test duration.

Reproduce the bounded diagnostics with [the feel route instructions](feel-route.md),
`tools/campaign/cohesion-acceptance.mjs`, and
`tools/campaign/inspect-interior-camera.mjs` (`MMF_CAMERA_MATRIX=1`).
