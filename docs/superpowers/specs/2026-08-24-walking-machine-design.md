# Machine Move Forward — The Machine Walks

**Date:** 2026-08-24
**Status:** The machine walks. Section 4 is settled and measured, section 5's
gait and section 6.3's IK are built and tested, section 6.2's CC0 inspection
was carried out and failed — the legs are procedural (6.4). What is left is
tuning by eye, the dust at each footfall, and one pre-existing inconsistency
this work uncovered (12).
**Source design:** `machine-move-forward-game-handoff.md` sections 6, 14, 41
**Builds on:** the engine room (WIP), world-scroll interpolation, tread cleats, track marks

---

## 1. Purpose

The machine is a tracked crawler. It should be a walker.

Treads were the right first answer — cheap to model, cheap to animate, and the
scrolling cleats plus the tracks pressed into the sand now sell forward motion
honestly. But a walker is a different kind of object. A tracked hull glides;
a legged one *transfers weight*, and that is a silhouette and a rhythm nothing
about treads can imitate.

This spec covers making the machine walk: what moves, how it stays collidable
while moving, where the geometry comes from, and what the existing motion work
becomes.

**The hull, deck, and engine room do not change.** They are gameplay space —
a 10×16m deck carrying a 9×12×3 build grid with an engine room beneath. No
imported model has any of that, and their colliders derive from their own
geometry, which is a property the build system depends on. What changes is
what carries them.

---

## 2. Constraints

Inherited and still binding:

- **No asset files** *was* the rule; it is now "procedural by default, assets
  where they earn their place" (`ASSETS.md`). Section 6 argues the legs earn it.
- **The machine holds station at the world origin.** It does not translate
  through world coordinates. A gait's heave and pitch are bounded oscillations
  about that origin, not travel, and do not threaten the float-precision or
  shadow-camera reasons the rule exists (handoff section 6).
- **Definition and runtime instance stay separate types.**
- **The camera is never displaced.** Confirmed with the player: the machine may
  move, the view may not. Every cue in this spec is diegetic.
- **Existing suites must keep passing:** 510 unit, 11 e2e, and the browser
  harnesses.

New and load-bearing:

- **Colliders must track the body they belong to.** See section 4.
- **Gait is driven by distance travelled, not wall time**, like every other
  pacing decision in this project. A machine that walks on a wall clock keeps
  striding when it is stopped.

---

## 3. What the player should perceive

In rough order of how much each carries the illusion:

1. **Silhouette.** Legs against the horizon, articulated, obviously bearing
   load. This alone changes what the object *is* before anything moves.
2. **Weight transfer.** The body rises and falls, and lists slightly toward the
   loaded side. This is the cue that separates a walker from a hovering hull.
3. **Foot plant.** A foot that stops dead on contact and stays put while the
   world moves past it. Sliding feet destroy the effect faster than no
   animation at all.
4. **Footfalls in the sand**, replacing the continuous tracks.
5. **Impact dust** at each plant, replacing the continuous tread plume.

---

## 4. The central problem: a body that moves and still holds people up

This is the whole engineering content of the feature. Everything else is
modelling and tuning.

The machine's colliders are created once as **fixed** rigid bodies at
construction (`Machine.ts`, `physics.addFixedBox`). If the body heaves and
pitches with a gait, the deck the player *sees* separates from the deck the
player *stands on*. At the deck's extremities a 1.5° pitch is about 20cm of
error — enough to leave a character visibly floating or sunk.

### 4.1 Decision: kinematic machine colliders, with platform carrying

**Recommended.** Machine colliders become **kinematic position-based** rigid
bodies. Once per fixed step, a single body transform — heave, pitch, roll — is
computed from the gait and every machine collider is written to its
transformed pose. Characters standing on the machine have the platform's
delta applied to their desired movement before `computeColliderMovement`,
because Rapier's character controller does not carry a character with a moving
platform on its own.

Why this one:

- It is the only option where the deck genuinely tilts *in physics*. The player
  chose "you feel motion because the deck moves"; a deck that is level in
  physics and tilted only in the render is not that.
- It generalises. Boarding vehicles that latch onto the hull, turret recoil,
  and a machine that lists after damage all need exactly this machinery.
- It is the standard solution to a standard problem, so its failure modes are
  known rather than novel.

Costs and risks, stated plainly:

