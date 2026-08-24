# Improvement Log

A running record for the 15-minute improvement loop. Newest first. Each entry
says what changed, what was actually measured, and what the next iteration
should pick up.

---

## 006 — Walls became something enemies route around, not walk into

**Why.** A wall was decoration. `steerAround` is local avoidance — a probe fan
that samples nine directions and takes the best-scoring one — not pathfinding,
and its own header says so. An enemy on the far side of a player-built wall
had no sampled direction that was both open and pointed at the player, so it
pressed into the wall forever. Design pillar 3.4, "the player's custom base
becomes the combat level," was unrealised: the build system worked and meant
nothing in a fight.

**What changed.** A new pure module, `src/enemies/NavGraph.ts`: nodes come
from the build grid (a floored cell, or a level-0 cell over the bare deck),
lateral links are gated on a new `blocksNavigation` piece predicate, and
stairs are the only vertical link — the cell above a stairs run, both ways.
`findPath` is A* with a level-change cost, falling back to the nearest
reachable cell when the goal cannot be reached, so a player who seals
themselves in gets an enemy that holds at the inside face of the nearest
wall and keeps hunting, rather than a siege state machine. `steerAround` was
**re-aimed at the current waypoint, not replaced** — A* answers which way
round the building, the probe fan still answers how not to walk into the
generator, and every local-avoidance rule already tuned survives untouched.

**Three things that were nearly wrong, and how they were caught.**

1. **`blocksNavigation` had to be a new predicate, not a reuse of
   `boundsRoom`.** They disagree on railings: a railing is correctly not
   room-bounding — a railed platform is fenced, not enclosed — but its
   collider is a 2m × 1.1m box against a 0.45m autostep, so it is physically
   impassable. Reusing `boundsRoom` would have called a railing walkable and
   routed enemies straight into a barrier they cannot cross, wedging them
   against it — precisely the failure this feature exists to remove. Settled
   by reading `pieceColliders()` in `BuildPieceGeometry.ts`, not by the design
   chat's assumption.

2. **The graph originally excluded the build system's blocked set**, on the
   assumption that "blocked" meant "unwalkable." Measured on the running game,
   that left **14 of 45 deck cells in three disconnected islands**, with most
   deck-perimeter cells gone. Since arrivals land 0.6m in from the deck lip,
   enemies would usually have had no start node, `findPath` would return
   empty, and **pathfinding would have been inert in the real game while
   every unit test stayed green** — the unit tests never build a grid dense
   enough to expose the fragmentation. The fix: navigation deliberately
   ignores the blocked set, because that set is a build-PLACEMENT rule whose
   2m rounding of equipment collider bounds is far too coarse to describe
   where a body can actually walk. Equipment avoidance belongs to the
   steering layer, which was already handling it.

3. **A waypoint-lookahead**, added so an enemy's heading doesn't stall
   between two short legs of a route, could aim it straight through a wall at
   any L-shaped corner — an L-detour's two arms can be closer to each other,
   as the crow flies, than either is to the corner between them, and the
   lookahead accepted a farther waypoint on Euclidean distance alone. It was
   caught in review, not by tests, because `tools/combat.mjs`'s existing
   checks run on a bare deck and are structurally blind to walls; nothing in
   the harness could have failed on this. Fixed with `segmentIsClear`, a
   supercover grid-DDA traversal checked against the graph's own links so the
   lookahead only extends to a farther waypoint the graph itself proves is
   reachable in a straight line. Then fixed **again** when review found the
   first version proved only the near half of a corner graze — it checked the
   two edges leaving the current cell but not the far side of the same
   lattice corner, so a wall pair positioned on the far side could still let
   the line squeeze through undetected. Both complete L-routes around the
   corner are now required, not just the one nearest the enemy.

**The honest limitation.** A pre-existing character-controller bug means no
kinematic capsule — enemy or player, reproduced under held WASD input as well
as AI — can currently complete a crossing through a doorway opening or up a
stairs run; it freezes dead mid-step or mid-climb. `maxSlopeClimbAngle` is
ruled out for the stairs case (50° against a 36.87° ramp), and the
`enableAutostep(..., 0.2, ...)` minimum-step-width parameter is a lead, not a
conclusion. So routing is proven — a scavenger reaches the correct side of a
wall, through the doorway cell, watched red before green — but arrival is
not. Two harness checks that would need a working crossing (a scavenger
actually standing inside a walled room, and actually reaching level 1 by the
stairs) were dropped rather than shipped permanently red.

