import * as THREE from 'three';
import { Renderer } from '@/core/renderer/Renderer';
import { detectQualityTier, getQualitySettings } from '@/core/renderer/QualitySettings';
import { Sky } from '@/art/Sky';
import { Materials } from '@/art/Materials';
import { updateFogColor } from '@/art/Fog';
import { WorldManager } from '@/world/WorldManager';
import { EventBus } from '@/core/events/EventBus';
import { GameLoop } from '@/game/GameLoop';
import { BASE_MACHINE_SPEED } from '@/game/constants';

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

// Placeholder for the machine, so there is something at the origin to judge
// the scroll against. Replaced by the real machine in the next task.
const placeholder = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 16), materials.hull);
placeholder.position.set(0, 1.2, 0);
placeholder.castShadow = true;
placeholder.receiveShadow = true;
renderer.scene.add(placeholder);

renderer.camera.position.set(9, 7.5, 19);
renderer.camera.lookAt(0, 2, -30);

document.querySelector('#boot')?.remove();

const clock = new THREE.Clock();

const loop = new GameLoop({
  fixedUpdate: (dt) => {
    world.fixedUpdate(dt, BASE_MACHINE_SPEED);
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
  }),
  world,
};