- Every machine collider is touched every fixed step (~25 of them). Trivial
  cost, but it is new per-step work in the hot path.
- **Platform carrying is the part that will bite.** Getting it wrong produces
  jitter, sinking, or a player who slides off a level deck. It needs its own
  tests before any gait is tuned on top of it.
- The dev guard in `Machine.fixedUpdate` that throws if the group leaves the
  origin must be relaxed to permit bounded oscillation while still catching
  actual drift. It should assert a *bound*, not equality with zero.

### 4.3 Attempted, and what actually happened

**4.1 was implemented and reverted.** Recording it here so nobody spends the
same afternoon twice.

The machine's colliders were moved onto a single kinematic body, posed once per
step. Every unit test passed and the machine looked identical — and the player
could no longer walk. Measured with the character controller instrumented:
`computedMovement` returned exactly zero on every step while `computedGrounded`
stayed true, with ~20 contacts all reporting an upward normal. That is the same
signature `constants.ts` already documents for a capsule spawned inside the
deck plate.

The cause is a Rapier rule, not a mistake in the pose maths: **collision is not
generated between two non-dynamic bodies.** The player's capsule is already
`kinematicPositionBased`, so the moment the machine stopped being `fixed` the
pair became kinematic-versus-kinematic and the controller had nothing solid to
resolve against.

Gating the pose writes so an unchanged pose never touches the body did not help
— the problem is what the body *is*, not how often it is written.

So 4.1 is not simply "more work than expected"; it needs a different mechanism.
The options worth investigating next, in the order I would try them:

1. Keep the machine's colliders **fixed**, and move them by rebuilding or
   re-positioning the fixed bodies directly each step. Fixed bodies can be
   teleported; whether the character controller tolerates that smoothly is the
   open question.
2. Make the machine's body **dynamic but kinematically driven** — a dynamic
   body with infinite mass, which restores contact generation against the
   kinematic player.
3. Take 4.2 and move the world instead.

What survives the revert and is worth keeping: `src/machine/MachineBody.ts`,
pure and covered by 17 tests, including the property that carry deltas sum to
zero over a closed gait cycle so nothing ratchets across the deck. Any of the
three routes above needs exactly that module. `Player.carry` is plumbed and
inert at rest.

### 4.4 Solved: dynamic bodies, locked and driven

Two experiments settled it.

**Experiment 1 — one kinematic body per collider**, mirroring the original
fixed layout exactly. Failed identically. That discriminates the two things
4.1 changed at once: the blocker is the **body type**, not collapsing ~25
bodies into one multi-collider body.

**Experiment 2 — dynamic bodies, `lockTranslations`, `lockRotations`,
`setGravityScale(0)`.** The player walks: 9/9 on the drive harness. A dynamic
body still generates contacts against the kinematic player capsule, while the
locks and zero gravity make it immovable by the solver. It is repositioned
explicitly with `setTranslation`/`setRotation`, which teleport a body directly
— the solver will not fight it.

So the machine's colliders are now driven from the body pose every step, and
the deck you stand on is the deck you see.

**Measured, with the body oscillating and no gait or legs present** — the test
section 10 insisted on. Player standing near the stern, where tilt moves the
deck most, ±0.11m heave and ±1.5° of pitch and roll for nine seconds:

- The player's height *relative to the deck* stayed inside a **0.058m band**,
  and their absolute Y swung 4.55 → 4.67 with the deck. They are carried.
- **Residual: about 0.31m of X and 0.63m of Z drift** over those nine seconds.

The drift is the one thing still to settle. Section 4.5 settles it — and the
guess in this paragraph, that `carryDelta` was sound and the ratchet lived in
Rapier's contact resolution, was wrong on both counts.

### 4.5 Settled: what the drift actually was

Two defects, independent, both in our own code. Neither was in Rapier.

**One — the carry was taken at the wrong point on the machine.** `carryDelta`
was handed the player's WORLD position and ran it through `transformPoint`,
which expects a machine-LOCAL one. Those are the same three numbers only while
the machine is at rest. A tilted metre later they name a different plank, so
every step asked how far *that other* point moved, and the answer was wrong by
a consistent bias rather than a wobble — about 7mm per pose pair at the deck's
edge. It integrates: **~10mm per gait cycle, 0.62m per 40 cycles** in an
isolated rig, which is the size of the 0.31m and 0.63m first measured.

