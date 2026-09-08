/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';

const URL = '/?nolock=1&nomenu=1&quality=low&seed=playable-loop&nospawn=1&notex=1';

const ready = (page: Page) =>
  page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

const sim = async (page: Page, seconds: number): Promise<void> => {
  const start = await page.evaluate(() => (globalThis as any).__game.game.state.simTime);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (globalThis as any).__game.game.state.simTime)) - start,
      {
        timeout: 90_000,
        intervals: [150],
      },
    )
    .toBeGreaterThanOrEqual(seconds);
};

test.describe('playable loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    await sim(page, 1);
  });

  test('salvage unlocks the manual gun and gates direct placement before it', async ({ page }) => {
    const before = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      return {
        step: g.firstRun.current,
        unlocked: g.progression.turretBlueprintReady,
        canBuild: g.build.canBuildPiece('turret-manual'),
      };
    });
    expect(before.step).toBe('salvage');
    expect(before.unlocked).toBe(false);
    expect(before.canBuild).toBe(false);

    await page.evaluate(() => (globalThis as any).__game.game.world.reset(100));
    await sim(page, 0.5);
    const after = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      const target = g.salvage.targets[0];
      if (!target || !g.salvage.hook(target.id)) throw new Error('salvage target did not spawn');
      g.salvage.open(target.id, (id: string, count: number) => g.resources.deposit(id, count));
      return {
        step: g.firstRun.current,
        unlocked: g.progression.turretBlueprintReady,
        canBuild: g.build.canBuildPiece('turret-manual'),
      };
    });
    expect(after.step).toBe('build-refinery');
    expect(after.unlocked).toBe(true);
    expect(after.canBuild).toBe(true);
  });

  test('a crewed deck gun can ray-hit the spawned skiff hull from its authored muzzle', async ({
    page,
  }) => {
    const turretId = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      const cell = (() => {
        for (let x = -2; x <= 2; x++) {
          for (let z = -4; z <= 4; z++) {
            const candidate = { x, y: 0, z };
            if (g.build.canPlace({ piece: 'floor', cell: candidate, rotation: 0 }).ok)
              return candidate;
          }
        }
        throw new Error('no open deck cell');
      })();
      const floor = g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const piece = g.build.place({ piece: 'turret-manual', cell, rotation: 0 }, true);
      if (!piece)
        throw new Error(
          `turret placement failed floor=${Boolean(floor)} validation=${JSON.stringify(g.build.canPlace({ piece: 'turret-manual', cell, rotation: 0 }))}`,
        );
      if (!g.defense.enter(piece.instanceId)) throw new Error('turret enter failed');
      if (!g.vehicleScene.spawn('port')) throw new Error('skiff spawn failed');
      return piece.instanceId;
    });

    await expect
      .poll(
        () => page.evaluate(() => (globalThis as any).__game.game.vehicleManager.snapshot?.phase),
        { timeout: 30_000, intervals: [150] },
      )
      .toMatch(/firing-pass|alongside|hook-flight|attached|boarding/);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const g = (globalThis as any).__game.game;
            const visual = g.build.turretVisual(g.defense.serialise()[0].instanceId);
            const skiff = g.vehicleManager.snapshot;
            if (!visual || !skiff) return false;
            const at = g.playerCamera.camera.position.clone();
            const dir = g.playerCamera.camera.position.clone();
            visual.muzzle.getWorldPosition(at);
            const current = g.defense.serialise()[0];
            let best = { score: Number.POSITIVE_INFINITY, yaw: current.yaw, pitch: current.pitch };
            const skiffModel = g.vehicleScene.group.children[0];
            const target = {
              x: skiff.lateral,
              y: (skiffModel?.position.y ?? 0) + 0.78,
              z: skiff.forward,
            };
            const dx = target.x - at.x;
            const dy = target.y - at.y;
            const dz = target.z - at.z;
            const length = Math.hypot(dx, dy, dz) || 1;
            for (let yaw = -120; yaw <= 120; yaw += 10) {
              for (let pitch = -30; pitch <= 35; pitch += 5) {
                g.defense.aim(
                  (yaw * Math.PI) / 180 - current.yaw,
                  (pitch * Math.PI) / 180 - current.pitch,
                );
                visual.muzzle.getWorldDirection(dir).negate();
                const dot = (dir.x * dx + dir.y * dy + dir.z * dz) / length;
                if (1 - dot < best.score)
                  best = {
                    score: 1 - dot,
                    yaw: (yaw * Math.PI) / 180,
                    pitch: (pitch * Math.PI) / 180,
                  };
                const now = g.defense.serialise()[0];
                current.yaw = now.yaw;
                current.pitch = now.pitch;
              }
            }
            const now = g.defense.serialise()[0];
            g.defense.aim(best.yaw - now.yaw, best.pitch - now.pitch);
            g.defense.update(g.state.simTime, {
              dt: 1 / 60,
              lookX: 0,
              lookY: 0,
              fireHeld: true,
              powered: true,
              occupied: false,
            });
            return (g.vehicleManager.snapshot?.hullHealth ?? 260) < 260;
          }),
        { timeout: 30_000, intervals: [250] },
      )
      .toBe(true);

    const mountedAfterDestroy = await page.evaluate((instanceId) => {
      const g = (globalThis as any).__game.game;
      g.build.damagePiece(instanceId, 999);
      return g.defense.mounted;
    }, turretId);
    expect(mountedAfterDestroy).toBeNull();
  });

  test('power loss suppresses manual fire and combat saves refuse an active enemy', async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const g = (globalThis as any).__game.game;
      const cell = (() => {
        for (let x = -2; x <= 2; x++) {
          for (let z = -4; z <= 4; z++) {
            const candidate = { x, y: 0, z };
            if (g.build.canPlace({ piece: 'floor', cell: candidate, rotation: 0 }).ok)
              return candidate;
          }
        }
        throw new Error('no open deck cell');
      })();
      g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const piece = g.build.place({ piece: 'turret-manual', cell, rotation: 0 }, true);
      if (!piece || !g.defense.enter(piece.instanceId)) throw new Error('turret setup failed');
      g.machine.power.restore({ fuel: 0 });
      const view = g.defense.update(g.state.simTime, {
        dt: 1 / 60,
        lookX: 0,
        lookY: 0,
        fireHeld: true,
        powered: false,
        occupied: false,
      });
      const enemy = g.enemies.spawn('scavenger', { x: 0, y: 4, z: -8 });
      return {
        powered: view?.powered,
        saveWhileUnsafe: await g.saveTo('playable-combat'),
        enemy: Boolean(enemy),
      };
    });
    expect(result.powered).toBe(false);
    expect(result.saveWhileUnsafe).toBe(false);
    expect(result.enemy).toBe(true);
  });

  test('a close wall blocks a player volley by collider identity', async ({ page }) => {
    await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      if (!g.vehicleScene.spawn('port')) throw new Error('skiff spawn failed');
    });
    await expect
      .poll(
        () => page.evaluate(() => (globalThis as any).__game.game.vehicleManager.snapshot?.phase),
        { timeout: 30_000, intervals: [150] },
      )
      .toBe('firing-pass');

    const blocked = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      const skiff = g.vehicleScene.group.children[0];
      const muzzle = skiff?.getObjectByName('SkiffMuzzle');
      const yaw = skiff?.getObjectByName('SkiffGunYaw');
      const pitch = skiff?.getObjectByName('SkiffGunPitch');
      if (!skiff || !muzzle || !yaw || !pitch) throw new Error('skiff muzzle missing');

      const vector = g.player.worldPosition;
      // Face away from the machine over an unobstructed strip of desert.
      // Otherwise the real hull can sit between the fixture and its target.
      const target = skiff
        .getWorldPosition(new vector.constructor())
        .add(new vector.constructor(-10, 3, -2));
      g.player.worldPosition.copy(target);
      g.player.handle.body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
      const local = skiff.worldToLocal(target.clone()).sub(yaw.position);
      yaw.rotation.y = Math.atan2(-local.x, -local.z);
      pitch.rotation.x = Math.atan2(local.y, Math.hypot(local.x, local.z));
      skiff.updateMatrixWorld(true);
      g.physics.step();

      const origin = new target.constructor();
      const direction = new target.constructor();
      muzzle.getWorldPosition(origin);
      muzzle.getWorldDirection(direction).negate();
      const clear = g.canDamageVolleyTarget('player', origin, target);
      const distance = origin.distanceTo(target);
      const cover = origin
        .clone()
        .addScaledVector(direction, Math.min(2, Math.max(0.75, distance * 0.25)));
      const coverCollider = g.physics.addFixedBox(
        new vector.constructor(0.75, 1.5, 0.75),
        cover,
        0,
        { kind: 'cover-test' },
      );
      g.physics.step();
      const blocked = g.canDamageVolleyTarget('player', origin, target);
      g.physics.removeCollider(coverCollider);
      const moved = target.clone().add(new vector.constructor(0, 0, 4));
      g.player.worldPosition.copy(moved);
      g.player.handle.body.setTranslation({ x: moved.x, y: moved.y, z: moved.z }, true);
      g.physics.step();
      const movedOffFrozenPoint = !g.canDamageVolleyTarget('player', origin, target);
      return { clear, blocked, movedOffFrozenPoint };
    });
    expect(blocked.clear).toBe(true);
    expect(blocked.blocked).toBe(false);
    expect(blocked.movedOffFrozenPoint).toBe(true);
  });

  test('a scheduled volley damages an exposed turret while the player is covered', async ({
    page,
  }) => {
    const setup = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      // An outboard platform exposes the gun above the desert without the
      // machine's leg housings blocking the incoming shot.
      const cell = { x: -4, y: 0, z: 0 };
      g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const turret = g.build.place({ piece: 'turret-manual', cell, rotation: 0 }, true);
      if (!turret) throw new Error('turret placement failed');

      // Put the player inside a nearby solid cover volume so target selection
      // must use the exposed turret. Keep the real candidate selection,
      // skiff schedule, muzzle ray, delayed impact and damage callback.
      const vector = g.player.worldPosition;
      g.physics.addFixedBox(new vector.constructor(1.5, 2, 1.5), vector.clone(), 0, {
        kind: 'cover-test',
      });
      if (!g.vehicleScene.spawn('port')) throw new Error('skiff spawn failed');
      return {
        instanceId: turret.instanceId,
        health: g.build.pieceHealth(turret.instanceId),
      };
    });

    await expect
      .poll(
        () => page.evaluate(() => (globalThis as any).__game.game.vehicleManager.snapshot?.phase),
        { timeout: 30_000, intervals: [150] },
      )
      .toBe('firing-pass');
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) => (globalThis as any).__game.game.build.pieceHealth(id),
            setup.instanceId,
          ),
        { timeout: 30_000, intervals: [150] },
      )
      .toBeLessThan(setup.health ?? 0);
  });

  test('tutorial side follows four gun rotations after dismount', async ({ page }) => {
    const sides = await page.evaluate(() => {
      const g = (globalThis as any).__game.game;
      g.stop();
      const results = [];
      for (const rotation of [0, 1, 2, 3]) {
        g.defense.clear();
        g.build.clear();
        const cell = { x: -3, y: 0, z: -2 };
        g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        const turret = g.build.place({ piece: 'turret-manual', cell, rotation }, true);
        if (!turret || !g.defense.enter(turret.instanceId)) throw new Error('turret setup failed');
        g.tutorialTurretId = turret.instanceId;
        const result = [-120, 0, 120].map((degrees) => {
          const current = g.defense
            .serialise()
            .find((entry: any) => entry.instanceId === turret.instanceId);
          g.defense.aim((degrees * Math.PI) / 180 - current.yaw, 0);
          return g.tutorialSkiffSide();
        });
        g.defense.exit();
        results.push({ rotation, result, afterDismount: g.tutorialSkiffSide() });
      }
      return results;
    });
    expect(sides).toHaveLength(4);
    // A starboard-facing base cannot aim at the port skiff, even when the
    // player leaves its barrel at the extreme nearest that forbidden side.
    expect(sides[1]!.result).toEqual(['starboard', 'starboard', 'starboard']);
    expect(sides[3]!.result).toEqual(['port', 'port', 'port']);
    for (const row of sides) expect(row.afterDismount).toBe(row.result.at(-1));
  });

  test('autosave waits for a clear deck and backs off after storage failure', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = (globalThis as any).__game.game;
      g.stop();
      const originalSave = g.saves.save.bind(g.saves);
      let writes = 0;
      let pending: Promise<unknown> | null = null;
      g.saves.save = (...args: unknown[]) => {
        writes++;
        pending = originalSave(...args);
        return pending;
      };
      const enemy = g.enemies.spawn('scavenger', { x: 0, y: 4.8, z: -8 });
      if (!enemy) throw new Error('enemy setup failed');
      g.nextAutosaveAt = g.state.simTime;
      g.autosavePending = true;
      g.processAutosave();
      const duringAttack = writes;
      enemy.takeDamage(999);
      // A corpse remains in the active pool while its 2.5s death clip plays.
      // Advance the real fixed loop until normal cleanup makes the deck safe.
      for (let i = 0; i < 180; i++) g.fixedUpdate(1 / 60);
      if (pending) await pending;
      // Allow Game's save completion/finally chain to finish too.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const afterClear = writes;
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
      const coalesced = writes;

      let failures = 0;
      g.saves.save = async () => {
        failures++;
        throw new Error('quota fixture');
      };
      g.nextAutosaveAt = g.state.simTime;
      g.autosavePending = true;
      g.processAutosave();
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        duringAttack,
        afterClear,
        coalesced,
        failures,
        retryDelay: g.nextAutosaveAt - g.state.simTime,
      };
    });
    expect(result.duringAttack).toBe(0);
    expect(result.afterClear).toBe(1);
    expect(result.coalesced).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.retryDelay).toBeGreaterThan(59);
  });

  test('calm save succeeds and storage failure stays in memory with visible feedback', async ({
    page,
  }) => {
    const calm = await page.evaluate(() => (globalThis as any).__game.game.saveTo('playable-calm'));
    expect(calm).toBe(true);
    const failed = await page.evaluate(async () => {
      const g = (globalThis as any).__game.game;
      g.saves.save = async () => {
        throw new Error('quota');
      };
      return await g.saveTo('playable-failed');
    });
    expect(failed).toBe(false);
    await expect(page.locator('#hud-warning')).toContainText('Save failed');
  });
});
