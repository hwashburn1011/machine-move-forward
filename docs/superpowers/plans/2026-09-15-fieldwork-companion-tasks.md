# Fieldwork and companion implementation tasks

Status: implemented on `codex/fieldwork-and-companion`, with the explicit
same-deck caretaker boundary below. Unit tests, browser acceptance, asset
validation, lifecycle soak, lint and production build passed. The
[delivery record](../../campaign/fieldwork-delivery.md) records measured results
and limitations; publication follows reviewed PR merge.
The [contract](./2026-09-15-fieldwork-companion-contract.md) is authoritative
for values, ownership and save behavior.

## Delivery boundary and remaining work

- FLD-01/02/03 and INT-01 are implemented: all four attachments, immutable
  campaign profile, actual workbench UI and backward-compatible saves.
- L12-01/02/03/04 are implemented for the dock's deck: recovery, single powered
  dock, physical follow/service, atomic transfers, known conversation text and
  saved recruitment/mode. Real interruption, relocation and save flows passed.
- Multi-deck caretaker following is deferred after actual machine stair
  traversal failed at the landings. The caretaker graph excludes vertical
  edges, including hidden same-deck detours. Dock relocation safely redeploys
  one actor on the chosen deck. Player/enemy stairs are unchanged.
- VAL-01 has bounded automated evidence, including 100 resource-conservation
  cycles and a separate 100-actor lifecycle soak. It does not claim exhaustive
  manual campaign play or locked 60 FPS during crowded combat.

## Work ownership

- **Luna 1 — weapons/profile:** new pure attachment/profile data and state,
  `Weapon`/`PlayerCombat` integration, focused unit tests. Do not edit Game,
  shared save composition, title/workbench UI, art or build systems.
- **Luna 2 — caretaker:** new pure caretaker director/planner and its focused
  tests, plus a new isolated caretaker view only if assigned. Do not edit Game,
  RouteChart, BuildSystem, navigation, inventory, story data or art.
- **Root — shared integration/art:** Game, SaveSchema composition, title and
  workbench flows, depot/RouteChart integration, build/power/nav/physics,
  authored attachment/L-12/dock assets, audio/presentation and runtime QA.
- **Sol — contracts/correctness:** API freeze, transaction/save/lifecycle
  review and focused corrective work explicitly handed back by root.

No worker edits another owner's files without a direct handoff.

## FLD-01 — pure attachment catalog and projection (Luna 1)

Create a typed four-row catalog with the exact IDs, compatibility, cost and
multipliers in the contract. Implement `attachmentsForWeapon` and
`applyAttachment` as pure projections from immutable base definitions.

Acceptance:

- applying the projection repeatedly is identical and leaves `WEAPONS`
  byte-for-byte unchanged;
- wrong-weapon and malformed IDs cannot equip or be restored;
- every exact multiplier and the burst descriptor is covered;
- no attachment changes damage, pellets, magazine size or ammo per shot.

## FLD-02 — weapon ownership, selection and timing (Luna 1)

Extend per-weapon runtime/save state with sanitized `attachments: { researched,
active }`. Implement `researchedAttachments`, `installedAttachment`,
`researchAttachment`, `setAttachment` and `effectiveDef`. Game supplies the
resource purse used by `researchAttachment`; ownership commits only after its
atomic consume succeeds. Use `effectiveDef` in spread, recoil, range/falloff,
cadence and reload. Implement burst commitment through `tryFire(now,
triggerHeld)`, `hasPendingBurst` and `cancelBurst()` in the authoritative
fixed-step combat path.

Acceptance:

- purchase is idempotent and free swaps require prior ownership;
- legacy extended magazine coexists with every compatible attachment;
- an unmodified weapon's shots, spread sequence, damage, reload deadline and
  serialized values match the current baseline;
- burst resolves three ordinary base-damage shots at 12/s, observes magazine
  exhaustion and waits 0.50 s after round three;
- cancellation covers reload, swap, death, panels/build, cinematic, new/load
  and disposal with no delayed shot;
- 30/60/144 Hz tests compare shot times, ammo and damage; save/load never
  resumes a burst.

## FLD-03 — campaign profile projection (Luna 1)

Implement `CampaignProfile`, `sanitizeCampaignProfile`,
`profileUsesInfiniteAmmo` and `campaignProfileLabel`. Add focused Weapon or
PlayerCombat seams to apply the rule without changing definitions. Root will
own selection UI and SaveGame composition.

Acceptance:

- absent, malformed and old save inputs normalize to Story;
- Story retains current infinite-reserve firing/reloading exactly;
- Survival consumes finite reserve, routes both ammo item types correctly and
  clamps hostile save values;
- changing a rules projection cannot refill either gun;
- tests cover empty magazine, partial reload, crafted/picked-up ammo,
  weapon swap and round-trip conservation.

## INT-01 — profile and workbench integration (root)

Add `profile?: 'story' | 'survival'` and optional per-weapon attachment data to
v1 saves. Add New Game profile selection with Story selected by default and no
mid-campaign Settings switch. At a workbench after Foundry, register the
temporary 1-power fieldwork-tools consumer and show researched, active, effects
and exact cost; purchase through the `AttachmentPurse` adapter
and select only after successful payment.

