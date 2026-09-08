import type { ItemCost } from './items';

/** The three sockets on the machine's upgrade rack. */
export type UpgradeBranch = 'propulsion' | 'power' | 'defense';

export type UpgradeId =
  | 'longstride-rams'
  | 'torque-clutch'
  | 'overwound-dynamo'
  | 'lean-governor'
  | 'heavy-breech'
  | 'cycler-feed';

/** The modifier surface consumed by the pure runtime adapters. */
export interface UpgradeModifiers {
  speedMultiplier: number;
  effectiveWeightMultiplier: number;
  accelerationMultiplier: number;
  fuelBurnMultiplier: number;
  generationBonus: number;
  turretDamageMultiplier: number;
  turretRateMultiplier: number;
  turretPowerBonus: number;
}

/** Runtime-facing name from the integration contract. */
export type MachineModifiers = UpgradeModifiers;

export interface UpgradeDefinition {
  id: UpgradeId;
  branch: UpgradeBranch;
  name: string;
  researchSeconds: number;
  researchCost: ItemCost;
  modifiers: Partial<UpgradeModifiers>;
}

/** One permanent research per id, with one active id per branch. */
export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  'longstride-rams': {
    id: 'longstride-rams',
    branch: 'propulsion',
    name: 'Longstride Actuators',
    researchSeconds: 60,
    researchCost: { scrap: 60, components: 8 },
    modifiers: { speedMultiplier: 1.18, fuelBurnMultiplier: 1.25 },
  },
  'torque-clutch': {
    id: 'torque-clutch',
    branch: 'propulsion',
    name: 'Torque Coupling',
    researchSeconds: 45,
    researchCost: { scrap: 45, components: 10 },
    modifiers: {
      effectiveWeightMultiplier: 0.65,
      speedMultiplier: 0.97,
      accelerationMultiplier: 0.7,
    },
  },
  'overwound-dynamo': {
    id: 'overwound-dynamo',
    branch: 'power',
    name: 'Overwound Generator',
    researchSeconds: 55,
    researchCost: { scrap: 55, components: 8 },
    modifiers: { generationBonus: 6, fuelBurnMultiplier: 1.5 },
  },
  'lean-governor': {
    id: 'lean-governor',
    branch: 'power',
    name: 'Economy Governor',
    researchSeconds: 40,
    researchCost: { scrap: 40, components: 8 },
    modifiers: { fuelBurnMultiplier: 0.55, generationBonus: -2 },
  },
  'heavy-breech': {
    id: 'heavy-breech',
    branch: 'defense',
    name: 'Heavy Breech',
    researchSeconds: 50,
    researchCost: { scrap: 50, components: 6 },
    modifiers: { turretDamageMultiplier: 60 / 42, turretRateMultiplier: 0.8 / 1.2, turretPowerBonus: 1 },
  },
  'cycler-feed': {
    id: 'cycler-feed',
    branch: 'defense',
    name: 'Fast Cycler',
    researchSeconds: 45,
    researchCost: { scrap: 45, components: 8 },
    modifiers: { turretDamageMultiplier: 30 / 42, turretRateMultiplier: 1.8 / 1.2, turretPowerBonus: 2 },
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export const DEFAULT_UPGRADE_MODIFIERS: UpgradeModifiers = {
  speedMultiplier: 1,
  effectiveWeightMultiplier: 1,
  accelerationMultiplier: 1,
  fuelBurnMultiplier: 1,
  generationBonus: 0,
  turretDamageMultiplier: 1,
  turretRateMultiplier: 1,
  turretPowerBonus: 0,
};

export function upgradeById(id: string): UpgradeDefinition | undefined {
  return UPGRADES[id as UpgradeId];
}
