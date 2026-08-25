# Machine Move Forward — The Threat Director

**Date:** 2026-08-25
**Status:** Built, tested, and wired. The second enemy type is deliberately not
in it — see section 7.
**Source design:** `machine-move-forward-game-handoff.md` sections 3.2, 28, 29,
milestone 10
**Builds on:** the enemy spawner, enemy navigation, the walking machine

---

## 1. Purpose

`EnemySpawner` was a metronome: one scavenger every 250m, forever, capped at
four. Its own header said so and refused to fake an escalation curve, on the
grounds that a fake one would only have to be unpicked when the real thing
arrived. This is the real thing.

The handoff asks for a rhythm, not a rate:

```text
CALM → building / crafting → DISTANT CONTACT → warning cues →
PREPARATION → enemy approach → COMBAT → loot → repairs → CALM
```

and one hard rule (section 28):

> Do not chain attacks so aggressively that players cannot build or recover.

**That rule is the whole design.** Quiet is not what is left over between
waves; it is scheduled first, and the fighting fits around it.

---

## 2. Constraints

- **Distance, never wall time.** Every other pacing decision in this project is
  a function of metres travelled — the world, the save file, the debug skip —
  and standing still stays genuinely safe.
- **Pure.** Plain numbers in, a decision out, no Three.js and no Rapier, like
  `EnemySpawner` and `BuildValidation` before it.
- **Seeded and deterministic.** Same seed, same encounters, or the harnesses
  become flaky in a way that is miserable to chase down.
- **Restorable exactly.** A save that puts the phase back but not the RNG
  position gives a loaded game a different future to the one it was saved from.
- **The spawner keeps its job.** Placement is a geometry problem that depends
  on the deck and the player's position; pacing is a scheduling problem that
  depends on neither. They were only ever one object because there was nothing
  to schedule.

---

## 3. The phase machine

```text
calm ──(distance)──▶ buildup ──(distance)──▶ contact
                                                │
                                     (wave fully released)
                                                ▼
recovery ◀──(deck clear)── engagement ◀─────────┘
   │
   └──(distance)──▶ calm
```

| Phase | Ends on | Length | Spawns |
| --- | --- | --- | --- |
| `calm` | distance | 400–1100m (rolled on entry) | none |
| `buildup` | distance | 140m | none |
| `contact` | wave released | ~25m per body | the wave, staggered |
| `engagement` | **deck clear** | as long as it takes | none |
| `recovery` | distance | 250m | none |

Two of those are floors the director cannot spend, whatever else it wants:
`RECOVERY_M` and `CALM_MIN`. Together they put **650m — about ninety seconds at
cruise — between one wave ending and the next being telegraphed**. That is the
hard rule expressed as a number rather than as an intention.

### Why engagement ends on a body count, not a distance

A fight does not end because the machine kept driving. Reinforcements arriving
on a timer while the player is still fighting is precisely the chaining the
handoff forbids, and it is the failure the metronome had: at 250m intervals a
slow fight simply accumulated scavengers until the cap.

"Deck clear" rather than "wave dead" is deliberate. A scavenger that walks off
the side counts, and should: the threat is gone either way and the player has
earned the quiet.

### Why one phase per call

Every phase's deadline is measured from the distance at which the phase was
**entered**, not from where the previous one was due to end. So a 500m debug
skip that crosses a whole calm arrives in `buildup` and is then given the
entire warning distance from there.

A player who skips does not skip the telegraph, and one who loads a save
mid-recovery still gets the recovery. Time the world travelled through is not
time the director spends. This falls out of the deadline rule rather than being
special-cased, and it is asserted in both the unit tests and `combat.mjs`.

---

## 4. Wave composition

```
size = 1 + floor(wavesSurvived / 2)          // 1, 1, 2, 2, 3, 3, 4, 4, 4...
size -= 1  if health < 35%
size  = clamp(size, 1, MAX_ACTIVE_ENEMIES)
```

Arithmetic, not a threat-point economy, and openly so: **with one enemy type a
budget is a multiplication dressed up as a system.** `composeWave` is the one
function that has to change the moment there is a second type, and it returns a
list of `defId`s precisely so that change is local.

The mercy rule is not softness. The handoff asks for encounters that are
occasionally, obviously beyond the player — but it asks that of *encounter
design*, not of a director kicking someone who has just lost a fight.

