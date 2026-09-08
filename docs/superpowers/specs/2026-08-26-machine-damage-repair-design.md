# Machine Move Forward — Machine Damage and Repair

**Date:** 2026-08-26
**Status:** Designed, not built.
**Source design:** `machine-move-forward-game-handoff.md` sections 15, 16, 32,
37, milestones 6 and 8
**Builds on:** the build system, enemy navigation, the threat director, the
walking machine

---

## 1. Purpose

The handoff sets the vertical slice one question:

> Is it fun to live, build, shoot, loot, and **defend** a continuously moving
> machine?

Four of those five verbs are in the game. Defend is not. `grep` for machine
health across `src/` returns nothing: the machine cannot be hurt, and neither
can anything the player builds on it. So the threat director does its careful
work — 650m of scheduled quiet, a telegraph, a buildup — and the payoff is that
some men walk over, and are shot, and nothing was ever at risk. Player death
reloads a save, and that is the only way to lose.

Reported symptom, from playing it: **it gets boring once you have built.** That
is the same fact from the other side. Building is a one-off because nothing
ever un-builds it, and the machine is scenery that the player decorates.

This milestone makes the machine and the player's structures things that can be
hurt, and repair the standing bill that gives loot somewhere to go and building
something to keep doing.

It is deliberately the *cheapest* thing that does that, because most of the
wiring is already in place and idle:

| Already built | Consumed by today | After this |
| --- | --- | --- |
| `maxHealth` on all nine build pieces, carried per instance, saved, restored | nothing | **first consumer** |
| `MachineMovement.enginePower`, documented as a multiplier on max speed | nothing | **first consumer** |
| `computeDamage(...)` with an armor term | enemies only | widened to three target kinds |
| Cascade demolition, `ResourceAccess` spend-from-crates | building only | destruction and repair too |
| `RoomDetector`: enclosure, interior volume, doorway connectivity | nothing | **still nothing** |
| `machine.coreHealth` in the save schema | nothing | **still nothing** — see section 4 |

Two things get their first consumer and two get a second. The last two rows are
listed because it would be easy to assume otherwise: enclosure is *not* what
decides whether an enemy can reach you — the nav graph is, and it already
handles it — and `coreHealth` stays unused on purpose rather than by oversight.
Armouring the engine by building a room around it is the obvious use for
`RoomDetector`, and it is a follow-up, not this.

---

## 2. Constraints

- **No global HP bar.** Handoff section 15 opens with the instruction and this
  design follows it: localized damage dominates, and the readout names the part
  that is hurt rather than averaging it away.
- **Failure is a state, not a load screen.** Handoff section 37 proposes
  `machine core HP <= 0 => reload save`. We are not doing that. **The engine at
  zero stops the machine until it is repaired.** A stop the player plays
  through is a better beat than a save reload, and it cannot dead-end a run:
  scrap comes from salvage and from the enemies still arriving, so a stranded
  machine is always recoverable.
- **Pure where it can be.** Damage arithmetic, target selection and repair
  pricing take plain numbers and return plain numbers, like `BuildValidation`
  and `stepEnemyAI` before them. Three.js and Rapier stay at the edges.
- **A hitbox is not an interaction point.** See section 4 — the leg hips are
  outboard of the deck and below it, so "walk up to the damaged thing" needs
  the two to be separate fields.
- **Distance, never wall time**, consistent with every other pacing decision in
  the project. Nothing here decays on a clock.

---

## 3. The damage model

Three kinds of target, one shape:

```ts
interface Damageable {
  kind: 'enemy' | 'structure' | 'subsystem';
  id: string;
  armor: number;
  takeDamage(amount: number): void;
}
```

`Damageable` is today hardcoded to `kind: 'enemy'` and lives in
`PlayerCombat.ts`. It moves to `src/combat/` and widens to the union above.
Colliders already carry it in `userData`, so routing a hit is a type switch, not
new plumbing, and `computeDamage`'s armor term already applies to all three.

| Target | Health from | At zero |
| --- | --- | --- |
| Structure | `BUILD_PIECES[id].maxHealth`, already per-instance and saved | Destroyed through the existing cascade demolition — anything it was supporting comes down with it, with no refund |
| Subsystem | new table, section 4 | Its failure effect goes to full |
| Enemy | unchanged | unchanged |

