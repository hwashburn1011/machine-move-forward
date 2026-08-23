# Machine Move Forward — Basic Enemy Spawner

**Date:** 2026-08-23
**Status:** Approved
**Source design:** `machine-move-forward-game-handoff.md` sections 32, 39
**Builds on:** Milestones 0–4 (foundation, shooter core, build grid, inventory and crafting)

---

## 1. Purpose

Milestones 0–4 built a working sandbox with no reason to be in it. Enemies,
their AI, damage, and death all work, but nothing ever calls
`EnemyManager.spawn` outside the F4 debug key, so a player who never touches
the debug keys is never threatened.

This adds the smallest thing that makes travel cost something: scavengers
arrive on the deck as the machine covers ground.

It is **not** the threat director (Milestone 8). See section 8.

---

## 2. Constraints

Inherited and still binding:

- **No asset files.**
- **The machine never moves.** It sits at the world origin and the world
  scrolls past it.
- **Definition and runtime instance stay separate types.**
- **No React, no Zustand, no audio.**

New and load-bearing:

- **Enemies live in machine-space.** Nothing applies the world scroll to them,
  so an enemy that stands still holds its distance from the machine while the
  dunes slide underneath. This is why they spawn on the deck rather than on the
  sand — see section 4.
- **Existing suites must keep passing:** 310 unit, 11 e2e, 71 harness checks
  (9 drive, 12 combat, 21 build, 29 craft).

---

## 3. Pacing

Spawns are driven by **distance travelled**, not by wall or simulated time.

Distance is already the clock the rest of the game derives from: the world
regenerates from it, the save file stores it, and `world.reset(d)` is how both
loading and the F7 skip move the game. Pacing off the same number means the
spawner needs no state of its own in the save file, and it means standing still
is genuinely safe while pushing forward is what costs.

| Knob | Value | Where |
| --- | --- | --- |
| Spawn interval | 250 m | `SPAWN_INTERVAL_M` in `src/data/enemies.ts` |
| Concurrent cap | 4 | `MAX_ACTIVE_ENEMIES` in `src/data/enemies.ts` |
| Enemy | `scavenger` | the only definition that exists |

At the machine's ~7 m/s cruise, 250 m is about 36 seconds. Four aboard at once
is enough that ignoring them accumulates into a real problem, and few enough
that stopping to build or craft is still a choice the player gets to make. The
existing pool holds 8, so the cap never contends with pool exhaustion.

---

## 4. Where They Appear

**On the deck, at the perimeter, furthest from the player.**

The alternative — spawning on the sand and letting them run in — fails twice
over. They would visibly slide across the scrolling dunes, because enemies do
not inherit the world scroll. And a scavenger moves at 3.1 m/s against a
machine doing 7.5 m/s, so a ground spawn behind the machine could never close
the distance without a speed rewrite that belongs to the enemy-vehicle
milestone.

Spawning them aboard sidesteps both and is forward-compatible: when Milestone 7
adds real boarding, this spawner is replaced at the point of placement, not
rewritten.

The machine deck is 10 m × 16 m (`MACHINE_TILES_X` 5 and `MACHINE_TILES_Z` 8 at
`GRID_TILE` 2), centred on the origin, with its surface at `DECK_HEIGHT` 2.4.

`perimeterSpawnPoint` builds **8 candidate points, one per octant** of the
perimeter, jitters each one within its own octant using the seeded RNG, and
returns whichever ends up furthest from the player.

The octants are fixed rather than sampled freely so coverage never depends on
how lucky the RNG was; the jitter within each octant is what keeps arrivals
from landing on the same eight marks forever. Picking the furthest candidate
rather than a random one costs nothing and removes the case where a scavenger
materialises inside the player's face.

---

## 5. Components

### 5.1 `src/enemies/EnemySpawner.ts`

Pure. No Three.js, no Rapier — plain numbers in, a decision out, so every rule
below is testable in node.

