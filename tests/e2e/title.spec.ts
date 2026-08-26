import { test, expect, type Page } from '@playwright/test';

/**
 * The front door.
 *
 * Everything here is about the boot path, which is the one thing every other
 * harness and every other e2e test depends on staying exactly as it was. The
 * `?nomenu=1` case is therefore the most important test in this file: it is
 * the promise the rest of the suite is built on.
 */

interface OpeningStats {
  simTime: number;
  opening: string;
  speed: number;
  armed: boolean;
}

const stats = (page: Page) =>
  page.evaluate(() =>
    (globalThis as never as { __game: { debugStats(): OpeningStats } }).__game.debugStats(),
  );

const ready = (page: Page) =>
  page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

async function sim(page: Page, seconds: number) {
  const start = (await stats(page)).simTime;
  await expect
    .poll(async () => (await stats(page)).simTime - start, { timeout: 90_000, intervals: [150] })
    .toBeGreaterThanOrEqual(seconds);
}

const BOOT = '&quality=low&seed=title-seed&nospawn=1&notex=1&nomodel=1&nosound=1';

test.describe('the title screen', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  });

  test('nomenu=1 boots straight into gameplay, exactly as before', async ({ page }) => {
    await page.goto(`/?nolock=1&nomenu=1${BOOT}`);
    await ready(page);
    await sim(page, 1.2);

    await expect(page.locator('#title-screen')).toBeHidden();
    await expect(page.locator('#hud-health-value')).toBeVisible();

    const s = await stats(page);
    expect(s.opening).toBe('done');
    // Walking from the first tick, which is what every distance-based check
    // in every other harness assumes.
    expect(s.speed).toBeGreaterThan(1);
    expect(s.armed).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the menu comes up over a live machine, with the HUD out of the way', async ({ page }) => {
    await page.goto(`/?nolock=1${BOOT}`);
    await ready(page);
    await sim(page, 1);

    await expect(page.locator('#title-screen')).toBeVisible();
    await expect(page.locator('#title-name')).toHaveText('Machine Move Forward');
    await expect(page.locator('#hud')).toBeHidden();
    expect((await stats(page)).opening).toBe('title');

    // The background is the game, not a still: the world is scrolling behind
    // the menu, which is the entire reason the title screen is built this way.
    const before = await page.evaluate(
      () => (globalThis as never as { __game: { world: { distanceTraveled: number } } }).__game.world.distanceTraveled,
    );
    await sim(page, 1.5);
    const after = await page.evaluate(
      () => (globalThis as never as { __game: { world: { distanceTraveled: number } } }).__game.world.distanceTraveled,
    );
    expect(after).toBeGreaterThan(before + 3);
    expect(errors).toEqual([]);
  });

  test('Continue is hidden when there is nothing to continue', async ({ page }) => {
    await page.goto(`/?nolock=1${BOOT}`);
    await ready(page);
    await sim(page, 1);

    // Scoped to the menu: the settings panel's Back button shares the class.
    await expect(page.locator('#title-menu .title-item')).toHaveCount(2);
    await expect(page.locator('[data-id="new-game"]')).toBeVisible();
    await expect(page.locator('[data-id="settings"]')).toBeVisible();
    await expect(page.locator('[data-id="continue"]')).toHaveCount(0);
  });

  test('New Game drops the player onto the rooftop, beside a stopped machine', async ({ page }) => {
    await page.goto(`/?nolock=1${BOOT}`);
    await ready(page);
    await sim(page, 1);

    await page.locator('[data-id="new-game"]').click();
    await sim(page, 0.5);

    await expect(page.locator('#title-screen')).toBeHidden();
    await expect(page.locator('#title-skip')).toBeVisible();

    const s = await stats(page);
    expect(s.opening).toBe('rooftop');
    // Unarmed on the roof: the answer up there is run.
    expect(s.armed).toBe(false);

    const player = await page.evaluate(
      () => (globalThis as never as { __game: { player: { worldPosition: { x: number; y: number } } } }).__game.player.worldPosition,
    );
    expect(player.x).toBeGreaterThan(6);
    expect(player.y).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });

  test('Settings opens, moves the volume, and remembers it across a reload', async ({ page }) => {
    await page.goto(`/?nolock=1${BOOT}`);
    await ready(page);
    await sim(page, 1);

    await page.locator('[data-id="settings"]').click();
    await expect(page.locator('#title-settings')).toBeVisible();

    await page.locator('#title-volume').fill('35');
    await page.locator('#title-volume').dispatchEvent('input');
    await expect(page.locator('#title-volume-value')).toHaveText('35%');

    await page.reload();
    await ready(page);
    await sim(page, 1);
    await page.locator('[data-id="settings"]').click();
    await expect(page.locator('#title-volume')).toHaveValue('35');
    expect(errors).toEqual([]);
  });

  test('Esc in play pauses, and the world genuinely stops behind the menu', async ({ page }) => {
    await page.goto(`/?nolock=1&nomenu=1${BOOT}`);
    await ready(page);
    await sim(page, 1.2);

    await page.keyboard.press('Escape');
    await expect(page.locator('#title-screen')).toBeVisible();
    // The pause menu leads with Resume, not with the game's name.
    await expect(page.locator('[data-id="resume"]')).toBeVisible();
    await expect(page.locator('#title-name')).toBeHidden();

    const frozen = await page.evaluate(
      () => (globalThis as never as { __game: { world: { distanceTraveled: number } } }).__game.world.distanceTraveled,
    );
    await page.waitForTimeout(700);
    const still = await page.evaluate(
      () => (globalThis as never as { __game: { world: { distanceTraveled: number } } }).__game.world.distanceTraveled,
    );
    expect(still).toBe(frozen);

    await page.locator('[data-id="resume"]').click();
    await expect(page.locator('#title-screen')).toBeHidden();
    await sim(page, 0.8);
    const moving = await page.evaluate(
      () => (globalThis as never as { __game: { world: { distanceTraveled: number } } }).__game.world.distanceTraveled,
    );
    expect(moving).toBeGreaterThan(frozen);
    expect(errors).toEqual([]);
  });
});
