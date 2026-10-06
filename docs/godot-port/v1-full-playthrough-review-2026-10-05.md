# Final presentation-build playthrough journal

Status: **complete — uninterrupted main-route run passed** (32m45s campaign; 32m50s including runner setup/teardown). Requested by the owner before their own playthrough. Review every observed issue, including small presentation details; do not silently fix or dismiss findings during the frozen run.

Build: `0.3.0-beta.1-dc384f8eeec2`; runtime `dc384f8eeec234285a71a8fe887cb4e9918d8bd190db6394dbe66b4c7df4abea`. Acceptance run: `test-results/campaign-earned-soak/v1-presentation-full-20261005-02/`. Fresh New Game, native renderer, normal clock and damage, actual spawned salvage and earned supplies. Dedicated short user profile; personal saves/settings are not used. Game runtime/assets stay frozen.

The actor follows the main campaign through Wake, Foundry direct, Quiet Array, Orchard caretaker, Meridian quiet line, relay ending and continued travel. It uses known paths, programmatic aiming, named production crafting/building/control authorities and scripted reading dwell. It does not cover every optional mission or alternative ending. This is not human play or an uncoached difficulty/discovery assessment.

Observation-only harness additions save sparse native images at intervals and when stage/menu/objective changes, retain text/state beside each image, and log frames over 33 ms with capture-adjacency tags. Image readback, PNG writing and observer work can themselves stall frames. These traces cannot replace the separate performance suite or prove the absence of flicker between samples. No continuous live audio listening is claimed.

Follow-up: all nineteen observations now have a disposition in [the refinement follow-up](v1-playthrough-fixes-2026-10-05.md). The entries below remain the original prior-build findings; eighteen led to changes and FP15 was reproduced with ordinary input without revealing a collision defect.

## Findings

