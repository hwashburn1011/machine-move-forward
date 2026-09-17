/**
 * Sustained, normal-input feel route from a cloned campaign profile.
 *
 * This runner is deliberately a diagnostic harness: page.evaluate is used
 * only to observe state, subscribe to the event bus, and attach an optional
 * MediaStreamDestination to the existing audio master. It never grants
 * resources, moves the player, changes damage, or advances simulation time.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const durationSeconds = Math.max(1, Number(process.env.MMF_FEEL_SECONDS ?? 1800));
const quality = String(process.env.MMF_FEEL_QUALITY ?? 'high').toLowerCase();
const viewport = {
  width: Number(process.env.MMF_FEEL_WIDTH ?? 1280),
  height: Number(process.env.MMF_FEEL_HEIGHT ?? 720),
};
if (!['medium', 'high'].includes(quality))
  throw new Error('MMF_FEEL_QUALITY must be medium or high');
const port = Number(process.env.MMF_PORT ?? 5205);
const site = process.env.MMF_SITE ?? `http://127.0.0.1:${port}/`;
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results/feel-acceptance', `run-${runStamp}`);
const profile = path.join(output, 'browser-profile');
const defaultProfile = path.resolve(
  'test-results/continuity-ending/run-2026-09-15T18-11-26-503Z/browser-profile',
);

const report = {
  status: 'starting',
  startedAt: new Date().toISOString(),
  output,
  source: null,
  authority:
    'Normal Continue, keyboard movement, mouse look, pause, and optional UI build. Read-only sampling and event observers. No state grants, teleport, damage injection, or accelerated simulation.',
  config: {
    durationSeconds,
    quality,
    viewport,
    port,
    site,
    buildRequested: process.env.MMF_FEEL_BUILD === '1',
  },
  capabilityLimits: [
    'The route records attempted and completed waypoints; it does not claim stair or combat coverage when a waypoint cannot be reached.',
    'Renderer memory and camera target visibility depend on browser and Three.js support.',
    'Audio recordings are best effort. Headless/browser MediaRecorder support may be unavailable.',
  ],
  coverage: {
    cycles: 0,
    completedWaypoints: [],
    routeFailures: [],
    build: { attempted: false, reason: null },
  },
  samples: [],
  frame: {
    histogram: {},
    maxMs: 0,
    retainedDeltasMs: [],
    retainedLimit: 12000,
    retainedIndex: 0,
    count: 0,
    spikesOver33: 0,
    spikesOver50: 0,
    spikesOver100: 0,
  },
  events: {
    damageSources: {},
    buildDestruction: [],
    buildRemovals: [],
    threatPhases: [],
    combat: { starts: [], ends: [], recovery: [] },
  },
  audio: [],
  artifacts: [],
  runtimeErrors: [],
};

const writeJson = async (name, value) => {
  const file = path.join(output, name);
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  if (!report.artifacts.includes(name)) report.artifacts.push(name);
};
const writeReport = async () => writeJson('report.json', report);

async function resolveProfile() {
  const requested = process.env.MMF_CONTINUITY_PROFILE;
  if (requested) return path.resolve(requested);
  try {
    await fs.access(defaultProfile);
    return defaultProfile;
  } catch {
    const root = path.resolve('test-results');
    const names = (await fs.readdir(root, { withFileTypes: true })).filter(
      (e) => e.isDirectory() && e.name.startsWith('continuity-'),
    );
    const candidates = [];
    for (const entry of names) {
      const base = path.join(root, entry.name);
      for (const run of await fs.readdir(base, { withFileTypes: true })) {
        if (!run.isDirectory()) continue;
        const candidate = path.join(base, run.name, 'browser-profile');
        try {
          const stat = await fs.stat(candidate);
          candidates.push({ candidate, mtime: stat.mtimeMs });
        } catch {
          /* stale/incomplete run */
        }
      }
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    if (candidates[0]) return candidates[0].candidate;
  }
  throw new Error(
    'No campaign profile found. Set MMF_CONTINUITY_PROFILE to a real saved campaign browser-profile.',
  );
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let context;
let page;
let samplingTimer;
let frameTimer;
let stopObservers;
let runDeadline = 0;

