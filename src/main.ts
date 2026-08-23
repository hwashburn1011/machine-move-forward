import * as THREE from 'three';
import { Game } from '@/game/Game';
import type { QualityTier } from '@/core/renderer/QualitySettings';
import { canonicalEdge } from '@/building/BuildGrid';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (!canvas) throw new Error('missing #game canvas');
if (!hudRoot) throw new Error('missing #hud root');

const params = new URLSearchParams(location.search);

/** Free-fly camera presets, used by the screenshot harness. */
const CAMERA_PRESETS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  far: [new THREE.Vector3(9, 7.5, 19), new THREE.Vector3(0, 2, -30)],
  front: [new THREE.Vector3(11, 6.5, -19), new THREE.Vector3(0, 3, 0)],
  side: [new THREE.Vector3(22, 6, 2), new THREE.Vector3(0, 2.5, 0)],
  sky: [new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 40, -18)],
};

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
  seed: params.get('seed') ?? 'mmf-dev-seed',
  qualityTier,
  bypassPointerLock: params.get('nolock') === '1',
  enemySpawns: params.get('nospawn') !== '1',
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
};

window.addEventListener('keydown', (e) => {
  const action = DEBUG_KEYS[e.code];
  if (!action) return;
  e.preventDefault();
  game.queueDebugAction(action);
});

document.querySelector('#boot')?.remove();
game.start();

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
  post: game.post,
  hud: game.hud,
  build: game.build,
  resources: game.resources,
  canonicalEdge,
  debugStats: () => {
    const info = game.renderer.three.info;
    return {
      calls: info.render.calls,
      tris: info.render.triangles,
      skyBakes: game.sky.bakes,
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
    };
  },
};
