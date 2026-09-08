import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 3's claims, checked in the running game.
 *
 * The lighting one is the reason this file exists rather than another unit
 * test: "a sealed room is no longer pitch dark" is a statement about pixels,
 * and nothing short of a real renderer can answer it.
 *
 * Everything waits on SIMULATED time, for the reason the other specs give:
 * under the software renderer the fixed step lets simulated time lag wall
 * time, so a wall-clock wait tests the GPU rather than the game.
 */

interface Handle {
  debugStats(): { simTime: number };
  game: {
    build: {
      place(p: unknown, free?: boolean): unknown;
      canPlace(p: unknown): { ok: boolean; reason?: string };
      lamps(): { instanceId: string }[];
    };
    machine: { power: PowerHandle };
    lampLights: { current: readonly string[]; size: number };
    renderer: { camera: { position: Vec; lookAt(x: number, y: number, z: number): void } };
    crafting: { craftBlock(recipe: unknown): string | null };
    resources: { deposit(id: string, n: number): number; count(id: string): number };
    depositFuel(): boolean;
    saveTo(slot: string): Promise<void>;
    loadFrom(slot: string): Promise<boolean>;
  };
  canonicalEdge(cell: Cell, side: string): unknown;
}

interface Vec {
  set(x: number, y: number, z: number): void;
}
interface Cell {
  x: number;
  y: number;
  z: number;
}
interface PowerHandle {
  fuel: number;
  capacity: number;
  draw: number;
  isPowered(id: string): boolean;
  addFuel(n: number): number;
  restore(saved: { fuel: number } | undefined): void;
}

declare global {
  /** The harness handle `main.ts` hangs on the page. Real, not a shim. */
  var __game: Handle;
}

const ready = (page: Page) =>
  page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

const simTime = (page: Page) => page.evaluate(() => __game.debugStats().simTime);

async function sim(page: Page, seconds: number) {
  const start = await simTime(page);
  await expect
    .poll(async () => (await simTime(page)) - start, { timeout: 90_000, intervals: [150] })
    .toBeGreaterThanOrEqual(seconds);
}

/** Place through the build system, bypassing camera aiming. */
const place = (page: Page, piece: string, cell: Cell, side: string | null = null) =>
  page.evaluate(
    ({ piece, cell, side }) => {
      const g = __game;
      const edge = side ? g.canonicalEdge(cell, side) : undefined;
      return g.game.build.place({ piece, cell, edge, rotation: 0 }) !== null;
    },
    { piece, cell, side },
  );

const canPlace = (page: Page, piece: string, cell: Cell, side: string | null = null) =>
  page.evaluate(
    ({ piece, cell, side }) => {
      const g = __game;
      const edge = side ? g.canonicalEdge(cell, side) : undefined;
      return g.game.build.canPlace({ piece, cell, edge, rotation: 0 });
    },
    { piece, cell, side },
  );

const power = (page: Page) =>
  page.evaluate(() => {
    const p = __game.game.machine.power;
    return { fuel: p.fuel, capacity: p.capacity, draw: p.draw };
  });

/**
 * Mean brightness of the middle of the frame, 0..255.
 *
 * The screenshot comes back as PNG bytes, which node cannot decode without a
 * dependency — so it goes back INTO the page, where a 2D canvas decodes it and
 * reads the pixels. Cheaper than adding an image library for one assertion.
 */
async function frameBrightness(page: Page): Promise<number> {
  const shot = await page.screenshot({ clip: { x: 540, y: 280, width: 200, height: 160 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number)) / 3;
    }
    return sum / (data.length / 4);
  }, shot.toString('base64'));
}

/** The cell the sealed room is built in. Clear of the machine's own equipment. */
const ROOM: Cell = { x: 2, y: 0, z: -1 };

