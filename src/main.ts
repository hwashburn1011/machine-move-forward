import * as THREE from 'three';

// Temporary boot check — replaced by the Game orchestrator in a later task.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('missing #game canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1f18);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
scene.add(cube);

document.querySelector('#boot')?.remove();

renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.005;
  cube.rotation.y += 0.008;
  renderer.render(scene, camera);
});
