import { describe, expect, it } from 'vitest';
import {
  buildAnchorCenter,
  buildFootprint,
  footprintOverlapsExpedition,
} from '@/game/ExpeditionBuildConflict';
import type { BuildPieceInstance } from '@/building/BuildSystem';

describe('expedition build reservation', () => {
  it('uses the physical canonical edge center on the correct axis', () => {
    expect(buildAnchorCenter({
      piece: 'wall',
      cell: { x: 2, z: 0 },
      edge: { x: 2, z: 0, axis: 'x' },
    })).toEqual({ x: 5, z: 0 });
    expect(buildAnchorCenter({
      piece: 'wall',
      cell: { x: 0, z: 2 },
      edge: { x: 0, z: 2, axis: 'z' },
    })).toEqual({ x: 0, z: 5 });
  });

  it('leaves the machine-side floor boundary legal but rejects a wall on it', () => {
    const machineFloor = {
      piece: 'floor' as const,
      cell: { x: 3, y: 0, z: 0 },
      rotation: 0,
    };
    const boundaryWall = {
      piece: 'wall' as const,
      cell: { x: 3, y: 0, z: 0 },
      edge: { x: 3, y: 0, z: 0, axis: 'x' as const },
      rotation: 0,
    };

    expect(buildFootprint(machineFloor).maxX).toBe(7);
    expect(footprintOverlapsExpedition(machineFloor)).toBe(false);
    expect(footprintOverlapsExpedition(boundaryWall)).toBe(true);
  });

  it('checks serialized piece records with the same footprint as candidates', () => {
    const savedFloor: BuildPieceInstance = {
      instanceId: 'bp-1',
      definitionId: 'floor',
      cell: { x: 3, y: 0, z: 0 },
      rotation: 0,
      health: 120,
    };
    const savedWall: BuildPieceInstance = {
      instanceId: 'bp-2',
      definitionId: 'wall',
      cell: { x: 3, y: 0, z: 0 },
      edge: { x: 3, y: 0, z: 0, axis: 'x' },
      rotation: 0,
      health: 150,
    };

    expect(footprintOverlapsExpedition(savedFloor)).toBe(false);
    expect(footprintOverlapsExpedition(savedWall)).toBe(true);
  });

  it('accounts for an edge offset along z when a wall reaches the wreck', () => {
    expect(footprintOverlapsExpedition({
      piece: 'wall',
      cell: { x: 4, z: 4 },
      edge: { x: 4, z: 4, axis: 'z' },
      rotation: 0,
    })).toBe(true);
  });
});
