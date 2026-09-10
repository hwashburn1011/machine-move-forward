import { describe, expect, it } from 'vitest';
import { buildIronNomad, nomadEquipmentCells } from '@/machine/IronNomadGeometry';
import { projectEquipmentCells } from '@/machine/Machine';
const machine = buildIronNomad({} as never);
const blocked = new Set(
  [...projectEquipmentCells(machine.colliders), ...nomadEquipmentCells()].map(
    (c) => `${c.x},${c.y},${c.z}`,
  ),
);
describe('Iron Nomad equipment and access reservations', () => {
  it('keeps the starter generator cell clear', () => expect(blocked.has('2,0,3')).toBe(false));
  it('reserves both stairwells at every overlapping cell', () => {
    for (const y of [-1, 0])
      for (const z of [-1, 0, 1]) expect(blocked.has(`-1,${y},${z}`)).toBe(true);
  });
  it('reserves the command cabin and functional engine', () => {
    expect(blocked.has('2,0,-2')).toBe(true);
    expect(blocked.has('0,0,3')).toBe(true);
  });
  it('does not charge floor and railing support to the build grid', () => {
    expect(blocked.has('0,0,-1')).toBe(false);
    expect(machine.colliders.filter((c) => c.expeditionGate)).toHaveLength(1);
  });
});
