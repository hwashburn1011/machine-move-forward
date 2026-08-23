import * as THREE from 'three';
import { Renderer } from '@/core/renderer/Renderer';
import { detectQualityTier, getQualitySettings } from '@/core/renderer/QualitySettings';
import { Sky } from '@/art/Sky';
import { Materials } from '@/art/Materials';
import { updateFogColor } from '@/art/Fog';
import { WorldManager } from '@/world/WorldManager';
import { EventBus } from '@/core/events/EventBus';
import { GameLoop } from '@/game/GameLoop';
import { Machine } from '@/machine/Machine';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { InputManager } from '@/core/input/InputManager';
import { Player } from '@/player/Player';
import { PlayerCamera } from '@/player/PlayerCamera';

await initRapier();

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');

const probe = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
const forcedTier = new URLSearchParams(location.search).get('quality');
const quality = getQualitySettings(
  forcedTier === 'low' || forcedTier === 'medium' || forcedTier === 'high' || forcedTier === 'ultra'
    ? forcedTier
    : detectQualityTier(probe),
);
probe.dispose();

const renderer = new Renderer(canvas, quality);
const bus = new EventBus();

const sky = new Sky(renderer.three);
renderer.scene.add(sky.mesh);
renderer.setEnvironment(sky.environment);
renderer.setSunDirection(sky.direction);
renderer.sun.color.copy(sky.sampleSunColor());
updateFogColor(sky.sampleHorizonColor());

const materials = new Materials();
const world = new WorldManager(renderer.scene, quality, bus, materials, 'mmf-dev-seed');
world.setSunDirection(sky.direction);

let recycles = 0;
bus.on('world:chunk-recycled', () => recycles++);

const physics = new PhysicsWorld();
const machine = new Machine(renderer.scene, physics, materials);

const params = new URLSearchParams(location.search);
const input = new InputManager(canvas, {
  bypassPointerLock: params.get('nolock') === '1',
});
const player = new Player(renderer.scene, physics, bus, materials, machine.deckSpawn);
const playerCamera = new PlayerCamera(window.innerWidth / window.innerHeight);

renderer.extraCameras.push(playerCamera.camera);

const camMode = params.get('cam');
const freeCam = camMode !== null;
if (camMode === 'front') {
  renderer.camera.position.set(11, 6.5, -19);
  renderer.camera.lookAt(0, 3, 0);
} else if (camMode === 'far') {
  renderer.camera.position.set(9, 7.5, 19);
  renderer.camera.lookAt(0, 2, -30);
} else if (camMode === 'deck') {
  renderer.camera.position.set(2.5, 5.2, 9.5);
  renderer.camera.lookAt(0, 3.0, -3);
} else {
  renderer.camera.position.set(13, 8.5, 17);
  renderer.camera.lookAt(0, 2.5, -2);
}

document.querySelector('#boot')?.remove();

const clock = new THREE.Clock();

// Rolling FPS, so the harness can tell a real bug from a slow headless GPU.
const fpsMeter = { value: 0, frames: 0, last: performance.now() };

// Simulated seconds elapsed. Test harnesses must wait on this rather than
// wall time: under a slow renderer the fixed-step clamp deliberately lets
// simulated time fall behind, and wall-clock assertions then measure the GPU
// rather than the game.
let simTime = 0;

const loop = new GameLoop({
  fixedUpdate: (dt) => {
    simTime += dt;
    machine.fixedUpdate(dt);
    if (!freeCam) {
      player.fixedUpdate(dt, input, playerCamera.yawAngle);
      playerCamera.fixedUpdate(dt, input, player.worldPosition, physics, player.collider);
    }
    world.fixedUpdate(dt, machine.speed);
    physics.step();
  },
  render: (alpha) => {
    const elapsed = clock.getElapsedTime();
    player.update(alpha);
    world.update(elapsed);
    if (sky.update(performance.now())) {
      renderer.setEnvironment(sky.environment);
      renderer.sun.color.copy(sky.sampleSunColor());
      updateFogColor(sky.sampleHorizonColor());
      world.setSunDirection(sky.direction);
    }
    renderer.three.render(renderer.scene, freeCam ? renderer.camera : playerCamera.camera);
    fpsMeter.frames++;
    const nowMs = performance.now();
    if (nowMs - fpsMeter.last >= 500) {
      fpsMeter.value = Math.round((fpsMeter.frames * 1000) / (nowMs - fpsMeter.last));
      fpsMeter.frames = 0;
      fpsMeter.last = nowMs;
    }
    input.endFrame();
  },
});
loop.start();

// Debug handle for the screenshot harness and e2e tests.
(globalThis as unknown as { __game: unknown }).__game = {
  debugStats: () => ({
    tier: quality.tier,
    calls: renderer.three.info.render.calls,
    tris: renderer.three.info.render.triangles,
    skyBakes: sky.bakes,
    distance: Math.round(world.distanceTraveled),
    recycles,
    chunks: world.activeChunkCount,
    speed: Number(machine.speed.toFixed(2)),
    bodies: physics.bodyCount,
    playerY: Number(player.worldPosition.y.toFixed(3)),
    grounded: player.isGrounded,
    vy: Number(player.debug.vy.toFixed(2)),
    fps: fpsMeter.value,
    simTime: Number(simTime.toFixed(3)),
  }),
  world,
  player,
  input,
};
