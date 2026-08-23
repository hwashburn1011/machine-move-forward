import * as THREE from 'three';
import { Renderer } from '@/core/renderer/Renderer';
import { detectQualityTier, getQualitySettings } from '@/core/renderer/QualitySettings';
import { PALETTE } from '@/art/Palette';
import { Sky } from '@/art/Sky';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');

const probe = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
const quality = getQualitySettings(detectQualityTier(probe));
probe.dispose();

const renderer = new Renderer(canvas, quality);

const sky = new Sky(renderer.three);
renderer.scene.add(sky.mesh);
renderer.setEnvironment(sky.environment);
renderer.setSunDirection(sky.direction);
renderer.sun.color.copy(sky.sampleSunColor());

// --- Temporary lighting-check scene, replaced once the machine lands --------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: PALETTE.sandLit, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
renderer.scene.add(ground);

for (let i = 0; i < 3; i++) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2 + i, 2),
    new THREE.MeshStandardMaterial({
      color: i === 1 ? PALETTE.steel : PALETTE.hullPaint,
      roughness: i === 1 ? 0.28 : 0.7,
      metalness: i === 1 ? 0.9 : 0.15,
    }),
  );
  box.position.set((i - 1) * 4, 1 + i / 2, 0);
  box.castShadow = true;
  box.receiveShadow = true;
  renderer.scene.add(box);
}

const camMode = new URLSearchParams(location.search).get('cam');
if (camMode === 'sky') {
  renderer.camera.position.set(0, 2, 0);
  renderer.camera.lookAt(0, 40, -18);
} else {
  renderer.camera.position.set(7, 4.5, 11);
  renderer.camera.lookAt(0, 1.5, 0);
}

document.querySelector('#boot')?.remove();

renderer.three.setAnimationLoop(() => {
  if (sky.update(performance.now())) renderer.setEnvironment(sky.environment);
  renderer.three.render(renderer.scene, renderer.camera);
});

// Debug handle for the screenshot harness and e2e tests.
(globalThis as unknown as { __game: unknown }).__game = {
  debugStats: () => ({
    tier: quality.tier,
    calls: renderer.three.info.render.calls,
    tris: renderer.three.info.render.triangles,
  }),
};
