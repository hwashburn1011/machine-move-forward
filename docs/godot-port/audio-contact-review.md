# Native audio contact, playback and lifetime

Starting revision: `9b7536d`. The character's refined locomotion used displacement-matched strides, but its footsteps still followed a separate 0.48/0.30-second timer. Synthetic cues generated PCM on first use and created a new player node for every call. Normal, spatial and synthesized sounds also handled pause, volume and mute differently.

## Implemented tasks

1. Emit right/left foot-contact events from the existing authored locomotion phase, at 0 and 0.5. Play the existing footfall asset once per contact during supported gameplay. Stop the timer-based path. Preserve the controller, animation clips and their speed/phase calculations. Blocked movement, airborne movement, recovery, menus, forced motion, cinematics and mounted controls cannot reuse a stale stepping timer.
2. Keep footsteps restrained: compensate per-step energy as cadence rises, reduce crouch gain, and alternate pitch by ±2% to soften identical repetition. Shelter/combat attenuation and the existing ambient-volume control still apply. This adjusts presentation, not enemy hearing or gameplay.
3. Prewarm all 12 currently used sound assets and the three existing synthesized recipes at audio setup. Preserve the original WAVs and synthesized PCM recipes. Use eight reusable cue voices alongside the existing 24 normal and 12 spatial voices. Reserve two cue voices for quiet radio notifications. An overloaded impact group recycles its six voices in round-robin order instead of creating more nodes; normal in-game cue rates fit this budget.
4. Apply volume changes to already-playing effects, make zero volume and mute stop every one-shot path, and silence both ambient loops immediately when muted. Unmuting does not replay stale sounds. Pause gameplay effects consistently while allowing the existing console confirmation inside the terminal. Zero gain also covers the pending physics-tick start of a 3D sound before it can acknowledge a pause. Update the whole pool only when pause/volume changes; ordinary unpaused frames avoid scanning it.
5. Release finished voice streams and verify ownership after scene destruction. Isolate the prior shutdown warning with a minimal engine-only reproduction. Let the story test wait for actual mixer-owned stream release instead of assuming four physics ticks provide enough real time.
6. Measure real movement/contact timing and a controlled cue burst; exercise volume, pause, silence, interrupted movement and lifetime; rerun locomotion, physical gameplay, story/UI and crossfire checks.

The machine hum's source, pitch formula, speed response, sheltered/combat attenuation and quiet level are unchanged. At the tested 0.7 master / 0.1 ambient settings, full-speed drone gain remains 0.00084, enclosed gain 0.00042, and the calm pad 0.00021. No rendering assets, gameplay speeds, damage, attack/reload timers, rewards, story content or Three.js code changed.

## Measurements

RTX 3070 / i9-11900KF, Godot 4.7.2, Forward+/Vulkan. A supported diagnostic platform inside the native world permits unobstructed movement. Each gait warms for 30 physics ticks and observes 180 rendered frames at a 60 FPS cap. Baseline footsteps are observed from the actual timer reset; updated footsteps are observed from accepted playback events. The baseline observation can itself be up to a render frame late, so phase error is evidence of the old independent cadence, not a sample-accurate acoustic measurement.

| Movement | Previous median error from nearest contact, cycles | Updated median | Updated maximum |
| --- | ---: | ---: | ---: |
| Jog | 0.1131 | 0.0153 | 0.0241 |
| Sprint | 0.1210 | 0.0207 | 0.0444 |
| Crouch | 0.1090 | 0.0222 | 0.0398 |

The focused controller checks verify each updated event occurs in the physics tick crossing the actual contact boundary, and every supported contact sounds once in forward/backward, strafe, diagonal, sprint and crouch cases. The remaining phase difference is bounded by that tick's advance. These are dispatch/animation measurements; audio-device latency and subjective listening remain separate concerns.

| Cue measurement | Before | Updated final run |
| --- | ---: | ---: |
| First three existing cue calls, total CPU | 5.705 ms | 0.086 ms |
| 200 same-frame, already-cached cue calls | 1.852 ms | 1.719 ms |
| Audio node count before / after that burst | 38 / 241 | 46 / 46 |

An earlier updated sample measured 0.109 ms first use and 1.685 ms for the burst. Synthesis work moves to setup rather than disappearing. The 200-call overload deliberately measures allocation pressure, not a normal combat workload or gameplay FPS. Eight persistent players are the small idle-memory tradeoff. [Baseline report](results/audio-profile-before.json) and [updated report](results/audio-profile-after.json) preserve all samples.

## Shutdown diagnostic

`audio_shutdown_probe.gd` uses only three ordinary engine `AudioStreamPlayer` nodes and newly created silent WAV streams. It loads no game scripts. It plays, stops, detaches and frees those nodes, then waits four physics ticks at a diagnostic fixed FPS of 1200. Those ticks completed in **0 ms of real time**: all three weak stream references were still live, and shutdown reported three WAV/playback pairs. Giving the mixer 120 ms of real time plus main-thread updates released all three and exited cleanly.

This reproduces the warning class independently of the game's sound bank. Similar immediate-exit audio reports exist in the [Godot issue tracker](https://github.com/godotengine/godot/issues/95484); the local probe is the direct evidence for this installed engine. Godot also documents that [stopping a player or leaving the tree does not emit `finished`](https://docs.godotengine.org/en/stable/classes/class_audiostreamplayer.html#class-audiostreamplayer-signal-finished), so explicit exit cleanup remains necessary.

The shared test helper captures weak references in a separate non-suspended function. Otherwise, a coroutine's temporary `bank.values()` array can itself retain all streams and create a misleading lifetime failure. It then permits real mixer time and main-thread updates, with a 500 ms bound, and fails if references remain. The final rendered game teardown released all 17 streams by the first observation at 60 ms. The story suite also passes with deliberately accelerated fixed-FPS teardown. This improves the harness and verifies resource ownership; it does not patch Godot's immediate-exit behavior or insert sleeps into shipping gameplay.

## Validation

**270 checks passed**: audio/contact/lifetime 50 (both native GPU and headless), locomotion 39, native physical-input parity 57, story/UI 59, and scanner crossfire 65. The audio suite verifies silent idle, blocked and airborne states; remnant-free mute/unmute; live volume changes; pending 3D pause; reserved radio playback during overload; finished-stream detachment; and complete graph/stream release. The existing regression suites preserve movement, combat, boarding, camera handoff and campaign behavior. [Rendered audio report](results/audio-lifecycle.json) is retained; full logs are under `test-results/godot-native/audio-*`.

Final game/regression/import logs contain no errors, failed checks or shutdown warnings. The deliberately immediate engine probe is the documented exception and should not be included in a normal green test run. Save directories are isolated and personal settings are not written. Normal-speed full-campaign listening across different audio devices remains outside this bounded sample; this is not a global frame-rate claim.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AudioTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AudioTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AudioProfile
# Engine-only cleanup probe; omitting --drain intentionally reproduces the warning.
test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --verbose --fixed-fps 1200 --path godot --script tests/audio_shutdown_probe.gd -- --drain
```
