import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel } from '../../../src/art/ModelLoader';

const limits: Record<string,number> = {
  player:36000,raider:36000,scavenger:28000,'scrap-rifle':12000,'scrap-shotgun':12000,
  'salvaged-radio':12000,'manual-turret':26000,'expedition-wreck':105000,'raider-skiff':75000,
  'machine-kit':32000,'station-kit':16000,'salvage-chest':15000,'forged-hook':4000,
};
const reports: object[]=[];
const errors: string[]=[];
function check(ok:unknown, message:string) { if(!ok) errors.push(message); }
async function main() {
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1200,800);renderer.toneMapping=THREE.ACESFilmicToneMapping;
  document.body.style.margin='0';document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x454d4b);
  scene.add(new THREE.HemisphereLight(0xc2d4df,0x76644a,2));
  const key=new THREE.DirectionalLight(0xffe8cc,3);key.position.set(3,6,4);scene.add(key);
  const camera=new THREE.PerspectiveCamera(40,1.5,.01,250);
  const models=new Map<string,THREE.Group>();
  for(const [id,limit] of Object.entries(limits)) {
    const model=await loadModel(`/models/authored/${id}.glb`);
    check(model,`${id}: GLB including images decodes`);if(!model)continue;
    const root=model.scene;root.updateMatrixWorld(true);models.set(id,root);
    let triangles=0,meshes=0,textured=0;const imageSizes:number[][]=[];
    const seen=new Set<THREE.Texture>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;meshes++;
      triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;
      check(object.geometry.attributes.normal,`${id}/${object.name}: normals`);
      for(const material of Array.isArray(object.material)?object.material:[object.material]) {
        const m=material as THREE.MeshStandardMaterial;
        if(m.map){textured++;check(object.geometry.attributes.uv,`${id}/${object.name}: textured UVs`);}
        for(const tex of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap]) {
          if(!tex||seen.has(tex))continue;seen.add(tex);
          check(tex.image?.width>0&&tex.image?.height>0,`${id}: decoded texture pixels`);
          imageSizes.push([tex.image?.width??0,tex.image?.height??0]);
        }
      }
    });
    check(triangles<=limit,`${id}: ${triangles} triangles exceeds ${limit}`);
    check(textured>0,`${id}: authored color maps present`);
    const bounds=new THREE.Box3().setFromObject(root,true);const report:Record<string,unknown>={id,triangles,meshes,textured,imageSizes,dimensions:bounds.getSize(new THREE.Vector3()).toArray()};
    if(id==='salvaged-radio'){
      check(root.getObjectByName('SignalLamp'),`${id}: signal lamp`);
      check(Math.abs(bounds.min.y)<.002&&bounds.max.y>1.8&&bounds.max.y<2,`${id}: floor/height`);
    }
    if(id==='manual-turret')for(const name of ['TurretYaw','TurretPitch','Muzzle'])check(root.getObjectByName(name),`${id}: ${name}`);
    if(id==='raider-skiff')for(const name of ['SkiffGunYaw','SkiffGunPitch','SkiffMuzzle','CrewSeatLeft','CrewSeatRight','PilotSeat'])check(root.getObjectByName(name),`${id}: ${name}`);
    if(id.startsWith('scrap-'))for(const name of ['GripOrigin','Muzzle'])check(root.getObjectByName(name),`${id}: ${name}`);
    if(id==='expedition-wreck'){
      for(const name of ['Gangway','CourseGyro','JournalCargo','JournalCrew','JournalRoute'])check(root.getObjectByName(name),`${id}: ${name}`);
      const ray=new THREE.Raycaster(new THREE.Vector3(-7.2,1.1,0),new THREE.Vector3(1,0,0),0,12.5);
      check(ray.intersectObject(root,true).length===0,'wreck: entrance corridor unobstructed');
      for(const [x,z] of [[-6.5,0],[-4,0],[0,0],[4,0],[4,2]]){
        const hit=new THREE.Raycaster(new THREE.Vector3(x,.5,z),new THREE.Vector3(0,-1,0),0,1).intersectObject(root,true)[0];
        check(hit&&Math.abs(hit.point.y)<.02,`wreck: collider-aligned floor ${x}/${z}, actual ${hit?.point.y} mesh ${hit?.object.name}`);
      }
      check(root.getObjectByName('CourseGyro')?.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(4.5,.92,3))!<.001,'wreck: gyro pedestal');
    }
    if(['player','raider','scavenger'].includes(id)){
      let low=Infinity,high=-Infinity,grip=1;
      for(const name of ['Idle','Walking','Running']){
        const actor=clone(root),clip=model.clips.find(c=>c.name===name);check(clip,`${id}: ${name} clip`);if(!clip)continue;
        const mixer=new THREE.AnimationMixer(actor);mixer.clipAction(clip).play();
        for(let i=0;i<40;i++){
          mixer.setTime(clip.duration*i/40);actor.updateMatrixWorld(true);
          const y=new THREE.Box3().setFromObject(actor,true).min.y;low=Math.min(low,y);high=Math.max(high,y);
          if(id==='player'){
            const hand=actor.getObjectByName('HandR');check(hand,'player: HandR');
            if(hand)grip=Math.min(grip,new THREE.Vector3(0,1,0).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())).z);
          }
        }
        mixer.stopAllAction();
      }
      check(low>-.025&&high<.055,`${id}: grounded animation ${low.toFixed(3)}..${high.toFixed(3)}`);
      if(id==='player')check(grip>.999,'player: hand axis maintains weapon alignment');
      report.plantedFootY=[low,high];report.weaponForwardDot=grip;
    }
    reports.push(report);
  }
  const show=(id:string)=>{
    for(const model of models.values())scene.remove(model);
    const model=models.get(id);if(!model)return;
    scene.add(model);const box=new THREE.Box3().setFromObject(model,true);
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const distance=Math.max(size.x,size.y,size.z)*1.8;
    camera.position.copy(center).add(new THREE.Vector3(.7,.5,1).normalize().multiplyScalar(distance));
    if(id==='expedition-wreck')camera.position.copy(center).add(new THREE.Vector3(-1,1,.4).normalize().multiplyScalar(distance));
    if(id==='salvaged-radio')camera.position.copy(center).add(new THREE.Vector3(-.7,.25,-1).normalize().multiplyScalar(distance));
    camera.lookAt(center);renderer.render(scene,camera);
  };
  Object.assign(globalThis,{assetReview:{reports,errors,show,renderer,scene,camera},artReady:true});
  show('salvaged-radio');
}
main().catch(error=>Object.assign(globalThis,{artError:String(error)}));