```ts
export interface SpawnRequest {
  defId: string;
}

export interface Bounds {
  halfWidth: number;
  halfLength: number;
  deckY: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export class EnemySpawner {
  /** `seed` is the world seed, run through `hashSeed` for the internal Rng. */
  constructor(seed: string, intervalM?: number, maxActive?: number);

  /** The distance at which the next spawn is due. Read-only from outside. */
  get nextSpawnAt(): number;

  /**
   * One decision per call. Null when it is not yet time, or the deck is at
   * its cap.
   */
  update(distance: number, activeCount: number): SpawnRequest | null;

  /** Re-derive the threshold from a distance. Save load and the F7 skip. */
  resync(distance: number): void;
}

/** A deck-edge point, biased away from the player. `Rng` from `@/core/math/Random`. */
export function perimeterSpawnPoint(
  bounds: Bounds,
  playerPos: Vec3Like,
  rng: Rng,
): Vec3Like;
```

**At most one spawn per call**, even when the distance has jumped far past the
threshold. The F7 debug key moves the world 500 m at a stroke and a save can be
loaded at any distance; neither should dump a backlog of scavengers onto the
deck at once. `update` advances `nextSpawnAt` to the next multiple ahead of the
current distance rather than stepping through the ones it missed.

**At the cap, the threshold does not advance.** A spawn refused because four
are already aboard is owed, not forgotten — the moment one dies, the next tick
delivers the one that was held back. Advancing the threshold on a refusal would
mean a player who lets four live is quietly rewarded with a lull.

### 5.2 `src/data/enemies.ts`

Gains `SPAWN_INTERVAL_M` and `MAX_ACTIVE_ENEMIES` beside the stats they tune.
Data only, as the rest of that directory is.

### 5.3 `src/game/Game.ts`

One call in `fixedUpdate`, inside the existing `!this.freeCamera` guard so the
screenshot harness keeps shooting empty decks. `loadFrom` calls `resync`.

---

## 6. When It Does Not Spawn

- **Free camera.** Screenshot and hero shots must stay clean.
- **Player dead.** Piling arrivals onto a corpse mid-respawn is noise.
- **At the cap.** Section 5.1.

**Not suppressed while an inventory or crafting panel is open.** Milestone 4
decided deliberately that the simulation keeps running behind panels — the
machine keeps moving and enemies keep acting. Pausing spawns here would
contradict that quietly, and would make the crafting panel a safe room by
accident.

---

## 7. Persistence

**No save schema change, and no new save field.**

`nextSpawnAt` is a function of `distanceTraveled`, which v1 already stores. On
load, `resync` recomputes it as the first interval boundary ahead of the
restored distance. Storing it would be storing a derived value, which is how
save files start disagreeing with themselves.

The consequence is that a save reloaded mid-interval loses at most the fraction
of an interval already travelled. Given the interval is 250 m, that is worth
strictly less than the schema change it would take to preserve it.

---

## 8. Deliberately Not In Scope

**No escalation.** The rate and the group size are flat at every distance. A
difficulty curve is the threat director's entire purpose, and a fake one here
would have to be unpicked to build the real one.

**No enemy variety.** `scavenger` is the only definition in `src/data/enemies.ts`.
Adding types is cheap; adding types with nothing to distinguish them is
content-shaped filler.

**No naming it `ThreatDirector`.** Milestone 8's director reads player state,
composes waves, and paces escalation. Taking the name now buys a rename later
or, worse, a half-director that is mistaken for the real one.

**No navmesh.** Enemies still steer straight at the player and shove against
player-built walls. The handoff defers pathing to the boarding milestone; this
spawner does not make that worse, but it does make it more visible.

---

## 9. Testing

`tests/unit/enemyspawner.test.ts`:

- Nothing spawns before the first threshold
- Exactly one spawn at the threshold
- Only one spawn per call when the distance jumps several intervals
- After a jump, the threshold lands ahead of the current distance
- No spawn at the cap; the held spawn arrives on the next call once below it
- `resync` from a loaded distance produces the next boundary ahead, not a backlog
- The same seed produces the same sequence of spawn points
- Spawn points sit on the deck perimeter, at deck height
- Spawn points bias away from the player: a player at one end gets arrivals at the other

`tools/combat.mjs` gains checks that enemies appear from travel alone, that the
cap holds under sustained travel, and that the F7 skip does not flood the deck.

## 10. Success Criteria

1. A player who never touches a debug key is attacked while travelling.
2. Scavengers appear on the deck, never mid-air and never inside the player.
3. No more than four are aboard at once.
4. A 500 m world skip produces one arrival, not several.
5. Loading a save does not produce a backlog of arrivals.
6. Screenshot and hero shots are still empty of enemies.
7. All existing tests and harnesses still pass.