| ID | Severity / evidence | Observation | Next action / status |
| --- | --- | --- | --- |
| FP01 | Medium / native visual | Workbench still opens as a large flat black panel with a bright green selection bar, unlike the device casing used by inventory/settings/story readers. The panel is readable, but this is a remaining visual inconsistency in a frequent early interaction (`review-0016.png`, 136.9 s). | Also reproduced on Orchard Service (`review-0350.png`) and Foundry gantry Console (`review-0195.png`): large mostly empty flat panel. Candidate: carry the existing wrist/device frame into Workshop and local machinery pages without changing controls. |
| FP02 | Low / visual judgment | The two intensely purple backpack light strips dominate an otherwise muted early deck view (`review-0008.png`). This may be intentional identification, but it is more saturated than the surrounding industrial palette. | Candidate only: compare a dimmer, less saturated treatment in gameplay before changing it. |
| FP03 | Review question / timing | The full introductory sequence delays first salvage input for about 87 seconds after the New Game call (93.44 seconds from harness start); parchment text fits and the burn completes (`review-0002`/`0004`). | Ask the owner whether the complete opening earns this duration. Do not shorten based on the scripted actor's lack of emotional response. Exact handoff timing will come from the event receipt. |
| FP04 | Low / visual judgment | Newly built deck gun has a very smooth, bright metal pedestal and fairly uniform housing against the worn Nomad (`review-0048.png`, 234.2 s). It reads less weathered than adjacent structures. | Consider a restrained shared-material/wear pass; do not add dirt everywhere or increase draw calls. |
| FP05 | Review question / timed behavior | The first scan takes 180 simulation seconds. The efficient actor is ready well before completion and stands idle; scan guidance suggests gun practice, salvage or repair, but field objectives are intentionally off by default. | Human check: is the available quiet work apparent from wrist guidance? Actor idle time alone does not justify shortening the scan or reintroducing alerts. |
| FP06 | Unconfirmed / instrumented frame trace | Early longer frames occur around build/navigation actions: 50-74 ms outside the immediate PNG capture window. Actor route planning and observer overhead remain confounds; reproduce ordinary construction without those observers before assigning cause. | Medium if reproduced |
| FP07 | Low / native visual + source-confirmed | While crewing the deck gun, the footer still advertises `[F] Throw salvage hook` (`review-0083.png`, 363.6 s). The actual salvage authority refuses throws while `manual_turret` is active (`salvage.gd`). | Confirmed contextual-hint mismatch: suppress unavailable salvage wording while mounted or say to dismount first. |
| FP08 | Low / native visual | A read-only Relay note has no selectable actions but still shows the generic arrow/Enter footer (`review-0132.png`). | Use a read-only Close hint on this page; keep navigation hints where there are choices. |
| FP09 | Low / native visual | Wake's recording reader repeats speaker identity (`ANNIKA / RECORDED`, `ANNIKA / ARCHIVE`) and shows a playing excerpt immediately above the same transcript (`review-0137.png`). Nothing clips, but the hierarchy is redundant. | Candidate: consolidate metadata and preserve the full transcript and voluntary playback controls. |
| FP10 | Medium / native visual | During deck-gun operation, the visible character retains the personal rifle rather than appearing to grip/operate the mounted weapon (`review-0167.png`, 678.6 s; also `0083`). HUD explicitly says CREWING DECK GUN. | Add an appropriate holster/operating pose and hand contacts, or deliberately frame the mounted view to avoid a contradictory visible pose. Check mounting/dismounting continuity. |
| FP11 | Medium / native visual + source inspection | While HUD says REELING CARGO, the character retains the normal rifle pose (`review-0234.png`, 904 s). The production throw handler launches hook/cable/audio without a corresponding dedicated throw/reel body pose. | Pair a brief free-hand throw/reel action with the existing hook timing and restore the weapon pose afterward. Preserve responsive movement and reward/trajectory rules. |
| FP12 | Low, potentially medium / transient native capture | Opening Array's Port Relay record produced a floor-only image (`review-0261.png`, 986.4 s); the next sample shows the complete readable wrist (`0262`, 1001.4 s). The wrist camera interpolates over 0.36 s. | Suspected camera-transition blemish; reproduce the transition in motion near this control. Do not report a persistent blank reader or establish duration from 15-second-spaced frames. |
| FP13 | Low / native visual | Array comparison still offers COMPARE BOTH REFERENCES after MISMATCH CONFIRMED is displayed (`review-0277.png`). The result text works, but the primary button does not acknowledge completion. | Candidate: label it Review comparison after success, preserving replay access. No progression failure observed. |
| FP14 | Low / native visual, discoverability question | On the first crossing into Orchard, the nearest active world/HUD prompt says Return to machine (`review-0333.png`, 1294.7 s). The action is valid, but its wording pulls against arriving to explore. | Consider neutral Gangway / Nomad wording. Do not change interaction authority or hide a usable escape route merely to improve wording. |
| FP15 | Unconfirmed / native camera view | The top-deck canopy occupies much of the upper view when moving with a steep downward camera (`review-0308.png`, 1216.5 s). The actor retained its salvage pitch. | Reproduce with ordinary mouse control before judging camera obstruction or mesh intersection. Not evidence of a broken default camera. |
| FP16 | Low / native visual + source-confirmed | Service lists carried fuel, TRANSFER FUEL and BUY FUEL together (`review-0350.png`). Buying adds directly to the tank, whereas transferring consumes carried items; the button text does not state the different source/destination clearly. | Prefer Fill tank / buy N units wording for the pump and Transfer carried fuel for inventory. Amounts/costs are correct; this is explanatory polish. |
| FP17 | Low / native visual + source inspection | Meridian's non-moving Verify preserved memory step repeats Keep the striped service sweep clear (`review-0428.png`), the same generic machinery guidance used elsewhere. The verify action is not a moving step. | Use task-specific short feedback for verification/readback, retaining clearance advice for actual moving machinery. This is repetitive presentation, not a failed interlock. |
| FP18 | Medium / native visual + source-confirmed | At the finale receiver, three optional contacts show 0m / OUT OF RANGE, and one appears under NEARBY with a -90 degree bearing (`review-0444.png`, 1746.6 s). `opportunities.preview()` clamps signed forward distance to zero; route_chart and navigation_page display that value as distance. | Distinguish passed/behind contacts from nearby reachable contacts; show truthful distance/status, and reconsider stale-list ordering. Keep encounter eligibility intact. |
| FP19 | Medium / editorial judgment from native ending | Relay-chain aftermath uses technical phrases such as challenge/response instructions, autonomous endpoints and optional allies (`review-0463.png`). The consequences are understandable, but this reads like system documentation beside the quieter seeds/family-records payoff. | Rewrite the aftermath in natural in-world language while preserving reach/privacy consequences and the fact that allies are not required. No new ending content is necessary. |

