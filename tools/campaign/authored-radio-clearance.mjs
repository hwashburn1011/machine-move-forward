/**
 * AP-01 diagnostic: inspect authored radio clearance with normal play input.
 * This script records evidence only. It never changes game state through the
 * debug surface, teleports an actor, or writes a save.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(
  process.env.MMF_RADIO_PROFILE ??
    'test-results/continuity-radio/run-1789475135178/browser-profile',
);
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const output = path.resolve('test-results', 'authored-radio-clearance', `run-${Date.now()}`);
const profile = path.join(output, 'profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });

const url = new URL(site);
url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');
const errors = [];
const samples = [];
const record = async (label) => {
  const sample = await page.evaluate(() => {
    const game = globalThis.__game?.game;
    if (!game) return null;
    const player = game.player.worldPosition;
    const authoredMeshes = [];
    game.renderer.scene.updateMatrixWorld(true);
    const authoredRoot =
      game.machine.authoredDetailRoot ??
      game.machine.group.getObjectByName('authored-machine-details');
    authoredRoot?.traverse((object) => {
      if (!object.visible || !object.isMesh) return;
      const geometry = object.geometry;
      const localBounds = geometry.boundingBox;
      const e = object.matrixWorld.elements;
      const points = [];
      if (localBounds) {
        for (const x of [localBounds.min.x, localBounds.max.x])
          for (const y of [localBounds.min.y, localBounds.max.y])
            for (const z of [localBounds.min.z, localBounds.max.z]) {
              points.push([
                e[0] * x + e[4] * y + e[8] * z + e[12],
                e[1] * x + e[5] * y + e[9] * z + e[13],
                e[2] * x + e[6] * y + e[10] * z + e[14],
              ]);
            }
      }
      const worldBounds = points.length
        ? {
            min: [
              Math.min(...points.map((point) => point[0])),
              Math.min(...points.map((point) => point[1])),
              Math.min(...points.map((point) => point[2])),
            ],
            max: [
              Math.max(...points.map((point) => point[0])),
              Math.max(...points.map((point) => point[1])),
              Math.max(...points.map((point) => point[2])),
            ],
          }
        : null;
      const playerCoordinates = [player.x, player.y, player.z];
      const closest = worldBounds
        ? worldBounds.min.map((value, index) =>
            Math.max(value, Math.min(playerCoordinates[index], worldBounds.max[index])),
          )
        : [e[12], e[13], e[14]];
      authoredMeshes.push({
        name: object.name || '(unnamed)',
        distance: Math.hypot(closest[0] - player.x, closest[1] - player.y, closest[2] - player.z),
        position: closest,
        bounds: worldBounds,
      });
    });
    authoredMeshes.sort((a, b) => a.distance - b.distance);
    const contacts = [];
    const nearbyColliders = [];
    game.physics.world.forEachCollider((collider) => {
      if (collider === game.player.collider || !collider.isValid() || collider.isSensor()) return;
      const position = collider.translation();
      const distance = Math.hypot(
        position.x - player.x,
        position.y - player.y,
        position.z - player.z,
      );
      const data = game.physics.getUserData(collider);
      const shapeContact = game.player.collider.contactCollider(collider, 0.25);
      if (shapeContact?.distance !== undefined && shapeContact.distance <= 0.1) {
        nearbyColliders.push({
          handle: collider.handle,
          shape: collider.shape.type,
          position: [position.x, position.y, position.z],
          distance,
          separation: shapeContact.distance,
          userData: data && typeof data === 'object' ? data : null,
        });
      }
      if (!shapeContact || shapeContact.distance > 0.1) return;
      contacts.push({
        handle: collider.handle,
        position: [position.x, position.y, position.z],
        distance,
        separation: shapeContact.distance,
        pointPlayer: [shapeContact.point1.x, shapeContact.point1.y, shapeContact.point1.z],
        pointCollider: [shapeContact.point2.x, shapeContact.point2.y, shapeContact.point2.z],
        userData: data && typeof data === 'object' ? data : null,
      });
    });
    nearbyColliders.sort((a, b) => a.distance - b.distance);
    contacts.sort((a, b) => a.distance - b.distance);
    return {
      player: player.toArray(),
      camera: game.playerCamera.camera.position.toArray(),
      boom: game.playerCamera.camera.position.clone().sub(player).toArray(),
      yaw: game.playerCamera.yawAngle,
      pitch: game.playerCamera.pitchAngle,
      grounded: game.player.isGrounded,
      inputContext: game.input.inputContext,
      pointerLocked: game.input.pointerLocked,
      paused: game.state.paused,
      assetMode: 'full-art',
      authored: {
        machine: Boolean(game.machine.group.getObjectByName('authored-machine-details')),
        playerS07: Boolean(game.player.visual?.isS07),
        destination: Boolean(game.destination.root.userData.authored),
      },
      physics: {
        bodies: game.physics.bodyCount,
        colliders: game.physics.colliderCount,
        nearbyColliders: nearbyColliders.slice(0, 24),
        playerContacts: contacts,
      },
      authoredMeshes: authoredMeshes.slice(0, 24),
    };
  });
  if (sample) samples.push({ label, ...sample });
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
  return sample;
};

let context;
let page;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1600, height: 900 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () => {
      const game = globalThis.__game.game;
      return game.input.pointerLocked && !game.state.paused && !game.titleScreen?.isOpen;
    },
    null,
    { timeout: 30_000 },
  );
  await record('start');

  for (const [key, milliseconds, label] of [
    ['KeyS', 1_000, 'back'],
    ['KeyD', 600, 'right'],
    ['KeyS', 1_000, 'back-again'],
    ['KeyA', 600, 'left'],
  ]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(milliseconds);
    await page.keyboard.up(key);
    await page.waitForTimeout(200);
    await record(label);
  }
  const summary = {
    status: errors.length ? 'errors' : 'captured',
    source,
    output,
    samples,
    errors,
  };
  await fs.writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const summary = { status: 'blocked', source, output, samples, errors, message };
  await fs.writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await context?.close();
}
