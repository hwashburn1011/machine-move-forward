export type VehicleId = 'skiff' | 'gunboat';

export interface VehicleCombatProfile {
  maxHealth: number;
  hookHealth: number;
  weapon: { damage: number; volleyShots: number; volleyPeriod: number; flightTime: number };
  crewStaggerSeconds: number;
  telegraphSeconds: number;
}

/** Boarding-skiff data only. Gunboats use the separate definition below. */
export interface VehicleDefinition {
  id: 'skiff';
  name: string;
  maxHealth: number;
  armor: number;
  crewCount: number;
  crewEnemyId: string;
  laneOffset: number;
  approachSpeed: number;
  weaveAmplitude: number;
  weavePeriod: number;
  weapon: { damage: number; volleyShots: number; volleyPeriod: number; flightTime: number };
  hookHealth: number;
  crewStaggerSeconds: number;
  telegraphSeconds: number;
  tutorial?: {
    maxHealth: number;
    weapon: { damage: number; volleyShots: number; volleyPeriod: number; flightTime: number };
    hookHealth: number;
    crewStaggerSeconds: number;
    telegraphSeconds: number;
  };
  defenseReward: { scrap: number; components: number };
}

export interface GunboatDefinition {
  id: 'gunboat';
  hull: { maxHealth: number; armor: number };
  weaponSubsystem: { maxHealth: number; armor: number };
  engineSubsystem: { maxHealth: number; armor: number };
  lane: number;
  dimensions: { widthX: number; lengthZ: number };
  hullBounds: {
    half: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
  };
  weaponTarget: {
    center: { x: number; y: number; z: number };
    half: { x: number; y: number; z: number };
    muzzle: { x: number; y: number; z: number };
  };
  engineTarget: {
    center: { x: number; y: number; z: number };
    half: { x: number; y: number; z: number };
  };
  shell: { damage: number; volleyShots: number; volleyPeriod: number; flightTime: number };
  telegraphSeconds: number;
  retreatSeconds: number;
  disabledSeconds: number;
  rewards: {
    destroyed: { scrap: number; components: number };
    disabled: { scrap: number; components: number };
  };
}

export const SKIFF: VehicleDefinition = {
  id: 'skiff',
  name: 'Dust Skiff',
  maxHealth: 260,
  armor: 5,
  crewCount: 2,
  crewEnemyId: 'raider',
  laneOffset: 13,
  approachSpeed: 8,
  weaveAmplitude: 1.2,
  weavePeriod: 5.5,
  weapon: { damage: 12, volleyShots: 3, volleyPeriod: 3.5, flightTime: 0.8 },
  hookHealth: 60,
  crewStaggerSeconds: 1.5,
  telegraphSeconds: 2,
  tutorial: {
    maxHealth: 220,
    weapon: { damage: 8, volleyShots: 2, volleyPeriod: 3.5, flightTime: 0.8 },
    hookHealth: 45,
    crewStaggerSeconds: 2.25,
    telegraphSeconds: 1,
  },
  defenseReward: { scrap: 30, components: 2 },
};

export const GUNBOAT: GunboatDefinition = {
  id: 'gunboat',
  hull: { maxHealth: 420, armor: 6 },
  weaponSubsystem: { maxHealth: 120, armor: 2 },
  engineSubsystem: { maxHealth: 160, armor: 4 },
  lane: 18,
  dimensions: { widthX: 3.4, lengthZ: 9 },
  hullBounds: { half: { x: 1.7, y: 1.4, z: 4.5 }, center: { x: 0, y: 1.7, z: 0 } },
  weaponTarget: {
    center: { x: 0, y: 3.4, z: -1.7 },
    half: { x: 0.6, y: 0.6, z: 0.7 },
    muzzle: { x: 0, y: 3.6, z: -3.5 },
  },
  engineTarget: { center: { x: 0, y: 3.2, z: 2.8 }, half: { x: 0.85, y: 0.65, z: 1 } },
  shell: { damage: 10, volleyShots: 2, volleyPeriod: 4, flightTime: 0.9 },
  telegraphSeconds: 1.2,
  retreatSeconds: 3,
  disabledSeconds: 5,
  rewards: { destroyed: { scrap: 45, components: 3 }, disabled: { scrap: 30, components: 2 } },
};

/** Legacy skiff lookup retained for existing boarding composition. */
export const VEHICLES = { skiff: SKIFF } as const;

export function combatProfile(
  definition: VehicleDefinition,
  tutorial = false,
): VehicleCombatProfile {
  const source = tutorial && definition.tutorial ? definition.tutorial : definition;
  return {
    maxHealth: source.maxHealth,
    hookHealth: source.hookHealth,
    weapon: { ...source.weapon },
    crewStaggerSeconds: source.crewStaggerSeconds,
    telegraphSeconds: source.telegraphSeconds,
  };
}
