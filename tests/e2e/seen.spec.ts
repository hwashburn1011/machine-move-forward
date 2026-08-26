import { test, expect, type Page } from '@playwright/test';

/**
 * The two things a screenshot was needed to see.
 *
 * Both were reported the same way — "look at it" — and both turn out to be
 * checkable without looking, which is why they are here rather than left to
 * the eye that caught them.
 *
 * Everything waits on SIMULATED time, for the reason `smoke.spec.ts` gives:
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

/**
 * Three's math classes, served by Vite from the real dependency.
 *
 * The page has no bare `three` specifier to import — the app's own imports are
 * rewritten at build time — so a harness that wants a Vector3 has to ask for
 * the file by path.
 */
const THREE_URL = '/node_modules/three/build/three.module.js';

test.describe('what the player can see', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  });

  test('stairs go where the deck is floored, not off the edge of the hull', async ({ page }) => {
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed&nospawn=1&notex=1&nomodel=1');
    await ready(page);

    const out = await page.evaluate(() => {
      const g = globalThis as never as {
        __game: {
          game: {
            build: {
              clear(): void;
              place(p: unknown, free?: boolean): unknown;
              canPlace(p: unknown): { ok: boolean; reason?: string };
              demolishAt(p: unknown): number;
              gridView: { getCell(c: unknown): string | undefined; hasStairs(c: unknown): boolean };
            };
          };
          canonicalEdge(cell: unknown, side: string): unknown;
        };
      };
      const B = g.__game.game.build;
      B.clear();

      // The build the piece used to be unbuildable in, and the ordinary one:
      // a floored deck, walled, with the storey above it already standing.
      for (let x = -2; x <= 0; x++) {
        for (let z = -6; z <= -4; z++) {
          B.place({ piece: 'floor', cell: { x, y: 0, z }, rotation: 0 }, true);
        }
      }
      for (let z = -6; z <= -4; z++) {
        B.place(
          {
            piece: 'wall',
            cell: { x: -2, y: 0, z },
            edge: g.__game.canonicalEdge({ x: -2, y: 0, z }, 'west'),
            rotation: 0,
          },
          true,
        );
      }
      // Rotation 1 runs toward +X: base (-2,0,-5), run (-1,0,-5), landing
      // (-1,1,-5). The upper storey is floored everywhere EXCEPT the landing,
      // which has to stay open — a plate there is a lid on the stairwell, and
      // refusing it is the one clearance rule that is about real geometry.
      const base = { x: -2, y: 0, z: -5 };
      const run = { x: -1, y: 0, z: -5 };
      for (let x = -2; x <= 0; x++) {
        for (let z = -6; z <= -4; z++) {
          if (x === run.x && z === run.z) continue;
          B.place({ piece: 'floor', cell: { x, y: 1, z }, rotation: 0 }, true);
        }
      }

      const verdict = B.canPlace({ piece: 'stairs', cell: base, rotation: 1 });
      const placed = !!B.place({ piece: 'stairs', cell: base, rotation: 1 }, true);
      const held = { floor: B.gridView.getCell(run), stairs: B.gridView.hasStairs(run) };

      // Aiming at the run cell is what the player's cursor does. Demolishing
      // the flight must not take the floor it crosses down with it.
      B.demolishAt({ piece: 'stairs', cell: run, rotation: 1 });
      const after = { floor: B.gridView.getCell(run), stairs: B.gridView.hasStairs(run) };

      return { verdict, placed, held, after };
    });

    // Every candidate run cell here is floored — it is the deck the player is
    // standing on. The validator used to answer "Not enough clear space" to
    // all of them, which left hanging the run over open sand as the only
    // placement it would accept.
    expect(out.verdict).toEqual({ ok: true });
    expect(out.placed).toBe(true);
    // Stairs and the floor they cross coexist. They used to share one slot,
    // so placing the flight silently overwrote the floor's entry...
    expect(out.held).toEqual({ floor: 'floor', stairs: true });
    // ...and removing the flight then deleted a floor still standing there.
    expect(out.after).toEqual({ floor: 'floor', stairs: false });
    expect(errors).toEqual([]);
  });

  test('the weapon stays in the hand, in every pose and on both weapons', async ({ page }) => {
    // Models ON, which the smoke run turns off. The bug was in the rig, and a
    // run without the rig cannot see it.
    await page.goto('/?nolock=1&quality=low&seed=e2e-seed&nospawn=1&notex=1');
    await ready(page);
    await sim(page, 3);

    const measure = (threeUrl: string) =>
      page.evaluate(async (url) => {
        const THREE = (await import(/* @vite-ignore */ url)) as typeof import('three');
        const root = (
          globalThis as never as { __game: { player: { object3D: import('three').Object3D } } }
        ).__game.player.object3D;
        root.updateMatrixWorld(true);

        let mount: import('three').Object3D | null = null;
        let wrist: import('three').Object3D | null = null;
        let knuckle: import('three').Object3D | null = null;
        root.traverse((o) => {
          if (o.name === 'held-weapon') mount = o;
          if (!(o as import('three').Bone).isBone) return;
          const name = o.name.toLowerCase();
          if (name.endsWith('righthand')) wrist = o;
          if (name.includes('righthandmiddle1')) knuckle = o;
        });
        if (!mount || !wrist || !knuckle) return null;
        const m: import('three').Object3D = mount;
        const w: import('three').Object3D = wrist;
        const k: import('three').Object3D = knuckle;

        const handPos = w.getWorldPosition(new THREE.Vector3());
        const muzzle = new THREE.Vector3(0, 0, 1).applyQuaternion(
          m.getWorldQuaternion(new THREE.Quaternion()),
        );
        const finger = k.getWorldPosition(new THREE.Vector3()).sub(handPos).normalize();

        const box = new THREE.Box3().setFromObject(m, true);
        const centre = box.getCenter(new THREE.Vector3());

        return {
          alignment: muzzle.dot(finger),
          length: box.min.distanceTo(box.max),
          reach: centre.distanceTo(handPos),
        };
      }, threeUrl);

    for (const [slot, name] of [
      ['1', 'rifle'],
      ['2', 'shotgun'],
    ] as const) {
      await page.keyboard.press(slot);
      await sim(page, 0.6);

      // Idle and then walking: two poses the wrist holds at very different
      // angles. The bug this pins was not that the weapon pointed the wrong
      // way once — it was that where it pointed depended on the POSE, because
      // the mount cancelled a bind-pose rotation the character never strikes.
      for (const walking of [false, true]) {
        if (walking) await page.keyboard.down('w');
        await sim(page, 1.2);
        const m = await measure(THREE_URL);
        if (walking) await page.keyboard.up('w');

        expect(m, `${name}: the held weapon and the right hand must both exist`).not.toBeNull();
        const { alignment, length, reach } = m as {
          alignment: number;
          length: number;
          reach: number;
        };
        const where = `${name}, ${walking ? 'walking' : 'idle'}`;

        // Muzzle down the fingers. That is what "held" means, and it has to
        // hold in every pose rather than in one chosen one.
        expect(alignment, where).toBeGreaterThan(0.98);
        // Scaled to a real weapon rather than to the author's own units.
        expect(length, where).toBeGreaterThan(0.8);
        expect(length, where).toBeLessThan(1.1);
        // Gripped rather than floating beside the hand.
        expect(reach, where).toBeLessThan(0.35);
      }
    }
    expect(errors).toEqual([]);
  });
});