The unit test that was supposed to catch this — deltas summing to zero over a
closed cycle — passed throughout, because it re-asked at a FIXED point. A
character does not stand still; each step it is somewhere new and the next
delta is asked for there. The test now follows the point through its own
deltas, and fails by 10mm per cycle against the old code.

The fix is to find the point on the machine first: undo the pose it was
standing in, then apply the new one. That is exactly the machine's rigid
motion of that point, so it is right from any pose rather than only from rest.

**Two — the vertical carry never reached the deck.** It was added to the
movement vector handed to the character controller, alongside gravity and
input. But a character standing still is pushed downward at 2 m/s so the
controller keeps finding the ground (`Player.fixedUpdate`), and that push is
about six times a step of platform rise. Summed, the rise vanished into it,
the controller resolved the total as "down", and a rising deck climbed
straight *through* the player. They tracked a falling deck, because gravity
does that work unaided, and a rising one not at all.

Measured against the real machine, with the body heaving 0.12m and tilting
1.5 degrees: the player's height above the deck varied by **0.396m** while
their world Y swung only 0.084m. They were very nearly nailed in the world
with the deck breathing around them. This is the same thing the 0.058m band in
4.4 was reaching for; that probe computed deck height with an approximate tilt
term and sampled at frame rate rather than every fixed step, and it understated
what was happening by most of its magnitude.

The fix is to stop handing the two to the controller as one vector.
`PhysicsWorld.moveCharacter` now resolves the character's OWN movement — input,
gravity, a jump — against the world, and then applies the platform carry as a
displacement the solver never sees. That is safe precisely because the machine
moves rigidly: a point on it cannot be carried into another part of it, and a
displacement that never passes through the solver cannot be partly absorbed,
projected along a slope, or ratcheted.

**Three — ordering.** The carry is now computed before the player moves and
before the colliders are written, so the player and the deck make the same
rigid step together. Computing it afterwards, as before, handed the player a
delta the deck had already made, and every step then resolved a contact that
should never have existed. Worth 50–100x on its own in the rig.

**After, on the real machine** (`tools/deck.mjs`, twelve seconds at the bow,
full heave and full tilt with pitch and roll a quarter cycle apart so the deck
corkscrews rather than see-saws):

| | before | after |
| --- | --- | --- |
| height above the deck | 0.396m band | **0.0007m band** |
| world Y swing — is the player carried at all? | 0.084m | **0.403m** |
| drift across the deck | 0.036m | **0.0001m** |

Verified red before green: the harness fails both carrying checks against the
old code, and the unit tests fail by exactly the bias described above.

**The residual, and the decision.** One place still moves: a player standing
almost exactly on the machine's origin, which is what the body turns about.
There is almost no carry there to hold them in place, and what is left is the
controller's own resolution against a tilting surface. Measured amidships over
480 seconds of continuous oscillation it wanders and **comes back** — 0.030m at
80 cycles, 0.014m at 160, 0.012m at 240 — rather than accumulating. Half a
metre off the pivot it is 0.0013m over 80 cycles.

That is accepted, not deferred. It is a couple of centimetres of shift
underfoot on a deck that is actively tilting, which is what a tilting deck
ought to feel like, and it is bounded rather than directional.
`deckcarry.test.ts` holds it to that bound, so a future change cannot quietly
turn it back into a ratchet.

**One condition worth stating:** the carry is applied to the player whenever
the machine's pose changes, without asking whether they are standing on the
machine. That is correct today because nothing else in the world is solid —
the sand has no colliders, and falling off the deck means falling to the
respawn threshold. The day the ground becomes standable, this needs a gate.

### 4.2 Rejected alternative: move the world instead

The architecture already holds the machine still and scrolls the world past
it, so the obvious cheap trick is to extend that: leave the machine rigid and
apply the gait's heave and tilt to the world instead, inverted. Physics is
untouched, there is no platform-carrying problem at all, and because the camera
is rigidly attached to the machine the *rendered* result is very nearly
identical.

It was rejected because the deck would stay perfectly level in physics. Nobody
would ever feel a list, a character would never shift on a slope, and a
future boarding vehicle would have nothing to attach to. It buys most of the
look for a fraction of the risk while foreclosing the reasons to want it.

**It remains a legitimate fallback.** If platform carrying proves worse than
this spec expects, moving the world gets perhaps 80% of the visual for perhaps
20% of the risk, and that trade should be taken deliberately rather than
discovered.