Acceptance:

- fresh Story, fresh Survival and old Continue reach play with correct rules;
- insufficient or split inventory/crate resources cause no partial charge;
- a listener/UI exception after commit cannot cause a free attachment or
  double charge;
- workbench power/range/panel loss closes safely and clears pending burst;
- labels never describe finite ammo in Story or infinite ammo in Survival.

## L12-01 — pure caretaker state and planner (Luna 2)

Implement `CaretakerDirector`, `CaretakerWorkSnapshot` and plain candidate/job
types exactly as the contract. Its planner receives already-authoritative live
candidates and returns at most one one-unit intent. `fixedUpdate` advances its
bounded navigation/service phases, and `resolveJob(token, success)` is the only
completion seam. It must not import Three, Rapier, Game, BuildSystem, Container
or UI.

Use stable ordering (job kind, source ID, target ID) so fixed-rate differences
cannot choose different inventories. A full target, empty source, full garden,
missing water, unsafe state or absent powered dock yields no job. `restore`
accepts only format 1, boolean recruitment, a known mode and a bounded safe
dock ID is not part of the pure save; malformed input resets unrecruited.
Job/phase/token are never restored.

Acceptance:

- one-unit plans prioritize crate water to garden, then cover condenser,
  collector and garden output to storage;
- player inventory is unrepresentable in planner inputs;
- repeated planning alone changes no counts;
- malformed/old saves grant nothing; recruited save/load keeps mode and Game
  separately rebinds a live dock;
- cancel/reset and 100,000 planning steps keep one bounded job and stable
  memory/state.

## L12-02 — depot recovery, dock and physical integration (root)

Add L-12 recovery to every repair depot until recruited. Consume 6 components
atomically and persist once. Add the one-per-machine `caretaker-dock` build
piece (40 scrap, 8 components), its 3-power consumer, interactions for
Companion/Steward and a readable
waiting/unpowered state. Build the authored 1.1 m L-12 and dock visuals.

Wire physical movement through existing nav/controller seams. The root owns
source/target approach points, reach validation, destination teardown and the
strict soft-return admission in the contract.

Acceptance:

- leaving, declining or lacking components preserves a later recovery chance;
- concurrent/repeated interaction charges exactly once and creates one unit;
- dock build cap, power, relocation, demolition, damage removal, save/load and
  destination transitions leave no stale body, model, consumer or job;
- unreachable/no-nav behavior waits safely and does not fall off the Nomad;
- 30/60/144 fixed-step movement reaches the same bounded goal without
  frame-rate-dependent commits.

## L12-03 — authoritative steward transactions (root, Sol review)

At source arrival revalidate and claim one unit through the existing producer,
collector or garden authority. Because L-12 has no inventory, do not remove the
unit yet. At target arrival, execute a single guarded transfer that first proves
the source still owns one and the target still accepts one, then commits both
sides. Prefer a narrow source-specific `transferOne` transaction over composing
public remove/deposit calls with an externally visible gap.

Acceptance:

- user collection, watering, relocation, demolition and combat destruction at
  every point before commit either wins cleanly or makes the caretaker abort;
- full crates/gardens preserve the source output; missing water preserves both
  sides; event-listener throws do not undo a committed transfer;
- 100 mixed move/demolish/save/load/work cycles conserve every item and keep
  physics bodies, colliders, scene objects and power consumers bounded;
- no save can contain or later pay a resource supposedly carried by L-12.

## L12-04 — companion knowledge and presentation (Luna 2 projection, root UI/art)

Project a small ambient-line view from explicit known fact IDs supplied by
Game. Unknown facts produce generic onboard lines. Root presents them with
cooldowns and normal panel/control rules; they have no rewards or state beyond
the recruited caretaker mode.

Acceptance:

- unread active journals, unvisited contacts and unrecovered uniques never
  appear;
- loading an old or early-campaign save cannot expose late-story text;
- repeated updates do not spam panels/audio or alter simulation state;
- Companion and Steward can be changed at the powered dock and survive save.

## VAL-01 — integrated release acceptance (root)

Run focused unit tests, full tests, lint and production build. In real Game
fresh profiles, exercise both weapons and all attachments, actual powered
workbench purchase/swap, finite-ammo pickup/craft/reload, depot recovery,
dock build/relocation, physical follow and every steward source/target.

The browser harness must record exact before/after resource totals, shot times,
save fields and live object/body/consumer counts. Include old published saves,
malformed optional fields, death during burst/travel, full storage, source or
target demolition, power loss, panel/build interruption and destination
transitions. Run a bounded mixed lifecycle soak and current performance/visual
checks with authored models. Do not claim campaign-length validation or new
story content from fixture-shortened flows.

## Completion boundary

This iteration is complete when Story remains behavior-compatible, Survival
makes the existing ammo economy real, attachments produce the documented
tradeoffs through authoritative combat, and recruited L-12 provides a
resource-conserving optional home presence. It does not complete future content
depth, campaign-duration validation or broader optional-site variety.
