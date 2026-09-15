import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TrackMarks } from '@/fx/TrackMarks';
import { SalvageField } from '@/salvage/SalvageField';
import { EventBus } from '@/core/events/EventBus';

const materials = {
  rustedSteel: new THREE.MeshBasicMaterial(),
  hullDark: new THREE.MeshBasicMaterial(),
  emissiveWarn: new THREE.MeshBasicMaterial(),
} as never;

describe('lateral projection seams', () => {
  it('keeps track marks on permanent ground while shifting render X', () => {
    const marks = new TrackMarks(new THREE.Scene());
    marks.press({ x: 4, z: 0 });
    marks.update(0, 0);
    marks.refresh();
    const before = new THREE.Matrix4();
    marks.mesh.getMatrixAt(0, before);
    marks.update(10, 20);
    const after = new THREE.Matrix4();
    marks.mesh.getMatrixAt(0, after);
    expect(after.elements[12]).toBeCloseTo(before.elements[12] - 20);
    expect(Number.isFinite(after.elements[13])).toBe(true);
    marks.update(10, Number.NaN);
    expect(marks.liveCount).toBe(1);
  });

  it('clears marks after a large lateral jump', () => {
    const marks = new TrackMarks(new THREE.Scene());
    marks.press({ x: 2, z: 0 });
    marks.update(0, 0);
    marks.update(0, 100);
    expect(marks.liveCount).toBe(0);
  });

  it('shifts only free salvage crates', () => {
    const field = new SalvageField(new THREE.Scene(), new EventBus(), materials, 'lateral');
    field.armAfterOpening(0);
    field.update(0, 0, 0);
    const free = field.targets[0]!;
    field.update(0, 180, 0);
    const second = field.targets.find((target) => target.id !== free.id)!;
    const freeBefore = field.positionOf(free.id)!.x;
    const heldBefore = field.positionOf(second.id)!.x;
    expect(field.hook(second.id)).toBe(true);
    field.shiftLateral(20);
    expect(field.positionOf(free.id)!.x).toBeCloseTo(freeBefore - 20);
    expect(field.positionOf(second.id)!.x).toBeCloseTo(heldBefore);
    expect(field.claim(free.id, 'collector:c1')).toBe(true);
    const collectorBefore = field.positionOf(free.id)!.x;
    field.shiftLateral(20);
    expect(field.positionOf(free.id)!.x).toBeCloseTo(collectorBefore);
  });
});
