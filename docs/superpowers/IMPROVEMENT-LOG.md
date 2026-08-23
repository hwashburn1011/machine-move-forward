# Improvement Log

A running record for the 15-minute improvement loop. Newest first. Each entry
says what changed, what was actually measured, and what the next iteration
should pick up.

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
