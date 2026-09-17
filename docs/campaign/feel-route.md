# Sustained campaign feel route

`tools/campaign/feel-acceptance.mjs` is a repeatable normal-input observation route for a saved campaign. It clones the selected browser profile into a new run directory, opens the game at the selected quality, clicks **Continue**, and drives the player with keyboard movement, mouse look, ordinary firing during observed threats, and a pause/resume check. The source profile is never opened for writing.

Run it from the repository while the local game server is available:

```powershell
node tools/campaign/feel-acceptance.mjs
```

The default is a 1,800 second run at 1280×720, high quality, and port 5205. The runner keeps every attempt, including failures, under `test-results/feel-acceptance/run-<timestamp>/`. The important files are `report.json`, `final.png`, periodic sample JSON files, and any short `audio-*.webm` recordings that the browser can produce.

Use environment variables to choose the input profile and route length:

```powershell
$env:MMF_CONTINUITY_PROFILE = 'test-results/continuity-meridian/run-.../browser-profile'
$env:MMF_FEEL_SECONDS = '1800'
$env:MMF_FEEL_QUALITY = 'medium' # medium or high
$env:MMF_PORT = '5205'
$env:MMF_SITE = 'http://127.0.0.1:5205/'
node tools/campaign/feel-acceptance.mjs
```

If `MMF_CONTINUITY_PROFILE` is omitted, the runner uses the accepted ending profile at `test-results/continuity-ending/run-2026-09-15T18-11-26-503Z/browser-profile`, then searches the newest `test-results/continuity-*/run-*/browser-profile`. Set the variable explicitly when comparing a particular saved profile. `MMF_ASSET_ROOT` can point at a local build directory when the route needs the same archived graphics override used by the other campaign diagnostics. The page is opened without `nosound=1`, so the normal audio path is enabled. Set `MMF_FEEL_BUILD=1` to permit one small, UI-driven build attempt when the sampled game reports sufficient scrap and no active threat; the default skips this optional action.

The route cycles the upper engine gap, west and east bows, cabin approach, and both directions of the upper/middle stair corridor. It reads the current deck height before each cycle and uses the existing stair approaches at `z=2.8` and `z=-2.7`; each ascent or descent is confirmed by the live player `y` crossing the deck boundary. It does not attempt to cross permanent middle-deck machinery. Each section gets a first-pass screenshot. A failed walk, unavailable panel, or missing threat remains a failure in `report.json`; the harness does not infer traversal or combat coverage from elapsed time. The normal route is allowed to continue after a waypoint failure so a later cycle can still provide useful evidence.

The report samples frame deltas and calculates whole-run p50/p95/p99 using a 0.1 ms histogram, maximum and counts over 33/50/100 ms. It retains at most 12,000 raw intervals. It also records player and camera positions, desired camera position, chest/head projection, renderer memory, threat phase/lane/distance, active threats, health, audio readiness, damage sources, build removals, combat/recovery timings, and runtime errors. Earlier packets predate the explicit player projection and distance fields; their enemy projections do not prove player framing. Sampling and event listeners observe the live runtime only. No save state, health, inventory, time, position, collider, or threat state is changed by the harness. Screenshots and diagnostic recording can add measurement overhead.

The cloned profile's stored settings and binding overrides are retained by default. The report records settings and effective FOV and performs one ordinary shoulder swap through the stored `play:shoulder` binding (default `KeyV`). Quality uses the normal URL option. Optional `MMF_FEEL_FOV` and `MMF_FEEL_SENSITIVITY` prepare local preferences before boot for boundary checks; no game setter is called. Optional `MMF_FEEL_WIDTH` and `MMF_FEEL_HEIGHT` choose the viewport. The movement driver accounts for the effective sensitivity.

For audio diagnostics, the page attaches a `MediaStreamDestination` to the existing `AudioEngine` master and records engine/deck, route, combat when a threat is observed, and pause when available. The historically named `audio-indoor.webm` covers the entire first route, including open deck; it is not an isolated room recording. The tap leaves source gain unchanged and is disconnected after capture. Browser or headless MediaRecorder support may be unavailable; that result is recorded with a reason rather than treated as proof that the mix is silent. Run `node tools/campaign/audio-mix-report.mjs <run-directory>` for unnormalized WAV review copies and peak/RMS/clipping/silence metrics. These measurements do not replace listening.

The harness is intended for bounded feel evidence, not an automated gameplay score. It does not promise a specific enemy spawn, damage event, stair transition, build placement, or renderer memory field. Review `coverage`, `runtimeErrors`, `frameSummary`, and the artifact list together before describing a run as successful. The default runner uses Chromium with the same D3D11 and GPU flags as the existing campaign diagnostics; root owns the single-GPU/browser execution decision.
