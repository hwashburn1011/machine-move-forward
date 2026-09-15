# Late campaign continuity slices

Current status: REC-LATE and caretaker-route ORCH-LATE are accepted with
normal-input save lineage and cold-restart evidence. See
[recovery notes](../../campaign/late-campaign-continuity-notes.md) and
[Orchard notes](../../campaign/orchard-continuity-notes.md). MER-LATE is in
progress; the ending remains a separate unaccepted slice. The detailed
requirements below remain the acceptance contract.

This is a validation and recovery plan for behavior already implemented in the game. It does not
claim that Glass Orchard, Last Garden Meridian, or Keep Walking have been completed in one normal
input lineage. The accepted parent is
`test-results/continuity-quiet-array/run-2026-09-15T14-23-53-655Z/browser-profile`: Quiet Array is
complete, tier-one steering is earned, the target bearing is +12 degrees, and the save has 174
scrap, 3 components, 4 carried fuel, 7.746 tank fuel, 60 health, 32.55 hydration, 35.05 nourishment,
and seven structures. Its generator is present; its refinery is missing.

Every slice clones the preceding accepted browser profile, reads the latest save before Continue,
uses ordinary keyboard, mouse, and DOM controls, writes no resources, facts, health, distance, or
campaign state, and commits a paused Save & Quit checkpoint followed by a cold Continue comparison.
Use normal game speed and preserve fuel, needs, combat and encounter updates. Resume legitimate
autosaves when a tool fails; do not accelerate travel or advance fixed steps through a test hook.

## 1. REC-LATE — recover fuel and needs before accepting Orchard

This comes first because the checkpoint is playable but has little margin. The four carried fuel
units can be deposited by standing at the live generator and pressing `E`; `Game.depositFuel`
transfers only what fits. The expected tank becomes 11.746 and carried fuel becomes zero. A healthy
generator burns 0.06 fuel per simulated second. At the base 7.5 m/s an unloaded 900 m route would
consume about 7.2 fuel. The current Helm estimate accounts for rated speed
and burn modifiers but assumes uninterrupted full-speed travel; it excludes
additional fuel used while encounters hold speed and docking tapers it.
Carry a reserve and record actual burn. The emergency drive still crawls at zero fuel, so low
fuel is recoverable rather than a hard failure.

Use normal build/catalog controls to replace the refinery for 80 scrap. One `refine-components`
craft converts 8 scrap to 2 components. This yields the five components needed for a water
condenser, whose build cost is 40 scrap and 5 components. Only one existing floor is free; the
refinery uses it, so the condenser also needs an 8-scrap floor. The minimum is 136 scrap spent and
38 remaining. The continuity runner makes a second 8-scrap component batch for the later stove,
leaving 30 scrap and 2 components. The existing refinery floor is damaged: if its repair prompt is
selected, holding E repairs it for 2 additional scrap. A reachable refinery prompt can open
crafting directly without that repair; preserve whichever action actually occurs.
The condenser produces one water every 90 simulated seconds while powered. Collect
it with `E`, then use its inventory slot through the normal inventory UI. A drink restores 60
hydration, capped at 100.

The first live infrastructure run found that these devices demand 19 power from a 16-capacity
generator: refinery 10, condenser 4, deck gun 3, radio 1 and helm 1. Station-class shedding leaves
only the gun powered; the condenser cannot produce water in that configuration. After making the
components, use normal demolition controls to reclaim the idle refinery for 48 scrap and free its
floor, preserving the floor's actual condition. That leaves 9 demand and enough room for water
production. Record the refund and powered state explicitly. A second generator is a valid future
alternative, but this recovery slice does not grant one or silently disable a consumer.

Food recovery must use what the save actually contains; the plan does not assume an unrecorded
water, greens, ration, stove, or planter. Existing routes are: a planter costs 20 scrap and produces
up to three greens at one per 150 simulated seconds without power; a stove costs 25 scrap and 2
components; `cook-rations` consumes one greens and one water; using the ration restores 60
nourishment. The planter and stove each also need an 8-scrap floor if none is free, so an empty
kitchen requires 61 scrap and 2 components including supports. If the accepted inventory already
holds water or rations, use those first and record
the exact slot ledger. Otherwise salvage normally until the additional materials are earned rather
than seeding them.

Acceptance: the runner proves generator `E` refuelling, at least one real water production and
consumption, and either real ration consumption or a precise recoverable checkpoint explaining the
remaining normal resource requirement. It records tank burn, carried resources, both needs,
structures, health, and source/cold saves. It must leave enough live Helm-estimated fuel for the
chosen Orchard route or continue normal salvage before accepting the signal.

