/**
 * Tuning constants for Machine Move Forward.
 *
 * Anything here is deliberately global and stable. Per-entity stats belong in
 * `src/data/`, not in this file.
 */

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** Simulation timestep. All gameplay logic runs at exactly this rate. */
export const FIXED_DT = 1 / 60;

/** Hard cap on simulation steps per frame, so a stalled tab cannot spiral. */
export const MAX_STEPS_PER_FRAME = 5;

/**
 * Heavier than real gravity. Reads better for a third-person shooter and suits
 * the chunky, weighty feel of the machine.
 */
export const GRAVITY = -22;

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

/** Build grid: 1 tile = 2m x 2m (handoff section 10). */
export const GRID_TILE = 2;

/** Starting machine footprint in tiles (handoff section 49) => 10m x 16m. */
export const MACHINE_TILES_X = 5;
export const MACHINE_TILES_Z = 8;

/**
 * Deck plate centre height above world origin, in metres.
 *
 * The centre, not the surface: the plate has thickness, and what a character
 * stands on is `DECK_SURFACE_Y`. Placing anything by this value alone puts it
 * half a plate too low.
 *
 * Raised from 2.4 to make room for the engine room hollowed out of the hull
 * beneath. `LEVEL_HEIGHT` below the deck plane lands exactly on the hull's
 * existing underside at 0.6, so the engine room is a full storey on the same
 * uniform grid spacing as everything the player builds — no special case, and
 * `cellCenter` addresses it as level -1 with no extra arithmetic.
 *
 * The running gear does NOT move with this. Treads, wheels, cross-members and
 * the plough are anchored to absolute ground in `MachineGeometry`, because
 * they sit on the sand rather than hanging off the deck.
 */
export const DECK_HEIGHT = 3.6;

/** Half the deck plate's thickness. The collider is built to match. */
export const DECK_PLATE_HALF = 0.09;

/** The deck surface a character actually stands on. */
export const DECK_SURFACE_Y = DECK_HEIGHT + DECK_PLATE_HALF;

/**
 * Ammunition is unlimited.
 *
 * Deliberately a switch rather than the ammo system being torn out: the
 * magazine, the reload, the crafting recipe and the save field all still work,
 * and the finite path is still covered by tests. Reloading stays -- what goes
 * away is running dry.
 */
export const INFINITE_AMMO = true;

/** Base machine speed in m/s before weight and engine modifiers. */
export const BASE_MACHINE_SPEED = 7.5;

/** Reference weight at which the engine hits exactly its base speed, in kg. */
export const REFERENCE_WEIGHT = 12000;

// ---------------------------------------------------------------------------
// Build grid
// ---------------------------------------------------------------------------

/**
 * Buildable envelope, in grid cells.
 *
 * Enormous on purpose: fifty tiles is a hundred metres in every direction from
 * a machine that is ten metres by sixteen. It was two tiles past the deck
 * edge, which is enough for a lean-to and not enough for anything a player
 * would call theirs, and the point of a build system is that the answer to
 * "can I put one more out there" is yes.
 *
 * It costs nothing to leave it this wide. The grid is sparse — four `Map`s
 * keyed by cell, so an empty cell has no representation at all — and the only
 * full sweeps of the envelope are `deckCells` and the machine's equipment
 * projection, both once at construction and both about ten thousand cheap
 * iterations.
 *
 * It is a hard limit rather than no limit because the number wants to be
 * somewhere, and out past this the world stops cooperating in two ways worth
 * knowing about:
 *
 *   - **Shadows stop at ±22m**, which is the sun's shadow camera (`Renderer`),
 *     kept tight because the machine never leaves the origin and a tight box
 *     is what buys sharp shadows everywhere else. Build past that and the
 *     structure is lit but casts nothing.
 *   - **The dunes come back at ±30m in X.** The dune field flattens a corridor
 *     for the machine — level within 10m, blending to full height by 30m
 *     (`DUNE_PARAMS.corridor*`) — so a deck built far out to the side will have
 *     sand standing through it.
 *
 * Neither is a reason to stop the player; both are reasons to know where the
 * comfortable envelope ends.
 */
export const GRID_MIN_X = -50;
export const GRID_MAX_X = 50;
export const GRID_MIN_Z = -50;
export const GRID_MAX_Z = 50;
export const GRID_LEVELS = 3;

/**
 * Lowest addressable build level.
 *
 * -1 is the engine room hollowed out of the hull. It is a real level on the
 * same uniform spacing as everything above, which is what lets enemies path
 * down into it — an interior the player could retreat to and never be followed
 * would be the safe-room problem the sealed-room design deliberately avoids.
 */
export const GRID_MIN_LEVEL = -1;

/** Vertical spacing between build levels, in metres. */
export const LEVEL_HEIGHT = 3;