---

## 5. Gait

A pure module, `src/machine/Gait.ts` — distance in, leg phases and a body
transform out. No Three.js and no Rapier, so it is exhaustively testable in
node like `NavGraph`, `EnemyAI`, and `EnemySteering`.

- **Four legs**, ~~in diagonal pairs~~ **a quarter cycle apart**. Six reads more
  insect-like and doubles the animation and IK work for a silhouette that is not
  obviously better at this scale; four is also easier to make read as *heavy*.

  Diagonal pairs had to go, and it is worth saying why because the reasoning
  looked sound. Pair the legs diagonally and every side of the machine, and
  every end of it, holds exactly one leg from each pair at every instant. The
  port and starboard support sums are then identical **by construction** — in
  single support and in double support alike — so roll and pitch are not merely
  small, they are exactly zero for the whole cycle. A trot can heave and it can
  do nothing else. That is flatly incompatible with section 3's second cue, and
  section 3 ranks weight transfer above foot plant. Measured, then changed:
  legs now run at 0, ¼, ½, ¾ of a cycle. Going back is four numbers in
  `src/data/gait.ts`.
- **Phase is a function of distance travelled**, so the machine strides in
  proportion to how fast it is actually moving, and stops striding when it
  stops. One full stride cycle per `STRIDE_LENGTH` metres.
- **Stance and swing.** A leg in stance holds its foot at a fixed world point
  while the world scrolls past — the foot moves astern in machine space at
  exactly the scroll rate. A leg in swing lifts, travels forward, and plants.
  Duty factor above 0.5 so at least two legs are always down.
- **Body transform** is derived from the stance legs: heave from their mean
  extension, roll from the left/right difference, pitch from fore/aft. Bounded
  hard — heave within ±0.12m, pitch and roll within ±1.5° — because the deck
  is a shooting platform and a build surface before it is a spectacle.

  Built, with one addition: the module measures its own signal over a cycle at
  load and scales it to the amplitudes in `src/data/gait.ts`, so those numbers
  mean literally "how far the body moves" and the bound is never actually
  reached. A clamped signal is a square wave, and a square wave is what jitter
  looks like. The legs imply far more movement than the body makes, which is
  fine: the feet are planted, the body is where the body is, and the knee takes
  up the difference.

Tuning knobs live in `src/data/`, not in the module.

---

## 6. Geometry

### 6.1 Hull, deck, engine room — unchanged and procedural

They stay exactly as they are. They carry the build grid, the walkable deck
surface, and colliders derived from their own geometry.

### 6.2 Legs — inspected, and rejected

The plan was CC0 legs, with the model to be **opened and inspected** before
anything was committed rather than trusted from a listing: segment count,
whether the limbs are separable, joint orientation, scale, and triangle budget
against a 10×16m body.

It was, and nothing survived. What the files actually contain:

| candidate | licence | triangles | separable limbs? |
| --- | --- | --- | --- |
| Quaternius **Mech** — the candidate this spec named | CC0 | 4,008, whole robot | **No.** One skinned mesh, and a **biped** |
| Quaternius **Robot Enemy Legs** | CC0 | 4,702 | **No.** Skinned, biped |
| **MechQuadruped** (3Donimus) | **CC-BY** | 59,644 | **No.** One mesh, 11 materials |
| **Mech Assault Walker** (Alimayo Arango) | **CC-BY** | 36,906 | **No.** One mesh, named "Cube" |

The pattern is consistent and, in hindsight, predictable. The CC0 models are
small skinned character rigs: their legs are vertex weights on a
whole-character mesh, not parts that can be taken off one, and a leg is around
a thousand triangles before being scaled up to carry a machine this size. The
models that actually look like heavy walkers are ten times the budget, single
unsplittable meshes — and CC-BY, where this spec required CC0 with no
attribution.

Section 6.2's own risk paragraph called this: *"A 2k-triangle mech's legs
scaled up to carry a 10×16m body may read as crude next to the hand-built
hull."* It is worse than that — they cannot be separated from the mech at all
without asset surgery.

Nothing was imported, so `ASSETS.md` gains no entry. The inspection itself is
the deliverable, and it is recorded here so nobody repeats it.

### 6.3 Legs move by IK

