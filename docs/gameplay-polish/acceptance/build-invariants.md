# Build runtime invariants

Headless Playwright run against `http://127.0.0.1:5201` with models, textures,
sound, spontaneous spawns, and pointer lock disabled. Machine collision and the
real fixed/render loop remained enabled. Raw evidence is in
[`build-invariants/results.json`](build-invariants/results.json).

- PASS: physical snapped floor endpoints at 4 m, 8 m, and 11 m pass both
  camera and chest LOS. The 8 m and 11 m probes searched recorded azimuths to
  avoid actual machine props rather than disabling collision.
- PASS: the same endpoint at 12.6 m is rejected as `out-of-reach`.
- PASS: real LMB placement resolves physical, visible cells and commits floors
  on the lower (`-2`), service (`-1`), and command (`0`) decks.
- PASS: a real V transition selects a full crate and the following LMB moves it
  to a different cell while retaining its instance id and all 35 resources.
- PASS: a hostile spawned during held placement closes build mode without
  changing ammunition or committed piece count.
- PASS: a hostile spawned while the cursor owns the catalog closes construction,
  pauses at the same simulation time, and does not turn held LMB into fire.
- PASS: IndexedDB save/load restores identical committed geometry and closes a
  live preview/session; preview state does not enter the save.

Result: 12/12 assertions passed with no browser exceptions or console errors.
