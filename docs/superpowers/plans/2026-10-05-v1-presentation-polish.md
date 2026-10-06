# V1 presentation polish â€” 5 October 2026

Status: P1–P6 complete locally. Five presentation improvements implemented, reviewed, validated and included in the refreshed Windows package. Baseline runtime `a17d6c7ec6d64581c704f1708485f87051065bdec9c50c33f1d4970e91e7ddd3`; prior beta and journal remain historical evidence. Preserve all existing uncommitted intro, voice B, gameplay and unrelated project work.

| Task | Owner | Bounded implementation | Acceptance |
| --- | --- | --- | --- |
| P1 Movement weight | Movement agent | Refine measured starts/stops/turns and landing presentation on the existing eight-direction gait/foot-contact system. Keep responsive controller and collision authority. | Motion captures of start/stop, diagonal changes, turns, landing and stairs; meaningful control/pose regressions; no foot/camera/weapon regressions. |
| P2 Intro clarity | Intro agent | Reframe the factory confrontation around readable attacker/defender/contact; inspect and refine demonstrated grip/escape/landing issues. Preserve approved interception, wall arrival, voice/subtitles and blue swords. | Compare native timed shot sequences, not isolated favorable screenshots; verify timing, skip and gameplay handoff. |
| P3 Desert composition | Environment agent | Group existing roadside props into infrequent coherent places with quiet intervals. Deterministic placement, route clearance and streaming budgets. | Multiple seeds/distances, native travel/cluster views, collision/streaming checks and representative performance. |
| P4 Purposeful wear | Environment agent | Refine a bounded set of visible props/materials with localized use/weathering cues and muted material contrast. Preserve floor/roof depth and geometry correctness. | Close and gameplay-distance native comparison; intentional wear placement, no sparkle/flicker or unbounded per-instance materials/draw calls. |
| P5 Interaction presentation | Root | Reduce simultaneous floating action sentences. Keep one actionable nearby label and quiet supporting markers; preserve actual interaction selection, prerequisites and wrist guidance. | Multiple adjacent targets and all main destinations; prompt/selection agreement, completed/locked states, layout/visibility and native captures. |
| P6 Integration | Root / team | Freeze runtime/assets, verify affected movement, intro, site progression and streaming; update written findings and Windows artifact. | Sequential native performance, resource audit and isolated exported-package boot/New Game/Continue. No new full-campaign claim without a new full run. |

GPU work is sequential on this 16 GB / RTX 3070 machine; independent source and headless work may overlap. Agents request a render window before starting native captures. No speculative enemy/economy changes, new region, paid generation or unrelated cleanup. No commit/push/upload is included. Record unsuccessful fixtures and any remaining human-review needs.


## Implemented decisions

- P1 retains the existing gait, foot IK and responsive movement; adds bounded torso inertia and landing compression. Component acceptance: 136 focused checks, 181 native motion frames, zero ground recoveries.
- P2 improves factory/lever/landing framing and narrow-screen composition. Native review also exposed a real 17.8 cm defender hover; independent posed boot vertices replaced the equipment-inclusive placement bound. Grounded native review passed 77 checks; approved interception, escape, voice B and blue pulses preserved.
- P3 uses six coherent roadside groups, quiet intervals, actual footprint clearance and unchanged population/streaming budgets. First captures prompted tighter spacing and approach-facing shop fronts.
- P4 adds localized wear to three weak service props and differentiates existing bare metal. Shared resources, original geometry/collisions and draw-call counts remain intact.
- P5 selects one full world label from the existing Use arbitration, quiet markers for other available controls, and preserves wrist/HUD guidance. 246 final native checks plus existing controls/story checks passed.

Component captures at `c084dfa83351…` precede only the isolated intro boot-placement fix. Final intro and whole-build performance/export receive their own source stamps. Do not treat these prepared fixtures as a new full campaign or uncoached human playtest.


## Completion

Final runtime `dc384f8eeec234285a71a8fe887cb4e9918d8bd190db6394dbe66b4c7df4abea`; build `0.3.0-beta.1-dc384f8eeec2`. Five affected native performance workloads passed, with one recorded 39.513 ms construction frame and no other frames over 33 ms. Final scenery contract 109 and streaming lifecycle 18 checks passed. Exported resources passed 4,502 checks, actual executable boot passed, and extracted-content New Game 34 / Continue 25 checks passed. [Release receipt](../../godot-port/results/v1-presentation-release-2026-10-05.json) and [updated journal](../../godot-port/v1-playthrough-journal-2026-10-04.md) retain details and limits. No commit, push, upload or full-campaign rerun in this pass.
