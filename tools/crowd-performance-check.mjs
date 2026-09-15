/**
 * Same-process crowded combat profile. This is a diagnostic fixture: the
 * ablation modes replace presentation methods only in the page under test.
 * They must never be used as shipping performance numbers.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.env.MMF_PORT ?? '5201';
const seconds = Number(process.env.MMF_SECONDS ?? 8);
const repetitions = Number(process.env.MMF_REPETITIONS ?? 3);
const modes = (process.env.MMF_MODES ?? 'all,no-enemy-presentation,no-tactical-cues')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);
const quality = process.env.MMF_QUALITY ?? 'medium';
const seed = process.env.MMF_SEED ?? 'crowded-combat-baseline';
const output = process.argv[2] ?? 'docs/gameplay-polish/crowd-performance-baseline.json';
if (!Number.isFinite(seconds) || seconds < 2) throw new Error('MMF_SECONDS must be at least 2');
if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('invalid repetitions');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
const results = [];
let hardware = null;
let provenance = null;
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push({ message: error.message, url: error.stack }));
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push({ message: message.text(), url: message.location().url });
  });
  await page.goto(
    `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=${quality}&seed=${encodeURIComponent(seed)}`,
  );
  await page.waitForFunction(() => globalThis.__game?.game?.player, null, { timeout: 180000 });
  provenance = await page.evaluate(() => ({
    url: location.href,
    scripts: Array.from(document.scripts, (script) => script.src).filter(Boolean),
    capturedAt: new Date().toISOString(),
  }));
  await page.click('#game');
  hardware = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const gl = g.renderer.three.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      quality: g.quality.tier,
    };
  });
  if (/swiftshader|software/i.test(hardware.renderer))
    throw new Error('hardware renderer required');

  for (const mode of modes) {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const result = await page.evaluate(
        async ({ mode, seconds, repetition }) => {
          const g = globalThis.__game.game;
          const fixture = {
            fuel: 60,
            modifiers: { generationBonus: 0, fuelBurnMultiplier: 1 },
            totalWeight: 12000,
          };
          g.stop();
          g.loop.accumulator = 0;
          g.state.paused = false;
          g.opening.restore({ phase: 'done' });
          g.enemies.despawnAll();
          g.tacticsVisual.clear();
          g.world.reset(0);
          g.world.setLateralOffset(0);
          g.player.stats.invulnerable = true;
          g.player.teleport(g.player.worldPosition.clone().set(5.6, 15.8, 1.5));
          g.playerCamera.setYaw(0);
          g.playerCamera.setOptions({ shoulder: 'right' });
          g.playerCamera.resetHistory();
          // These are private implementation fields, deliberately touched only
          // by this QA fixture to make pooled runs start from one known state.
          g.playerCamera.pitch = -0.08;
          g.playerCamera.recoilPitch = 0;
          g.playerCamera.recoilYaw = 0;
          g.playerCamera.aimed = false;
          g.playerCamera.aimBlend = 0;
          g.state.simTime = 0;
          g.enemies.simulationTime = 0;
          g.enemies.repathTick = 0;
          g.enemies.flankUntil.clear();
          g.enemies.flankTargets.clear();
          g.machine.movement.speed = 0;
          g.machine.movement.totalWeight = fixture.totalWeight;
          g.machine.movement.enginePower = 1;
          g.machine.movement.legScale = 1;
          g.machine.movement.fuelAvailable = true;
          g.machine.damage.restore(undefined);
          g.machine.movement.setModifiers({
            speedMultiplier: 1,
            effectiveWeightMultiplier: 1,
            accelerationMultiplier: 1,
          });
          g.machine.movement.setThrottle(1);
          g.machine.movement.setScriptedSpeedLimit(null);
          g.machine.power.restore({ fuel: fixture.fuel });
          g.machine.power.setModifiers(fixture.modifiers);
          const restPose = g.machine.poseAt(0);
          g.machine.setPose(restPose);
          g.machine.setPose(restPose);
          g.machine.fixedUpdate(0);
          const positions = [
            [-6, -6],
            [-6, -2],
            [-6, 2],
            [-6, 6],
            [6, -6],
            [6, -2],
            [6, 2],
            [6, 6],
          ];
          const kinds = ['bastion', 'warden', 'revenant', 'sovereign'];
          for (let i = 0; i < positions.length; i += 1) {
            const [x, z] = positions[i];
            if (
              !g.enemies.spawn(
                kinds[i % kinds.length],
                g.player.worldPosition.clone().set(x, 15.94, z),
              )
            )
              throw new Error(`enemy ${i} failed to spawn`);
          }
          g.physics.step();
          const snapshot = () => ({
            simTime: g.state.simTime,
            enemyClock: g.enemies.simulationTime,
            repathTick: g.enemies.repathTick,
            worldDistance: g.world.distanceTraveled,
            lateralOffset: g.world.lateralWorldOffset,
            machine: {
              speed: g.machine.speed,
              targetSpeed: g.machine.movement.targetSpeed,
              scriptedSpeedLimit: g.machine.movement.currentScriptedSpeedLimit,
              pose: { ...g.machine.currentPose },
            },
            power: {
              fuel: g.machine.power.fuel,
              capacity: g.machine.power.fuelCapacity,
              demand: g.machine.power.registeredDemand,
              modifiers: g.machine.power.activeModifiers,
            },
            movementModifiers: { ...g.machine.movement.modifiers },
            damage: g.machine.damage.toSave(),
            camera: {
              yaw: g.playerCamera.yawAngle,
              pitch: g.playerCamera.pitchAngle,
              shoulder: g.playerCamera.shoulderSide,
            },
            enemies: g.enemies.active.map((enemy) => ({
              id: enemy.id,
              kind: enemy.def.id,
              state: enemy.aiState,
              position: enemy.worldPosition.toArray(),
            })),
            player: g.player.worldPosition.toArray(),
            physics: { bodies: g.physics.bodyCount, colliders: g.physics.colliderCount },
            art: {
              playerAnimated: g.player.visual.isAnimated,
              tacticsModelLoaded: Boolean(g.tacticsModel),
              enemyAnimated: g.enemies.active.map((enemy) => enemy.visual.isAnimated),
            },
          });
          const initialSnapshot = snapshot();
          const restore = [];
          const replace = (object, key, replacement) => {
            const original = object[key];
            object[key] = replacement;
            restore.push(() => {
              object[key] = original;
            });
          };
          if (mode === 'no-enemy-presentation') {
            for (const enemy of g.enemies.active) replace(enemy.visual, 'update', () => {});
          }
          if (mode === 'no-tactical-cues') {
            replace(g.tacticsVisual, 'fixedUpdate', () => {});
            replace(g.tacticsVisual, 'render', () => {});
          }
          const work = {};
          const instrument = (object, key, label) => {
            const original = object[key].bind(object);
            work[label] = { calls: 0, ms: 0, max: 0 };
            replace(object, key, (...args) => {
              const start = performance.now();
              const value = original(...args);
              const elapsed = performance.now() - start;
              work[label].calls += 1;
              work[label].ms += elapsed;
              work[label].max = Math.max(work[label].max, elapsed);
              return value;
            });
          };
          instrument(g.enemies, 'fixedUpdate', 'enemyFixed');
          instrument(g.enemies, 'update', 'enemyRenderUpdate');
          instrument(g.tacticsVisual, 'fixedUpdate', 'tacticalFixed');
          instrument(g.tacticsVisual, 'render', 'tacticalRender');
          instrument(g.playerCamera, 'update', 'cameraRender');
          instrument(g.physics, 'step', 'physicsStep');
          instrument(g.physics, 'raycast', 'raycast');
          for (const enemy of g.enemies.active)
            instrument(enemy.handle.controller, 'computeColliderMovement', `move:${enemy.id}`);
          const oldRender = g.render.bind(g);
          const frameWork = [];
          replace(g, 'render', (...args) => {
            const start = performance.now();
            oldRender(...args);
            frameWork.push(performance.now() - start);
          });
          // Yield to real browser frames during warm-up. Synchronous rendering
          // queues GPU work and turns the first measured frame into an artifact.
          const warmupStart = performance.now();
          await new Promise((resolve) => {
            let count = 0;
            const warm = (now) => {
              g.loop.advance(count === 0 ? 0 : 1 / 60);
              count += 1;
              if (count >= 180) resolve(now);
              else requestAnimationFrame(warm);
            };
            requestAnimationFrame(warm);
          });
          const warmupMs = performance.now() - warmupStart;
          const warmupSnapshot = snapshot();
          frameWork.length = 0;
          for (const item of Object.values(work)) Object.assign(item, { calls: 0, ms: 0, max: 0 });
          const frames = [];
          let deliveredX = 0;
          const initialYaw = g.playerCamera.yawAngle;
          let start = null;
          let previous = null;
          await new Promise((resolve) => {
            const tick = (now) => {
              if (start === null) start = now;
              const frameDelta = previous === null ? 0 : now - previous;
              if (previous !== null) frames.push(frameDelta);
              previous = now;
              if (frameDelta > 0) deliveredX += (1800 * frameDelta) / 1000;
              if (frameDelta > 0)
                window.dispatchEvent(
                  new MouseEvent('mousemove', { movementX: (1800 * frameDelta) / 1000 }),
                );
              g.loop.advance(Math.min(frameDelta / 1000, 0.25));
              if (now - start >= seconds * 1000) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          // The page clock above is only for rendering samples; fixed simulation
          // is driven by the normal loop in the browser. Restore all seams.
          for (const undo of restore.reverse()) undo();
          const stats = (values) => {
            const sorted = [...values].sort((a, b) => a - b);
            return {
              mean: values.reduce((sum, value) => sum + value, 0) / values.length,
              p50: sorted[Math.floor(sorted.length * 0.5)],
              p95: sorted[Math.floor(sorted.length * 0.95)],
              p99: sorted[Math.floor(sorted.length * 0.99)],
              max: sorted.at(-1),
            };
          };
          const activeFrames = frames.filter((value) => value > 0 && value <= 250);
          return {
            mode,
            repetition,
            frames: frames.length,
            fps: 1000 / stats(frames).mean,
            frameMs: stats(frames),
            activeFrameMs: stats(activeFrames),
            blockedFrameCount: frames.length - activeFrames.length,
            renderCpuMs: stats(frameWork),
            work,
            over25ms: frames.filter((value) => value > 25).length,
            over50ms: frames.filter((value) => value > 50).length,
            draws: g.renderer.three.info.render.calls,
            triangles: g.renderer.three.info.render.triangles,
            resources: { ...g.renderer.three.info.memory },
            enemies: g.enemies.activeCount,
            warmupMs,
            warmupFrames: 180,
            initialSnapshot,
            warmupSnapshot,
            yawTravel: initialYaw - g.playerCamera.yawAngle,
            deliveredX,
            enemyStates: g.enemies.active.map((enemy) => ({
              id: enemy.id,
              kind: enemy.def.id,
              state: enemy.aiState,
              at: enemy.worldPosition.toArray(),
            })),
          };
        },
        { mode, seconds, repetition },
      );
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
} finally {
  await mkdir(output.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        diagnosticOnly: true,
        provenance,
        hardware,
        seed,
        quality,
        seconds,
        repetitions,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (errors.length) throw new Error(errors.map((error) => error.message).join('\n'));
