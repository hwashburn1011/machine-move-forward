# Continuity and smoothness contract

Status: approved direction for the iteration after Fieldwork and Companion.
The shipped peaceful Meridian ending remains authoritative. This iteration adds
no chapter, enemy, weapon, currency or reward track. It investigates three observed
1.0 gaps: L-12 cannot use the Nomad's stairs, an eight-enemy fight falls below
the otherwise stable frame rate, and the campaign has not been completed from a
fresh profile without state-seeding fixtures.

Measurement update: the crowd baseline reached a median 59.00 FPS after fixing
the profiler's asynchronous GPU warm-up. No production combat optimization is
justified by the earlier misleading stall samples. Full campaign acceptance
remains open; see the adjacent task status and delivery evidence.

## Authority and ownership

- **Root** owns physical ramp measurement, Machine geometry/colliders, shared
  Game integration, renderer/art changes and final browser acceptance.
- **Luna `build_foundation`** owns caretaker portal expansion and committed
  portal movement in `src/companion/CaretakerNavigation.ts` and
  `src/companion/CaretakerActor.ts`, plus focused tests. Work begins after root
  publishes measured landing/ramp points and capsule-clearance results.
- **Luna `controls_camera`** owns a reproducible crowd profiler, diagnosis and
  only the narrow runtime optimizations justified by its measurements. Shared
  Game, renderer or art edits require a root handoff.
- **Sol** owns the campaign-runner contract, review of current interaction
  seams, runner implementation when assigned, and final correctness review.
- Existing systems retain their authority: StoryDirector owns facts and chapter
  phase; Inventory/ResourceAccess own resources; SaveManager owns durable
  writes; Game owns admission and orchestration; fixed simulation remains 60 Hz.

No task may change combat balance, campaign rewards, survival rates, navigation
tiers or the ending to satisfy an acceptance harness.

## 1. Physical caretaker stairs

The current safe same-deck behavior is the baseline, not proof that the stairs
are impossible. `CaretakerNavigation` currently removes vertical graph edges
and refuses a route whose endpoints have different levels. The Nomad already
exports two `fixedLinks` and uses smooth physical stair ramps. The next step is
to measure those real ramps and construct routes that the caretaker capsule can
physically traverse.

Root first records, for both ramps and both directions:

- posed world-space lower and upper landing feet points;
- ramp centerline endpoints, width, slope and clear headroom;
- the first collision that prevents the current capsule from completing a
  traversal, including collider identity;
- whether the existing radius, half-height, autostep and slope settings can
  pass without changing player or enemy physics.

If a fallback or authored machine collider intrudes into the intended passage,
root may correct that collider to the visible ramp. The fix must retain deck
rails, player/enemy traversal and build exclusion. Shrinking L-12 solely to fit
an unintended gap is not acceptance.

After measurement, navigation expands each directed fixed link into a portal:

```ts
export interface CaretakerPortal {
  readonly id: string;
  readonly fromLevel: number;
  readonly toLevel: number;
  /** Machine-local world-surface feet points in traversal order. */
  readonly points: readonly THREE.Vector3[];
}

export interface CaretakerRoutePoint {
  readonly point: THREE.Vector3; // posed world-space feet position
  readonly portalId?: string;
}
```

The exact public shape may stay as `Vector3[]` if portal metadata remains an
internal parallel route field. The behavioral contract is fixed:

1. Ordinary graph nodes still exclude live station centers and physically
   blocked clearance samples.
2. A vertical fixed link is usable only when every measured portal point is
   finite, lies in the matching link direction and passes the live clearance
   query. A missing or blocked portal returns no route.
3. A route joins an ordinary same-level path, one complete portal, then the
   destination-level path. A* may not jump directly between landing cells.
4. Once the actor enters a portal, it follows its ordered centerline until the
   exit. Local fan steering is bounded to the ramp width and cannot choose a
   side route through coaming or equipment. Replanning may occur before entry
   or after exit; obstruction while inside stops safely and retries rather than
   committing a job or teleporting.
5. Route points remain attached to the moving machine through the existing
   carry/pose contract. No point receives the machine transform twice.
6. `canReach` is true only for a complete physically clear route. Resource
   commit still requires actual arrival at both live endpoints.

The browser fixture must execute the real Game fixed-loop order. Each step
must update the machine pose, caretaker/navigation, character controllers and
Rapier in the same order as production. Repeating `actor.fixedUpdate` and
`physics.step` against an unchanged machine is invalid because
`Machine.carryFor` can otherwise repeat a stale per-step delta. Initial actor
placement at a measured landing is allowed; no later teleport is allowed.

Acceptance covers ascent and descent on both fixed ramps, a cross-deck follow,
and a crate-to-garden or producer-to-crate job across decks. Run on a stationary
and walking/posed Nomad, with render cadence sampled at 30/60/144 Hz while the
authoritative fixed step stays 60 Hz. Moving the dock, demolishing an endpoint,
losing power or blocking a landing cancels safely. One hundred traversals keep
controllers, bodies, colliders and route-cache size bounded. Until all of this
passes, the documented same-deck refusal remains enabled.

