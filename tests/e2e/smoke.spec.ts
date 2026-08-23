import { test, expect, type Page } from '@playwright/test';

/**
 * Boot-to-save smoke test.
 *
 * Everything waits on SIMULATED time. Under the software renderer the fixed
 * step deliberately lets simulated time lag wall time, so wall-clock waits
 * would be testing the GPU rather than the game.
 */

interface DebugStats {
  calls: number;
  tris: number;
  distance: number;
  chunks: number;
  simTime: number;
  hp: number;
  ammo: string;
  weapon: string;
  enemies: number;
  grounded: boolean;
  playerY: number;
}

const stats = (page: Page) =>
  page.evaluate(() => (globalThis as never as { __game: { debugStats(): DebugStats } }).__game.debugStats());

async function sim(page: Page, seconds: number) {
  const start = (await stats(page)).simTime;
  await expect
    .poll(async () => (await stats(page)).simTime - start, { timeout: 90_000, intervals: [150] })
    .toBeGreaterThanOrEqual(seconds);
}

test.describe('Machine Move Forward', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed');
    await sim(page, 1.2);
  });

  test('boots without console errors and renders a real frame', async ({ page }) => {
    expect(errors).toEqual([]);

    const box = await page.locator('#game').boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    const s = await stats(page);
    // A blank or all-black render would have essentially nothing to draw.
    expect(s.calls).toBeGreaterThan(10);
    expect(s.tris).toBeGreaterThan(1000);
    expect(s.chunks).toBe(9);
  });

  test('the screenshot is not a uniform colour', async ({ page }) => {
    const shot = await page.locator('#game').screenshot();
    // Sample the raw PNG bytes: a flat frame compresses to almost nothing,
    // which catches a blank canvas that still reports draw calls.
    expect(shot.byteLength).toBeGreaterThan(20_000);
  });

  test('the machine travels forward on its own', async ({ page }) => {
    const before = (await stats(page)).distance;
    await sim(page, 2);
    const after = (await stats(page)).distance;
    expect(after).toBeGreaterThan(before + 8);
  });

  test('the player stands on the deck and can walk', async ({ page }) => {
    const s0 = await stats(page);
    expect(s0.grounded).toBe(true);

    const before = await page.evaluate(
      () => (globalThis as never as { __game: { player: { worldPosition: { x: number; z: number } } } }).__game.player.worldPosition,
    );
    await page.keyboard.down('w');
    await sim(page, 0.8);
    await page.keyboard.up('w');
    const after = await page.evaluate(
      () => (globalThis as never as { __game: { player: { worldPosition: { x: number; z: number } } } }).__game.player.worldPosition,
    );

    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    expect(moved).toBeGreaterThan(2);
    expect(errors).toEqual([]);
  });

  test('firing consumes ammo', async ({ page }) => {
    const before = (await stats(page)).ammo;
    await page.mouse.down();
    await sim(page, 0.5);
    await page.mouse.up();
    await sim(page, 0.1);
    const after = (await stats(page)).ammo;

    expect(Number(after.split('/')[0])).toBeLessThan(Number(before.split('/')[0]));
    expect(errors).toEqual([]);
  });

  test('the HUD reports live values', async ({ page }) => {
    await expect(page.locator('#hud-health-value')).toHaveText('100');
    await expect(page.locator('#hud-weapon-name')).toHaveText('Scrapline AR');
    await expect(page.locator('#hud-ammo')).toContainText('30');
    await expect(page.locator('#hud-distance')).not.toHaveText('0 m');
  });

  test('the debug overlay toggles', async ({ page }) => {
    await expect(page.locator('#debug-overlay')).toBeHidden();
    await page.keyboard.press('F3');
    await sim(page, 0.4);
    await expect(page.locator('#debug-overlay')).toBeVisible();
    await expect(page.locator('#debug-overlay')).toContainText('Draw calls');
  });

  test('save and reload restores distance and ammo', async ({ page }) => {
    await page.mouse.down();
    await sim(page, 0.4);
    await page.mouse.up();
    await sim(page, 0.3);

    const saved = await stats(page);
    await page.evaluate(
      () => (globalThis as never as { __game: { game: { saveTo(s: string): Promise<void> } } }).__game.game.saveTo('e2e'),
    );

    // Travel on, then load the save back.
    await sim(page, 3);
    const drifted = await stats(page);
    expect(drifted.distance).toBeGreaterThan(saved.distance);

    const loaded = await page.evaluate(
      () => (globalThis as never as { __game: { game: { loadFrom(s: string): Promise<boolean> } } }).__game.game.loadFrom('e2e'),
    );
    expect(loaded).toBe(true);

    const restored = await stats(page);
    // Distance keeps advancing while loading, so allow a small forward drift.
    expect(Math.abs(restored.distance - saved.distance)).toBeLessThan(15);
    expect(restored.ammo).toBe(saved.ammo);
    expect(errors).toEqual([]);
  });

  test('the world survives a long jump forward', async ({ page }) => {
    await page.evaluate(
      () => (globalThis as never as { __game: { world: { reset(d: number): void } } }).__game.world.reset(50_000),
    );
    await sim(page, 1);

    const s = await stats(page);
    expect(s.chunks).toBe(9);
    expect(s.calls).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });
});