Two-bone IK per leg, solved analytically. The gait supplies a foot target in
machine space; IK produces hip and knee angles. Analytic rather than iterative
because two bones have a closed-form solution and it is trivially testable.

Built, in `src/machine/LegIK.ts`, with three degrees of freedom rather than
two: a **splay** that rolls the leg's whole working plane out from the hull is
needed before hip and knee can reach a foot planted off the centreline. Every
reachability test is a round trip — solve for a target, put the angles back
through forward kinematics, and the foot has to land on it. An unreachable
target stretches straight at it rather than returning NaN, because NaN in a
joint angle propagates into a transform and the mesh vanishes.

---

### 6.4 Legs — procedural, from the existing vocabulary

The fallback this spec provided, and on the evidence above the better option
rather than the consolation one. `src/machine/MachineLegs.ts` builds each leg
from `bevelledBox` like the rest of the machine — hip housing, thigh with a
piston alongside, knee, shin, splayed foot pad — so it matches the hull it
hangs off by construction. Around forty triangles a leg.

Two things about the machine forced the proportions, and both are worth
knowing before anyone retunes them:

- **The hull was drawn around treads.** Its underside is 0.6m off the sand,
  because the engine room is inside it and the deck is a fixed height. There is
  no daylight under this machine and there cannot be without moving the deck,
  which section 1 forbids. So the legs hang OUTBOARD — hips at x = ±6.0, clear
  of the flank rather than buried in it, with the feet a further metre out
  again. A splayed stance also reads as heavier than a leg dropping straight
  down.
- **The hip pivots at the deck line**, y = 3.1, not halfway down the flank.
  Pivoting low gives a stub with nothing around it; pivoting at the deck edge
  gives three metres of visible leg beside a three-metre hull, which is roughly
  the proportion an animal has.

The tread housings that used to fill that volume are gone, replaced by a
shallow sponson that closes the hull's side and gives the leg housings
something to bolt to. Its collider was resized to match what is drawn: the old
one was the size of the housing, and leaving it would have left an invisible
wall a metre outboard of anything visible.

## 7. What existing work becomes

- **`TrackMarks` becomes footfalls.** Done, and it was exactly as small as this
  predicted: the pool, the world-locked movement, the dune-height sampling and
  the taper all transferred unchanged, and the spawn rule went from "every
  `SPACING` metres per side" to "when a foot plants, at that foot's position".
  The caller now says when, because only the gait knows.
- **Tread cleats and the tread belts are removed** along with the treads. Done:
  `TREAD_BELT_LENGTH`, the belts, the road wheels and `Machine.updateVisuals`'
  cleat scroll are gone, and `updateVisuals` now walks the legs instead. The
  `treadCleats` texture generator stayed — it costs nothing and may suit a
  future tracked enemy vehicle.
- **`SandFX`'s continuous tread plume becomes per-plant impact puffs**, keyed
  off the same foot-plant event as the footfalls.
- **World-scroll interpolation stays exactly as it is** and becomes more
  important, not less: a gait is a periodic motion, and periodic motion against
  a quantised backdrop beats visibly. More than that — the legs are now driven
  from `renderedDistance`, the distance the world will be DRAWN at, rather than
  from the simulation's own. Against the simulation's distance every planted
  foot skates on the sand by up to a full step of travel, 0.125m at speed,
  which is the one thing the whole feature exists to avoid.

---

## 8. Testing

**Unit, in node — `Gait.ts` and the IK are pure:**

- one full stride per `STRIDE_LENGTH` metres, independent of frame rate
- phase does not advance when speed is zero
- at least two feet are in stance at every phase (duty factor holds)
- a stance foot's machine-space position moves astern at exactly the scroll
  rate — the treadmill property that stops feet sliding
- body heave, pitch and roll stay inside their bounds across a full cycle
- two-bone IK reaches a reachable target, and clamps rather than exploding on
  an unreachable one

**Platform carrying needs its own tests before any gait sits on top.** Done, in
`tests/unit/deckcarry.test.ts`: a real character on a real driven body in real
Rapier, with the pose maths the machine uses and everything else stripped away,
measured in machine space — the pose undone — because that is what "standing
still on a moving deck" means.

- a character standing on the deck while the body heaves stays at a constant
  height *relative to the deck*
- the same while the body pitches, at the deck's extremities where the error is
  largest