**Method lesson.** The recurring one, and the same one log 005 paid for: a
check that cannot fail, or a harness that cannot see the thing it guards, is
not evidence. 005 was a five-centimetre model passing every check that
existed because nothing asserted size. This iteration has two instances of
the same shape: a unit suite that stayed green while the real game's
pathfinding would have been inert (item 2), and a combat harness structurally
incapable of exercising the exact bug that shipped in review (item 3). The
fix in both cases was the same kind of fix — measure the real, running
system, not the suite's idea of it.

**Next.**

- **Root-cause the traversal freeze.** `maxSlopeClimbAngle` is already ruled
  out; the autostep min-width parameter is the next thing to check, on both
  the doorway and the stairs symptom, without assuming they share one cause.
- **Stairs have a second, independent blocker: zero drive at the landing
  waypoint.** `NavGraph`'s only vertical link puts the landing directly above
  the run cell, sharing its x and z exactly. `nextWaypointIndex` correctly
  refuses to consume that waypoint from a different level, so the landing is
  correctly held as the target — but since its XZ equals the run cell's own
  XZ, `Enemy.ts`'s `flat > 1e-4` movement gate leaves `vx` and `vz` at zero
  once the enemy reaches the run cell's centre. It parks motionless at the
  foot of the ramp; the wedge detector's `asked > 1e-5` test also fails, on
  the same zero, so there is no back-out either. This is independent of the
  traversal freeze above — both must be fixed before stairs work, and fixing
  only the freeze will leave enemies parked with nothing pushing them onto
  the ramp. Suggested direction, not a decision: while holding a waypoint on
  a different level, steer at the *next* waypoint's XZ, or at the ramp's
  uphill vector, rather than at the landing's XZ.
- **`steerAround` cannot hold a broadside heading against a flat surface.**
  The lookahead avoids handing it that heading rather than curing the
  underlying inability — worth its own pass once it matters for something
  other than a corner graze.
- **Whether enemies bunch at a doorway** (spec section 10) once traversal
  actually works, and whether the funnel reads as tactical or as a queue.

---

## 005 — Scavengers were rendering five centimetres tall

**The player was right, and I was wrong.** They reported "no enemies" three
times. I told them, from their own screenshot, that a scavenger was standing two
metres in front of them. It was not. That figure is the **player's own body** —
the camera sits about 3.6m behind the player, and I had been reading the player
character as an enemy in every screenshot this session, including when I told
them so.

**The bug.** `EnemyVisual` fitted the model with
`new THREE.Box3().setFromObject(scene)` on a freshly cloned scene whose world
matrices had never been updated, using the cheap non-precise path. That path
measures each mesh's bind-pose bounding box — for a skinned mesh, the
armature's whole reach rather than the body. It reported the model as ~147
units tall when its vertices span about 4.3. `fitToCapsule` did exactly what it
was told and scaled the model by 0.0129, so every scavenger rendered **0.06m
tall**: present, animated, pathing, attacking, and invisible.

That is the whole of "no enemies" and most of "vitals randomly going down".

**The fix.** `scene.updateMatrixWorld(true)` before measuring, and
`setFromObject(scene, true)` to walk actual vertices. Scale went 0.0129 → 0.430,
drawn height 0.06m → 1.91m, feet at 2.45 against a deck top of 2.49.

**How it hid for so long.** Every check that existed was true of a five
centimetre model: `hasModel` was true, four skinned meshes were present, two
enemies held different poses, the hit flash set emissive on all 19 materials,
the death clip clamped. Nothing asserted the model had a *size*. There is now a
check for drawn height and foot placement, and I verified it goes red — 0.06m —
when the fix is reverted.

**Also in this commit.** A hostile retint of the placeholder (its dominant
colour, `#ca9337`, is almost exactly the tone of the dunes) and an emissive eye
band. Both were written before the scale bug was found, and both were untestable
by eye until it was fixed.

