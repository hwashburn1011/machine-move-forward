/**
 * Mutable run state.
 *
 * A plain object, deliberately: the event bus handles decoupling and this
 * holds the handful of values several systems need to read. A state library
 * here would be ceremony without benefit (spec section 8.1).
 */
export interface GameState {
  seed: string;
  /** Simulated seconds since the run started. */
  simTime: number;
  paused: boolean;
  godMode: boolean;
  /** Set once the player dies, until they respawn. */
  playerDead: boolean;
}

export function createGameState(seed: string): GameState {
  return {
    seed,
    simTime: 0,
    paused: false,
    godMode: false,
    playerDead: false,
  };
}