// ---------------------------------------------------------------------------
// World streaming
// ---------------------------------------------------------------------------

/** Terrain chunk dimensions in metres. */
export const CHUNK_SIZE_Z = 64;
export const CHUNK_SIZE_X = 360;

/** Chunks kept alive ahead of and behind the machine. */
export const CHUNKS_AHEAD = 6;
export const CHUNKS_BEHIND = 2;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export const PLAYER_WALK_SPEED = 4.5;
export const PLAYER_SPRINT_SPEED = 7.5;
export const PLAYER_CROUCH_SPEED = 2.2;
export const PLAYER_JUMP_HEIGHT = 1.1;
export const PLAYER_CAPSULE_RADIUS = 0.34;
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.62;

/**
 * Gap the character controller keeps between a capsule and everything it
 * touches, so resting on a surface does not make grounded detection flicker.
 *
 * It also widens the body: a capsule needs its radius plus this much clear to
 * either side to actually fit through a gap.
 */
export const CHARACTER_SKIN = 0.02;

/** Clearance between a dropped capsule's feet and the deck it lands on. */
const DROP_CLEARANCE = 0.15;

/**
 * Y to place a character capsule's centre when dropping it onto the deck.
 *
 * Feet must start above `DECK_SURFACE_Y`, not merely above `DECK_HEIGHT`. A
 * capsule that starts inside the plate collider is one Rapier's character
 * controller refuses to move: it reports grounded, reports no lateral
 * collision, and returns zero movement forever. Enemies dropped half a plate
 * too low arrived on the deck and stood on their spawn marks for the rest of
 * the run — close enough to hit anyone who wandered past, and never seen.
 *
 * Both capsules are the same height today; the max keeps this honest if one
 * of them changes.
 */
export const CHARACTER_DROP_Y =
  DECK_SURFACE_Y +
  Math.max(PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS, 0.6 + 0.36) +
  DROP_CLEARANCE;
export const PLAYER_EYE_HEIGHT = 1.62;

/**
 * Maximum step the character controller climbs automatically. Anything shorter
 * than this is a curb rather than an obstacle, which is also how the build
 * grid decides whether machine geometry blocks a cell.
 */
export const AUTOSTEP_HEIGHT = 0.45;

/** Falling below this Y means the player left the machine. */
export const RESPAWN_Y_THRESHOLD = -20;

/**
 * Below this, a character is standing on the desert rather than on the machine.
 *
 * The engine-room floor is the lowest deck anyone can stand on, at 0.6, which
 * puts a standing capsule's centre around 1.56. The desert floor puts it around
 * 0.61. A metre cleanly separates the two, and being generous in the wrong
 * direction would sweep a player out of their own engine room.
 *
 * Both characters read it, for opposite fates: the player starts dying (see
 * `LOST_IN_THE_DESERT_S`), and a scavenger is simply gone. It moved here from
 * `Game` when the second caller appeared.
 */
export const ON_THE_SAND_Y = 1.0;

/**
 * The desert floor, as something you can stand on.
 *
 * The terrain has never had a collider — `TerrainChunk` says so, on the
 * grounds that nothing in the game can reach the ground. That stopped being
 * true the moment a player walked off the side: they fell straight through the
 * sand, past -17, and were respawned by the threshold above, having never
 * touched anything.
 *
 * FLAT, and deliberately so for now. The dune field is displaced on the GPU
 * and would want a scrolling heightfield to match exactly, but the machine
 * drives down a corridor the dunes are flattened inside — 92% removed within
 * 10m of the centreline — so within the band a falling player can actually
 * reach, the real surface is this to within a few tens of centimetres.
 * A heightfield is the honest version and is worth doing when anything other
 * than a player who has just jumped off needs to walk out there.
 */
export const DESERT_FLOOR_Y = -0.35;

/**
 * How long you last out on the sand once the machine has left you.
 *
 * The machine cruises at exactly the speed you sprint, so on foot you can hold
 * station with it and never close — there is no catching it, and standing in
 * an empty desert waiting to slide off the edge of the world is not an
 * outcome. This makes falling off cost something, promptly and legibly.
 *
 * Long enough to see what has happened and swear; short enough that it reads
 * as a consequence rather than a wait.
 */
export const LOST_IN_THE_DESERT_S = 4;
/** How far the standable floor reaches, in metres either side of the machine. */
export const DESERT_FLOOR_HALF_X = 70;
export const DESERT_FLOOR_HALF_Z = 130;

/** Seconds face-down before a killed player is put back on the deck. */
export const RESPAWN_DELAY_S = 3;

/**
 * Seconds of protection after respawning.
 *
 * Respawn puts the player at mid-deck, which is exactly where pursuing
 * scavengers converge. Without this, "respawn intact" is a death loop rather
 * than a second chance.
 */
export const RESPAWN_GRACE_S = 2;
