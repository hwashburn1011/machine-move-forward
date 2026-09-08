import type { PieceId } from './build-pieces';

export type TurretId = 'manual-turret' | 'automatic-turret';
export type TurretFilter = 'all';

export interface TurretDefinition {
  id: TurretId;
  name: string;
  pieceId: PieceId;
  damage: number;
  fireRate: number;
  range: number;
  powerDraw: number;
  traverse: { yawMin: number; yawMax: number; pitchMin: number; pitchMax: number };
  aimTolerance: number;
  yawSpeed?: number;
  pitchSpeed?: number;
  lockDelay?: number;
  automatic?: boolean;
}

/** One deliberately readable weapon: a player must crew it and aim it. */
export const TURRETS: Record<TurretId, TurretDefinition> = {
  'manual-turret': {
    id: 'manual-turret',
    name: 'Manual Deck Gun',
    pieceId: 'turret-manual',
    damage: 42,
    fireRate: 1.2,
    range: 48,
    powerDraw: 3,
    // Angles are radians. The lower elevation reaches a skiff on the
    // alongside lane from the machine deck while the normal raycast still
    // prevents shots through the machine's own superstructure.
    traverse: {
      yawMin: (-120 * Math.PI) / 180,
      yawMax: (120 * Math.PI) / 180,
      pitchMin: (-30 * Math.PI) / 180,
      pitchMax: (35 * Math.PI) / 180,
    },
    aimTolerance: (2.5 * Math.PI) / 180,
  },
  'automatic-turret': {
    id: 'automatic-turret',
    name: 'Automatic Defense Turret',
    pieceId: 'turret-auto',
    damage: 18,
    fireRate: 1,
    range: 30,
    powerDraw: 6,
    traverse: { yawMin: -Math.PI, yawMax: Math.PI, pitchMin: (-20 * Math.PI) / 180, pitchMax: (45 * Math.PI) / 180 },
    aimTolerance: (2 * Math.PI) / 180,
    yawSpeed: (90 * Math.PI) / 180,
    pitchSpeed: (60 * Math.PI) / 180,
    lockDelay: 0.35,
    automatic: true,
  },
};

export const TURRET_BLUEPRINT_ID = 'manual-turret';
export const MANUAL_TURRET_COST = { scrap: 42, components: 4 } as const;

export function turretPowerDraw(definition: TurretDefinition, powerDrawBonus = 0): number {
  return Math.max(0, definition.powerDraw + (Number.isFinite(powerDrawBonus) ? powerDrawBonus : 0));
}