- a character does not accumulate drift over a long run of oscillation — eight
  minutes of it, because a ratchet accumulates and a wander does not, and one
  short measurement cannot tell the two apart

**Browser, in `tools/`:**

- `tools/deck.mjs` — the player stands on the deck through repeated cycles of
  the body at its bounds without sinking, floating, drifting or being thrown,
  against the whole machine rather than a plate, and can still walk afterwards.
  Verified red before green, as with the navigation work.
- footfalls appear under feet at plant, not on a fixed interval. Built: the
  prints are pressed at the foot's own position the moment `Gait` reports a
  plant. Not yet asserted in a harness — see section 11.
- `tools/drive.mjs` now measures the player's height ABOVE THE DECK rather than
  in the world, because on a walking machine those are different numbers and
  only the first one is supposed to hold still. It reads 4.6696 → 4.6696 across
  a walk.

---

## 9. Deliberately not in scope

- Steering or turning. The machine still travels in a straight line.
- Terrain-adaptive footing — feet plant at the sampled dune height, but legs do
  not reach for uneven ground or step over obstacles.
- Damage-driven limp, leg destruction, or a machine that lists permanently.
- Any change to the hull, deck, engine room, build grid, or the navigation graph.
- Camera motion of any kind.

---

## 10. Risks

**Platform carrying is the one that can sink this — and on first attempt it
did.** See 4.3 for what failed, 4.4 for what worked, and 4.5 for the two
defects that survived 4.4 and what they measured. It is now done, tested, and
inert: nothing calls `setPose` in production, so the machine still sits at
rest, and `Game.poseSource` is the seam the gait will fill.

**Original assessment, left as written:** It is the difference
between a machine that walks and a machine that shakes its passengers off. It
must be built and tested on its own, with the body oscillating and no gait or
legs present, before anything is hung on it. If it cannot be made solid, take
section 4.2 rather than shipping a deck that jitters.

**The imported legs may not fit the art direction.** A 2k-triangle mech's legs
scaled up to carry a 10×16m body may read as crude next to the hand-built
hull. The inspection step in 6.2 exists to catch this before it is load-bearing;
the procedural fallback exists because it might.

**Gait tuning is taste, and taste needs eyes.** Stride length, duty factor and
heave amplitude cannot be settled from measurements. Get a walking silhouette
on screen early and cheaply, and expect to tune it with the player watching
rather than to specify it correctly in advance.

---

## 11. Success criteria

1. ~~The machine reads as a walker in silhouette, at a glance, before anything
   moves.~~ **Yes** — four legs from the deck line to the sand, outboard of the
   hull, knees bent and trailing. Whether it reads *well* is taste and wants
   eyes on it.
2. ~~Feet plant and stay planted — no sliding contact at any speed.~~ **Yes, by
   construction and by test.** A planted foot travels through machine space at
   exactly the world's own scroll rate, asserted against `WORLD_Z_PER_METRE`
   rather than a hard-coded sign, and driven from the rendered distance so it
   does not skate between fixed steps either.
3. ~~The body's rise, fall and list are visibly tied to which legs are
   loaded.~~ **Yes** — and getting the list at all is what cost the diagonal
   pairs (section 5).
4. ~~A player standing on the deck through a full stride neither sinks, floats,
   nor drifts, and can still shoot accurately.~~ **Measured.** Through a walk,
   the player's height above the deck reads 4.6696 → 4.6696, and `drive.mjs`
   passes 9/9 with the gait live.
5. **Footfalls appear in the sand under the feet that made them** — built, not
   yet asserted in a harness. The next thing to test.
6. ~~Stopping the machine stops the gait, mid-stride, without snapping.~~
   **Yes, for free:** phase is a function of distance, so a stopped machine
   simply stops.
7. ~~All existing suites pass unchanged.~~ **Yes** — 579 unit, 11 e2e, and the
   browser harnesses at parity with the baseline (the six standing failures in
   `combat.mjs` and `craft.mjs` are pre-existing enemy-navigation and
   crate-payment ones, confirmed identical on the commit before this work).

Still to do, in the order I would do it:

- **Dust at each footfall.** `SandFX`'s continuous tread plume is still a
  continuous plume; section 7 wants a puff per plant, off the same event the
  prints already use.
- **A harness for the prints**, closing criterion 5 the way `deck.mjs` closed
  section 4.