## Progress and successful behavior

The fresh run completed. Chronological observations below were written during the run; final milestone receipts follow.

## Coverage still requiring human judgment

Uncoached discovery, ordinary aiming/combat difficulty, emotional response to story/voice/music, exploratory pacing and comfort cannot be established by this actor. All observations below must distinguish game behavior from scripted-driver behavior and image-capture overhead.


## Rejected preliminary attempt

`v1-presentation-full-20261005` was stopped during the intro. The test helper attempted to list a campaigns directory that does not yet exist in a pristine isolated profile. This emitted a directory error; it is a harness defect, not failed game saving. Added a missing-directory guard to the test helper, retained the attempt and restarted from New Game. No game runtime or assets changed.

Early behavior: first real cargo was recovered, and ordinary paid refinery/workbench/scanner/deck-gun preparation succeeded without injected supplies. At 146.7 s: 100 health, 57.74 tank fuel, one cargo receipt, zero ground recoveries.

Opening milestone saved successfully at 388.483 s: first defense cleared, 100 health, 44.3 tank fuel, 120 scrap / 2 components / 8 fuel items, zero ground recoveries. Combat used programmatic aiming; this is not evidence that ordinary players take no damage.

Wake: all gyro work, recoveries and recording reader completed, return route walked and save succeeded. At the next preparation stage (597.1 s): 100 health, 32.33 tank fuel and zero ground recoveries. Native reader text fits within the case.

Foundry defense: weapon disabled and encounter resolved by the normal combat authorities; second defense counted, 100 health and zero ground recoveries. No enemy-stat or damage bypass was used, but aiming is still programmatic.

Foundry observation: the machinery control page is plain and oversized, but source inspection confirms moving actions close it so physical motion remains visible. Do not report permanent machinery occlusion as a bug. The service record fits its newer frame; route guidance names the Array and optional courier separately.

Foundry service and departure succeeded; at 907.3 s, en route to Array: 100 health, 64.30 tank fuel, 802 scrap / 21 components / 16 fuel items, two repair kits, 22 recovered cargo and no ground recovery. No engine errors recorded.

Array: both calibration records, three wheels, phase lock, components and reference comparison completed; the reached reader shows the complete mismatch explanation and the Orchard lead without clipping. The actor knows the calibration values; this does not test human puzzle difficulty.

Orchard arrival: greenhouse forms and planted rows distinguish the site from the earlier industrial interiors. Third defense resolved; 100 health, 41.96 tank fuel, 1,215 scrap / 35 components / 46 fuel items and two repair kits. No ground recovery.

Orchard local work, seeds/governor/memory-core recovery, caretaker record and return/service path completed. The greenhouse reader clearly connects the recovered seeds and family records to Meridian. The reserve remained sufficient; no death or rescue.

Meridian archive/transmitter work and departure saved; final interception resolved, five defenses counted. At 1778.6 s: 100 health, 79.16 fuel, zero ground recoveries; protected final journey is available.

Receiving berth: power/channel setup, seed transfer, archive import and relay decision completed; final recording text and choice aftermath fit the case. The route permits returning aboard and continued travel. Closing proof passed; runtime, assets and test inputs remained stable.


## Final results and priorities

