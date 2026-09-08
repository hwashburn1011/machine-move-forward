import * as THREE from 'three';
import { loadModel } from '../../../src/art/ModelLoader';

const contracts: Record<string, { nodes: string[]; size: number[]; budget: number }> = {
  'navigation-helm': { nodes: ['HelmRoot','GyroInstalled','HelmPowerLamp','HelmInteract'], size:[1.21,1.40,.80], budget:15000 },
  'relay-foundry': { nodes: ['FoundryRoot','EntryAnchor','ExitSightline','Gangway','SalvageController','TrackingServo','JournalLog','JournalBlueprint'], size:[15.1,5.2,10.2], budget:150000 },
  'raider-gunboat': { nodes: ['GunboatRoot','GunboatGunYaw','GunboatGunPitch','GunboatMuzzle','WeaponDamageAnchor','EngineDamageAnchor','EngineExhaust','WeaponDisabled','EngineDisabled'], size:[3.6,4.1,9.2], budget:80000 },
  'automatic-collector': { nodes: ['CollectorRoot','DrumPivot','GuidePivot','HookExit','CollectorInteract','ControllerInstalled','BufferLamp'], size:[1.61,1.61,1.61], budget:22000 },
  'automatic-turret': { nodes: ['AutoTurretRoot','TurretYaw','TurretPitch','Muzzle','TrackerHead','PowerLamp','ServoInstalled'], size:[1.41,1.61,1.41], budget:20000 },
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  renderer.setSize(1500,1000); renderer.setPixelRatio(1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  document.body.style.margin='0'; document.body.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#273236');
  const camera = new THREE.PerspectiveCamera(38,1.5,.03,180);
  scene.add(new THREE.HemisphereLight('#dce6ed','#71674f',1.4));
  const sun = new THREE.DirectionalLight('#ffebd2',3.5); sun.position.set(-8,12,7);
  sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=sun.shadow.camera.bottom=-15; sun.shadow.camera.right=sun.shadow.camera.top=15;
  sun.shadow.normalBias=.015; sun.shadow.bias=-.0004; scene.add(sun);
  const fill = new THREE.DirectionalLight('#bdd4df',1.2); fill.position.set(5,7,-5);scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#58605d',roughness:.95}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.3;floor.receiveShadow=true;scene.add(floor);
  const assets = new Map<string,THREE.Group>(), reports:unknown[]=[],errors:string[]=[];
  for (const [id,contract] of Object.entries(contracts)) {
    const loaded=await loadModel(`/models/authored/${id}.glb`);if(!loaded)throw new Error(`${id}: load failed`);
    const root=loaded.scene;root.updateMatrixWorld(true);scene.add(root);assets.set(id,root);root.visible=false;
    let triangles=0,primitives=0; const textures=new Set<THREE.Texture>();
    root.traverse(o=>{if(o instanceof THREE.Mesh){
      o.castShadow=o.receiveShadow=true;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
      primitives+=Math.max(1,o.geometry.groups.length);
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        const s=m as THREE.MeshStandardMaterial;
        for(const t of [s.map,s.normalMap,s.roughnessMap,s.metalnessMap])if(t)textures.add(t);
      }
      if(!o.geometry.attributes.uv)errors.push(`${id}: mesh missing UV`);
      for(const v of o.geometry.attributes.position.array)if(!Number.isFinite(v)){errors.push(`${id}: nonfinite vertex`);break;}
    }});
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()).toArray();
    const markers:Record<string,{world:number[];local:number[];parent:string}>= {};
    for(const name of contract.nodes){
      const node=root.getObjectByName(name);if(!node){errors.push(`${id}: missing ${name}`);continue;}
      markers[name]={world:node.getWorldPosition(new THREE.Vector3()).toArray(),local:node.position.toArray(),parent:node.parent?.name??''};
    }
    for(let i=0;i<3;i++)if(size[i]>contract.size[i])errors.push(`${id}: bounds[${i}] ${size[i]} exceeds ${contract.size[i]}`);
    if(triangles>contract.budget)errors.push(`${id}: triangles exceed budget`);
    reports.push({id,triangles,primitives,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},markers,textures:[...textures].map(t=>({name:t.name,width:t.image.width,height:t.image.height}))});
  }
  const show=(id:string,side='front')=>{
    for(const [name,root] of assets)root.visible=name===id;
    const root=assets.get(id)!;
    root.getObjectByName('WeaponDisabled')?.traverse(o=>o.visible=false);
    root.getObjectByName('EngineDisabled')?.traverse(o=>o.visible=false);
    if(id==='relay-foundry'){camera.position.set(-17,13,-16);camera.lookAt(0,1.5,0);}
    else if(id==='raider-gunboat'){camera.position.set(side==='front'?-9:9,7,side==='front'?-13:12);camera.lookAt(0,1.8,0);}
    else {camera.position.set(side==='front'?2.5:-2.5,2.4,(id==='navigation-helm'?1:-1)*(side==='front'?3.5:-3.5));camera.lookAt(0,.65,0);}
    renderer.render(scene,camera);
  };
  show('navigation-helm');Object.assign(globalThis,{artReady:true,expansionReview:{reports,errors,show,assets,renderer,scene,camera}});
}
main().catch(e=>Object.assign(globalThis,{artError:String(e.stack??e)}));
