/**
 * Weapon definitions (handoff section 18).
 *
 * Data only. No logic belongs in this file — the separation between
 * definition and runtime instance is what lets later milestones add loot
 * rolls, mods, and rarity without touching the firing code.
 */
export interface WeaponDefinition {
  id: string;
  name: string;
  weaponClass: 'assault-rifle' | 'shotgun' | 'pistol' | 'smg' | 'marksman';
  /** Damage per projectile. Shotguns deal this per pellet. */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  magazineSize: number;
  /** Seconds. */
  reloadTime: number;
  /** Cone half-angle in degrees, hip-fired. */
  spread: number;
  /** Cone half-angle in degrees, aimed down sights. */
  aimSpread: number;
  /** Camera pitch kick per shot, in degrees. */
  recoil: number;
  /** Metres. Damage falls off to zero here. */
  range: number;
  /** Metres. Full damage inside this. */
  falloffStart: number;
  /** Rays per shot. */
  pellets: number;
  ammoType: string;
  startingReserve: number;
}

export const WEAPONS: Record<string, WeaponDefinition> = {
  rifle: {
    id: 'rifle',
    name: 'Scrapline AR',
    weaponClass: 'assault-rifle',
    damage: 24,
    fireRate: 9,
    magazineSize: 30,
    reloadTime: 2.1,
    spread: 0.9,
    aimSpread: 0.25,
    recoil: 0.35,
    range: 120,
    falloffStart: 45,
    pellets: 1,
    ammoType: 'rifle',
    startingReserve: 150,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Dust Breaker',
    weaponClass: 'shotgun',
    damage: 11,
    fireRate: 1.4,
    magazineSize: 6,
    reloadTime: 3.2,
    spread: 4.5,
    aimSpread: 3.0,
    recoil: 1.4,
    range: 35,
    falloffStart: 9,
    pellets: 9,
    ammoType: 'shell',
    startingReserve: 48,
  },
};

export const DEFAULT_WEAPON_ORDER = ['rifle', 'shotgun'] as const;