**Method lessons, bought expensively.**

- Every visual conclusion I drew this session from a screenshot was wrong at
  least once. The thing that finally worked: hide everything else
  (`machine.group.visible = false`, `player.object3D.visible = false`), then
  toggle the subject and diff. Do that *first*, not after an hour.
- "Measured correctly" and "the player can see it" are different claims. The
  materials were provably right while the model was invisible.

**Next.**

- Re-judge the retint and the always-on health bars now that the model is
  actually visible. Both were tuned blind.
- Consider whether third-person is intended — the player's own body occupies
  the centre of the screen and I mistook it for an enemy repeatedly.
- Audio: still nothing in the project.
- Graphics pass: not started.

---

## 004 — A health bar over every scavenger

**Why.** Iteration 003 made a scavenger react when shot, which says "you hit
it" but nothing about "and it is nearly dead". More importantly the player's
original complaint was not being able to find them at all, on a deck cluttered
with an engine, a generator, cargo and a bulwark that hide a 1.9m figure
completely.

**What changed.**

- New pure module `src/enemies/HealthBar.ts` — `healthFraction()` (clamped,
  NaN-proof) and `healthBarColour()`. The colour runs red → orange → yellow
  rather than the usual green → red: a scavenger is a threat at every point on
  that scale, and green would read as something the player is meant to leave
  alone. The change is there to say "nearly done", not "safe".
- `EnemyVisual` draws a two-sprite bar above the capsule. Sprites so it faces
  the camera without this class knowing where the camera is, and **depth
  testing off** so cargo cannot hide a scavenger. Seeing one through a crate is
  a smaller problem than the one being fixed.
- The bar is added to `object3D` *after* the body, and after `adoptMaterials`.
  Both matter — see below.

**Measured.**

- 8 new unit tests. 408 unit tests green.
- Two new harness checks: the fill tracks health (0.86 → 0.43 at half health,
  50%), and a corpse's bar disappears.
- Placement measured in screen pixels rather than judged by eye: at 6.66m the
  bar sits 26px above the head, centred on the enemy within 1px, 91px wide
  against a ~148px body.
- 9/44/21/29 harness checks, 11 e2e, lint and build clean.

**Two bugs the harness caught, both mine.** Adding the bar in the constructor
made it `children[0]`, and the existing foot-height check indexes that to find
the body — it started reporting feet at 4.683 instead of 2.443. And the bar was
hidden in `setState('dead')`, which runs on the next fixed tick, so a corpse
advertised a health bar for a frame. Fixed by adding the bar last and hiding it
from `setHealth` at zero, which `takeDamage` already drives. Worth noting that
neither was visible in a screenshot; both were caught by assertions.

**A correction to log 003.** I blamed the free camera being "overwritten by the
render loop" for bad screenshot framing. That was wrong: `PlayerCamera` builds
its own camera and never touches `renderer.camera`. What actually happened is
that the enemy walks at 3.1 m/s and left the frame between the camera being
placed and the capture landing. The fix is to frame off a fixed point, or let
the enemy reach attack range first, where it stops moving.

**Also worth remembering.** I twice judged this feature "obviously wrong" from a
screenshot — the bars looked enormous and detached — and both times the numbers
said otherwise. The first was a 2.7m camera making a 0.86m bar fill the frame;
the second was three enemies converging behind a bulwark that hid their bodies
while the bars drew through it, exactly as designed. Project the thing to screen
coordinates before believing your eyes.

**Next.**

- **Threat colouring at rest.** The model still reads as friendly when nobody
  is shooting it. This is the last piece of the threat-read work.
- **Whether always-on bars are too much.** Four bars visible through the hull at
  all times may read as cheap. Worth revisiting once threat colouring lands —
  the two solve overlapping problems.
- **No audio anywhere in the project.** Still the largest missing feedback
  channel; check whether that is deliberate scope before adding it.
- **Graphics.** Not started.

---

## 003 — Scavengers react to being shot

**Why.** Shooting one produced nothing visible until it died. A thing that does
not react to being shot is indistinguishable from deck furniture, which is
exactly what the player took one for. It is also the feedback that makes a
weapon feel like it is connecting.

**What changed.**

