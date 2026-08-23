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

await initRapier();

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');

const probe = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
const quality = getQualitySettings(detectQualityTier(probe));
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

const camMode = new URLSearchParams(location.search).get('cam');
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

const loop = new GameLoop({
  fixedUpdate: (dt) => {
    machine.fixedUpdate(dt);
    world.fixedUpdate(dt, machine.speed);
    physics.step();
  },
  render: () => {
    const elapsed = clock.getElapsedTime();
    world.update(elapsed);
    if (sky.update(performance.now())) {
      renderer.setEnvironment(sky.environment);
      renderer.sun.color.copy(sky.sampleSunColor());
      updateFogColor(sky.sampleHorizonColor());
      world.setSunDirection(sky.direction);
    }
    renderer.three.render(renderer.scene, renderer.camera);
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
  }),
  world,
};
