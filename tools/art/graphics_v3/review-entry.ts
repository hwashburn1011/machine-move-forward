import * as THREE from 'three';
import { loadModel } from '../../../src/art/ModelLoader';

async function main() {
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1600,1000);renderer.setPixelRatio(1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  document.body.style.margin='0';document.body.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#272f32');
  const camera=new THREE.PerspectiveCamera(36,1.6,.05,180);
  const hemi=new THREE.HemisphereLight('#d4dce5','#515345',1.6);scene.add(hemi);
  const light=new THREE.DirectionalLight('#ffe8ce',3.0);light.position.set(-3,7,5);
  light.castShadow=true;light.shadow.mapSize.set(2048,2048);
  light.shadow.bias=-.0006;light.shadow.normalBias=.02;
  light.shadow.camera.left=light.shadow.camera.bottom=-15;light.shadow.camera.right=light.shadow.camera.top=15;
  scene.add(light);
  const fill=new THREE.DirectionalLight('#9bb7c8',1);fill.position.set(3,4,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:'#3c494a',roughness:.9}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.012;scene.add(floor);
  const actors:THREE.Group[]=[];
  for(const [id,x] of [['player',-1.1],['raider',0],['scavenger',1.1]] as const){
    const model=await loadModel(`/models/authored/${id}.glb`);if(!model)throw new Error(id+' failed');
    const actor=model.scene;actor.position.x=x;
    actor.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    scene.add(actor);actors.push(actor);
  }
  const draw=(view='front')=>{
    for(const a of actors)a.visible=true;
    if(view==='back'){camera.position.set(-2.8,2.45,-5.2);camera.lookAt(0,1.01,0);}
    else if(view==='profile'){camera.position.set(5.8,2.15,1.8);camera.lookAt(0,1.05,0);}
    else{camera.position.set(2.4,2.55,5.8);camera.lookAt(0,1.0,0);}
    renderer.render(scene,camera);
  };
  const solo=(index:number)=>{
    actors.forEach((a,i)=>a.visible=i===index);
    const x=actors[index]!.position.x;
    camera.position.set(x+.9,1.97,2.35);camera.lookAt(x,1.27,0);renderer.render(scene,camera);
  };
  draw();Object.assign(globalThis,{artReady:true,reviewV3:{draw,solo,renderer,scene,camera,actors}});
}
main().catch(error=>Object.assign(globalThis,{artError:String(error)}));
