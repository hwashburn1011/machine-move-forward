import type { PieceId } from './build-pieces';
import type { StoryUniqueId } from './story';

export type UnlockId = 'manual-turret' | 'automatic-salvage-collector' | 'automatic-defense-turret';
export type AutomationPieceId = 'collector-auto' | 'turret-auto';

export const SPECIALIST_BLUEPRINT: Record<StoryUniqueId, UnlockId | null> = {
  'course-gyro': null,
  'salvage-controller': 'automatic-salvage-collector',
  'tracking-servo': 'automatic-defense-turret',
};

export interface AutomationDefinition {
  pieceId: AutomationPieceId;
  unlock: UnlockId;
  cost: { scrap: number; components: number };
  weight: number;
  maxHealth: number;
  armor: number;
  powerDraw: number;
}

export const AUTOMATION: Record<AutomationPieceId, AutomationDefinition> = {
  'collector-auto': {
    pieceId: 'collector-auto',
    unlock: 'automatic-salvage-collector',
    cost: { scrap: 55, components: 6 },
    weight: 280,
    maxHealth: 130,
    armor: 1,
    powerDraw: 4,
  },
  'turret-auto': {
    pieceId: 'turret-auto',
    unlock: 'automatic-defense-turret',
    cost: { scrap: 65, components: 8 },
    weight: 190,
    maxHealth: 120,
    armor: 1,
    powerDraw: 6,
  },
};

export const AUTOMATION_POWER_DRAW: Record<AutomationPieceId, number> = {
  'collector-auto': 4,
  'turret-auto': 6,
};

export function automationDefinition(piece: PieceId): AutomationDefinition | undefined {
  return piece === 'collector-auto' || piece === 'turret-auto' ? AUTOMATION[piece] : undefined;
}
