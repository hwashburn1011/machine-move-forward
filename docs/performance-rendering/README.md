# Character rendering performance pass

This pass removes redundant character skinning work and fixes ownership of temporary GPU resources. Models, image textures, lighting, post-processing, animation clips, and gameplay remain unchanged.

## Changes

- `cloneRig` shares identical skeleton palettes between parts of one cloned character. Bone identities and every inverse-bind matrix must match exactly. Each character still owns an independent rig, and individual mesh bind matrices remain unchanged.
- Enemy meshes reuse one mutable material copy per source material within that enemy. Different enemies retain independent hit flashes and type colours.
- Player replacement, temporary equipment removal, and loaded-model disposal release owned bone textures. Enemy disposal now includes cloned non-flashing materials as well as flashing materials; borrowed asset textures remain owned by the loader.

For the player and eight mechs, 110 skin primitives now use nine palettes. In the measured view, the colour and normal passes together update palettes 18 times per frame instead of 220. The gameplay benchmark's GPU texture object count falls from 644 to 377. These are mainly duplicate bone textures, not resized image textures; the count reduction is **not a measurement of VRAM savings**.

## Validation

- All 1,786 unit tests across 209 files pass; lint and the production build pass.
- Animation tests compare bone matrices and transformed vertices against the original Three.js cloning implementation over 60 poses, including different mesh bind matrices. Results match exactly.
- Four rendered views (combat deck, close character, mech lineup, workshop) have zero changed pixel channels when switching between separate and shared palettes in the same warmed scene. Draw and triangle counts match in each view.
- Tests verify that enemies keep independent hit flashes and that disposal preserves source assets while releasing each owned resource once.
- Ten browser cycles create, render, and dispose an additional player visual and enemy visual. GPU texture count returns from 379 to 377 every time; geometry count remains 470. This verifies the tested lifecycle, not every possible game resource lifetime.

## Gameplay measurements

Chrome using the RTX 3070 through ANGLE/D3D11, 1920 × 1080, DPR 1, High quality. Production builds; seed `smoothness-review`; automatic spawning disabled, with eight mechs added for the crowded scenario. The player is invulnerable for measurement. The existing harness records CPU profiles, which add some overhead.

| Scenario | Before: mean render CPU | After: mean render CPU | Reduction |
| --- | ---: | ---: | ---: |
| Deck | 4.35 ms | 3.82 ms | 12.1% |
| Rapid mouse turning | 4.44 ms | 3.70 ms | 16.6% |
| Eight mechs and rapid turning | 6.17 ms | 5.72 ms | 7.3% |

Each final scenario runs for 15 seconds. Both builds reach the display's 60 FPS ceiling; the improvement is additional rendering headroom, not an increase in displayed FPS. The final run records no frames over 25 ms. Live enemy positions and scenery visibility can vary between runs, so these figures do not isolate the rig change by themselves. The same-scene comparison in `rig-comparison.json` isolates palette sharing with an A/B/B/A render sequence.

In that controlled comparison, each sequence has 60 warm-up frames and 120 measured frames. Averaging both runs per variant, render CPU time falls from 7.38 to 6.39 ms (13.5%), and WebGL timer-query GPU time falls from 9.64 to 8.79 ms (8.8%). These results include post-processing and identical draw/triangle counts, with simulation stopped. Timing varies between runs; the exact palette-update reduction is the more stable measure.

An additional three-minute run starts at 3,000 metres and tests each scenario for 60 seconds. Deck movement and rapid turning average 60 FPS with no frames over 25 ms. Crowded combat averages 59.88 FPS, with seven frames over 25 ms, none over 50 ms, and a maximum of 33.4 ms. The 99th percentile frame time is 16.8 ms in all three scenarios. No browser errors were recorded in either gameplay run or the rig comparison.

Baseline: commit `5f1dc08`. Raw reports: [before](before.json), [final](final.json), [same-scene comparison](rig-comparison.json), [extended scenarios](soak.json).

These are short tests on one desktop GPU/browser, not a guarantee for every device, browser, or extended play session.

## Reproduction

Build with `npm run build`, then serve the production build with `npm run preview -- --host 127.0.0.1 --port 5206`. In a separate PowerShell terminal:

```powershell
$env:MMF_PORT = '5206'
$env:MMF_QA_OUT = 'test-results/performance-render-pass'
node tools/performance-smoothness.mjs --label=final --seconds=15
node tools/performance-smoothness.mjs --label=soak --seconds=60 --distance=3000
node tools/performance-rig-qa.mjs
```

Run these sequentially with no competing GPU tests. The tools use the installed Windows Chrome executable. `performance-rig-qa.mjs` compares palettes within the current scene and does not require checking out an older build. `performance-render-audit.mjs` provides an optional inventory of actual draw submissions and source textures for future profiling; its decoded texture byte estimate is not actual GPU memory usage.
