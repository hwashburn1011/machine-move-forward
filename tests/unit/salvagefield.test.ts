import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { SalvageField } from '@/salvage/SalvageField';
import { Container } from '@/items/Container';

describe('SalvageField first target pacing', () => {
  it('keeps a real manifest across partial collector transfers and claim release', () => {
    const bus = new EventBus();
    const events: { id: string; count: number }[] = [];
    bus.on('loot:collected', (event) => events.push(...event.items));
    const materials = {
      rustedSteel: new THREE.MeshBasicMaterial(),
      hullDark: new THREE.MeshBasicMaterial(),
      emissiveWarn: new THREE.MeshBasicMaterial(),
    } as never;
    const field = new SalvageField(new THREE.Scene(), bus, materials, 'lossless');
    field.armAfterOpening(0);
    field.update(0, 0, 0);
    const id = field.targets[0]!.id;
    expect(field.claim(id, 'collector:c1')).toBe(true);
    const first = new Container(1);
    first.add('scrap', 99);
    const partial = field.transferContents(id, (item, count) => first.add(item, count));
    expect(partial.opened).toBe(true);
    expect(partial.remaining.length).toBeGreaterThan(0);
    const accepted = events.reduce((n, item) => n + item.count, 0);
    const remaining = partial.remaining.reduce((n, item) => n + item.count, 0);
    expect(first.count('scrap')).toBeLessThanOrEqual(100);
    expect(field.release(id, 'collector:c1')).toBe(true);
    expect(field.claim(id, 'collector:c2')).toBe(true);
    const second = new Container(6);
    const complete = field.transferContents(id, (item, count) => second.add(item, count));
    expect(complete.remaining).toHaveLength(0);
    expect(events.reduce((n, item) => n + item.count, 0)).toBe(accepted + remaining);
    expect(field.positionOf(id)).toBeNull();
  });
  it('arms a target 42m ahead after opening, then keeps the 180m cadence', () => {
    const scene = new THREE.Scene();
    const materials = {
      rustedSteel: new THREE.MeshBasicMaterial(),
      hullDark: new THREE.MeshBasicMaterial(),
      emissiveWarn: new THREE.MeshBasicMaterial(),
    } as never;
    const field = new SalvageField(scene, new EventBus(), materials, 'test');

    field.armAfterOpening(0);
    field.update(0, 0, 0);
    expect(field.targets).toHaveLength(1);
    expect(Math.abs(field.targets[0]!.z)).toBeCloseTo(42);

    field.update(0, 179, 0);
    expect(field.targets).toHaveLength(1);
    field.update(0, 180, 0);
    expect(field.targets).toHaveLength(2);
    field.update(0, 359, 0);
    expect(field.targets).toHaveLength(2);
    field.update(0, 360, 0);
    expect(field.targets).toHaveLength(3);
  });

  it('does not spawn while integration pauses the field', () => {
    const scene = new THREE.Scene();
    const materials = {
      rustedSteel: new THREE.MeshBasicMaterial(),
      hullDark: new THREE.MeshBasicMaterial(),
      emissiveWarn: new THREE.MeshBasicMaterial(),
    } as never;
    const field = new SalvageField(scene, new EventBus(), materials, 'pause');
    field.armAfterOpening(0);
    field.update(1, 100, 0, false);
    expect(field.targets).toHaveLength(0);
    field.update(0, 0, 0, true);
    expect(field.targets).toHaveLength(1);
  });

  it('resets stale crates and re-arms the early target for a new session', () => {
    const scene = new THREE.Scene();
    const materials = {
      rustedSteel: new THREE.MeshBasicMaterial(),
      hullDark: new THREE.MeshBasicMaterial(),
      emissiveWarn: new THREE.MeshBasicMaterial(),
    } as never;
    const field = new SalvageField(scene, new EventBus(), materials, 'reset');

    field.armAfterOpening(0);
    field.update(0, 0, 0);
    const staleId = field.targets[0]!.id;
    expect(field.hook(staleId)).toBe(true);

    field.reset(25);
    expect(field.targets).toHaveLength(0);
    expect(field.positionOf(staleId)).toBeNull();

    field.armAfterOpening(25);
    field.update(0, 25, 0);
    expect(field.targets).toHaveLength(1);
    expect(Math.abs(field.targets[0]!.z)).toBeCloseTo(42);
  });

  it('keeps the 180m cadence after loading a run whose radio is already found', () => {
    const materials = {
      rustedSteel: new THREE.MeshBasicMaterial(),
      hullDark: new THREE.MeshBasicMaterial(),
      emissiveWarn: new THREE.MeshBasicMaterial(),
    } as never;
    const field = new SalvageField(new THREE.Scene(), new EventBus(), materials, 'continued');
    field.armAfterOpening(0);
    field.update(0, 0, 0);
    field.reset(1000);
    // Found-radio loads intentionally skip armAfterOpening; resetting must
    // not silently double their salvage income back to the old 90m spacing.
    field.update(0, 1090, 0);
    expect(field.targets).toHaveLength(0);
    field.update(0, 1180, 0);
    expect(field.targets).toHaveLength(1);
    field.update(0, 1359, 0);
    expect(field.targets).toHaveLength(1);
    field.update(0, 1360, 0);
    expect(field.targets).toHaveLength(2);
  });
});