## 2. Measured crowded-combat smoothness

The latest paired Medium 1920x1080 samples measure about 49 FPS with eight live
enemies, while deck and rapid-look scenes remain near 60 FPS. The fieldwork
fixture is neutral relative to its control, so this work targets the shared
crowd path rather than removing L-12 features.

The profiler uses one saved fixture, seed, camera path, build layout, enemy
roster and warm-up for baseline and candidate runs. It records:

- frame interval median/p95/p99/max and counts above 25, 33 and 50 ms;
- render CPU, fixed CPU, physics, character movement, raycasts and enemy tick;
- renderer calls, triangles, geometries, textures and programs;
- per-enemy visual/mixer, authoritative-pose, shadow and muzzle-query cost when
  an isolated measurement is possible;
- backend, resolution, quality, build hash and active actor counts.

The Luna worker performs same-process ablations before proposing production
changes. Acceptable changes include measured transform caching, bounded visual
animation/shadow cadence at distance, avoiding redundant traversal, or batching
that does not alter simulation. Removing enemies, reducing their AI tick rate,
changing weapon timing, hiding nearby counterplay or lowering the chosen quality
preset is not an optimization.

All authoritative AI, navigation, shots, damage, muzzle origins, death timing
and pooling remain fixed-step equivalent. Visual scheduling must refresh
immediately on attack, hit, death, spawn and camera-near transitions. No new
shader may compile during the measured post-warm-up run.

Local acceptance on the declared RTX 3070 reference is three paired warmed
runs at 1920x1080 Medium. The candidate crowd median target is at least 55 FPS,
with materially fewer frames above 25 ms and no regression in deck or rapid
look. There must be no new frame above 50 ms attributable to compilation or
allocation. Low and High receive sanity runs, and a 100-cycle spawn/death soak
keeps renderer, physics and pool counts bounded. Results remain hardware-local,
not a universal frame-rate promise.

## 3. Campaign continuity and pacing

Current browser suites prove isolated chapters and systems by shortening travel
or directly preparing facts/resources. They do not prove that a player can
start a fresh campaign, learn it, survive it, finish Meridian and continue from
the same save. This iteration adds a resumable acceptance runner and fixes only
deadlocks or recovery failures that the run demonstrates.

The runner drives public DOM controls and normal input through:

1. profile selection and opening;
2. radio recovery, recurring raid eligibility and Wreck One;
3. Foundry, Quiet Array, Glass Orchard and Meridian route choice;
4. required journals, objectives and unique pickups;
5. building/crafting needed by the chosen Story or Survival path;
6. the peaceful Meridian commitment, credits and Keep Walking;
7. save, quit, Continue and death recovery at representative safe boundaries.

It must not write StoryDirector state, recovered facts, inventory slots,
resources, health, build structures or encounter outcomes through private test
seams. It may select a deterministic seed and use ordinary debug-free New Game
options. UI clicks, movement, interaction, combat, building, crafting and saves
use the same Game paths as a player.

Travel acceleration is permitted only to make long uneventful distance
tractable. It must advance the authoritative fixed simulation, world distance,
machine fuel/power, needs, weather and threat scheduling together. It may run
fixed steps faster than wall time or skip rendering between sampled intervals;
it may not assign `distanceTraveled`, phase, arrival distance, sim time or
resources. Combat and destination interiors run at normal fixed-step cadence
and normal authority. Every accelerated segment records simulated duration,
wall duration, starting/ending resources and events.

The runner writes an append-only checkpoint after each durable in-game save so
a harness interruption resumes through the actual Continue/load path. A failed
step records the last screenshot, UI text, campaign/save summary and console
errors without mutating state to continue.

At least one fresh Story campaign must reach Keep Walking uninterrupted in this
sense. A fresh Survival campaign must cover the opening, finite-ammo crafting,
representative infantry/vehicle combat, death recovery, one expedition and a
quit/load boundary; extend it to the ending if the first run exposes no
prohibitive duration. Report observed simulated travel/combat/build time and an
honest unaccelerated duration estimate. Do not claim the roadmap's 8–15 hours
unless measured player time supports it.

Any gameplay correction requires a reproducible failure and a focused
regression. Typical valid corrections are an unreachable interaction, a missing
recovery resource, an unsafe save phase, or a prompt that directs the player to
an impossible action. Pacing changes require before/after evidence and root
approval because resource rates and encounter distances are balance authority.

## Release boundary

The iteration is complete only when all three tracks have their own evidence
and the existing unit, lint, TypeScript and production-build checks pass. A
successful campaign runner does not waive focused simulation tests; a graph
test does not prove physical stairs; one favorable performance sample does not
prove smoothness. The release record must distinguish automated fixtures,
accelerated simulation, actual wall-clock play and hardware-local measurements.