**No progression blocker was observed on this main route.** All five destinations, five defenses, receiving-berth transfers, relay ending, post-ending departure and all 14 milestone saves passed. Runtime/asset/test inputs remained unchanged. No engine errors, deaths or ground recoveries; 815.73 m walked and 46 real cargo recoveries. Final tank: 68.746; lowest tank: 20.814. Lowest owned scrap: 90. The actor had 100 health throughout and 38/38 damaging deck-gun shots: this is explicitly not ordinary-player combat or balance evidence. Main simulation/active-wall ratio was 0.9723.

The **19 entries are observations, not 19 confirmed bugs**. They include visual/editorial judgments, two pacing questions, uncertain transition/camera observations and instrumented frame measurements with attribution limits. Highest-value follow-up groups:

1. **Complete the shared station UI** (FP01): Workshop, machinery Console, Service and receiver screens still use the older flat style. Preserve the distinction between personal wrist pages and station links while making them visually related.
2. **Connect the character to physical actions** (FP10/FP11): mounted-gun operation and salvage throw/reel need corresponding weapon/hand poses.
3. **Correct passed-contact presentation** (FP18): do not describe contacts behind the machine as 0 m away / nearby.
4. **Polish context and prose** (FP07–09, FP13–14, FP16–17, FP19): accurate action hints, completion wording and a more natural ending description.
5. **Reproduce before changing** (FP06/FP12/FP15): construction hitches, the brief wrist-camera floor view and canopy visibility. Material preferences and opening/scan duration should be judged with the owner.

Captured 468 sparse review images plus milestone/reader images. Selected images were inspected during the run; this does not mean every frame or every screenshot was viewed. No continuous audio listening or complete temporal flicker clearance is claimed. The instrumentation observed 530 frames above 33 ms, **503 within one second of image capture**. The other 27 remain confounded by test route planning and observer overhead. They do not establish 27 game hitches, resolve the isolated construction benchmark hitch, or replace the exclusive performance receipt.

The last periodic image (`review-0467.png`, 1950.018 s) shows post-ending control with the continuing-journey objective. The final milestone's deferred PNG did not write before teardown; its state and durable save did complete. This is a harness capture limitation, not a missing final save. The actor's stage label remains `live_defense` through parts of the finale; story/finale state and named milestone receipts identify those portions accurately.

Game source/assets and the Windows package were **not changed** during this review. Only observation/test harness and documentation changed. Personal profiles were isolated. Optional missions, alternate routes/endings, failed-combat recovery, uncoached discovery, human feel/audio judgment and weaker-PC behavior remain outside this run.

## Milestone receipts

| Milestone | Elapsed seconds | Health | Tank | Saved |
| --- | ---: | ---: | ---: | --- |
| opening-earned | 388.48 | 100 | 44.33 | Yes |
| wake-arrival-earned | 515.73 | 100 | 37.17 | Yes |
| wreck-one-earned | 596.29 | 100 | 32.38 | Yes |
| relay-foundry-arrival-earned | 743.26 | 100 | 24.50 | Yes |
| relay-foundry-earned | 816.61 | 100 | 69.14 | Yes |
| quiet-array-arrival-earned | 980.22 | 100 | 60.14 | Yes |
| quiet-array-earned | 1135.09 | 100 | 50.91 | Yes |
| glass-orchard-arrival-earned | 1291.62 | 100 | 42.33 | Yes |
| glass-orchard-earned | 1425.33 | 100 | 98.37 | Yes |
| last-garden-meridian-arrival-earned | 1634.31 | 100 | 86.81 | Yes |
| last-garden-meridian-earned | 1730.54 | 100 | 81.07 | Yes |
| receiving-berth-arrival-earned | 1849.53 | 100 | 75.67 | Yes |
| receiving-berth-payoff-earned | 1917.86 | 100 | 71.57 | Yes |
| campaign-complete-earned | 1965.03 | 100 | 68.75 | Yes |

Evidence: [runner summary](../../test-results/campaign-earned-soak/v1-presentation-full-20261005-02/runner-summary.json), [campaign report](../../test-results/campaign-earned-soak/v1-presentation-full-20261005-02/report.json), [capture/state index](../../test-results/campaign-earned-soak/v1-presentation-full-20261005-02/visual-review.json). The retained preliminary attempt is described above.
