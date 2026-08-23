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

/** Deck surface height above world origin, in metres. */
export const DECK_HEIGHT = 2.4;

/** Base machine speed in m/s before weight and engine modifiers. */
export const BASE_MACHINE_SPEED = 7.5;

/** Reference weight at which the engine hits exactly its base speed, in kg. */
export const REFERENCE_WEIGHT = 12000;

// ---------------------------------------------------------------------------
// Build grid
// ---------------------------------------------------------------------------

/**
 * Buildable envelope, in grid cells. Wider and deeper than the starting deck
 * so the player can extend outward, which is what makes multi-room structures
 * achievable at all — the bare deck is mostly occupied by equipment.
 */
export const GRID_MIN_X = -4;
export const GRID_MAX_X = 4;
export const GRID_MIN_Z = -6;
export const GRID_MAX_Z = 5;
export const GRID_LEVELS = 3;

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
export const PLAYER_EYE_HEIGHT = 1.62;

/**
 * Maximum step the character controller climbs automatically. Anything shorter
 * than this is a curb rather than an obstacle, which is also how the build
 * grid decides whether machine geometry blocks a cell.
 */
export const AUTOSTEP_HEIGHT = 0.45;

/** Falling below this Y means the player left the machine. */
export const RESPAWN_Y_THRESHOLD = -20;