async function installObservers() {
  await page.evaluate(() => {
    const g = globalThis.__game?.game;
    if (!g) throw new Error('Game runtime is unavailable after Continue');
    const bus = g.bus;
    const state = { frames: [], disposers: [], audio: null, combatSince: null, lastThreat: null };
    let lastFrame = performance.now();
    const frame = (now) => {
      state.frames.push(now - lastFrame);
      lastFrame = now;
      globalThis.__feelFrameRequest = requestAnimationFrame(frame);
    };
    globalThis.__feelFrameRequest = requestAnimationFrame(frame);
    globalThis.__feelEvents = {
      damageSources: {},
      buildDestruction: [],
      buildRemovals: [],
      threatPhases: [],
      combat: { starts: [], ends: [], recovery: [] },
    };
    const on = (event, callback) => {
      if (!bus?.on) return;
      const dispose = bus.on(event, callback);
      if (typeof dispose === 'function') state.disposers.push(dispose);
    };
    on('player:damaged', (payload) => {
      const source = String(payload?.source ?? payload?.from ?? 'unknown');
      globalThis.__feelEvents.damageSources[source] =
        (globalThis.__feelEvents.damageSources[source] ?? 0) + 1;
    });
    on('build:damaged', (payload) => {
      if (payload?.health <= 0)
        globalThis.__feelEvents.buildDestruction.push({ at: performance.now(), payload });
    });
    on('build:removed', (payload) =>
      globalThis.__feelEvents.buildRemovals.push({ at: performance.now(), payload }),
    );
    on('threat:phase', (payload) => {
      const phase = String(payload?.phase ?? 'unknown');
      globalThis.__feelEvents.threatPhases.push({
        at: performance.now(),
        phase,
        wavesSurvived: payload?.wavesSurvived ?? null,
        distanceM: g.world.distanceTraveled,
        lane: g.director.toSave().lane,
        speed: g.machine.actualSpeed ?? null,
        profile: g.campaignProfile,
      });
      if (
        phase === 'engagement' ||
        phase === 'combat' ||
        phase === 'active' ||
        phase === 'attack'
      ) {
        if (state.combatSince === null) state.combatSince = performance.now();
      } else if (state.combatSince !== null) {
        globalThis.__feelEvents.combat.ends.push({
          at: performance.now(),
          phase,
          durationMs: performance.now() - state.combatSince,
        });
        if (phase === 'recovery')
          globalThis.__feelEvents.combat.recovery.push({
            at: performance.now(),
            durationMs: performance.now() - state.combatSince,
          });
        state.combatSince = null;
      }
    });
    on('enemy:fired', (payload) =>
      globalThis.__feelEvents.combat.starts.push({
        at: performance.now(),
        kind: 'enemy:fired',
        payload,
      }),
    );
    on('enemy:killed', (payload) =>
      globalThis.__feelEvents.combat.ends.push({
        at: performance.now(),
        kind: 'enemy:killed',
        payload,
      }),
    );
    globalThis.__feelObserverState = state;
    globalThis.__feelTakeFrames = () => {
      const frames = state.frames.splice(0);
      return { frames, sampleTime: performance.now() };
    };
    globalThis.__feelAudioStart = () => {
      const audio = g.audio;
      const ctx = audio?.ctx;
      const master = audio?.master;
      if (
        !ctx ||
        !master ||
        typeof ctx.createMediaStreamDestination !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        return {
          supported: false,
          reason: 'AudioEngine master/context or MediaRecorder unavailable',
        };
      }
      if (globalThis.__feelAudio?.recorder?.state === 'recording')
        return { supported: false, reason: 'recording already active' };
      const destination = ctx.createMediaStreamDestination();
      master.connect(destination); // Diagnostic tap only; source gain and graph remain unchanged.
      const mime = ['audio/webm;codecs=opus', 'audio/webm', ''].find(
        (candidate) => !candidate || MediaRecorder.isTypeSupported(candidate),
      );
      const chunks = [];
      const recorder = new MediaRecorder(destination.stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.start(250);
      globalThis.__feelAudio = {
        recorder,
        chunks,
        destination,
        mime: recorder.mimeType || mime || 'audio/webm',
      };
      return { supported: true, mime: globalThis.__feelAudio.mime };
    };
    globalThis.__feelAudioStop = async () => {
      const active = globalThis.__feelAudio;
      if (!active?.recorder) return { supported: false, reason: 'no active recording' };
      const recorder = active.recorder;
      if (recorder.state !== 'inactive')
        await new Promise((resolve) => {
          recorder.addEventListener('stop', resolve, { once: true });
          recorder.stop();
        });
      const blob = new Blob(active.chunks, { type: active.mime });
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      try {
        g.audio.master.disconnect(active.destination);
      } catch {
        /* tap may already be gone during page teardown */
      }
      active.destination.stream.getTracks().forEach((track) => track.stop());
      globalThis.__feelAudio = null;
      return { supported: true, mime: active.mime, bytes };
    };
  });
}

async function readSample() {
  const result = await page.evaluate(() => {
    const g = globalThis.__game?.game;
    const p = g?.player?.worldPosition;
    const rig = g?.playerCamera;
    const camera = rig?.camera;
    const player = p ? [p.x, p.y, p.z] : null;
    const cameraPosition = camera?.position
      ? [camera.position.x, camera.position.y, camera.position.z]
      : null;
    const goal = rig?.goal ? [rig.goal.x, rig.goal.y, rig.goal.z] : null;
    const distance =
      cameraPosition && player
        ? Math.hypot(
            cameraPosition[0] - player[0],
            cameraPosition[1] - player[1],
            cameraPosition[2] - player[2],
          )
        : null;
    const frame = globalThis.__feelTakeFrames?.() ?? { frames: [] };
    const view = camera?.matrixWorldInverse?.elements;
    const projection = camera?.projectionMatrix?.elements;
    const project = (point) => {
      if (!view || !projection) return null;
      const vx = view[0] * point[0] + view[4] * point[1] + view[8] * point[2] + view[12];
      const vy = view[1] * point[0] + view[5] * point[1] + view[9] * point[2] + view[13];
      const vz = view[2] * point[0] + view[6] * point[1] + view[10] * point[2] + view[14];
      const vw = view[3] * point[0] + view[7] * point[1] + view[11] * point[2] + view[15];
      const x = projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12] * vw;
      const y = projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13] * vw;
      const w = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15] * vw;
      return w
        ? {
            x: x / w,
            y: y / w,
            z:
              (projection[2] * vx +
                projection[6] * vy +
                projection[10] * vz +
                projection[14] * vw) /
              w,
            visible: w > 0 && Math.abs(x / w) <= 1 && Math.abs(y / w) <= 1,
          }
        : null;
    };
    const playerGroup = g?.player?.group ?? g?.player?.object3D;
    const enemyTargets = (g?.enemies?.active ?? []).map((enemy) => {
      const p = enemy.worldPosition;
      const chest = [p.x, p.y + 0.75, p.z];
      const head = [p.x, p.y + 1.35, p.z];
      return { id: enemy.id, position: p.toArray(), chest: project(chest), head: project(head) };
    });
    const rendererInfo = g?.renderer?.three?.info;
    const hudMachine = document.querySelector('#hud-machine')?.getBoundingClientRect();
    const hudStatus = document.querySelector('.machine-status-view')?.getBoundingClientRect();
    return {
      at: new Date().toISOString(),
      simTime: g?.state?.simTime ?? null,
      player,
      camera: cameraPosition,
      cameraDistance: distance,
      desiredCameraPosition: goal,
      playerGroupVisible: playerGroup?.visible ?? null,
      hudLayout:
        hudMachine && hudStatus
          ? {
              machineBottom: hudMachine.bottom,
              statusTop: hudStatus.top,
              gap: hudStatus.top - hudMachine.bottom,
              emptyFuelHint: document.querySelector('#hud-fuel-help')?.style.display !== 'none',
            }
          : null,
      enemyTargets,
      playerFraming: player
        ? { chest: project([p.x, p.y + 0.35, p.z]), head: project([p.x, p.y + 0.75, p.z]) }
        : null,
      distanceM: g.world.distanceTraveled,
      profile: g.campaignProfile,
      director: g.director.toSave(),
      paused: g.state.paused,
      threatPhase: g?.threatPhase ?? g?.threats?.phase ?? null,
      activeThreats: g?.enemies?.activeCount ?? g?.enemies?.active?.length ?? null,
      health: g?.player?.stats?.health ?? null,
      rendererMemory: rendererInfo?.memory ? { ...rendererInfo.memory } : null,
      audioReady: g?.audio?.ready ?? null,
      frames: frame.frames,
      settings: JSON.parse(localStorage.getItem('mmf-settings') ?? 'null'),
    };
  });
  const frames = result.frames;
  delete result.frames;
  report.samples.push(result);
  for (const delta of frames) {
    const bucket = String(Math.round(delta * 10) / 10);
    report.frame.histogram[bucket] = (report.frame.histogram[bucket] ?? 0) + 1;
    report.frame.maxMs = Math.max(report.frame.maxMs, delta);
    const retained = report.frame.retainedDeltasMs;
    if (retained.length < report.frame.retainedLimit) retained.push(delta);
    else {
      retained[report.frame.retainedIndex] = delta;
      report.frame.retainedIndex = (report.frame.retainedIndex + 1) % report.frame.retainedLimit;
    }
    if (delta > 33) report.frame.spikesOver33 += 1;
    if (delta > 50) report.frame.spikesOver50 += 1;
    if (delta > 100) report.frame.spikesOver100 += 1;
  }
  report.frame.count += frames.length;
  const eventState = await page.evaluate(() => globalThis.__feelEvents);
  if (eventState) report.events = eventState;
  return result;
}