- New pure module `src/enemies/HitFlash.ts` — `flashIntensity()`, a curve that
  holds full brightness for the first 35% before decaying. The hold is not
  decoration: at 30fps a frame is 33ms against a 160ms flash, and a pure decay
  can be stepped clean over between two frames so the hit that killed something
  shows nothing.
- `EnemyVisual` now **owns its materials**. `SkeletonUtils.clone` shares
  materials between clones exactly as it shares skeletons — without per-enemy
  copies, shooting one scavenger lights up every scavenger aboard. Shared
  materials remain the right default everywhere else in the project; they are
  wrong here for one reason, which is that this class writes to them.
- The flash is applied at the moment of the hit, not deferred to the next
  render where the decay runs. A frame can be longer than the whole flash — on
  a software renderer it routinely is — and the first update would otherwise
  step straight past the curve and apply nothing.

**Measured.**

- 7 new unit tests on the curve. 400 unit tests green.
- Two new harness checks, on the fallback path: a shot scavenger's peak
  emissive goes 3.50 → 5.90, and a bystander standing next to it stays at
  exactly 3.50. That second one is the per-enemy-materials check and is the
  only thing that catches shared materials.
- Model path measured separately in the browser: all 19 GLB materials move to
  emissive `#ff3020` at intensity 5.5.
- 9/42/21/29 harness checks, 11 e2e, lint and build clean.

**One thing that nearly shipped as a non-fix.** The first version drove only
`emissive`. It measured perfectly and looked like almost nothing: the deck is
lit by a low orange sun, everything on it is already warm, and a red glow
against a red-lit hull does not register. Dragging the base colour as well
changes the silhouette rather than its shading, which survives whatever the sun
is doing. Worth remembering — measuring a material property is not evidence
that a player can see it.

**Limits of what was verified.** The screenshots confirm the torso shifts
olive → red, and the numbers confirm every material moves. I did not manage a
clean side-by-side of the whole model: the free camera gets overwritten by the
render loop each frame, so `freeCamera.position.set` from a probe does not
stick, and headless rAF throttling means a 160ms effect has to be pinned open
(`visual.flashElapsed = -1000`) to be captured at all. A future iteration
wanting reliable visual diffs should fix the camera-override problem first.

**Next.**

- **Enemy health bar.** The flash says "you hit it"; nothing yet says "and it
  is nearly dead". A billboarded bar above a damaged scavenger is the obvious
  next step for threat read.
- **Threat colouring at rest.** The model still reads as friendly when it is
  not being shot.
- **No audio anywhere in the project.** Still the largest missing feedback
  channel; check whether that is deliberate scope before adding it.
- **Graphics.** Not started.

---

## 002 — Boarding awareness: the deck tells you something is on it

**Why.** The player reported an empty deck while a scavenger was aboard, twice.
Arrivals land once every 250m (~33s of travel), at the deck edge, deliberately
placed *as far from the player as the deck allows* — which puts them astern,
screened by cargo, on a deck the player is facing away from. Nothing announced
one, and nothing showed how many were aboard, so the first news of an arrival
was being hit by it.

**What changed.**

- New pure module `src/ui/DeckBearing.ts` — `deckBearingName()` names a spot in
  ship words: the bow, the stern, the port rail, the starboard quarter,
  amidships. Machine-relative rather than player-relative on purpose: "aft"
  stays true while the player spins on the spot looking for what is hitting
  them, where "behind you" stops being true the moment they turn. Thresholds
  are a fraction of the deck's half-extent, not metres, so they still hold when
  the player builds the deck longer.
- HUD raises a boarding banner on `enemy:spawned` — "SCAVENGER BOARDING THE
  PORT QUARTER" — for four seconds.
- The machine panel gained a permanent **Aboard** count, red whenever it is
  above zero. This is the part that directly answers "no enemies": the number
  is on screen the whole time, whether or not the player saw the banner.

**Measured.**

- 7 new unit tests on `deckBearingName`. 393 unit tests green.
- Screenshotted and inspected: banner reads correctly for a spawn at
  (-4.4, 6.9) — "the port quarter" — and the panel shows `Aboard 1` in red.
- 9/40/21/29 harness checks, 11 e2e, lint and build clean.

