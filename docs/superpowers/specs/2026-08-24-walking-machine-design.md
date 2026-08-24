# Machine Move Forward — The Machine Walks

**Date:** 2026-08-24
**Status:** Section 4 is settled, fixed and measured — platform carrying is done
and the drift it left open is closed (4.5). Sections 5–7 — gait, legs, IK — are
not started.
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

- **Four legs**, in diagonal pairs. Six reads more insect-like and doubles the
  animation and IK work for a silhouette that is not obviously better at this
  scale; four is also easier to make read as *heavy*.
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

Tuning knobs live in `src/data/`, not in the module.

---

## 6. Geometry

### 6.1 Hull, deck, engine room — unchanged and procedural

They stay exactly as they are. They carry the build grid, the walkable deck
surface, and colliders derived from their own geometry.

### 6.2 Legs — imported, CC0

Legs are the one part that is genuinely hard to hand-author convincingly and
easy to drop in: they are decoration hung off a body whose collisions we
control, so importing them costs none of the properties the project depends on.

Candidate source, verified CC0 and requiring no attribution:

- **Quaternius mech**, <https://poly.pizza/m/D5wW2jDO42> — Public Domain (CC0),
  glTF and FBX, ~2k triangles, chunky low-poly, a reasonable match for the
  existing art direction. Quaternius is a long-standing, reliable CC0 author.
- Broader index: **awesome-cc0**, <https://github.com/madjin/awesome-cc0>,
  which also lists Base Mesh (900+ CC0 models as glTF) — worth mining for
  pistons, greebles and panel detail regardless of where the legs come from.
- **Meshy**, <https://www.meshy.ai/subcategory/robots-mechs> — CC0 and far
  larger, but AI-generated, so topology is uneven. Fallback only.

**Before anything is imported, the model must be opened and inspected**, not
taken from a listing: segment count, whether the limbs are separable, joint
orientation, scale, and triangle budget against a 10×16m body. A 2k-triangle
whole mech may be too coarse once its legs alone carry a machine this size.

**If nothing suitable survives inspection**, fall back to procedural legs built
from the existing `bevelledBox` vocabulary — pistons, sleeved joints, splayed
feet — which is what the rest of the machine is made of and will at minimum
match. The player's instruction was "CC0 first if possible, otherwise as
detailed and granular as possible."

Provenance, licence, and the source URL go in `ASSETS.md` before the file is
committed, as the existing texture assets already do.

### 6.3 Legs move by IK

Two-bone IK per leg, solved analytically. The gait supplies a foot target in
machine space; IK produces hip and knee angles. Analytic rather than iterative
because two bones have a closed-form solution and it is trivially testable.

---

## 7. What existing work becomes

- **`TrackMarks` becomes footfalls.** The pool, the world-locked movement, the
  dune-height sampling and the taper all transfer unchanged. What changes is
  the spawn rule: instead of laying a mark every `SPACING` metres per side, a
  mark is laid *when a foot plants*, at that foot's position. This is a small
  change to a system already built and measured.
- **Tread cleats and the tread belts are removed** along with the treads.
  `TREAD_BELT_LENGTH`, the cleat map, and `Machine.updateVisuals`' scroll go
  with them. The `treadCleats` texture generator can stay — it costs nothing
  and may suit a future tracked enemy vehicle.
- **`SandFX`'s continuous tread plume becomes per-plant impact puffs**, keyed
  off the same foot-plant event as the footfalls.
- **World-scroll interpolation stays exactly as it is** and becomes more
  important, not less: a gait is a periodic motion, and periodic motion against
  a quantised backdrop beats visibly.

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
- footfalls appear under feet at plant, not on a fixed interval — still to do,
  with the gait.

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

1. The machine reads as a walker in silhouette, at a glance, before anything
   moves.
2. Feet plant and stay planted — no sliding contact at any speed.
3. The body's rise, fall and list are visibly tied to which legs are loaded.
4. A player standing on the deck through a full stride neither sinks, floats,
   nor drifts, and can still shoot accurately.
5. Footfalls appear in the sand under the feet that made them.
6. Stopping the machine stops the gait, mid-stride, without snapping.
7. All existing suites pass unchanged.