function frameSummary() {
  const values = report.frame.retainedDeltasMs;
  const quantile = (fraction) => {
    const target = Math.ceil(report.frame.count * fraction);
    let count = 0;
    for (const [bucket, total] of Object.entries(report.frame.histogram).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    )) {
      count += total;
      if (count >= target) return Number(bucket);
    }
    return null;
  };
  return {
    count: report.frame.count,
    retainedCount: values.length,
    p50: quantile(0.5),
    p95: quantile(0.95),
    p99: quantile(0.99),
    max: report.frame.maxMs,
    quantileMethod:
      'Entire run histogram, rounded to 0.1ms; retained frames are the last bounded window.',
    spikesOver33: report.frame.spikesOver33,
    spikesOver50: report.frame.spikesOver50,
    spikesOver100: report.frame.spikesOver100,
  };
}

async function turnToward(x, z) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const delta = await page.evaluate(
      ({ x, z }) => {
        const rig = globalThis.__game.game.playerCamera;
        const p = globalThis.__game.game.player.worldPosition;
        const wrap = (n) => Math.atan2(Math.sin(n), Math.cos(n));
        return {
          yaw: wrap(Math.atan2(-(x - p.x), -(z - p.z)) - rig.yawAngle),
          pitch: -rig.pitchAngle,
          sensitivity: rig.sensitivity,
        };
      },
      { x, z },
    );
    if (Math.abs(delta.yaw) < 0.02) return;
    await page.evaluate(
      ({ yaw, pitch, sensitivity }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -yaw / (0.0022 * sensitivity))),
            movementY: Math.max(-350, Math.min(350, -pitch / (0.0022 * sensitivity))),
            bubbles: true,
          }),
        ),
      delta,
    );
    await page.waitForTimeout(55);
  }
}

