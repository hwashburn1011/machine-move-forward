import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ENEMIES, MECH_ENEMY_IDS } from '@/data/enemies';
import { mechWave } from '@/enemies/MechEncounters';
import { RangedWindup } from '@/enemies/RangedWindup';
import { ThreatDirector } from '@/enemies/ThreatDirector';
import { Rng } from '@/core/math/Random';
import { EnemyManager } from '@/enemies/EnemyManager';
import { PhysicsWorld, initRapier } from '@/core/physics/PhysicsWorld';
import { EventBus } from '@/core/events/EventBus';
import { Materials } from '@/art/Materials';
import { PlayerStats } from '@/player/PlayerStats';
import { cellCenter, cellKey, type Cell } from '@/building/BuildGrid';

describe('mech encounter roster', () => {
  it('preserves the opening, gradually unlocks elites, and retains an engine attacker', () => {
    expect(mechWave(['scavenger'], 1, 1, () => 0.99)).toEqual(['scavenger']);
    const seen = new Set<string>();
    const rng = new Rng(34);
    for (let wave = 2; wave < 100; wave++) {
      const members = mechWave(['raider', 'raider', 'scavenger', 'scavenger'], wave, 1, () =>
        rng.next(),
      );
      members.forEach((id) => seen.add(id));
      expect(members[0]).toBe('raider');
      expect(
        members.filter((id) => ['bastion', 'sovereign'].includes(id)).length,
      ).toBeLessThanOrEqual(1);
      if (wave < 4) expect(members).not.toContain('bastion');
      if (wave < 6) expect(members).not.toContain('sovereign');
    }
    for (const id of MECH_ENEMY_IDS) expect(seen.has(id)).toBe(true);
    expect(mechWave(['scavenger', 'scavenger'], 20, 0.2, () => 0.99)).toEqual([
      'revenant',
      'revenant',
    ]);
  });

  it('preserves all four queued mech IDs and RNG composition across save/load', () => {
    const d = new ThreatDirector('mech-save');
    d.restore({
      ...d.toSave(),
      phase: 'contact',
      wavesSurvived: 10,
      pending: [...MECH_ENEMY_IDS],
      draws: 77,
    });
    const loaded = new ThreatDirector('mech-save');
    loaded.restore(JSON.parse(JSON.stringify(d.toSave())));
    expect(loaded.toSave().pending).toEqual([...MECH_ENEMY_IDS]);
    const kinds: string[] = [];
    for (let m = 0; m < 15000; m += 25) {
      const a = d.update(m, 0, 1),
        b = loaded.update(m, 0, 1);
      expect(a).toEqual(b);
      if (a.spawn) kinds.push(a.spawn.defId);
      if (a.vehicle) {
        d.finishExternalEncounter(m);
        loaded.finishExternalEncounter(m);
      }
    }
    expect(kinds.length).toBeGreaterThan(12);
  });

  it('ships actual animated combat assets with weapons and bounded complexity', () => {
    for (const id of MECH_ENEMY_IDS) {
      const bytes = readFileSync(`public/models/authored/${id}.glb`);
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
      expect(gltf.animations.map((a: { name: string }) => a.name).sort()).toEqual([
        'attack',
        'death',
        'idle',
        'polish_attack',
        'polish_death',
        'polish_hit',
        'run',
        'walk',
      ]);
      expect(gltf.skins[0].joints.length).toBeGreaterThanOrEqual(47);
      expect(gltf.nodes.some((n: { name: string }) => n.name === 'EnemyMuzzle')).toBe(true);
      expect(gltf.nodes.some((n: { extras?: { mechId: string } }) => n.extras?.mechId === id)).toBe(
        true,
      );
      const triangles = gltf.meshes.reduce(
        (sum: number, m: { primitives: { indices: number }[] }) =>
          sum + m.primitives.reduce((s, p) => s + gltf.accessors[p.indices].count / 3, 0),
        0,
      );
      expect(triangles).toBeLessThan(65000);
      expect(bytes.length).toBeLessThan(5_000_000);
    }
  });
});

