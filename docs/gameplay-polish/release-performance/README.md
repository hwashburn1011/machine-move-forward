# Final hardware performance

RTX 3070, Chrome ANGLE/D3D11, 1920×1080, High, DPR 1, seed `desert-review`, distance 800. Every scenario has three independent 30-second samples, with the same harness and original `1cf3835` checkout. All six primary runs are included. FPS values are capped by the 60 Hz test display.

| Scenario | Original median FPS | Current FPS, runs 1/2/3 | Current median (change) | Current p95 ms, runs 1/2/3 | Current p99 ms, runs 1/2/3 | Frames >50 ms, runs 1/2/3 |
| --- | ---: | --- | ---: | --- | --- | --- |
| deck | 59.73 | 60 / 60 / 54.94 | 60 (0.45%) | 16.8 / 16.8 / 33.3 | 16.8 / 16.8 / 33.4 | 0 / 0 / 0 |
| rapid-look | 59.96 | 59.93 / 59.8 / 53.57 | 59.8 (-0.27%) | 16.8 / 16.8 / 33.4 | 16.8 / 16.8 / 33.5 | 0 / 0 / 0 |
| crowded-look | 57.93 | 57.07 / 54.67 / 58.8 | 57.07 (-1.48%) | 16.9 / 33.3 / 16.8 | 33.4 / 33.4 / 33.3 | 1 / 2 / 0 |

The additional contemporaneous original-build control measured 60 FPS in deck, 59.86 FPS in rapid-look, 55.6 FPS in crowded-look. It is reported separately and does not replace an earlier baseline sample. See [all statistics](summary.json) for original tails and sample counts.

The crowded scenario keeps eight detailed mechs active while continuously turning the camera. Occasional missed refreshes remain; these results do not promise a locked 60 FPS on every PC. No visual quality tier, geometry, texture resolution or gameplay definition was reduced for these measurements.

Earlier folders named `after`, `final`, `accepted`, `optimized` and `clean` are diagnostic history, not selected release samples. Some overlapped unrelated host rendering work. The final series runs GPU tests sequentially; normal desktop/OS scheduling still introduces variation.

`before-visibility-current-*.json` preserves the superseded three-run series that exposed translucent helmet/backpack overdraw at close camera distances. The final series follows the visibility-cutoff and fully-hidden draw-skip correction; all three earlier runs remain available. Warmed shader counts rise from the original 157/158 to 174 and stay constant throughout the final runs.
