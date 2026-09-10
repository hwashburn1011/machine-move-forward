"""Package only final deliverables; exclude temporary imports and engine caches."""
from pathlib import Path
import json,hashlib,zipfile
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07'
assert json.loads((OUT/'source/unreal_validation.json').read_text())['status']=='success'
assert all(r['errors']==0 and r['warnings']==0 for r in json.loads((OUT/'source/gltf_validation.json').read_text()))
files=[OUT/'README.md',OUT/'REFERENCE.md',OUT/'reference/gunner.png',OUT/'unreal/S07Preview.uproject',OUT/'unreal/Config/DefaultEngine.ini']
files+=list((OUT/'exports').glob('*.glb'))+list((OUT/'exports').glob('*.fbx'))+list((OUT/'textures').glob('*.png'))
files+=[OUT/'source'/f for f in ['S07_Gunner.blend','S07_Engine_Setup.blend','asset_manifest.json','gltf_validation.json','roundtrip_validation.json','unreal_validation.json','tangent_cleanup.json']]
files+=[OUT/'preview'/f for f in ['01_S07_reference_pose.png','02_S07_neutral_front.png','03_S07_back_equipment.png','04_S07_helmet_detail.png']]
files+=list((OUT/'unreal/Content/S07_Ready').rglob('*.uasset'))
files+=[p for p in (OUT/'viewer').rglob('*') if p.is_file()]
entries=[]
for p in files:
 assert p.is_file(),p
 entries.append({'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
zip_path=OUT/'S07_Gunner_Package.zip'
with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for p in files:archive.write(p,p.relative_to(OUT).as_posix())
 archive.writestr('PACKAGE_CONTENTS.json',json.dumps(entries,indent=2))
with zipfile.ZipFile(zip_path) as archive:
 bad=archive.testzip();assert bad is None,bad
info={'file':zip_path.name,'files':len(files)+1,'bytes':zip_path.stat().st_size,'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest(),'verified_crc':True}
(OUT/'source/package_info.json').write_text(json.dumps(info,indent=2),encoding='utf-8');print(json.dumps(info),flush=True)
