/** Isolated art inspection, intentionally does not import or alter a game session. */
import * as THREE from 'three';
import { Materials } from '../../src/art/Materials';
import { loadModel } from '../../src/art/ModelLoader';
import { PlayerVisual } from '../../src/player/PlayerVisual';
import { loadDefenseModels, authoredModel } from '../../src/art/DefenseModels';
import { buildRadioModel, buildWreckModel } from '../../src/art/ExpeditionModels';

async function main() {
  await loadDefenseModels(true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x818478);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1440, 900);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.style.margin = '0';
  document.body.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.05, 100);
  const light = new THREE.DirectionalLight(0xffe5c0, 3.5);
  light.position.set(-4, 8, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = light.shadow.camera.bottom = -12;
  light.shadow.camera.right = light.shadow.camera.top = 12;
  scene.add(light, new THREE.HemisphereLight(0xc7e2f1, 0x79735e, 2.3));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: 0x7b8176, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const materials = new Materials();
  const rifle = await loadModel('models/authored/scrap-rifle.glb');
  const shotgun = await loadModel('models/authored/scrap-shotgun.glb');
  const actors: PlayerVisual[] = [];
  for (const [x, speed, phase, weapon] of [
    [-1.4, 0, 0.4, 'rifle'],
    [0, 3, 0.3, 'rifle'],
    [1.4, 7, 0.16, 'shotgun'],
  ] as const) {
    const actor = new PlayerVisual(authoredModel('player'), materials);
    actor.object3D.position.set(x, 0.96, 0);
    actor.setMotion(speed, true);
    actor.setHeldWeapon(weapon, (weapon === 'rifle' ? rifle : shotgun)?.scene ?? null);
    actor.update(phase);
    scene.add(actor.object3D);
    actors.push(actor);
  }
  camera.position.set(4, 2.9, 6);
  camera.lookAt(0, 1.1, 0);
  renderer.render(scene, camera);
  Object.assign(globalThis, {
    artFixture: { scene, camera, renderer, actors, materials, buildRadioModel, buildWreckModel },
    artReady: true,
  });
}
main().catch((error) => {
  console.error(error);
  Object.assign(globalThis, { artError: String(error) });
});
