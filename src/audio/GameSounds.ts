import type { EventBus } from '@/core/events/EventBus';
import type { AudioEngine } from './AudioEngine';
import type { SoundId } from './SoundBank';

/**
 * Every event that makes a noise, in one list.
 *
 * Separate from `AudioEngine` on purpose. The engine is about WebAudio; this is
 * about the game, and the question "does killing something make a sound" should
 * be answerable by reading one file rather than by grepping for `play(`
 * through fifteen call sites the way the HUD's cues had to be found.
 *
 * Positional sounds are given metres to the source in the LISTENER'S frame —
 * right and forward — which is the same frame `damageBearing` works in. The
 * listener is the player, always: the camera orbits them but the ears do not.
 */

export interface Listener {
  x: number;
  z: number;
  /** Radians. 0 faces +Z, matching `Player.facing` and the HUD's arc. */
  yaw: number;
}

/**
 * World offset to listener-relative right and forward.
 *
 * Exported and pure so the sign conventions — the thing most likely to be
 * wrong and least likely to be noticed — are testable without a browser.
 */
export function toListener(
  sourceX: number,
  sourceZ: number,
  listener: Listener,
): { dx: number; dz: number } {
  const wx = sourceX - listener.x;
  const wz = sourceZ - listener.z;
  const cos = Math.cos(listener.yaw);
  const sin = Math.sin(listener.yaw);
  // Rotate the world offset into the listener's frame. Forward is +Z at yaw 0,
  // so right is +X, and the rotation is the inverse of the listener's own.
  return { dx: wx * cos - wz * sin, dz: wx * sin + wz * cos };
}

/**
 * Subscribe an engine to the bus. Returns an unsubscribe.
 *
 * `listener` is a getter rather than a value because it is read at the moment
 * a sound fires, and the player has usually moved since the last time anything
 * asked.
 */
export function connectGameSounds(
  bus: EventBus,
  audio: AudioEngine,
  listener: () => Listener,
): () => void {
  const at = (id: SoundId, x: number, z: number): void => {
    const { dx, dz } = toListener(x, z, listener());
    audio.play(id, dx, dz);
  };

  const offs = [
    // --- Weapons. Not positional: the player IS the source. ----------------
    bus.on('weapon:fired', (e) => audio.play(e.weaponId === 'shotgun' ? 'shotgun' : 'rifle')),
    bus.on('turret:fired', () => audio.play('rifle')),
    bus.on('enemy:fired', (e) => at('rifle', e.visualOrigin.x, e.visualOrigin.z)),
    bus.on('gunboat:telegraph', () => audio.play('warning')),
    bus.on('gunboat:volley', () => audio.play('rifle')),
    bus.on('weapon:dry-fire', () => audio.play('dry-fire')),
    bus.on('weapon:reload-started', () => audio.play('reload-start')),
    bus.on('weapon:reload-finished', () => audio.play('reload-done')),

    // The single most useful thing audio does in a shooter: telling the player
    // whether they hit the target or the deck behind it, without looking.
    bus.on('combat:hit', (e) =>
      at(
        e.surface === 'flesh' || (e.surface === undefined && !e.onMetal)
          ? 'hit-flesh'
          : 'hit-metal',
        e.position.x,
        e.position.z,
      ),
    ),
    bus.on('enemy:damaged', () => audio.play('enemy-hurt')),
    bus.on('enemy:killed', (e) => at('enemy-died', e.position.x, e.position.z)),

    // --- The player --------------------------------------------------------
    // Positional, so being hit tells you WHERE from -- the same job the HUD's
    // damage arc does, and audio gets there first because it needs no glance.
    bus.on('player:damaged', (e) => at('player-hurt', e.from.x, e.from.z)),
    bus.on('player:died', () => audio.play('player-died')),

    // --- Building and inventory --------------------------------------------
    bus.on('build:placed', () => audio.play('build-place')),
    bus.on('build:removed', () => audio.play('build-remove')),
    bus.on('loot:collected', () => audio.play('pickup')),
    bus.on('craft:completed', () => audio.play('craft')),
    bus.on('radio:found', () => audio.play('radio-signal')),
    bus.on('story:next-signal', () => audio.play('radio-signal')),
    bus.on('story:unique-collected', () => audio.play('craft')),

    // --- The threat director -----------------------------------------------
    // The reason the director's telegraph can work at all. A banner needs a
    // glance at the HUD; this reaches a player who is looking at the sand,
    // which is where they are when they are building.
    bus.on('threat:phase', (e) => {
      if (e.phase === 'buildup') audio.play('warning');
      if (e.phase === 'recovery') audio.play('all-clear');
    }),

    // --- The machine itself -------------------------------------------------
    // Reuses the director's warning rather than inventing a third alert
    // channel, for the reason the design gives: the player is already trained
    // on what that sound means, and "something is wrong, look up" is the same
    // message. `Game` rate-limits it; this end only plays what it is handed.
    bus.on('machine:damaged', () => audio.play('warning')),

    // --- Power --------------------------------------------------------------
    // Edges only, which is why `MachinePower` goes to the trouble of returning
    // them: a level-triggered clunk would fire sixty times a second for as long
    // as the tank was empty.
    bus.on('power:shed', () => audio.play('breaker-open')),
    bus.on('power:restored', () => audio.play('breaker-close')),
  ];

  return () => {
    for (const off of offs) off();
  };
}
