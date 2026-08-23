# Improvement Log

A running record for the 15-minute improvement loop. Newest first. Each entry
says what changed, what was actually measured, and what the next iteration
should pick up.

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