test.describe('power and light', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    // A free camera, so the shot can be taken from INSIDE a sealed room —
    // the third-person camera would be pushed out through the wall.
    await page.goto(
      '/?nolock=1&quality=low&seed=e2e-power&nospawn=1&notex=1&nomodel=1&nosound=1&cam=far&nomenu=1',
    );
    await ready(page);
    await sim(page, 1.2);
    // A new game starts with scrap and no components, and a lamp costs one.
    // The refinery is how a player earns them; a harness may simply be given
    // them, which is what F5 does in the running game.
    await page.evaluate(() => __game.game.resources.deposit('components', 40));
  });

  test('a new machine starts with a generator making power from its own tank', async ({
    page,
  }) => {
    const state = await power(page);
    expect(state.capacity).toBeGreaterThan(0);
    expect(state.fuel).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the refinery refuses to run without power and runs the moment it has it', async ({
    page,
  }) => {
    await place(page, 'floor', { x: 2, y: 0, z: 4 });
    expect(await place(page, 'refinery', { x: 2, y: 0, z: 4 })).toBe(true);
    await sim(page, 0.5);

    const powered = await page.evaluate(() => {
      const g = __game;
      const refinery = {
        id: 'refine-components',
        station: 'refinery',
        inputs: { scrap: 4 },
        output: { itemId: 'components', count: 1 },
      };
      g.game.resources.deposit('scrap', 50);
      return g.game.crafting.craftBlock(refinery);
    });
    expect(powered).toBeNull();

    // Dry the tank. Capacity falls to zero and the station class sheds.
    await page.evaluate(() => __game.game.machine.power.restore({ fuel: 0 }));
    await sim(page, 0.5);

    const dry = await page.evaluate(() => {
      const refinery = {
        id: 'refine-components',
        station: 'refinery',
        inputs: { scrap: 4 },
        output: { itemId: 'components', count: 1 },
      };
      return __game.game.crafting.craftBlock(refinery);
    });
    expect(dry).toBe('no-power');

    // Refuel and it comes straight back.
    await page.evaluate(() => __game.game.machine.power.addFuel(50));
    await sim(page, 0.5);
    const back = await page.evaluate(() => {
      const refinery = {
        id: 'refine-components',
        station: 'refinery',
        inputs: { scrap: 4 },
        output: { itemId: 'components', count: 1 },
      };
      return __game.game.crafting.craftBlock(refinery);
    });
    expect(back).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a lamp hangs on a wall and is refused on bare air', async ({ page }) => {
    await place(page, 'floor', ROOM);

    const bare = await canPlace(page, 'lamp', ROOM, 'north');
    expect(bare.ok).toBe(false);
    expect(bare.reason).toBe('needs-wall');

    expect(await place(page, 'wall', ROOM, 'north')).toBe(true);
    expect(await place(page, 'lamp', ROOM, 'north')).toBe(true);
    // And the wall is still standing underneath it.
    const stillThere = await canPlace(page, 'wall', ROOM, 'north');
    expect(stillThere.reason).toBe('occupied');
    expect(errors).toEqual([]);
  });

  test('a sealed room is dark no longer, and dark again when the power sheds', async ({
    page,
  }) => {
    // A sealed room under a software renderer is the slowest frame the game
    // can draw, and this test draws three of them.
    test.setTimeout(300_000);

    // Seal a single cell: floor, four walls, a roof.
    await place(page, 'floor', ROOM);
    for (const side of ['north', 'south', 'east', 'west']) {
      expect(await place(page, 'wall', ROOM, side)).toBe(true);
    }
    expect(await place(page, 'roof', ROOM)).toBe(true);

    // Put the free camera inside, looking at the far wall.
    await page.evaluate(() => {
      const camera = __game.game.renderer.camera;
      camera.position.set(4, 5.0, -2.4);
      camera.lookAt(4, 4.6, -1.0);
    });
    // WALL CLOCK here, and only here. Everything else in this file waits on
    // simulated time; a screenshot is a question about frames that have
    // actually been drawn, which is the one thing the render clock measures.
    await page.waitForTimeout(2000);

    const unlit = await frameBrightness(page);

    // Now hang a lamp. It must be powered by the starting generator.
    expect(await place(page, 'lamp', ROOM, 'north')).toBe(true);

    // Poll for the assignment rather than waiting a fixed time: the pool
    // reassigns once a render-second, and under SwiftShader that is a long
    // way from once a wall-clock second.
    await expect
      .poll(async () => page.evaluate(() => __game.game.lampLights.current.length), {
        timeout: 60_000,
        intervals: [250],
      })
      .toBe(1);

    const assigned = await page.evaluate(() => ({
      pool: __game.game.lampLights.size,
      powered: __game.game.build
        .lamps()
        .every((l) => __game.game.machine.power.isPowered(l.instanceId)),
    }));
    expect(assigned.pool).toBeGreaterThan(0);
    expect(assigned.powered).toBe(true);

    await page.waitForTimeout(1500);
    const lit = await frameBrightness(page);

    // Dry the tank. The lamp sheds and the room goes back to dark.
    await page.evaluate(() => __game.game.machine.power.restore({ fuel: 0 }));
    await expect
      .poll(async () => page.evaluate(() => __game.game.lampLights.current.length), {
        timeout: 60_000,
        intervals: [250],
      })
      .toBe(0);
    await page.waitForTimeout(1500);
    const dark = await frameBrightness(page);

    console.log(`brightness: unlit=${unlit.toFixed(2)} lit=${lit.toFixed(2)} dark=${dark.toFixed(2)}`);

    // The whole point of the phase: the interior is measurably brighter with
    // the lamp burning, and measurably darker again when it sheds.
    expect(lit).toBeGreaterThan(unlit + 2);
    expect(dark).toBeLessThan(lit - 2);
    expect(errors).toEqual([]);
  });

  test('the tank survives a save and a reload', async ({ page }) => {
    await page.evaluate(() => {
      const p = __game.game.machine.power;
      p.restore({ fuel: 0 });
      p.addFuel(37);
    });
    await sim(page, 0.5);
    expect((await power(page)).fuel).toBeCloseTo(37, 3);

    await page.evaluate(() => __game.game.saveTo('e2e-power'));
    await page.evaluate(() => __game.game.machine.power.addFuel(20));
    expect((await power(page)).fuel).toBeCloseTo(57, 3);

    await page.evaluate(() => __game.game.loadFrom('e2e-power'));
    await sim(page, 0.5);
    expect((await power(page)).fuel).toBeCloseTo(37, 1);
    // And the generator came back with the structures, rather than being
    // counted twice or lost entirely.
    expect((await power(page)).capacity).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('feeding the generator moves fuel from the bag into the tank', async ({ page }) => {
    const result = await page.evaluate(() => {
      const g = __game;
      g.game.machine.power.restore({ fuel: 0 });
      g.game.resources.deposit('fuel', 12);
      const before = g.game.resources.count('fuel');
      const deposited = g.game.depositFuel();
      return { before, deposited, after: g.game.resources.count('fuel'), tank: g.game.machine.power.fuel };
    });
    expect(result.before).toBe(12);
    expect(result.deposited).toBe(true);
    expect(result.after).toBe(0);
    expect(result.tank).toBe(12);
    expect(errors).toEqual([]);
  });
});
