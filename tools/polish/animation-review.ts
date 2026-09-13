import * as THREE from 'three';
import { PlayerVisual } from '../../src/player/PlayerVisual';
import { EnemyVisual } from '../../src/enemies/EnemyVisual';
import { Materials } from '../../src/art/Materials';
import { loadModel } from '../../src/art/ModelLoader';

const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color('#20282e');
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.05,100);
scene.add(new THREE.HemisphereLight('#e8f0ff','#795537',2));
for(const [x,y,z,color,power] of [[-3,5,4,0xffdbac,5],[3,3,-2,0x86b7ff,3]]) {
 const lamp=new THREE.DirectionalLight(color,power);lamp.position.set(x,y,z);scene.add(lamp);
 lamp.castShadow=true;lamp.shadow.mapSize.set(2048,2048);lamp.shadow.normalBias=.02;
}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#51483b',roughness:1}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const materials=new Materials();
const kind=new URLSearchParams(location.search).get('kind')??'s07';
const model=await loadModel('/models/authored/'+(kind==='s07'?'s07-player':kind)+'.glb');
if(!model)throw Error('Missing staged model '+kind);
const visual=kind==='s07'?new PlayerVisual(model,materials):new EnemyVisual(model,materials);
visual.object3D.position.y=.96;scene.add(visual.object3D);
if(visual instanceof PlayerVisual) visual.setGroundSampler({sample:origin=>({hit:true,point:{x:origin.x,y:0,z:origin.z},normal:{x:0,y:1,z:0}})});
const rifle=kind==='s07'?await loadModel('/models/authored/scrap-rifle.glb'):null;
const shotgun=kind==='s07'?await loadModel('/models/authored/scrap-shotgun.glb'):null;
function show({motion='idle',time=0,angle=0.65,pitch=0,weapon='rifle'}={}) {
 camera.position.set(Math.sin(angle)*4.6,1.9,Math.cos(angle)*4.6);camera.lookAt(0,1.05,0);
 if(visual instanceof PlayerVisual) {
  visual.setHeldWeapon(weapon,(weapon==='rifle'?rifle:shotgun)?.scene??null);
  const direction=new THREE.Vector3(motion.includes('left')?4.5:motion.includes('right')?-4.5:0,0,motion.includes('back')?-4.5:motion.includes('fwd')?4.5:0);
  visual.setMotion(direction.length(),true,motion.includes('crouch'),direction);
  visual.setCombatPresentation({weaponId:weapon,reloading:motion==='reload',reloadProgress:time,aiming:true,aimPitch:pitch,aimYaw:0});
  for(let t=0;t<Math.max(.001,motion==='reload'?.2:time);t+=1/60) visual.update(1/60);
 } else {
  visual.reset(); visual.setState(motion==='death'?'dead':'idle');
  if(motion==='attack')visual.attack();
  if(motion==='hit')visual.flash();
  for(let t=0;t<time;t+=1/60) visual.update(Math.min(1/60,time-t));
 }
 if(motion==='death') { const box=new THREE.Box3(); visual.object3D.updateMatrixWorld(true); visual.object3D.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)box.expandByObject(o,true)}); const centre=box.getCenter(new THREE.Vector3());camera.position.copy(centre).add(new THREE.Vector3(Math.sin(angle)*5.8,2.3,Math.cos(angle)*5.8));camera.lookAt(centre); }
 document.querySelector('#label')!.textContent=kind.toUpperCase()+' · '+motion+' · '+time.toFixed(2)+' s';
 renderer.render(scene,camera);
 return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
(window as unknown as {review:unknown}).review={visual,renderer,scene,camera,show};
show();