describe('committed ranged attacks', () => {
  it('warns before firing, retains aim when the target moves, and resets bursts', () => {
    const windup = new RangedWindup(ENEMIES.bastion!.ranged!);
    const target = { x: 1, y: 2, z: 3 };
    windup.begin(target);
    target.x = 20;
    expect(windup.step(1)).toBe(false);
    expect(windup.target!.x).toBe(1);
    expect(windup.step(0.16)).toBe(true);
    expect(windup.step(0.01)).toBe(false);
    expect(windup.step(0.14)).toBe(true);
    expect(windup.step(0.14)).toBe(true);
    expect(windup.complete).toBe(true);
    windup.reset();
    expect(windup.step(10)).toBe(false);
    expect(windup.target).toBeNull();
  });
});

describe('actual pooled combat and cover', () => {
  beforeAll(initRapier);
  const fixture = () => {
    const physics = new PhysicsWorld(),
      bus = new EventBus(),
      materials = new Materials();
    const enemies = new EnemyManager(new THREE.Scene(), physics, bus, materials);
    const floor = physics.createDrivenBody(new THREE.Vector3(0, 3.9, 0));
    physics.addBoxTo(floor, new THREE.Vector3(20, 0.1, 20), new THREE.Vector3());
    const playerPos = new THREE.Vector3(0, 5, 7);
    const player = physics.addCharacter(0.35, 0.6, playerPos);
    physics.setUserData(player.collider, { kind: 'player' });
    const stats = new PlayerStats(bus);
    const tick = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        physics.step();
        enemies.fixedUpdate(1 / 60, playerPos, stats);
        enemies.update(1, 1 / 60);
      }
    };
    return { physics, bus, enemies, player, playerPos, stats, tick };
  };

  it('can alternate enemy types after all eight cache slots have been used', () => {
    const { enemies } = fixture();
    for (let i = 0; i < 8; i++)
      expect(enemies.spawn('scavenger', new THREE.Vector3(i, 2, 0))).not.toBeNull();
    expect(enemies.spawn('warden', new THREE.Vector3())).toBeNull();
    enemies.despawnAll();
    for (const id of [...MECH_ENEMY_IDS, ...MECH_ENEMY_IDS]) {
      const e = enemies.spawn(id, new THREE.Vector3(0, 2, 0));
      expect(e?.def.id).toBe(id);
      e?.takeDamage(999);
      e?.despawn();
    }
  });

  it('prewarms reusable rigs without creating encounters or physics bodies', () => {
    const { enemies, physics, bus } = fixture();
    const count = physics.bodyCount;
    let spawned = 0;
    bus.on('enemy:spawned', () => spawned++);
    const warmed = [...enemies.prewarm([...MECH_ENEMY_IDS, ...MECH_ENEMY_IDS])];
    for (const enemy of warmed) {
      enemy.stageForWarmup(new THREE.Vector3(0, 30, 0));
      enemy.finishWarmup();
      expect(enemy.object3D.parent).toBeNull();
    }
    expect(enemies.activeCount).toBe(0);
    expect(physics.bodyCount).toBe(count);
    expect(spawned).toBe(0);
    const enemy = enemies.spawn('warden', new THREE.Vector3(0, 5, 0))!;
    expect(warmed).toContain(enemy);
    expect(enemy.object3D.parent).not.toBeNull();
    expect(spawned).toBe(1);
    enemy.despawn();
    expect(enemy.object3D.parent).toBeNull();
    expect(enemies.spawn('warden', new THREE.Vector3(0, 5, 0))).toBe(enemy);
    expect(spawned).toBe(2);
  });

  it('damages a stationary visible player only after the warning', () => {
    const f = fixture();
    f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0));
    f.tick(35);
    expect(f.stats.health).toBe(100);
    f.tick(35);
    expect(f.stats.health).toBe(92);
    f.enemies.despawnAll();
  });

  it('lets a player dodge a committed shot and cancels fire on death', () => {
    const f = fixture();
    const e = f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0))!;
    f.tick(20);
    f.playerPos.x = 3;
    f.player.body.setTranslation(f.playerPos, true);
    f.tick(50);
    expect(f.stats.health).toBe(100);
    e.takeDamage(999);
    f.tick(200);
    expect(f.stats.health).toBe(100);
    expect(e.isActive).toBe(false);
  });

  it('solid cover intercepts shots already being aimed', () => {
    const f = fixture();
    f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0));
    f.tick(20);
    const wall = f.physics.createDrivenBody(new THREE.Vector3(0, 5, 4));
    f.physics.addBoxTo(wall, new THREE.Vector3(10, 2, 0.2), new THREE.Vector3());
    f.tick(80);
    expect(f.stats.health).toBe(100);
    f.enemies.despawnAll();
  });

  it('commits a warden to a covered reachable flank when its direct lane is blocked', () => {
    const f = fixture();
    const enemy = f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0))!;
    const level = enemy.gridCell.y;
    const start: Cell = { x: 0, y: level, z: 0 };
    const side: Cell = { x: 2, y: level, z: 0 };
    const flank: Cell = { x: 2, y: level, z: 2 };
    const nav = {
      links: new Map<string, Cell[]>([
        [cellKey(start), [side]],
        [cellKey(side), [start, flank]],
        [cellKey(flank), [side]],
      ]),
    };
    const wall = f.physics.createDrivenBody(new THREE.Vector3(0, 5, 1.5));
    const coverCollider = f.physics.addBoxTo(
      wall,
      new THREE.Vector3(2, 2, 0.2),
      new THREE.Vector3(),
      undefined,
      {
        kind: 'structure',
        id: 'flank-cover',
        armor: 0,
        takeDamage: () => undefined,
      },
    );

    // The first tick observes the cover and transitions the Warden into its
    // flank phase. The next manager repath is the one that commits a route.
    const before = enemy.worldPosition.clone();
    let committedAt: THREE.Vector3 | null = null;
    let healthAtCommit = 0;
    for (let i = 0; i < 90; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats, nav);
      const target = f.enemies.flankTarget(enemy.id);
      if (target && !committedAt) {
        committedAt = enemy.worldPosition.clone();
        healthAtCommit = f.stats.health;
      }
    }

    expect(enemy.tacticalSnapshot?.phase).toBe('flank');
    expect(enemy.gridCell.y).toBe(start.y);
    const committed = f.enemies.flankTarget(enemy.id);
    expect(committed).not.toBeNull();
    expect(Math.hypot(committed!.x, committed!.z)).toBeGreaterThan(0);
    expect(committed!.y).toBeCloseTo(cellCenter(flank).y);
    expect(enemy.pathLength).toBeGreaterThan(0);
    expect(committedAt).not.toBeNull();
    expect(enemy.worldPosition.distanceTo(before)).toBeGreaterThan(0.2);
    expect(f.stats.health).toBe(healthAtCommit);
    f.physics.removeCollider(coverCollider);
    for (let i = 0; i < 180; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats, nav);
    }
    expect(f.enemies.flankTarget(enemy.id)).toBeNull();
    expect(f.stats.health).toBeLessThan(healthAtCommit);
    f.enemies.despawnAll();
  });

  it('moves a Revenant at its committed lunge speed and strikes once in range', () => {
    const f = fixture();
    const enemy = f.enemies.spawn('revenant', new THREE.Vector3(0, 5, 0))!;
    f.playerPos.z = 5.5;
    f.player.body.setTranslation(f.playerPos, true);
    const before = enemy.worldPosition.clone();
    for (let i = 0; i < 70; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats);
    }
    const travelled = enemy.worldPosition.distanceTo(before);
    expect(travelled).toBeGreaterThan(2.5);
    expect(travelled).toBeLessThan(7);
    expect(f.stats.health).toBe(90);
    f.enemies.despawnAll();
  });

  it('hits a close target during the lunge but misses a target that dodges behind distance', () => {
    const close = fixture();
    close.playerPos.z = 1;
    close.player.body.setTranslation(close.playerPos, true);
    close.enemies.spawn('revenant', new THREE.Vector3(0, 5, 0));
    for (let i = 0; i < 70; i++) {
      close.physics.step();
      close.enemies.fixedUpdate(1 / 60, close.playerPos, close.stats);
    }
    expect(close.stats.health).toBe(90);
    close.enemies.despawnAll();

    const dodge = fixture();
    const enemy = dodge.enemies.spawn('revenant', new THREE.Vector3(0, 5, 0))!;
    dodge.playerPos.z = 5.5;
    dodge.player.body.setTranslation(dodge.playerPos, true);
    for (let i = 0; i < 35; i++) {
      dodge.physics.step();
      dodge.enemies.fixedUpdate(1 / 60, dodge.playerPos, dodge.stats);
    }
    dodge.playerPos.z = 20;
    dodge.player.body.setTranslation(dodge.playerPos, true);
    for (let i = 0; i < 45; i++) {
      dodge.physics.step();
      dodge.enemies.fixedUpdate(1 / 60, dodge.playerPos, dodge.stats);
    }
    expect(dodge.stats.health).toBe(100);
    expect(enemy.tacticalSnapshot?.phase).toBe('recovery');
    dodge.enemies.despawnAll();
  });

  it('travel missions suppress player attacks and stop steering at their target', () => {
    const f = fixture();
    const enemy = f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0))!;
    const target = new THREE.Vector3(0, 5, 2);
    enemy.setMissionTarget(target, 'travel', 'engine');
    for (let i = 0; i < 240; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats);
    }
    expect(f.stats.health).toBe(100);
    expect(enemy.tacticalSnapshot?.missionMode).toBe('travel');
    expect(enemy.worldPosition.distanceTo(target)).toBeLessThan(1.5);
    f.enemies.despawnAll();
  });

  it('sabotage missions damage only their validated subsystem at the target', () => {
    const f = fixture();
    const enemy = f.enemies.spawn('warden', new THREE.Vector3(0, 5, 0))!;
    const damages: Array<{ id: string; amount: number }> = [];
    enemy.setMissionTarget(new THREE.Vector3(0, 5, 0), 'sabotage', 'engine');
    for (let i = 0; i < 40; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats, null, null, null, {
        damage: (id, amount) => (damages.push({ id, amount }), amount),
      });
    }
    expect(f.stats.health).toBe(100);
    expect(damages.length).toBeGreaterThan(0);
    expect(damages.every((damage) => damage.id === 'engine')).toBe(true);
    f.enemies.despawnAll();
  });

  it('opens Bastion vent only after its burst and doubles open-vent damage', () => {
    const f = fixture();
    const enemy = f.enemies.spawn('bastion', new THREE.Vector3(0, 5, 0))!;
    let opened = false;
    for (let i = 0; i < 240; i++) {
      f.physics.step();
      f.enemies.fixedUpdate(1 / 60, f.playerPos, f.stats);
      if (enemy.tacticalSnapshot?.ventOpen) {
        opened = true;
        break;
      }
    }
    expect(opened).toBe(true);
    const before = enemy.currentHealth;
    enemy.applyHit({ amount: 10, weakpoint: 'vent' });
    expect(enemy.currentHealth).toBe(before - 20);
    f.enemies.despawnAll();
  });

  it('protects allies only while Sovereign drone is alive and Sovereign is alive', () => {
    const f = fixture();
    const sovereign = f.enemies.spawn('sovereign', new THREE.Vector3(0, 5, 0))!;
    const ally = f.enemies.spawn('warden', new THREE.Vector3(1, 5, 0))!;
    expect(f.enemies.damageMultiplierFor(ally)).toBeCloseTo(0.8);
    sovereign.damageDrone(999);
    expect(f.enemies.damageMultiplierFor(ally)).toBe(1);
    sovereign.despawn();
    f.enemies.spawn('sovereign', new THREE.Vector3(0, 5, 0));
    expect(sovereign.tacticalSnapshot?.droneAlive).toBe(true);
    expect(f.enemies.damageMultiplierFor(ally)).toBeCloseTo(0.8);
    sovereign.takeDamage(999);
    expect(f.enemies.damageMultiplierFor(ally)).toBe(1);
    f.enemies.despawnAll();
  });
});