## 2. ORCH-LATE — complete full-art Glass Orchard on the caretaker route

Open the radio with `E`, accept the existing Glass Orchard offer through
`[data-radio-trace-button]`, and select and confirm `[data-route="orchard-caretaker"]` then
`[data-route-confirm="orchard-caretaker"]`. This is the preferred first continuity route: it is the
shorter 900 m course and schedules one existing skiff at 420 m remaining. The alternative
`orchard-cold-vault` is 1,100 m with a gunboat at 500 m. Ordinary threats can still occur on either
route. The choice is a real consequence: it controls which signed testimony is readable.

Use the authored destination and normal movement through its west gangway. Complete both objective
interactions:

- `orchard-port-isolator`
- `orchard-starboard-isolator`

Read `orchard-caretaker-record` and the common `orchard-memory-record`. The caretaker route does not
permit `orchard-evacuation-record`; the runner must not manufacture that read. Recover the uniques
through their normal `E` interactions in dependency order:

- `human-seed-bank`, after the port isolator
- `orchard-memory-core`, after the starboard isolator
- `vector-governor`, after both isolators plus the selected and common records

These recoveries already unlock the seed-garden blueprint and tier-two course authority in Game.
They consume no crafting resources. Walk physically back aboard, use `[data-radio-depart]`, and
verify Glass Orchard is complete, the detached colliders are disabled, the player is aboard, all
three uniques occur exactly once, the two objectives persist, the caretaker/common records enter
the journal archive, and the course tier is 2. Save and cold-restore the exact inventory, resources,
needs, health, damage, structures, story, route, journal archive, and course state.

The evidence boundary is explicit: this slice proves the caretaker/skiff route. It does not claim a
normal-input cold-vault/gunboat playthrough or its evacuation testimony.

## 3. MER-LATE — Meridian, deliberate ending, and same-save Keep Walking

From the accepted Orchard save, open the radio and accept the existing Last Garden Meridian offer.
Choose one recorded route through the real two-step route UI. Prefer
`meridian-quiet-line` for the first cohesive lineage: 1,250 m with one skiff at 520 m remaining and
access to `meridian-civilian-record`. The shorter `meridian-cordon-gap` is 1,050 m with a gunboat at
620 m and exposes `meridian-defense-record`. Neither route may be credited without its actual
scripted encounter resolving.

At the full-art Meridian destination, interact with both required objectives:
`meridian-transmitter-online` and `meridian-archive-installed`. StoryDirector requires the Orchard
memory core before either can complete. Read `meridian-common-record` and the route-selected record,
then recover `meridian-solution`. The other route record must remain unknown. Return aboard and
depart normally. Verify Meridian completion, tier 3 with the existing +/-45-degree authority, and
the required records and solution exactly once across Save & Quit and cold Continue.

The peaceful ending is a separate deliberate Helm action. Open the live Helm, require its ending
button `[data-testid="helm-commit-ending"]` to be enabled, click once to expose confirmation and a
second time to commit. The successful safe checkpoint precedes control lock. Advance the real 400 m
journey with normal fuel, needs, and threats governed by the shipped ending sanctuary rules. The
arrival lasts 12 simulation seconds; exercise either `[data-ending-skip]` or the normal credits and
`[data-ending-keep]`, recording which path was used. Do not claim both from one run.

Acceptance: cold Continue works from a committed journey checkpoint and from the completed ending;
death/respawn does not advance the committed boundary while the player is dead; completion preserves
the same resources, builds, gardens, damage, journals, seed, and course except for ordinary elapsed
simulation changes. After `[data-ending-keep]`, resume pointer-locked play, move and build normally,
observe continuing raid/contact eligibility, make one ordinary recoverable save, and cold-continue
again. This proves the shipped post-ending loop remains playable; it does not assert that optional
contacts, both Meridian routes, or an 8–15 hour manual-duration campaign have all been exhausted.

## Ownership and release evidence

- Sol owns the normal-input continuity runners, provenance manifests, ledger review, and retention
  of failed evidence.
- Luna-sized work, if needed, is limited to one runner slice or one reproduced production defect;
  it must not add campaign facts or bypass resource authority.
- Root owns Game/art fixes, full-art browser execution, final automated tests, performance checks,
  build, and release.

No slice is accepted from DOM visibility alone. Each interaction must be followed by its authoritative
StoryDirector, BuildSystem, Needs, MachinePower, inventory, or EndingDirector state transition, and
each durable boundary must match the committed save and a cold Continue.
