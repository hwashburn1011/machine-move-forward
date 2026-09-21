import { describe, expect, it } from 'vitest';
import { buildIronNomad, nomadEquipmentCells } from '@/machine/IronNomadGeometry';
import { projectEquipmentCells } from '@/machine/Machine';
import { STARTING_STRUCTURES } from '@/data/build-pieces';
const machine = buildIronNomad({} as never);
const blocked = new Set(
  [...projectEquipmentCells(machine.colliders), ...nomadEquipmentCells()].map(
    (c) => `${c.x},${c.y},${c.z}`,
  ),
);
describe('Iron Nomad equipment and access reservations', () => {
  it('keeps the starter generator cell clear', () => {
    const starter = STARTING_STRUCTURES.find((piece) => piece.piece === 'generator')!.cell;
    expect(blocked.has(`${starter.x},${starter.y},${starter.z}`)).toBe(false);
  });
  it('reserves both stairwells at every overlapping cell', () => {
    for (const y of [-1, 0])
      for (const z of [-1, 0, 1]) expect(blocked.has(`-1,${y},${z}`)).toBe(true);
  });
  it('reserves the command cabin and functional engine', () => {
    // Cabin occupies world X 4.31..8.06, Z -9.40..-5.16; engine is at Z 9.
    expect(blocked.has('3,0,-4')).toBe(true);
    expect(blocked.has('0,0,4')).toBe(true);
    // Reattached mast details no longer leave a phantom obstruction here.
    expect(blocked.has('2,0,-2')).toBe(false);
  });
  it('does not charge floor and railing support to the build grid', () => {
    // Clear deck remains buildable despite the decorative service-access pass.
    expect(blocked.has('2,0,4')).toBe(false);
    expect(machine.colliders.filter((c) => c.expeditionGate)).toHaveLength(1);
  });
});
