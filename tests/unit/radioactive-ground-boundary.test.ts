import { describe, expect, it } from 'vitest';
import {
  RADIOACTIVE_BOUNDARY_FEET_Y,
  RadioactiveGroundBoundary,
  type GroundBoundarySample,
} from '@/player/RadioactiveGroundBoundary';

const machine = { space: 'machine' as const, rootId: 'nomad', local: { x: 1, y: 16.1, z: 2 } };
const rooftop = {
  space: 'rooftop' as const,
  rootId: 'opening-roof',
  local: { x: 15, y: 19, z: 0 },
};

function sample(overrides: Partial<GroundBoundarySample> = {}): GroundBoundarySample {
  return {
    center: { x: 1, y: 16.72, z: 2 },
    supported: true,
    support: machine,
    openingRooftop: false,
    ...overrides,
  };
}

describe('RadioactiveGroundBoundary', () => {
  it('records machine and destination supports as local moving-root anchors', () => {
    const boundary = new RadioactiveGroundBoundary();
    const recorded = boundary.observe(sample());
    expect(recorded.kind).toBe('safe');
    expect(boundary.lastSafeAnchor).toEqual({ ...machine, world: { x: 1, y: 16.72, z: 2 } });

    const destination = {
      space: 'destination' as const,
      rootId: 'relay-foundry',
      local: { x: 2, y: 0.96, z: -1 },
    };
    boundary.observe(sample({ center: { x: 40, y: 5, z: 8 }, support: destination }));
    expect(boundary.lastSafeAnchor?.space).toBe('destination');
    expect(boundary.lastSafeAnchor?.local).toEqual(destination.local);
    boundary.clearDestinationAnchor('other-site');
    expect(boundary.lastSafeAnchor?.space).toBe('destination');

    boundary.observe(sample({ center: { x: 3, y: 16.72, z: 4 } }));
    expect(boundary.lastSafeAnchor?.space).toBe('machine');
    expect(boundary.lastSafeAnchor?.local).toEqual(machine.local);

    boundary.clearDestinationAnchor('relay-foundry');
    expect(boundary.lastSafeAnchor?.space).toBe('machine');
  });

  it('recovers before capsule feet reach the radioactive boundary', () => {
    const boundary = new RadioactiveGroundBoundary();
    boundary.observe(sample());
    const result = boundary.observe(
      sample({
        center: { x: 30, y: RADIOACTIVE_BOUNDARY_FEET_Y + 0.62 + 0.34 - 0.01, z: 2 },
        supported: false,
        support: undefined,
      }),
    );
    expect(result.kind).toBe('recover');
    expect(result.kind === 'recover' && result.reason).toBe('radioactive-ground');
    expect(result.kind === 'recover' && result.anchor.rootId).toBe('nomad');
  });

  it('waits while falling above the edge instead of making a sand landing playable', () => {
    const boundary = new RadioactiveGroundBoundary();
    boundary.observe(sample());
    const result = boundary.observe(
      sample({
        center: { x: 30, y: RADIOACTIVE_BOUNDARY_FEET_Y + 0.62 + 0.34 + 0.01, z: 2 },
        supported: false,
        support: undefined,
      }),
    );
    expect(result).toEqual({ kind: 'waiting', reason: 'falling' });
  });

  it('uses a rooftop anchor only during the opening and clears it afterward', () => {
    const boundary = new RadioactiveGroundBoundary();
    expect(
      boundary.observe(sample({ center: rooftop.local, support: rooftop, openingRooftop: true }))
        .kind,
    ).toBe('safe');
    const missedJump = boundary.observe(
      sample({
        center: { x: 15, y: RADIOACTIVE_BOUNDARY_FEET_Y + 0.95, z: 0 },
        supported: false,
        support: undefined,
        openingRooftop: true,
      }),
    );
    expect(missedJump.kind).toBe('recover');
    expect(missedJump.kind === 'recover' && missedJump.anchor.space).toBe('rooftop');

    boundary.clearRooftopAnchor();
    const afterOpening = boundary.observe(
      sample({
        center: { x: 15, y: RADIOACTIVE_BOUNDARY_FEET_Y + 0.95, z: 0 },
        supported: false,
        support: undefined,
        openingRooftop: false,
      }),
    );
    expect(afterOpening.kind).toBe('blocked');
  });

  it('does not accept a low platform or an unsupported rooftop as safe', () => {
    const boundary = new RadioactiveGroundBoundary();
    const low = boundary.observe(
      sample({
        center: { x: 0, y: 0.6, z: 0 },
        supported: true,
        support: { ...machine, local: { x: 0, y: 0.6, z: 0 } },
      }),
    );
    expect(low.kind).toBe('blocked');
    const roof = boundary.observe(sample({ support: rooftop, openingRooftop: false }));
    expect(roof.kind).toBe('waiting');
    expect(boundary.lastSafeAnchor).toBeNull();
  });

  it('returns defensive copies so a caller cannot move the recovery anchor', () => {
    const boundary = new RadioactiveGroundBoundary();
    boundary.observe(sample());
    const anchor = boundary.lastSafeAnchor!;
    anchor.local.x = 999;
    expect(boundary.lastSafeAnchor?.local.x).toBe(1);
    boundary.clear();
    expect(boundary.observe(sample({ supported: false, support: undefined })).kind).toBe('waiting');
  });
});