async function moveAim(target) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const camera = g.playerCamera.camera;
      const dx = at[0] - camera.position.x;
      const dy = at[1] - camera.position.y;
      const dz = at[2] - camera.position.z;
      const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
        sensitivity: g.playerCamera.sensitivity,
      };
    }, target);
    if (Math.abs(error.x) < 0.014 && Math.abs(error.y) < 0.014) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      ({ x, y, sensitivity }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / (0.0022 * sensitivity))),
            movementY: Math.max(-350, Math.min(350, -y / (0.0022 * sensitivity))),
            bubbles: true,
          }),
        ),
      error,
    );
    await page.waitForTimeout(55);
  }
}

async function walkTo(x, z, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (runDeadline && Date.now() >= runDeadline) throw new Error('duration reached');
    const state = await page.evaluate(() => {
      const g = globalThis.__game?.game;
      const p = g?.player?.worldPosition;
      return {
        position: p ? [p.x, p.z] : null,
        paused: Boolean(g?.state?.paused),
        title: Boolean(g?.titleScreen?.isOpen),
      };
    });
    if (!state.position) throw new Error('player position unavailable');
    const distance = Math.hypot(x - state.position[0], z - state.position[1]);
    if (distance < 0.18) {
      report.coverage.completedWaypoints.push({ label, x, z });
      return;
    }
    if (state.paused || state.title) throw new Error(`route interrupted at ${label}`);
    await turnToward(x, z);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(clamp((distance - 0.08) * 135, 35, 120));
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(55);
  }
  throw new Error(`walk timeout at ${label}`);
}

