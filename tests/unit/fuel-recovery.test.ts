import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { Machine } from '@/machine/Machine';
import { EventBus } from '@/core/events/EventBus';
import { SalvageField } from '@/salvage/SalvageField';
import { Container } from '@/items/Container';
import { pickReelTarget } from '@/salvage/Reel';

describe('empty tank recovery', () => {
  it('keeps real salvage in reach, reels and refuels with no generator power, and respects a restored empty save', async () => {
    await initRapier();
    const physics = new PhysicsWorld(),
      scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const materials = Object.fromEntries(
      [
        'hull',
        'hullDark',
        'bareSteel',
        'rustedSteel',
        'rubber',
        'accent',
        'hazard',
        'emissiveWarn',
      ].map((name) => [name, material]),
    ) as never;
    const machine = new Machine(scene, physics, materials);
    const salvage = new SalvageField(scene, new EventBus(), materials, 'fuel-recovery');
    const inventory = new Container(30);
    machine.power.registerProducer('test-generator', 16);
    machine.power.registerConsumer({ id: 'collector', draw: 2, priority: 'station' });
    machine.power.restore({ fuel: 0 });
    machine.fixedUpdate(1 / 60);
    expect(machine.movement.fuelAvailable).toBe(false);
    expect(machine.power.capacity).toBe(0);
    expect(machine.power.isPowered('collector')).toBe(false);
    let distance = 0,
      collected = 0;
    salvage.armAfterOpening(distance);
    // Operate the existing reel/loot path as the world crawls. No fuel gifts,
    // powered collectors, changed loot table, or spawn-timer shortcuts.
    for (let frame = 0; frame < 60 * 600 && inventory.count('fuel') === 0; frame++) {
      machine.fixedUpdate(1 / 60);
      distance += machine.speed / 60;
      salvage.update(1 / 60, distance, machine.speed);
      const origin = new THREE.Vector3(0, 15, 0);
      const candidate = salvage.targets[0];
      if (candidate) {
        const target = pickReelTarget(
          salvage.targets,
          origin,
          new THREE.Vector3(candidate.x, candidate.y, candidate.z).sub(origin),
        );
        if (target) salvage.hook(target.id);
      }
      for (const id of salvage.reelIn(1 / 60, origin)) {
        if (salvage.open(id, (item, count) => inventory.add(item, count))) collected++;
      }
    }
    expect(distance).toBeGreaterThan(0);
    expect(collected).toBeGreaterThan(0);
    expect(inventory.count('fuel')).toBeGreaterThan(0);
    const crawl = machine.movement.maxSpeed;
    const accepted = machine.power.addFuel(inventory.count('fuel'));
    expect(accepted).toBeGreaterThan(0);
    machine.fixedUpdate(1 / 60);
    expect(machine.movement.maxSpeed).toBeCloseTo(crawl * 5);
    expect(machine.power.isPowered('collector')).toBe(true);
    machine.power.restore({ fuel: 0 });
    machine.fixedUpdate(1 / 60);
    expect(machine.movement.maxSpeed).toBeCloseTo(crawl);
    machine.dispose();
    physics.dispose();
    salvage.reset(0);
    material.dispose();
  });
});
