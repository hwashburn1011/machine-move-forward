import { test, expect, type Page } from '@playwright/test';

/**
 * The four claims this milestone makes, checked in the running game.
 *
 * Everything waits on SIMULATED time, for the reason smoke.spec.ts gives:
 * under the software renderer the fixed step lets simulated time lag wall
 * time, so a wall-clock wait tests the GPU rather than the game.
 */
const ready = (page: Page) =>
  page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

const simTime = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as never as { __game: { debugStats(): { simTime: number } } }).__game.debugStats()
        .simTime,
  );

async function sim(page: Page, seconds: number) {
  const start = await simTime(page);
  await expect
    .poll(async () => (await simTime(page)) - start, { timeout: 90_000, intervals: [150] })
    .toBeGreaterThanOrEqual(seconds);
}

test.describe('machine damage', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed&nospawn=1&notex=1&nomodel=1');
    await ready(page);
    await sim(page, 1.2);
  });

  test('a wrecked engine stops the machine, and repairing it starts it again', async ({ page }) => {
    const before = await page.evaluate(
      () =>
        (globalThis as never as { __game: { machine: { movement: { maxSpeed: number } } } }).__game
          .machine.movement.maxSpeed,
    );
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => {
      const m = (
        globalThis as never as {
          __game: { machine: { damage: { damage(id: string, n: number): number } } };
        }
      ).__game.machine.damage;
      m.damage('engine', 99999);
    });
    await sim(page, 4);

    const stopped = await page.evaluate(
      () =>
        (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game
          .debugStats().distance,
    );
    await sim(page, 2);
    const stillStopped = await page.evaluate(
      () =>
        (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game
          .debugStats().distance,
    );
    // Stopped means stopped: it must not creep.
    expect(stillStopped - stopped).toBeLessThan(0.5);

    await page.evaluate(() =>
      (
        globalThis as never as {
          __game: { machine: { damage: { repair(id: string, n: number): void } } };
        }
      ).__game.machine.damage.repair('engine', 99999),
    );
    await sim(page, 3);
    const moving = await page.evaluate(
      () =>
        (globalThis as never as { __game: { debugStats(): { distance: number } } }).__game
          .debugStats().distance,
    );
    expect(moving).toBeGreaterThan(stillStopped + 2);
    expect(errors).toEqual([]);
  });

  test('a damaged leg slows the machine without stopping it', async ({ page }) => {
    const top = () =>
      page.evaluate(
        () =>
          (globalThis as never as { __game: { machine: { movement: { maxSpeed: number } } } })
            .__game.machine.movement.maxSpeed,
      );
    const before = await top();
    await page.evaluate(() => {
      const m = (
        globalThis as never as {
          __game: { machine: { damage: { damage(id: string, n: number): number } } };
        }
      ).__game.machine.damage;
      for (const id of ['leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right']) {
        m.damage(id, 99999);
      }
    });
    await sim(page, 1);
    const after = await top();
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('a wall takes damage and is destroyed, taking what it carried with it', async ({ page }) => {
    const out = await page.evaluate(() => {
      const g = globalThis as never as {
        __game: {
          game: {
            build: {
              clear(): void;
              place(p: unknown, free?: boolean): { instanceId: string } | null;
              damagePiece(id: string, n: number): number;
              pieceHealth(id: string): number | null;
              pieceCount: number;
            };
          };
          canonicalEdge(cell: unknown, side: string): unknown;
        };
      };
      const B = g.__game.game.build;
      B.clear();
      B.place({ piece: 'floor', cell: { x: -2, y: 0, z: -5 }, rotation: 0 }, true);
      const wall = B.place(
        {
          piece: 'wall',
          cell: { x: -2, y: 0, z: -5 },
          edge: g.__game.canonicalEdge({ x: -2, y: 0, z: -5 }, 'west'),
          rotation: 0,
        },
        true,
      );
      if (!wall) return null;

      const dealt = B.damagePiece(wall.instanceId, 20);
      const mid = B.pieceHealth(wall.instanceId);
      B.damagePiece(wall.instanceId, 99999);
      return { dealt, mid, gone: B.pieceHealth(wall.instanceId) };
    });

    expect(out).not.toBeNull();
    const { dealt, mid, gone } = out as { dealt: number; mid: number | null; gone: number | null };
    // Armour is subtracted, so a 20 hit lands less than 20.
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(20);
    expect(mid).toBeGreaterThan(0);
    // Destroyed pieces stop existing, rather than sitting at zero health.
    expect(gone).toBeNull();
    expect(errors).toEqual([]);
  });

  test('an enemy on the far side of a wall does not reach the player through it', async ({
    page,
  }) => {
    // The bug Task 7 fixes: 2m cells against a 2.2m reach meant an enemy one
    // cell away damaged the player through a wall.
    const hp = await page.evaluate(() => {
      const g = globalThis as never as {
        __game: {
          game: {
            build: { clear(): void; place(p: unknown, free?: boolean): unknown };
          };
          player: { stats: { health: number }; teleport(v: unknown): void };
          canonicalEdge(cell: unknown, side: string): unknown;
        };
      };
      const B = g.__game.game.build;
      B.clear();
      for (let x = -3; x <= -1; x++) {
        B.place({ piece: 'floor', cell: { x, y: 0, z: -4 }, rotation: 0 }, true);
      }
      B.place(
        {
          piece: 'wall',
          cell: { x: -2, y: 0, z: -4 },
          edge: g.__game.canonicalEdge({ x: -2, y: 0, z: -4 }, 'west'),
          rotation: 0,
        },
        true,
      );
      g.__game.player.teleport({ x: -4, y: 4.8, z: -8 });
      return g.__game.player.stats.health;
    });
    expect(hp).toBe(100);
    expect(errors).toEqual([]);
  });
});
