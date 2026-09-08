import { CAMERA_PRESETS, Game } from '@/game/Game';
import type { QualityTier } from '@/core/renderer/QualitySettings';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { canonicalEdge } from '@/building/BuildGrid';
import '@/art/interface.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const titleRoot = document.querySelector<HTMLElement>('#title');
if (!canvas) throw new Error('missing #game canvas');
if (!hudRoot) throw new Error('missing #hud root');

const params = new URLSearchParams(location.search);

const camMode = params.get('cam');
const preset = camMode ? CAMERA_PRESETS[camMode] : undefined;

const tierParam = params.get('quality');
const validTiers: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
const qualityTier = validTiers.includes(tierParam as QualityTier)
  ? (tierParam as QualityTier)
  : undefined;

const game = await Game.create({
  canvas,
  hudRoot,
  titleRoot: titleRoot ?? undefined,
  // `?nomenu=1` reproduces the pre-Phase-2 boot exactly: no title screen, no
  // opening, straight into gameplay. Every harness and e2e test boots with it.
  // `?opening=1` forces the rooftop opening regardless, for `tools/opening.mjs`.
  menu: params.get('nomenu') !== '1',
  forceOpening: params.get('opening') === '1',
  seed: params.get('seed') ?? 'mmf-dev-seed',
  qualityTier,
  bypassPointerLock: params.get('nolock') === '1',
  textures: params.get('notex') !== '1',
  models: params.get('nomodel') !== '1',
  enemySpawns: params.get('nospawn') !== '1',
  sound: params.get('nosound') !== '1',
  freeCamera: preset?.[0] ?? null,
  freeCameraTarget: preset?.[1] ?? null,
});

// Debug keys (handoff section 57). Queued rather than applied inline, so they
// take effect inside the fixed step alongside everything else.
const DEBUG_KEYS: Record<string, Parameters<typeof game.queueDebugAction>[0]> = {
  F1: 'save',
  F2: 'load',
  F3: 'overlay',
  F4: 'spawn',
  F5: 'ammo',
  F6: 'god',
  F7: 'skip',
  F8: 'quality',
  F9: 'post',
  F10: 'time',
  KeyM: 'mute',
};

window.addEventListener('keydown', (e) => {
  const action = DEBUG_KEYS[e.code];
  if (!action) return;
  e.preventDefault();
  game.queueDebugAction(action);
});

document.querySelector('#boot')?.remove();
// Decides what this boot sees first — the menu, the opening, or gameplay.
// Before `start`, so the first frame drawn is already the right one.
game.boot();
game.start();

// Browsers create an AudioContext suspended and refuse to resume it outside a
// user gesture. The click that takes pointer lock is the gesture every player
// performs anyway, before there is anything to hear. `?nolock=1` skips that
// click, so the first keypress serves instead -- otherwise the harnesses and
// anyone driving the game without pointer lock would have a silent game and no
// way to tell it from a broken one.
canvas.addEventListener('mousedown', () => game.audio.resume());
window.addEventListener('keydown', () => game.audio.resume(), { once: false });

// Handle for the screenshot, movement, combat, and e2e harnesses.
(globalThis as unknown as { __game: unknown }).__game = {
  game,
  world: game.world,
  player: game.player,
  input: game.input,
  combat: game.combat,
  enemies: game.enemies,
  spawner: game.spawner,
  machine: game.machine,
  physics: game.physics,
  playerCamera: game.playerCamera,
  bus: game.bus,
  sessionMetrics: game.sessionMetrics,
  post: game.post,
  hud: game.hud,
  build: game.build,
  resources: game.resources,
  opening: game.opening,
  titleScreen: game.titleScreen,
  canonicalEdge,
  // Which way the world scrolls. Harnesses that reason about anything glued to
  // the sand need it, and deriving it by observation instead is how a harness
  // ends up asserting a direction of its own -- see walker spec section 12.
  WORLD_Z_PER_METRE,
  debugStats: () => {
    const info = game.renderer.three.info;
    return {
      calls: info.render.calls,
      tris: info.render.triangles,
      skyBakes: game.sky.bakes,
      graphics: game.post.diagnostics,
      distance: Math.round(game.world.distanceTraveled),
      chunks: game.world.activeChunkCount,
      speed: Number(game.machine.speed.toFixed(2)),
      bodies: game.physics.bodyCount,
      playerY: Number(game.player.worldPosition.y.toFixed(3)),
      grounded: game.player.isGrounded,
      vy: Number(game.player.debug.vy.toFixed(2)),
      simTime: Number(game.state.simTime.toFixed(3)),
      hp: game.player.stats.health,
      ammo: `${game.combat.current.ammoInMag}/${game.combat.current.reserveAmmo}`,
      weapon: game.combat.current.def.id,
      enemies: game.enemies.activeCount,
      particles: game.sandFX.liveCount + game.impactFX.liveCount,
      scrap: game.resources.count('scrap'),
      pieces: game.build.pieceCount,
      rooms: game.build.rooms.rooms.length,
      buildMode: game.buildMode,
      opening: game.opening.phase,
      armed: game.playerArmed,
    };
  },
};
