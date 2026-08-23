import * as THREE from 'three';
import { Renderer } from '@/core/renderer/Renderer';
import { detectQualityTier, getQualitySettings } from '@/core/renderer/QualitySettings';
import { PALETTE } from '@/art/Palette';
import { Sky } from '@/art/Sky';
import { Materials } from '@/art/Materials';
import { applyHeightFog, updateFogColor } from '@/art/Fog';

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
updateFogColor(sky.sampleHorizonColor());

const materials = new Materials();

// --- Temporary lighting/material check scene, replaced by the machine -------
const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.sandLit, roughness: 0.95 });
applyHeightFog(groundMat);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
renderer.scene.add(ground);

const showcase: [string, THREE.Material][] = [
  ['hull', materials.hull],
  ['deckPlate', materials.deckPlate],
  ['rustedSteel', materials.rustedSteel],
  ['bareSteel', materials.bareSteel],
  ['hazard', materials.hazard],
];
showcase.forEach(([, mat], i) => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat);
  box.position.set((i - 2) * 3.2, 1.2, 0);
  box.castShadow = true;
  box.receiveShadow = true;
  renderer.scene.add(box);
});

// Distance markers, to judge whether fog reads correctly with range.
for (let i = 1; i <= 12; i++) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 1.6), materials.hullDark);
  pillar.position.set(-14 + (i % 3) * 13, 3.5, -i * 22);
  pillar.castShadow = true;
  renderer.scene.add(pillar);
}

const camMode = new URLSearchParams(location.search).get('cam');
if (camMode === 'sky') {
  renderer.camera.position.set(0, 2, 0);
  renderer.camera.lookAt(0, 40, -18);
} else {
  renderer.camera.position.set(6, 4.2, 12);
  renderer.camera.lookAt(0, 1.4, -14);
}

document.querySelector('#boot')?.remove();

renderer.three.setAnimationLoop(() => {
  if (sky.update(performance.now())) {
    renderer.setEnvironment(sky.environment);
    renderer.sun.color.copy(sky.sampleSunColor());
    updateFogColor(sky.sampleHorizonColor());
  }
  renderer.three.render(renderer.scene, renderer.camera);
});

// Debug handle for the screenshot harness and e2e tests.
(globalThis as unknown as { __game: unknown }).__game = {
  debugStats: () => ({
    tier: quality.tier,
    calls: renderer.three.info.render.calls,
    tris: renderer.three.info.render.triangles,
    skyBakes: sky.bakes,
  }),
};