const capturedSections = new Set();
async function captureSection(label) {
  const key = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  if (capturedSections.has(key)) return;
  capturedSections.add(key);
  const filename = `section-${key}.png`;
  try {
    await page.screenshot({ path: path.join(output, filename), fullPage: false });
    report.artifacts.push(filename);
    console.log(`[feel] section=${label} screenshot=${filename}`);
  } catch (error) {
    report.runtimeErrors.push({ type: 'section-screenshot', label, message: error.message });
  }
}

async function waitForDeck(upper, label) {
  await page.waitForFunction(
    (expectedUpper) => {
      const y = globalThis.__game.game.player.worldPosition.y;
      return expectedUpper ? y > 14.3 : y < 14.3;
    },
    upper,
    { timeout: 12_000 },
  );
  await captureSection(label);
}

async function routeCycle() {
  let state = await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray());
  if (state[1] < 14.3) {
    await walkTo(0.8, -2.7, 'middle-stair-approach');
    await walkTo(-2, -2.7, 'middle-stair-mouth');
    await walkTo(-2, 2.8, 'stair-ascent');
    await waitForDeck(true, 'upper-deck-stairs');
    state = await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray());
  }
  const upper = [
    [0.7, 4.05, 'upper-engine-gap'],
    [0.7, -1.5, 'upper-west-aisle'],
    [0.8, -7.7, 'upper-west-bow'],
    [6.1, -7.7, 'upper-east-bow'],
    [6.1, -4.5, 'upper-east-cabin-view'],
    [6.1, -7.7, 'upper-east-return'],
    [0.8, -7.7, 'upper-west-return'],
    [0.8, 2.8, 'upper-stair-approach'],
  ];
  for (const [x, z, label] of upper) {
    await walkTo(x, z, label);
    await defendNormally();
    await captureSection(label);
  }
  state = await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray());
  await walkTo(0.8, 2.8, 'upper-stair-approach');
  await walkTo(-2, 2.8, 'upper-stair-mouth');
  await walkTo(-2, -2.7, 'stair-descent');
  await waitForDeck(false, 'middle-deck-stairs');
  // Reuse the proven descent/return corridor. Earlier middle-deck waypoints
  // crossed permanent machinery; retaining those driver failures is not a
  // reason to remove gameplay collision or pretend the aisle is walkable.
  await page.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 420, movementY: 50, bubbles: true }),
    ),
  );
  await page.waitForTimeout(180);
  await page.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent('mousemove', { movementX: -420, movementY: -50, bubbles: true }),
    ),
  );
  await defendNormally();
  await walkTo(-2, 2.8, 'stair-ascent-return');
  await waitForDeck(true, 'upper-deck-return');
  void state;
}

