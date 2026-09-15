# Campaign readiness task plan

Status: approved next iteration plan. This file defines work and acceptance;
it is not a delivery record.

Implementation and executed acceptance are recorded in
[the readiness delivery](../../campaign/readiness-delivery.md). Offline reload
is a tested compatibility boundary, not an offline-play feature. The browser
fixtures and visual checks are distinguished from manual play/audio review.

## Goal

Remove the three clearest barriers between the completed campaign and a robust
player experience: an opaque all-assets boot, weak recovery literacy after the
first tutorial, and a generic ending/postgame record that does not reflect the
journey. Do this without another chapter or new progression economy.

## LOAD — staged and recoverable boot (Astra/root)

### LOAD-01 — inventory and immutable cache publication

- Introduce the typed manifest and critical/background grouping from the
  contract.
- Change the authored cache from clear-and-repopulate to publish-once entries.
- Preserve player alias fallback and shared Array palette ownership.
- Give each request a generation and deadline; discard stale completions.
- Keep procedural factories usable after every failure class.

Acceptance:

- Every current `authoredModel`/`authoredEnemyModel` factory receives the same
  prepared source when loaded and null when degraded.
- A background completion cannot replace/dispose a source already cloned by a
  build piece, destination, vehicle, enemy, cinematic or signal scene.
- Repeated Retry/Continue/New Game cycles do not grow model, material, texture
  or listener counts after warm-up.

### LOAD-02 — playable boundary and save-aware priority

- Split `Game.create` so Rapier, critical art, machine/station collision and
  the critical shader set establish the playable boundary.
- Start title/opening at that boundary and preload the background batch without
  blocking menu input.
- Before Continue returns control, prioritize assets proven necessary by the
  selected save: current destination/route, scripted vehicle, recovered seed
  garden instances and ending phase.
- Await a settled result at each late factory boundary; use its existing
  procedural fallback on failure.

Acceptance:

- Cold New Game reaches an interactive title/opening without waiting for
  Orchard, Meridian or optional-site art.
- Continue into each stable docked chapter and committed/arrival/complete
  Meridian phase shows the intended model or an explicit procedural fallback
  on its first visible frame.
- Late loading never changes physics, interaction anchors, campaign state or
  camera ownership.

### LOAD-03 — progress and failure UX

- Replace the static boot text with the contract's progress view.
- Report fallback assets without debug terms. Keep the game playable when the
  fallback path is valid.
- Offer Retry and Use simpler visuals for an unresolved critical failure;
  prevent double starts, partial cache publication and stale callbacks.

Acceptance matrix:

- Normal warm and cold cache.
- One critical 404 and one background 404.
- One stalled critical request and one stalled background request.
- Offline reload after one successful visit.
- Continue into a docked late chapter and Meridian arrival.
- Pointer lock, title focus, opening timing and audio-resume gesture match the
  current build.

## REC — survival literacy (Luna Noether, then root wiring)

### REC-01 — pure projection

- Implement `RecoverySnapshot`, `RecoveryHint` and `projectRecovery` exactly as
  frozen in the contract.
- Use finite arithmetic and stable priority; return at most three hints.
- Explain concrete recovery through existing actions: reel salvage and refuel,
  reduce demand/restore generation, drink/condense water, harvest/cook food,
  repair at access panels, or return to the safe-save boundary.

Focused tests cover:

- positive fuel at moving/stopped states and modified burn rate;
- zero fuel emergency crawl without infinite/free-range text;
- registered demand above capacity while powered draw is lower;
- empty hydration/nourishment with and without carried supplies/producers;
- garden dry, growing, full and exact completion boundary;
- damaged machine with/without a repair kit;
- safe and refused saves; malformed/nonfinite numeric inputs.

### REC-02 — HUD integration and session dismissal (Astra/root)

- Compose the snapshot from `MachinePower`, machine speed/upgrades, `Needs`,
  ResourceAccess, BuildSystem garden/controllers, MachineDamage and the existing
  safe-save predicate/refusal.
- Add a compact recovery/status area after first-run completion. Resolve
  controls through InputManager labels.
- Let the player dismiss informational topics for this session. A blocker can
  resurface; New Game and load clear dismissals.

Browser acceptance starts from a fresh profile and reaches each real state by
normal interactions or an explicitly recorded setup fixture, then performs the
recovery action. It verifies fuel, water/food, power, repair and save recovery,
old-save loading, pause/focus and remapped labels. No test passes by asserting
only projection text.

## RECord — campaign record and postgame guidance

### RECORD-01 — pure campaign projection (Luna Ptolemy)

- Implement the frozen `CampaignSummaryInput`, `CampaignRecord` and projection.
- Resolve chapter, journal and unique labels from existing data.
- Count only persisted chart history and known archive records.
- Produce the five optional guidance rows from current state without rewards or
  durable completion bits.

Focused tests cover empty/legacy-shaped inputs, partial routes, all chapters,
both Meridian routes, unknown journal IDs, visited/missed distinction, active
contact, no garden/automation, full postgame, stable ordering and immutable
inputs.

### RECORD-02 — read-only log UI (Luna Ptolemy)

- Add a presentation-only panel/view with chapters, preserved items, archive
  records, discovery totals/current contact and Keep Walking guidance.
- Use delegated callbacks only for close/open navigation. It must never mutate
  story/chart/inventory or register global input listeners.
- Escape, pointer lock, focus and remapped menu controls use the current panel
  lifecycle supplied by root.

### RECORD-03 — Game and ending composition (Astra/root)

- Compose chart history from the existing `RouteChart.snapshot` and the rest
  of the summary input from existing authorities.
- Add a discoverable radio/helm entry to the campaign log.
- Select a few nonjudgmental arrival/credit lines from durable facts; always
  preserve the current ambiguous Meridian message and peaceful ending.
- Keep the panel available in Keep Walking and after reload.

Acceptance:

- Fresh, midchapter, precommit checkpoint, arrival, credits and Keep Walking
  saves render accurate records.
- Skip arrival/credits and reload cannot duplicate a line, reward or event.
- An optional contact marked missed is never called visited; unknown/legacy
  facts are omitted rather than invented.
- Continuing survival, raids, chart contacts, gardens and building remain live
  after closing the log.

## Final verification (Astra/root)

1. Run focused unit tests during each task, then the full test/lint/build suite.
2. Run a cold-cache browser matrix with request delays, 404s and a stalled
   request; retain progress timing and fallback evidence.
3. Run a fresh-profile recovery scenario and old-save load scenarios. Record
   which steps use UI/input and which use setup fixtures.
4. Run campaign record scenarios at every stable campaign/ending phase and a
   same-save Keep Walking continuation.
5. Repeat the existing 100-cycle resource/scene/body soak and representative
   performance sample. Staged loading must not move first-use stalls into live
   combat or destination docking.
6. Visually and audibly review boot, recovery hints, the campaign log and
   conditional ending text at supported resolutions and quality tiers.

Release evidence must distinguish unit projection proof, network-failure
fixtures, automated browser interaction and manual visual/audio review. Do not
claim a manual full campaign playthrough from shortened-distance fixtures.