Destroying a structure deliberately reuses the demolition path rather than a
parallel one. A wall that falls has exactly the same consequences as a wall the
player pulls down — the roof above it drops, the room stops being enclosed —
and there is one code path to get wrong instead of two.

**No refund on destruction.** Demolition refunds 60% because it is a considered
decision; losing a wall to a raider is not.

---

## 4. Subsystems

Five, and no more, because each one has to earn a distinct failure the player
can feel:

| id | Hitbox | Repair point | Effect at full damage |
| --- | --- | --- | --- |
| `engine` | The existing `engine` box, `[2.8, 1.8, 2.6]` at `z = DECK_L/2 - 2` — already a named part with a collider | itself; it stands on the deck | Scales `enginePower` to 0. **The machine stops.** |
| `leg-front-left` | Hip at `x -6.0, y 3.1` | deck-edge access panel | Speed penalty; machine lists to that side |
| `leg-front-right` | `x 6.0` | " | " |
| `leg-rear-left` | `x -6.0, z 4.5` | " | " |
| `leg-rear-right` | `x 6.0, z 4.5` | " | " |

**Hitbox and repair point are separate fields, and this is not a nicety.** The
leg hips sit at `x = ±6.0, y = 3.1`: outboard of a deck 10m wide and below its
plane. There is no way for the player to stand at one. Each leg therefore gets
an access panel on the nearest reachable deck cell inboard of its hip, and that
is what `InteractionSystem` offers. The engine is the case where the two
coincide, which is exactly why a single field would have looked correct right up
until the first leg was damaged.

Leg damage feeds the gait, which already heaves and lists — the visual channel
exists and needs a lean term, not a new system. Effects scale continuously with
damage rather than tripping at thresholds, so a player reads condition off how
the machine moves before they read it off the HUD.

`machine.coreHealth` in the save schema is **not** repurposed as a fifth bar.
Engine-as-stop is the loss state; a chassis number draining from damage taken
elsewhere would be the global HP bar section 15 opens by forbidding.

---

## 5. Enemies as attackers

### 5.1 A bug this milestone has to fix first

`stepEnemyAI` decides to attack on straight-line distance alone, with no
occlusion test:

```ts
if (dist <= def.attackRange) { ... return { state: 'attack', shouldAttack: ready }; }
```

Grid tiles are 2m. Attack ranges are 2.2m (scavenger) and 2.0m (raider). **An
enemy in the cell next to you, with a wall between, is inside attack range and
damages you through it.** Walls do not protect the player today.

That has to be fixed here rather than later, because this milestone's whole
proposition is that a wall is worth building and worth repairing. `AIInput`
gains a `blocked` flag — computed by the caller, which already knows the grid —
and an attack on a blocked target becomes an attack on the blocker.

### 5.2 Two rules

**Blocked → attack the blocker.** The nav graph already computes "the player is
unreachable, fall back to the nearest reachable cell", and an enemy in that
state today simply stands there. It now attacks the structure between it and
the player. This is one branch on a state that is already computed, and it pays
for itself four times: it closes the turtling hole (a sealed room is currently
permanent safety), it makes walls consumable so building becomes continuous, it
is the handoff's own worked example, and together with 5.1 it makes a wall a
real tactical object — it stops the hit *and* it can be chewed through.

**Target priority per type**, as data in `enemies.ts`:

| Enemy | Priority | Reading |
| --- | --- | --- |
| Wasteland Scavenger | player | An opportunist. It wants what you are carrying. |
| Dust Raider | `engine`, falling back to player | It is here to stop the machine. |

The raider currently exists to be *the fast one you cannot back away from* — a
speed stat, not a role. Sending it for the engine gives it a reason to exist,
creates a real decision under fire (shoot the one hitting you, or the one
crossing the deck), and is what makes engine-as-stop fire in play at all.
Without it nothing ever damages the engine and the stop condition is dead code.

---

## 6. Repair

`Interactable.kind` is today `'crate' | 'workbench' | 'refinery'` and
`INTERACT_REACH` is 3m. A damaged subsystem or structure becomes another
`kind`, mirroring section 3 exactly. No new interaction machinery.

**Hold `E`.** Scrap drains through `ResourceAccess`, so crates within 6m count,
the same as building. Holding rather than tapping is load-bearing: repairing the
engine mid-wave means standing still and exposed, which is what makes being
stopped a scramble rather than a chore.

