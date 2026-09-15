# Radio Slice 2 supplementary summary

Runs `1789474059926` and `1789474626542` exercised the real 5205 build from
the accepted boarding profile. The first run advanced from 364 m through
signal, crossfire and raids, observed wave 1 and `boarding:ended`, and opened
the visible Wreck One trace at 2706 m. Its Save & Quit attempt was a runner
timing failure: the second Escape arrived during pointer-lock reacquisition.

The resume run used the actual autosave from that run, verified persisted wave
1 and radio eligibility, then completed the offer, paused checkpoint, read-only
SaveManager load, cold relaunch and restored offer checks. The final restored
state retained eight structures, FirstRun through repair, wave 1, and 204
scrap / 9 components / 4 fuel. The ledger observed +14 scrap scavenger loot,
+21 scrap/+2 components commander loot, +23 scrap/+2 components heavy-gunner
loot, and +30 scrap/+2 components skiff salvage.

Evidence: [`radio-slice2-first-run.json`](radio-slice2-first-run.json),
[`radio-slice2-resume-run.json`](radio-slice2-resume-run.json), and
[`radio-slice2-committed-checkpoint.json`](radio-slice2-committed-checkpoint.json).
The raw failed logs remain under
`test-results/continuity-radio/run-1789474059926` and
`test-results/continuity-radio/run-1789474490480`.

These are supplementary because the runner URL included
`seed=continuity-radio`, while the accepted parent uses `mmf-dev-seed`. A
clean no-seed rerun later passed as `1789475135178`; the manifest records that
canonical replacement and the subsequent Wreck One continuation.
