export interface PlayerCombatClock {
  readonly weaponId: string | null;
  readonly aiming: boolean;
  readonly aimPitch: number;
  readonly aimYaw: number;
  readonly reloading: boolean;
  /** Authoritative reload fraction from Weapon's existing clock. */
  readonly reloadProgress: number;
}

export type PlayerCombatSnapshot = Readonly<PlayerCombatClock>;

/** Presentation adapter; it observes the combat clock and mutates no combat state. */
export function playerCombatSnapshot(clock: PlayerCombatClock): PlayerCombatSnapshot {
  return Object.freeze({
    ...clock,
    reloadProgress: Math.max(0, Math.min(1, clock.reloadProgress)),
  });
}

export function reloadClipForWeapon(
  weaponId: string | null,
): 'reload_rifle' | 'reload_shotgun' | null {
  if (!weaponId) return null;
  return weaponId.toLowerCase().includes('shotgun')
    ? 'reload_shotgun'
    : weaponId.toLowerCase().includes('rifle')
      ? 'reload_rifle'
      : null;
}

export function isUpperBodyTrack(trackName: string): boolean {
  return /(spine|chest|neck|head|clavicle|shoulder|upperarm|lowerarm|hand|weapon)/i.test(trackName);
}