**Pricing, and the constraint that fixes it.** Demolition refunds 60%, so
replacing a wrecked piece nets 40% of its build cost. Repair must be *strictly
cheaper than 40%* or the optimal play is demolish-and-rebuild and the repair
verb is dead on arrival:

```text
full repair of a structure = 30% of build cost
charged proportional to missing HP
```

Subsystems have no build cost and carry their own scrap-per-HP rate in the same
table as their health.

---

## 7. Readout

`hud-machine` already carries Speed / Distance / Aboard and already toggles an
`is-hot` class on the threat count. Condition joins it as **one row that stays
quiet at full health and goes hot naming what is hurt.** A permanent five-bar
column earns nothing across 650m of quiet, and the HUD's restraint is worth
keeping; full per-subsystem detail sits behind a held key.

The engine is the one thing that can be attacked while the player is nowhere
near it, so it needs a cue of its own. `DamageDirection` already points at what
is hitting the player and the director already owns warning and all-clear
audio — an engine-under-attack alert reuses both rather than inventing a third
alert channel.

Structures show damage by darkening toward destruction. `HitFlash` already
exists for enemies and the same idea carries over; no new material.

---

## 8. Saving

Subsystem health is the only new state. It goes in the `machine` block as an
**optional** field:

```ts
machine: {
  structures: BuildPieceInstance[];
  devices: unknown[];
  fuel: number;
  coreHealth: number;
  navigationTier: number;
  /** Absent in saves written before machine damage. Absent means undamaged. */
  subsystems?: { id: string; health: number }[];
}
```

No version bump and no migration, following the precedent `threatDirector` set
in this same file: the old shape is still a legal value of the new type, and
absent has exactly one sensible reading. Structure health already persists.

---

## 9. Deliberately not in scope

- **Power, fuel, lamps, turrets, hardpoints.** Handoff sections 13, 17, 21.
  Fuel stays inert. Giving it a fabricated sink here would be worse than
  leaving it idle, for the reason `items.ts` already gives.
- **Enemy vehicles and boarding.** Sections 30 and 31, and much larger. They
  land harder once the machine can be hurt, which is the argument for this
  milestone coming first.
- **Environmental attrition.** Dust, heat and terrain wearing the machine down
  between waves would fill the scheduled quiet, and is the obvious follow-up —
  but combat-only is the smaller change and proves the loop first.
- **Armor tiers and repair drones.** Section 16's "later".
- **Storage destroyed spills items**, section 15. Crates can be destroyed; their
  contents are simply lost. Spill physics is a separate problem.

---

## 10. Testing

Unit, in node, no browser:

- `computeDamage` against structure and subsystem armor.
- Repair pricing: full repair is strictly cheaper than 40% of build cost for
  every piece in `BUILD_PIECES` — the property, asserted over the table, not a
  hand-picked example.
- `stepEnemyAI` with `blocked` set: attacks the blocker, not the player.
- Target priority: a raider picks the engine, a scavenger the player, and a
  raider with no reachable engine falls back.
- Subsystem effects: `enginePower` reaches 0 at zero health and `maxSpeed`
  follows; leg damage produces a lean of the expected sign.
- Destruction routes through cascade demolition — pulling a load-bearing wall
  by damage takes the same pieces as pulling it by hand.
- Save round-trip with and without the `subsystems` field.

Browser harness, in the running game:

- An enemy sealed out of a room attacks the wall, breaks it, and reaches the
  player. This is the handoff's worked example and the turtling fix in one.
- An enemy on the far side of a wall at 2.0m does **not** damage the player.
  This fails today.
- A raider crosses the deck to the engine, damages it, and the machine's
  measured speed falls.
- Engine to zero: the machine stops. Repair it: the machine moves again.

---

## 11. Success criteria

1. The machine can be stopped, and the player can start it again without
   reloading.
2. A wall stops a hit, and can be destroyed, and rebuilding or repairing it is
   a decision with a price.
3. Sealing yourself in is no longer permanent safety.
4. Scrap has a second sink that recurs, so looting keeps mattering after the
   first structure is finished.
5. The raider is told apart from the scavenger by what it *does*, not only by
   how fast it moves.
6. Nothing in section 9 has quietly arrived.
