# Campaign continuity evidence

These files record the low-cost logical continuity pass. The browser ran at
640×360 with `nomodel=1`, `notex=1`, muted audio and Chromium SwiftShader. This
is interaction, authority and persistence evidence; it is not art, GPU or
performance evidence.

No run seeded resources, inventory, health, facts, progression phases, world
distance or player position. The only fixture is an isolated browser profile.
Input used the visible title and campaign controls, normal keyboard actions,
catalog and recipe DOM buttons, mouse-look events through `InputManager`, and
trusted mouse presses for placement. Read-only Game state selected targets and
verified results.

## Provenance

- `baseline-opening-trap-{events,summary}` copies the deployed-main 0994f1d
  run from
  `test-results/continuity-story-main0994f1d/run-2026-09-15T10-34-20-392Z`.
  The physical opening succeeded, but two opening-owned scavengers remained
  beneath the Nomad and blocked saving. This is failure evidence for the bug
  fixed by the candidate's explicit rooftop-pursuer retirement.
- `candidate-story-{events,summary}` copies the candidate 5205 run from
  `test-results/continuity-build-clean/run-2026-09-15T11-02-16-853Z`. It proves
  physical rooftop sprint/jump, zero surviving opening pursuers, manual Save,
  Save & Quit/Continue, first reel salvage, radio recovery, Wreck One signal,
  and a second exact Save & Quit/Continue restoration.
- `candidate-first-loop-events` copies the child run
  `first-loop-1789470403504`. The runner cloned the candidate story browser
  profile before continuing, so retries and ordinary autosaves could not alter
  the accepted source checkpoint. This is one legitimate branch from the same
  durable save, not a separately seeded campaign. It proves normal placement
  of three floor plates, refinery, workbench and manual deck gun; four refinery
  crafts; turret entry; and the normally delayed tutorial boarding start.

The earlier `continuity-story-candidate/run-2026-09-15T10-47-55-042Z` profile
is deliberately excluded. An initial version of the follow-up launcher opened
its restored last page, threw before navigation because it passed a URL object
instead of a string, and immediately closed during boot. Continue was missing
on the next attempt. That run is invalid and the precise reason its save was
unavailable remains unresolved; the premature launcher failure alone does not
prove a cause. Source review found no boot-time delete or overwrite path:
SaveManager's title queries are read-only, periodic autosave cannot pass title
save admission, and new-game reset only runs after the visible New Game choice.
A clean controlled save-close-reopen pair subsequently passed. The new-story
runner now refuses to run without `--fresh`, and the follow-up runner always
works from a copied profile.

## Current boundary

The verified candidate lineage ends with the tutorial boarding vehicle active.
It does not claim the boarding victory, repair objective, Wreck One docking or
later campaign chapters. Those remain the next uninterrupted slices.