- **Tuning, with the player watching.** Stride length, duty factor, foot lift,
  splay, and the two body amplitudes are all one file, `src/data/gait.ts`, and
  the spec was right that none of them can be settled from measurements.

---

## 12. Uncovered by this work: the machine drives stern-first

Not introduced here, and not fixed here, because fixing it is a decision rather
than a repair.

**The machine's bow points one way and its motion goes the other.** The two
halves of the codebase disagree, and each half is self-consistent:

*Forward is +Z, say:*

- `ChunkManager`, which places a chunk at `chunkIndex * chunkSize - distance`,
  so the world slides toward −Z and the machine therefore advances toward +Z;
- `SalvageField`, which spawns a crate `AHEAD = 46` and retires it at
  `BEHIND = -26`;
- `TrackMarks`, whose laying point was commented "the leading end of the
  tread's contact patch" — at z = +7.

*Forward is −Z, say:*

- `MachineGeometry`, which puts the prow, the plough and the machine's whole
  face at `-DECK_L / 2`;
- `DeckBearing`, which names z = −7 "the bow";
- `Player`, whose starting heading is commented "the way the machine drives"
  and faces −Z.

So the machine ploughs the sand it has already crossed. With treads this was
close to invisible: a belt is symmetrical, and its cleats scroll the same way
whichever end leads. A stride is not symmetrical, and neither is a footprint —
which is why the walker work is what surfaced it.

**The gait sides with the world**, deliberately: a planted foot is glued to the
sand by `WORLD_Z_PER_METRE`, exported from `WorldManager` and derived from the
same arithmetic the terrain uses, so whichever way the world scrolls the feet
go with it. If the world's direction is ever flipped, the feet flip too and the
tests that pin them say so. Nothing in `Gait` or `LegIK` hard-codes a forward
direction.

**RESOLVED 2026-08-25: the world turned round, not the hull.** Option 2, which
this section ranked second, and the ranking was correct when it was written and
wrong by the time it was acted on. What changed is this very feature.

The argument for option 1 was that the hull's face is a modelling decision
where the world's direction is load-bearing for chunk recycling, spawning and
saves. But the walker work funnelled every direction-dependent system through
`WORLD_Z_PER_METRE` precisely so that a foot could not be wrong on its own —
and once that was done, the count came out the other way. Measured, what still
wrote a direction down for itself was:

- `ChunkManager`'s `slot.z = chunkIndex * size - distance`, and the slot
  seeding that assumed a lower index meant further astern;
- one dune-height lookup in `TrackMarks`, and its retirement threshold, which
  was a Z rather than a distance;
- the knee-fold direction in `LegIK`, which had a comment saying it must follow
  `WORLD_Z_PER_METRE` and then hard-coded the sign anyway.

That is three places, all pure, all now derived. Everything else — the salvage
field, the blown sand, the footfall prints, the player carried astern on the
sand, the gait's whole treadmill — flipped for free, which is exactly what the
constant was named and exported for.

Against that, turning the hull round meant moving the prow, the plough, the
deck-bearing strings a boarding alert already uses, and the spawn heading. And
the tempting one-line version of it — rotating the machine's group 180° — is
not available at all: a planted foot is glued to the sand in MACHINE space, so
under a rotated group every foot would travel backwards. The walker made option
1 more expensive and option 2 nearly free, at the same time.

`ChunkManager` now takes the direction as a parameter rather than importing it,
so it keeps the no-dependency property its header claims and its tests drive
BOTH directions and assert they are exact mirrors. The machine's face is at -Z
and it now travels toward -Z. Verified in the running game: the plough leads,
the stacks trail, and the knees fold astern.

The three options as they stood:

1. **Turn the hull round** — the prow, plough and deck-bearing names move to
   +Z. Cheap in code, but it moves the machine's face, and the deck bearings
   are player-facing strings that a boarding alert already uses.
2. **Turn the world round** — the chunk formula, salvage, and the spawner flip
   to match the hull. More systems touched, and chunk recycling and the save
   format both read `distance`.
3. **Leave it.** It has shipped this way through five milestones and nobody has
   remarked on it. A desert of dunes is nearly symmetrical, and at 7.5 m/s the
   only cues are the plume and the trail.

My own preference is (1): the geometry is the least entangled of the three, and
the hull's face is a modelling decision where the world's direction is load
bearing for chunk recycling, spawning, and saves.
