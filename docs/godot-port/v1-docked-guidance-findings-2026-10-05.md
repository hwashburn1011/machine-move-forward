# Docked operating-mode guidance — 5 October 2026

## Evidence and scope

The earned campaign journal observed fuel being consumed while exploring the Wake with generators running. Its final fresh run departed Wake with 32.348 tank fuel. The journal explicitly leaves novice understanding of Docked mode as an open question; no human confusion or difficulty claim is made here.

Source inspection established a narrower, actionable omission. The existing helm preparation and quiet service note said Docked mode stops fuel burn, but did not identify the preview/apply controls or explain which equipment loses power. The engineering overview also implied that the player must separately resume a travel configuration at the helm, although the existing departure transaction restores it automatically.

This pass changes explanatory text only. Operating modes, unlocks, generator consumption, costs, rewards, save fields and interaction authorities are unchanged. Mooring does not automatically select a mode; the player remains in control. No new popup, alarm or voice was added.

## What changed

`MMFMachineOperations.docked_guidance()` derives read-only help from the actual mode unlock, mooring state and current operating mode. It is reused in the existing engineering Overview/Modes pages, helm journey-preparation record and quiet wrist service note.

- Before the first expedition, it explains when the preset becomes available without advertising an unavailable command.
- While travelling, it identifies the requirement to be moored and makes clear that shutdown is voluntary.
- While moored, it names the service-deck engineering path: **Modes → PREVIEW DOCKED → APPLY OPERATING MODE**.
- With Docked active, it confirms that generators are stopped and consume no fuel.
- It explains that the refinery, deck guns, lamps and recovery machinery are switched off. Receiver, helm and fieldwork can use charged battery backup only when enabled.
- It explains automatic restoration of the saved travel plan on departure, and identifies generator switches plus Devices controls for a custom powered-work plan before leaving.

This avoids advising Cruise for refinery work: the actual Cruise policy also disables the refinery and recovery loads.

## Verification

All checks ran **headlessly**, with no rendered capture or GPU performance claim.

- `godot/tests/campaign_flow.gd`: **40 checks passed**, including 14 focused additions for locked/available/active guidance, explicit application, read-only behavior, real power-policy tradeoffs and automatic resume semantics.
- Existing `godot/tests/recovery_operations.gd`: **98 checks passed**. This includes the physical engineering interface, authorization, Docked/previous-plan save round-trip, battery behavior, and successful/blocked departure handling. Its user-data scope is isolated from ordinary saves.
- Both reports identify source fingerprint `e7bc42afeecb38fa7378e2f48dbc5c2e3eaa504aed6bace6b2ab1677abd35b49`; recovery-operations confirmed the same fingerprint at its end.
- No engine warnings, script errors or failed checks appeared in the captured logs. `git diff --check` found no whitespace errors in the four changed source/test files.

Evidence: `test-results/v1-docked-guidance-2026-10-05/`, including complete logs, result JSON and previous result snapshots.

Remaining acceptance after the headless pass was visual inspection and uncoached discovery. The native capture pass below covers visual fit; whether an uncoached player finds and understands the voluntary power controls remains untested. Final integration checks should be rerun after any later runtime change.

## Native visual review

`godot/tests/docked_guidance_review.gd` completed rendered verification with **231 checks passed and 26 captures** on stable runtime `90a327f874205c5f9500a95d080b2e5d75310ce0770214176233d94c008adf8c`. It exercises prepared Wake-moored, Docked-active and after-departure fixtures at 1024×768 and 1440×810. The existing Helm/preparation, engineering Overview/Modes and Docked preview/apply pages receive captures plus panel/button/scroll-access assertions. Actual UI callbacks apply Docked and depart; fixture setup supplies Wake completion only to make that UI state reviewable, and is explicitly not campaign-play evidence.

Output is `test-results/v1-docked-guidance-2026-10-05/visual/review.json` with adjacent PNGs. Both runs used isolated AppData under `test-results/dgv/`; ordinary user settings were untouched. No warnings or engine errors appeared. The first run had two overly strict harness assertions expecting Docked-specific help after departure; the production helm correctly displays travel preparation instead. Only this expectation was corrected before rerunning; the original report and log remain as `visual/review-first-attempt.json` and `visual-first-attempt.log`.

Visual inspection covered the 1024×768 moored preparation, Docked preview and after-departure Modes captures, plus the 1440×810 active-Docked Overview. Text wraps within the panel, controls remain visible, and none of these prepared screens requires horizontal or vertical scrolling. Uncoached comprehension remains untested.

One pre-existing contextual concern is visible in active-Docked Overview: the general diagnosis still recommends restarting a stopped source and lists unpowered helm/radio immediately before the intentional Docked confirmation. This was reported to the root agent for coordination; no runtime change was made during this capture pass.

## Follow-up: intentional shutdown diagnosis

After coordination, this reproduced conflict was fixed in the engineering Overview. `MMFMachineService.diagnose()` gained an optional presentation flag that defaults to its previous behavior. For a moored machine intentionally in Docked mode with propulsion stopped, engineering omits only the operating-switch advice; tank, engine and generator-condition faults remain. Receiver/helm/fieldwork receive factual status instead: supplied by battery backup, or off with no battery supply. No diagnostic strings are filtered, and emergency eligibility, repairs and power behavior are unchanged.

Headless results on stable source `a17d6c7ec6d64581c704f1708485f87051065bdec9c50c33f1d4970e91e7ddd3`: campaign-flow **49/49** and recovery-operations **98/98** passed. Added cases verify retained hardware/tank failures, charged/disabled backup truthfulness, unchanged default diagnosis and read-only behavior. Reports/logs carry `-diagnosis-fix` filenames in the same evidence directory. The earlier visual evidence remains attributed to `90a327…`; its report/log and PNGs are preserved separately before recapture.

The final rendered rerun passed **235/235 checks**, with 26 captures and identical start/end `a17d6c…` fingerprints. The active-Docked Overview capture was inspected again: helm and radio now report being off with no battery supply, the intentional fuel-saving state is explicit, and the inappropriate restart instructions are absent. Controls and wrapped text still fit. Current images/report are under `visual/`; older PNGs are retained under `visual/before-diagnosis-fix/` with their matching `review-before-diagnosis-fix.json` and log.

After that final runtime change, the adjacent cargo regression suites also passed headlessly: `cargo_capacity.gd` **24/24**, `beta_salvage.gd` **32/32**, and `salvage_feedback.gd` **75/75**. Their logs, result copies and exit codes are under `final-integration/`, with previous result snapshots preserved. These legacy suite reports do not embed runtime fingerprints; they ran after the final stamped visual pass with no further runtime edits by this worker. All three exited zero without engine warnings or script errors. The CPU/GPU review window was released before final performance profiling.
