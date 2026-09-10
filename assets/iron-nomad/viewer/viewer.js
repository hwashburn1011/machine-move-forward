import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const container = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
container.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#293238');
scene.fog = new THREE.Fog('#293238', 140, 350);
const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, .06).texture;
scene.environmentIntensity = .48;
room.dispose(); pmrem.dispose();
const camera = new THREE.PerspectiveCamera(36, 1, .12, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = .5;
controls.minDistance = 2;
controls.maxDistance = 160;
controls.maxPolarAngle = Math.PI * .51;
const key = new THREE.DirectionalLight('#ffdfb4', 3.5);
key.position.set(-25, 38, 30); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -28, right: 28, top: 38, bottom: -28, near: 1, far: 125 });
key.shadow.normalBias = .035; key.shadow.bias = -.00015;
const hemi = new THREE.HemisphereLight('#c0dbee', '#6a5640', 1.1);
const rim = new THREE.DirectionalLight('#a0cce7', 1.2); rim.position.set(18, 27, -22);
scene.add(key, key.target, hemi, rim);
key.target.position.set(0, 12, 0);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: '#766957', roughness: .93 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.035; ground.receiveShadow = true; scene.add(ground);
const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, sceneTarget);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .24, .35, 1.25);
composer.addPass(bloom); composer.addPass(new OutputPass());
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let model, mixer, action, clip, bounds, token = 0, walking = false, night = false, wire = false;
const spillLights = [];
let turbine, crane, craneInitial;

function dispose(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => { if (!o.isMesh) return; geometries.add(o.geometry); for (const m of [].concat(o.material)) { materials.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
function setPressed(id, value) { $(id).classList.toggle('active', value); $(id).setAttribute('aria-pressed', String(value)); }
function setView(name = $('view').value) {
  if (!model) return;
  const views = {
    hero: [[43, 23, 54], [1.5, 14, 0]],
    front: [[0, 18, 38], [0, 16.5, 5]],
    banner: [[36, 20, 9], [5, 16, 0]],
    legs: [[22, 9, 24], [7.8, 5.0, 6.0]],
    rear: [[-47, 27, -54], [0, 14, 0]],
    top: [[30, 42, 30], [0, 20, 0]],
  };
  const [position, target] = views[name] || views.hero;
  controls.target.fromArray(target); camera.position.fromArray(position);
  // Keep the whole machine framed in narrow viewports.
  if (name === 'hero' && camera.aspect < 1.12) camera.position.sub(controls.target).multiplyScalar(1.12 / camera.aspect).add(controls.target);
  controls.update();
}
function applyLighting() {
  scene.background.set(night ? '#0c1623' : '#293238'); scene.fog.color.copy(scene.background);
  scene.environmentIntensity = night ? .16 : .48;
  key.intensity = night ? .45 : 3.5; hemi.intensity = night ? .18 : 1.1; rim.intensity = night ? .7 : 1.2;
  bloom.strength = night ? .34 : .24;
  spillLights.forEach(l => l.intensity = night ? l.userData.nightPower : l.userData.nightPower * .18);
}
async function load() {
  const serial = ++token; delete window.__NOMAD_READY__;
  $('loading').classList.remove('hidden'); $('status').textContent = 'Loading…'; $('status').classList.remove('error');
  try {
    const quality = $('quality').value;
    const gltf = await loader.loadAsync(`../optimized/iron-nomad-${quality}.glb`);
    if (serial !== token) { dispose(gltf.scene); return; }
    if (model) { mixer.stopAllAction(); mixer.uncacheRoot(model); scene.remove(model); dispose(model); }
    spillLights.length = 0;
    model = gltf.scene; scene.add(model); model.updateMatrixWorld(true);
    let triangles = 0, primitives = 0;
    model.traverse(o => {
      if (!o.isMesh) return;
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; primitives++;
      o.castShadow = o.receiveShadow = true;
      for (const mat of [].concat(o.material)) { mat.wireframe = wire; if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) o.castShadow = o.receiveShadow = false; for (const value of Object.values(mat)) if (value?.isTexture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
    });
    bounds = new THREE.Box3().setFromObject(model, true);
    mixer = new THREE.AnimationMixer(model); clip = gltf.animations.find(a => a.name === 'Walker_Walk');
    if (!clip) throw new Error('The exported Walker_Walk animation is missing.');
    action = mixer.clipAction(clip); action.play(); action.paused = !walking; mixer.update(0);
    turbine = model.getObjectByName('Turbine_Rotor'); crane = model.getObjectByName('CargoCrane_Yaw'); craneInitial = crane.quaternion.clone();
    $('crane').value = 0;
    // Bounded preview light budget. The model itself contains emissive surfaces
    // and named light anchors; these lights belong only to this viewer.
    for (const [position, color, power] of [
      [[-5, 16.7, 7], '#ff943e', 120], [[1, 16.7, 6], '#ff943e', 150], [[5.5, 16.7, 3], '#ff943e', 120],
      [[-5.5, 20, 9.3], '#28beff', 85], [[-3.7, 16, 10.9], '#28beff', 65], [[8.9, 14.5, 5], '#28beff', 60],
      [[3.8, 24.9, -3], '#ff6923', 80], [[3.8, 24, -7.1], '#ff6923', 80],
    ]) { const light = new THREE.PointLight(color, 0, 7, 2); light.position.fromArray(position); light.userData.nightPower = power; model.add(light); spillLights.push(light); }
    applyLighting(); setView();
    $('glb').href = `../exports/iron-nomad-${quality}.glb`;
    $('info').textContent = `${triangles.toLocaleString()} triangles · 4 articulated legs · 3 deck levels\nDrag to orbit · Scroll to inspect`;
    $('status').textContent = 'Ready · 4-second walking cycle'; $('loading').classList.add('hidden');
    window.__NOMAD_READY__ = { quality, triangles, primitives, clips: gltf.animations.map(a => ({ name: a.name, duration: a.duration })), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    window.__NOMAD_VIEWER__ = { scene, model, camera, renderer, composer, controls, mixer, action, setView };
  } catch (error) { $('loading').textContent = 'Unable to load the model. Check the local server and reload.'; $('status').textContent = error.message; $('status').classList.add('error'); console.error(error); }
}
$('quality').onchange = load; $('view').onchange = () => setView();
$('walk').onclick = () => { walking = !walking; if (action) action.paused = !walking; setPressed('walk', walking); };
$('night').onclick = () => { night = !night; applyLighting(); setPressed('night', night); };
$('wire').onclick = () => { wire = !wire; model?.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) m.wireframe = wire; }); setPressed('wire', wire); };
$('rotate').onclick = () => { controls.autoRotate = !controls.autoRotate; setPressed('rotate', controls.autoRotate); };
$('ref').onclick = () => { const visible = $('reference-panel').classList.toggle('visible'); setPressed('ref', visible); };
$('crane').oninput = () => { if (crane) crane.quaternion.copy(craneInitial).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(Number($('crane').value)))); };
$('reset').onclick = () => { $('view').value = 'hero'; setView(); controls.autoRotate = false; setPressed('rotate', false); };
function resize() { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let previous = performance.now();
renderer.setAnimationLoop(now => { const dt = Math.min((now - previous) / 1000, .05); previous = now; if (walking) { mixer?.update(dt); if (turbine) turbine.rotateZ(dt * .7); } controls.update(); renderer.info.reset(); composer.render(dt); });
load();