Bodies are released one per 25m rather than all at once: four appearing on the
same frame reads as a spawn, four arriving over ten seconds reads as a
boarding.

---

## 5. Telegraphing

Handoff section 29 wants the encounter visible before it is dangerous, and
lists the cues: dust plume, engine noise, radio static, lights on the horizon.

**None of those exist yet.** What exists is a HUD banner, fired off a
`threat:phase` event on the bus, on the phase edge only — the banner is timed,
and re-triggering it every frame would pin it up forever. `buildup` says
*"CONTACT — dust on the horizon"*; `recovery` says *"Clear — the desert is
quiet again"*; the rest say nothing. Contact is deliberately silent: the
boarding alert already fires per arrival, and a second banner over the top of
it is noise at exactly the moment the player should be looking at the deck.

A line of text now is worse than a dust plume and much better than a fight that
arrives unannounced. The event is the seam the real cues will hang off.

---

## 6. Saving

`SaveGameV1.world.threatDirector` was already reserved and typed `null`. It now
holds a `ThreatDirectorSave`, and **this needed no version bump and no
migration**: `null` is still a legal value of the new type, and it means the
same thing to a loader either way — start a director from the seed.

Two details worth knowing:

- **The RNG position is saved as a draw count, not a stream.** `Rng` is a
  value, so replaying N draws on load is exact, and the director draws once per
  calm — the cost is nothing at that scale.
- **`Infinity` does not survive JSON.** It comes back as `null`. The two phases
  that use it as "no deadline" restore it explicitly rather than trusting the
  number that was written.

---

## 7. Deliberately not in scope

- **A second enemy type.** It belongs with the model work rather than here: the
  interesting part of a second scavenger is that it reads differently at a
  glance, and `EnemyMesh`'s capsule constants are shared with `Enemy` and
  `NavGraph`, so a body of a different SIZE is a bigger change than it looks.
  `composeWave` is ready for it and nothing else has to move.
- **Enemy vehicles and boarding** (milestones 6 and 7). The director schedules
  bodies onto the deck; a vehicle encounter is a different kind of thing and
  wants its own composition rules.
- **Machine damage, player power score, machine power score.** The handoff's
  `ThreatDirectorState` lists them. Nothing produces those numbers yet, and a
  director reading fabricated ones would be tuned against a lie.
- **The real telegraph cues.** See section 5.

---

## 8. Testing

**Unit — `tests/unit/threatdirector.test.ts`, 14 checks.** The director is
pure, so all of it is reachable in node: the guaranteed quiet, calm bounds
across 200 seeds, buildup always preceding contact and getting its whole
distance, the stagger, the wave held while the deck is full and delivered the
moment a slot frees, engagement refusing to end while anything is alive, wave
growth and its cap, the mercy rule, determinism per seed and difference between
seeds, a long jump not skipping the warning, and a save round-trip — including
one through `JSON.parse(JSON.stringify(...))`, which is where `Infinity` dies.

**Browser — `tools/combat.mjs`.** The metronome's section was replaced rather
than adapted, because what it asserted no longer exists. What the real game is
now asked to prove: a fresh game starts calm; the calm ends in a warning rather
than an ambush; the warning reaches the player as actual text in the actual
HUD; the wave then lands; **no reinforcements arrive while the wave is still
alive, over 3.6km of travel**; a cleared deck buys a recovery; a 5km skip lands
in a phase rather than in an ambush; and waves grow, over seven fought cycles,
without ever exceeding what the deck holds.

---

## 9. Success criteria

1. ~~Several minutes of peaceful building can occur~~ **Yes, by construction
   and by test.** 650m of guaranteed quiet between waves, and the calm rolls up
   to 1100m on top of it.
2. ~~Combat is unpredictable but not relentless.~~ Seeded, so unpredictable to
   the player and repeatable to the harness; and bounded below by the two
   floors.
3. ~~Encounters are telegraphed.~~ As text, on the edge, off the bus. Section 5
   is honest about what that is and is not.
4. ~~Nothing arrives mid-fight.~~ Engagement ends on a clear deck, asserted
   against 3.6km of travel with the wave alive.
5. ~~A save restores the same future it was written from.~~ Phase, wave count,
   pending bodies, release schedule, and RNG position.