async function defendNormally() {
  const target = await page.evaluate(() => {
    const g = globalThis.__game?.game;
    const p = g?.player?.worldPosition;
    const enemies = (g?.enemies?.active ?? [])
      .map((enemy) => ({
        id: enemy.id,
        position: enemy.worldPosition.toArray(),
        health: enemy.currentHealth,
      }))
      .filter((enemy) => Math.abs(enemy.position[1] - p.y) < 1.5)
      .sort(
        (a, b) =>
          Math.hypot(a.position[0] - p.x, a.position[2] - p.z) -
          Math.hypot(b.position[0] - p.x, b.position[2] - p.z),
      );
    const phase = g?.threatPhase ?? g?.threats?.phase ?? null;
    if (!enemies.length && !['engagement', 'combat', 'active', 'attack'].includes(String(phase)))
      return null;
    if (enemies[0])
      return {
        kind: 'enemy',
        ...enemies[0],
        aim: [enemies[0].position[0], enemies[0].position[1] + 0.75, enemies[0].position[2]],
        phase,
      };
    const hook = g?.vehicleScene?.hookWorldPosition;
    if (hook) return { kind: 'hook', position: hook.toArray(), aim: hook.toArray(), phase };
    const gunboat = g?.gunboatScene?.getTargetPosition?.('hull');
    if (gunboat)
      return { kind: 'hook', position: gunboat.toArray(), aim: gunboat.toArray(), phase };
    return null;
  });
  if (!target) return false;
  await page.mouse.down({ button: 'right' });
  try {
    await moveAim(target.aim);
    const weapon = await page.evaluate(() => {
      const current = globalThis.__game.game.combat.current;
      return {
        ammoInMag: current.ammoInMag,
        reserveAmmo: current.reserveAmmo,
        infiniteReserve: current.infiniteReserve,
        reloading: current.reloading,
      };
    });
    if (weapon.reloading)
      await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
        timeout: 7_000,
      });
    if (weapon.ammoInMag <= 0 && (weapon.infiniteReserve || weapon.reserveAmmo > 0)) {
      await page.keyboard.press('KeyR');
      await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
        timeout: 7_000,
      });
    }
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(450);
    await page.mouse.up({ button: 'left' });
  } finally {
    await page.mouse.up({ button: 'left' }).catch(() => {});
    await page.mouse.up({ button: 'right' }).catch(() => {});
  }
  report.coverage.lastDefense = { kind: target.kind, target: target.position, phase: target.phase };
  return true;
}

async function captureAudio(label, durationMs, action) {
  const started = await page.evaluate(() => globalThis.__feelAudioStart?.());
  if (!started?.supported) {
    report.audio.push({ label, ...started });
    return;
  }
  try {
    if (action) {
      await action();
      await sleep(durationMs);
    } else await sleep(durationMs);
  } finally {
    const stopped = await page.evaluate(() => globalThis.__feelAudioStop?.());
    if (stopped?.supported && stopped.bytes?.length) {
      const filename = `audio-${label}.webm`;
      await fs.writeFile(path.join(output, filename), Buffer.from(stopped.bytes));
      report.artifacts.push(filename);
      report.audio.push({
        label,
        supported: true,
        mime: stopped.mime,
        bytes: stopped.bytes.length,
        file: filename,
      });
    } else report.audio.push({ label, ...stopped });
  }
}

async function trySmallBuild() {
  if (process.env.MMF_FEEL_BUILD !== '1') {
    report.coverage.build.reason = 'not requested';
    return;
  }
  const safe = await page.evaluate(() => {
    const g = globalThis.__game?.game;
    const scrap = g?.resources?.count?.('scrap') ?? g?.resources?.scrap ?? 0;
    const enemies = g?.enemies?.activeCount ?? 0;
    return { safe: enemies === 0 && (g?.isSafeToSave ? g.isSafeToSave(true) : true), scrap };
  });
  if (!safe.safe || safe.scrap < 10) {
    report.coverage.build.reason = `unsafe or insufficient scrap (${safe.scrap})`;
    return;
  }
  report.coverage.build.attempted = true;
  try {
    await page.keyboard.press('KeyB');
    await page.waitForTimeout(300);
    const button = page
      .locator('button[data-piece], button[data-build-piece], [data-piece] button')
      .filter({ visible: true })
      .first();
    if (await button.count()) {
      await button.click();
      await page.waitForTimeout(250);
      report.coverage.build.reason = 'catalog action attempted';
    } else report.coverage.build.reason = 'no visible build choice';
    await page.keyboard.press('Escape');
  } catch (error) {
    report.coverage.build.reason = `build attempt failed: ${error.message}`;
    try {
      await page.keyboard.press('Escape');
    } catch {}
  }
}

