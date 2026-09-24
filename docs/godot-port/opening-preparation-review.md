# Responsive opening entry

The native New Campaign action blocked the main thread for **589.359 ms** while loading and assembling the rooftop, Warden and Revenant. The corresponding first frame lasted **616.471 ms**. This was reproduced from the actual paused title after three seconds of warmup, with no screenshot readbacks.

The opening now prepares those same three resources in the background while the title/settings/library remain usable. One hidden scene part is assembled per frame on the main thread, with disabled actor processing and a render opportunity before activation. New Campaign reuses these nodes. A click before preparation finishes shows a cancellable loading page while simulation remains paused. No chase, shot, explosion, landing, camera sample or story duration was changed.

This uses Godot's documented [background loading and hidden-instance pipeline preparation](https://docs.godotengine.org/en/stable/tutorials/performance/pipeline_compilations.html). The measured improvement is removal of synchronous resource loading/assembly from the button action; the evidence does not attribute all earlier hitches to shader compilation.

## Native comparison

RTX 3070, 1920×1080, high Forward+/Vulkan, 4x MSAA, VSync off and a 60 FPS cap. Before/after tests wait three seconds on the paused title, then run the complete existing opening and its first playable seconds. Both tests perform no image capture. Source baseline: `f1df64a`.

| Measurement | Before | Prepared opening |
| --- | ---: | ---: |
| New Campaign action CPU | 589.359 ms | 2.903 ms |
| Frame median | 16.664 ms | 16.663 ms |
| Frame p95 | 16.782 ms | 16.795 ms |
| Maximum frame | 616.471 ms | 18.834 ms |
| Frames above 25 ms | 1 | 0 |

Both robot explosions and the 10.2-second handoff completed. This is an entry-hitch improvement, not a claim that average FPS increased: the comparison is capped at 60 FPS. Timing, event and pipeline evidence is retained in [opening-performance.json](results/opening-performance.json).

The separate immediate-click run returned from the button action in 0.450 ms. The first opening frame arrived 691.902 ms after the click; its loading UI remained available for cancellation. Maximum frame time **during the opening** was 19.060 ms. That run still includes four startup frames above 25 ms while the opening is pending, with a 184.005 ms maximum. The preparation does not eliminate engine startup work or promise instant loading on every PC. Unfinished-opening save restores retain a synchronous complete fallback because they do not necessarily have a title preparation interval.

## Independent travel trace

A fresh 65-second uncapped actual-travel trace on the baseline, including rotating the camera and an autosave, did not reproduce the older intermittent gameplay stall. After ten game seconds, 14,739 measured frames have a 3.588 ms median, 5.145 ms p99 and 7.082 ms maximum. The maximum instrumented main tick in that interval was 2.489 ms; the autosave request took 0.122 ms within a 0.627 ms main tick. Seven slow frames occurred only in initial rendering. See [travel trace summary](results/travel-september24-summary.json).

This narrows the evidence; it does not prove that the previously observed isolated 30–190 ms stalls are fixed. It also is not a full-campaign, cold-driver-cache or lower-end-hardware performance result.

## Behaviour and lifetime validation

The focused suite covers immediate/repeated New Campaign clicks, Escape cancellation, preparation while Settings is open, unchanged campaign state/RNG, no hidden physics obstacles, original actor scales and timeline samples, both explosions, handoff, rooftop departure, loading a different campaign during an outstanding request, unfinished-opening saves, starting a new campaign from an existing session, and shutdown while a loader request is active. Cancellation cannot start an old scene after its resources arrive. Completed or superseded preparation stops processing and releases its unused scene nodes; resources use the existing shared asset cache.

**449 assertions pass:** opening handoff 32, integration 108, parity/navigation audit 132, playable parity 58, crossfire preparation/handoff 65 and rendered camera clearance 54. Final import and those test/profile logs contain no Godot errors or warnings. Tests use isolated save directories and the existing settings-write protection. [Focused results](results/opening-handoff.json) are committed; full logs remain in ignored `test-results/godot-native/`.

Run from the repository root in PowerShell:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/opening_handoff.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/opening_profile.gd -- --label=current
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/opening_profile.gd -- --label=immediate --title-seconds=0
```

Add `--captures` to the last test's user arguments for a visual review; do not mix its timing with capture-free measurements.

## Continuing visual work

The native [chase capture](previews/opening-prepared-chase.png) confirms the existing set and actors. Reviewing later shots also exposed [poor rooftop-wall framing](previews/opening-wall-framing.png): after the jump, the wall occupies much of the view and obscures the action. This pass preserves the existing camera samples and rooftop geometry. Improving that framing and the simple rooftop fixtures is a concrete next target within the existing story. Adjacent machine pressure fittings and the broader intermittent-stall investigation remain open. The overall enhancement goal remains active.