**One correction.** My first test asserted that z=-7 on a 40m deck is
"amidships"; it is 35% of the way up, just past the 34% threshold, so the code
was right and the test was wrong. Fixed the test, not the code.

**Next.**

- **Enemy threat read** is now the biggest gap. The RobotExpressive placeholder
  reads as friendly scenery — I twice misidentified machine geometry as a
  scavenger while reading screenshots this session, which is itself the
  evidence. Wants: a flinch or flash when shot, threat colouring or emissive,
  and a health bar so shooting one feels like it is working.
- **No audio anywhere in the project.** Still the largest missing feedback
  channel; check whether that is deliberate scope before adding it.
- **Graphics.** Not started. Flat washed-out lighting, weak shadow contrast.

---

## 001 — Damage feedback: you can now tell you are being attacked

**Why.** The player reported "vitals seem to randomly go down" twice, across two
separate sessions. It was not random and it was not a bug in the damage system:
`player:damaged` was emitted by `PlayerStats` and **had no subscribers at all**.
Being hit produced no screen flash, no directional cue, no sound, no hitmarker.
The only tell was a number in the corner quietly decreasing, which reads as the
game malfunctioning rather than as something attacking you.

**What changed.**

- `player:damaged` now carries `from`, the attacker's position. `PlayerStats`
  already received it and was throwing it away.
- New pure module `src/ui/DamageDirection.ts` — `damageBearing()` turns an
  attacker position, the player position, and the camera yaw into a screen
  bearing (0 ahead, positive right, ±π behind). Pure so the trigonometry is
  testable in node instead of by being punched in a browser.
- HUD renders two things on a hit: a red vignette that hugs the screen edges,
  and a soft directional glow that rotates to point at whoever hit you. The
  bearing is recomputed every frame, so turning to look sweeps the glow round
  to meet the attacker.
- The vitals panel kicks with a red outline, so the overlay and the number read
  as one event.

**Measured.**

- 7 new unit tests on `damageBearing`, plus one on `PlayerStats` asserting the
  attacker position reaches the event. 386 unit tests green.
- Rotation verified end to end in the browser, not just in unit tests: attacker
  behind → `rotate(-180deg)`, right → `rotate(90deg)`, front-left →
  `rotate(-45deg)`.
- Screenshots inspected at peak strength. First attempt washed the entire
  screen red and drew a hard-edged triangle floating mid-frame; tuned down to
  an edge-hugging vignette and a soft glow, and re-inspected.
- 9/40/21/29 harness checks, 11 e2e, lint and build clean.

**Two things worth knowing for later iterations.**

1. **Headless screenshots cannot see short transients.** rAF is throttled in
   headless, so a 1.1s effect decays before a capture lands, and CSS
   transitions never advance. To inspect one, pin its expiry open from the page
   (`hud.hurtUntil = performance.now() / 1000 + 120`) and screenshot that.
   This also found a real flaw: the overlay had a 90ms fade-*in*, which is
   wrong for damage feedback. Removed — a hit must register on the frame it
   lands.
2. **Arrivals do work in plain play.** Verified with no debug skips: one
   scavenger boards at 251m, the next at 500m. Earlier verification in this
   session leaned on `queueDebugAction('skip')` and never tested the real
   thing. The player's "no enemies" is a legibility problem, not a spawning
   one.

**Next.**

- **Boarding alert.** One enemy per 250m (~33s of travel), spawning astern and
  biased *away* from the player, on a cluttered 16m deck. Even now that it
  crosses the deck, nothing announces it. A HUD warning ("Scavenger aboard,
  aft") on `enemy:spawned` would do more for "no enemies" than anything else.
- **Enemy threat read.** The CC0 RobotExpressive placeholder looks like
  friendly scenery — in the player's own screenshot they walked past one and
  reported seeing none. Needs hit reaction, threat colouring, and a health bar.
  I twice misidentified machine geometry as a scavenger while reading
  screenshots, which is itself evidence of how poorly it reads.
- **No audio anywhere in the project.** The single highest-value missing
  feedback channel; check whether that is deliberate scope before adding it.
- **Graphics.** Not started. The player calls them basic: flat washed-out
  lighting, weak shadow contrast.