async function periodic() {
  await readSample();
  const sample = report.samples.at(-1);
  await fs.mkdir(path.join(output, 'periodic'), { recursive: true });
  const name = `periodic/${String(report.samples.length).padStart(5, '0')}.json`;
  await writeJson(name, sample);
  const elapsed = (Date.now() - Date.parse(report.startedAt)) / 1000;
  if (!report.progressAt || elapsed - report.progressAt >= 30) {
    report.progressAt = elapsed;
    console.log(
      `[feel] elapsed=${Math.round(elapsed)}s cycles=${report.coverage.cycles} waypoints=${report.coverage.completedWaypoints.length} failures=${report.coverage.routeFailures.length} frames=${report.frame.count}`,
    );
  }
  if (!report.nextProgressScreenshot || elapsed >= report.nextProgressScreenshot) {
    report.nextProgressScreenshot = elapsed + 60;
    const filename = `progress-${String(Math.floor(elapsed / 60)).padStart(3, '0')}m.png`;
    try {
      await page.screenshot({ path: path.join(output, filename), fullPage: false });
      report.artifacts.push(filename);
    } catch (error) {
      report.runtimeErrors.push({ type: 'progress-screenshot', message: error.message });
    }
  }
  await writeReport();
}

async function run() {
  await fs.mkdir(output, { recursive: true });
  report.source = await resolveProfile();
  await fs.cp(report.source, profile, { recursive: true, errorOnExist: true });
  await writeReport();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport,
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  report.browserVersion = context.browser()?.version() ?? null;
  page = context.pages()[0] ?? (await context.newPage());
  const preferences = {};
  if (process.env.MMF_FEEL_FOV) preferences.hipFov = Number(process.env.MMF_FEEL_FOV);
  if (process.env.MMF_FEEL_SENSITIVITY)
    preferences.sensitivity = Number(process.env.MMF_FEEL_SENSITIVITY);
  if (Object.keys(preferences).length)
    await page.addInitScript((preferences) => {
      const old = JSON.parse(localStorage.getItem('mmf-settings') ?? '{}');
      localStorage.setItem('mmf-settings', JSON.stringify({ ...old, ...preferences }));
    }, preferences);
  report.config.preferences = preferences;
  page.on('pageerror', (error) =>
    report.runtimeErrors.push({
      type: 'pageerror',
      message: error.message,
      at: new Date().toISOString(),
    }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      report.runtimeErrors.push({
        type: 'console',
        message: message.text(),
        at: new Date().toISOString(),
      });
  });
  if (process.env.MMF_ASSET_ROOT) {
    const assetRoot = path.resolve(process.env.MMF_ASSET_ROOT);
    await page.route(`http://127.0.0.1:${port}/**`, async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(assetRoot, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) return route.abort();
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.wasm': 'application/wasm',
      };
      try {
        await route.fulfill({
          contentType: types[path.extname(file)] ?? 'application/octet-stream',
          body: await fs.readFile(file),
        });
      } catch {
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
  }
  const url = `${site}${site.includes('?') ? '&' : '?'}quality=${encodeURIComponent(quality)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180000 });
  const continueButton = page.locator('button.title-item[data-id="continue"]');
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (!(await continueButton.isVisible().catch(() => false))) {
    report.menu = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: button.textContent?.trim(),
        id: button.id,
        dataId: button.getAttribute('data-id'),
        classes: button.className,
        hidden: button.hidden,
        disabled: button.disabled,
      })),
      menu: document.getElementById('title-menu')?.outerHTML ?? null,
      bodyText: document.body.textContent?.slice(0, 1200) ?? '',
    }));
    report.entries = await page.evaluate(async () => {
      try {
        return await globalThis.__game.game.saves?.listEntries?.();
      } catch (error) {
        return { error: error.message };
      }
    });
    throw new Error('Continue button not found in cloned campaign profile');
  }
  await continueButton.click();
  await page.waitForFunction(
    () =>
      Boolean(document.pointerLockElement) &&
      !globalThis.__game.game.state.paused &&
      !globalThis.__game.game.titleScreen?.isOpen,
    null,
    { timeout: 20_000 },
  );
  await installObservers();
  report.bundle = await page.evaluate(() =>
    [...document.scripts].map((s) => s.src).filter(Boolean),
  );
  report.settings = await page.evaluate(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem('mmf-settings') ?? 'null');
    } catch {
      /* malformed settings fall back in the game */
    }
    return {
      stored,
      effectiveFov: globalThis.__game.game.playerCamera.camera.fov,
      shoulder: globalThis.__game.game.playerCamera.shoulderSide,
    };
  });
  const shoulderCode = report.settings?.stored?.bindings?.['play:shoulder'] ?? 'KeyV';
  const shoulderBefore = report.settings?.shoulder;
  await page.keyboard.press(shoulderCode);
  await page.waitForTimeout(250);
  report.settings.shoulderBinding = {
    code: shoulderCode,
    before: shoulderBefore,
    after: await page.evaluate(() => globalThis.__game.game.playerCamera.shoulderSide),
  };
  samplingTimer = setInterval(
    () =>
      periodic().catch((error) =>
        report.runtimeErrors.push({ type: 'sampler', message: error.message }),
      ),
    2000,
  );
  await captureAudio('engine-deck', 4500, async () => {
    await page.evaluate(() =>
      window.dispatchEvent(
        new MouseEvent('mousemove', { movementX: 0, movementY: 0, bubbles: true }),
      ),
    );
    await sleep(1800);
  });
  const deadline = Date.now() + durationSeconds * 1000;
  runDeadline = deadline;
  let recordedIndoor = false;
  let recordedCombat = false;
  while (Date.now() < deadline) {
    report.coverage.cycles += 1;
    try {
      const action = async () => {
        await routeCycle();
      };
      if (!recordedIndoor) {
        recordedIndoor = true;
        await captureAudio('indoor', 5000, action);
      } else await action();
    } catch (error) {
      if (error.message !== 'duration reached')
        report.coverage.routeFailures.push({
          label: 'route-cycle',
          message: error.message,
          at: new Date().toISOString(),
        });
      try {
        await page.keyboard.up('KeyW');
      } catch {}
    }
    if (
      !recordedCombat &&
      (await page.evaluate(() => Boolean(globalThis.__game?.game?.enemies?.activeCount)))
    ) {
      recordedCombat = true;
      await captureAudio('combat', 5000, defendNormally);
    }
    await trySmallBuild();
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const paused = await page.evaluate(() => Boolean(globalThis.__game?.game?.state?.paused));
  if (paused) {
    await page.screenshot({ path: path.join(output, 'pause.png'), fullPage: false });
    report.artifacts.push('pause.png');
    await captureAudio('pause', 3500);
    await page.keyboard.press('Escape');
  } else
    report.audio.push({ label: 'pause', supported: false, reason: 'pause state was not observed' });
  report.status = report.runtimeErrors.length ? 'failed' : 'completed';
}

try {
  await run();
} catch (error) {
  report.status = 'failed';
  report.runtimeErrors.push({
    type: 'fatal',
    message: error.message,
    stack: error.stack,
    at: new Date().toISOString(),
  });
} finally {
  clearInterval(samplingTimer);
  clearInterval(frameTimer);
  if (page) {
    try {
      await readSample();
    } catch (error) {
      report.runtimeErrors.push({ type: 'final-sample', message: error.message });
    }
    try {
      await page.screenshot({ path: path.join(output, 'final.png'), fullPage: false });
      report.artifacts.push('final.png');
    } catch {}
    try {
      stopObservers = await page.evaluate(() => {
        cancelAnimationFrame(globalThis.__feelFrameRequest);
        globalThis.__feelObserverState?.disposers?.forEach((dispose) => dispose());
        return true;
      });
    } catch {}
  }
  report.frameSummary = frameSummary();
  report.finishedAt = new Date().toISOString();
  await writeReport();
  if (context) await context.close();
}

if (report.status === 'failed') process.exitCode = 1;
