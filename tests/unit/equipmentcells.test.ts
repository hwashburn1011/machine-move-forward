import { describe, expect, it } from 'vitest';
import { buildMachine } from '@/machine/MachineGeometry';
import { projectEquipmentCells } from '@/machine/Machine';
import { AUTOSTEP_HEIGHT, DECK_HEIGHT } from '@/game/constants';

/**
 * What the machine's own steel takes out of the build grid.
 *
 * The regression this exists for: the railings were given colliders, each one
 * 12cm of steel lying hard against the deck lip — which is to say lying across
 * a grid boundary. Containment charged them the cells on BOTH sides, so the
 * port and starboard rails took columns x=±2 and x=±3 and the rear rail took
 * the aft row. Two of the deck's five columns, gone, for something you lean on.
 *
 * `buildMachine` is given no materials: nothing here touches a material, and a
 * real `Materials` needs a renderer.
 */
const machine = buildMachine({} as never);
const blocked = new Set(projectEquipmentCells(machine.colliders).map((c) => `${c.x},${c.z}`));

describe('equipment cell projection', () => {
  it('exempts exactly the railings, and they are tall enough to need it', () => {
    const exempt = machine.colliders.filter((c) => c.blocksBuild === false);
    expect(exempt).toHaveLength(3);
    // If a rail were shorter than autostep the height rule would already have
    // spared it and the exemption would be dead code saying nothing.
    for (const c of exempt) {
      expect(c.center.y + c.half.y).toBeGreaterThan(DECK_HEIGHT + AUTOSTEP_HEIGHT);
    }
  });

  it('blocks nothing outboard of the deck', () => {
    // The deck is five cells wide, x=-2..2. Anything at |x|>=3 is off the side
    // of the machine, and only the rails ever reached that far.
    for (const key of blocked) {
      const x = Number(key.split(',')[0]);
      expect(Math.abs(x)).toBeLessThanOrEqual(2);
    }
  });

  it('leaves the outermost deck columns buildable where no equipment stands', () => {
    // Column x=±2 is mostly real equipment — the prow bulwark forward, the
    // generator, cargo rack and lockers amidships. These six are the gaps
    // between them, and the side rails used to take all six along with the
    // rest of the column; the rear rail took z=4 across the full width.
    for (const cell of ['2,-1', '2,3', '2,4', '-2,-1', '-2,3', '-2,4']) {
      expect(blocked.has(cell)).toBe(false);
    }
  });

  it('still blocks the equipment that genuinely stands on the deck', () => {
    // Positive control. The engine housing sits aft on the centreline; if this
    // ever passes an empty set the two tests above prove nothing.
    expect(blocked.has('0,3')).toBe(true);
    expect(blocked.size).toBeGreaterThan(8);
  });
});
