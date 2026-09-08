import { describe, expect, it } from 'vitest';
import { surfaceForDamageable, type Damageable } from '@/combat/Damageable';
import { WEAPONS } from '@/data/weapons';
import * as THREE from 'three';
import { EventBus } from '@/core/events/EventBus';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { PlayerCombat } from '@/player/PlayerCombat';
import { ImpactFX } from '@/fx/ImpactFX';
import type { GameEvents } from '@/core/events/GameEvents';
import type { QualitySettings } from '@/core/renderer/QualitySettings';

const target = (kind: Damageable['kind']): Damageable => ({
  kind,
  id: kind,
  armor: 2,
  takeDamage: () => undefined,
});

describe('combat feedback contract', () => {
  it('classifies infantry as flesh and machine-facing targets as metal', () => {
    expect(surfaceForDamageable(target('enemy'))).toBe('flesh');
    for (const kind of ['vehicle', 'structure', 'subsystem', 'hook'] as const) {
      expect(surfaceForDamageable(target(kind))).toBe('metal');
    }
  });

  it('keeps presentation kick data separate from weapon balance', () => {
    expect(WEAPONS.rifle!.damage).toBe(24);
    expect(WEAPONS.shotgun!.pellets).toBe(9);
    expect(WEAPONS.rifle!.heldKick?.distance).toBeGreaterThan(0);
    expect(WEAPONS.shotgun!.heldKick?.distance).toBeGreaterThan(0);
  });

  it('resolves shotgun pellets once per trigger with camera damage and held muzzle presentation', async () => {
    await initRapier();
    const bus = new EventBus(),
      physics = new PhysicsWorld(),
      combat = new PlayerCombat(bus, physics);
    const damage: number[] = [];
    const body = physics.createDrivenBody(new THREE.Vector3(0, 1, -5));
    physics.addBoxTo(body, new THREE.Vector3(3, 3, 0.1), new THREE.Vector3(), undefined, {
      kind: 'enemy',
      id: 'raider-1',
      armor: 0,
      takeDamage: (n: number) => damage.push(n),
    });
    physics.step();
    const resolved: GameEvents['combat:shot-resolved'][] = [],
      shots: GameEvents['weapon:fired'][] = [],
      hits: GameEvents['combat:hit'][] = [];
    bus.on('combat:shot-resolved', (e) => resolved.push(e));
    bus.on('weapon:fired', (e) => shots.push(e));
    bus.on('combat:hit', (e) => hits.push(e));
    combat.equip('shotgun');
    combat.setVisualMuzzle(() => new THREE.Vector3(1, 1, 2));
    combat.fixedUpdate(
      1 / 60,
      { isDown: () => true, consumePressed: () => false } as never,
      {
        isAiming: true,
        muzzleOrigin: new THREE.Vector3(0, 1, 0),
        forward: new THREE.Vector3(0, 0, -1),
        addRecoil: () => {},
      } as never,
    );
    expect(damage).toHaveLength(9);
    expect(resolved).toHaveLength(1);
    expect(shots).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ pelletsHit: 9, totalDamage: 99, targetIds: ['raider-1'] });
    expect(shots[0]!.visualOrigin).toEqual({ x: 1, y: 1, z: 2 });
    expect(shots[0]!.aimEnd?.z).toBeCloseTo(-4.9);
    expect(hits.every((hit) => hit.shotId === shots[0]!.shotId && hit.surface === 'flesh')).toBe(
      true,
    );
    physics.removeBody(body);
  });

  it('environment impacts produce zero aggregate target damage and no hit confirmation', async () => {
    await initRapier();
    const physics = new PhysicsWorld(),
      bus = new EventBus(),
      combat = new PlayerCombat(bus, physics);
    const body = physics.createDrivenBody(new THREE.Vector3(0, 1, -5));
    physics.addBoxTo(body, new THREE.Vector3(4, 4, 0.1), new THREE.Vector3());
    physics.step();
    const resolved: GameEvents['combat:shot-resolved'][] = [];
    bus.on('combat:shot-resolved', (e) => resolved.push(e));
    combat.fixedUpdate(
      1 / 60,
      { isDown: () => true, consumePressed: () => false } as never,
      {
        isAiming: true,
        muzzleOrigin: new THREE.Vector3(0, 1, 0),
        forward: new THREE.Vector3(0, 0, -1),
        addRecoil: () => {},
      } as never,
    );
    expect(resolved[0]).toMatchObject({ pelletsHit: 0, totalDamage: 0, targetIds: [] });
    physics.removeBody(body);
  });

  it('reuses tracer geometry/materials and keeps the flash at the true muzzle', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerHeight: 1080 },
    });
    const scene = new THREE.Scene(),
      bus = new EventBus();
    const fx = new ImpactFX(scene, bus, { particleBudget: 300 } as QualitySettings);
    const allocations = () =>
      scene.children
        .filter((o) => o instanceof THREE.Line)
        .map((o) => {
          const line = o as THREE.Line;
          return [line.geometry.uuid, (line.material as THREE.Material).uuid];
        });
    const before = allocations();
    for (let i = 0; i < 100; i++) {
      bus.emit('weapon:fired', {
        shotId: i,
        weaponId: 'rifle',
        ammoRemaining: 20,
        visualOrigin: { x: 2, y: 3, z: 4 },
        aimEnd: { x: 0, y: 3, z: -10 },
      });
      fx.update(0.01, new THREE.Vector3(90, 90, 90));
    }
    expect(allocations()).toEqual(before);
    expect(scene.children.find((o) => o instanceof THREE.PointLight)?.position.toArray()).toEqual([
      2, 3, 4,
    ]);
    fx.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
