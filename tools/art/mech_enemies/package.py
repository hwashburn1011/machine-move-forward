"""Package only completed, verified deliverables; no caches or old Blender backups."""
from pathlib import Path
import json,hashlib,zipfile
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies'
checks=json.loads((OUT/'source/gltf_validation.json').read_text())
assert len(checks)==32 and all(r['errors']==0 and r['warnings']==0 for r in checks)
roundtrip=json.loads((OUT/'source/roundtrip_validation.json').read_text())
assert len(roundtrip)==16 and all(r['finite'] for r in roundtrip)
browser=json.loads((OUT/'source/browser_validation.json').read_text());assert browser['status']=='passed' and len(browser['reports'])==16
files=[OUT/'README.md',OUT/'REFERENCE.md']
for folder in ['exports','optimized','textures','reference','viewer']:
    files.extend(p for p in (OUT/folder).rglob('*') if p.is_file() and '.fbm' not in ''.join(p.suffixes) and not any(x.endswith('.fbm') for x in p.parts))
files.extend(p for p in (OUT/'source').iterdir() if p.suffix in ['.blend','.json'] and p.name!='package_info.json')
files.extend(p for p in (OUT/'preview').glob('*.png') if not p.name.endswith('_browser.png') and p.name!='wireframe.png')
files=sorted(set(files));archive=OUT/'Mech_Enemy_Collection.zip'
inventory=[{'file':str(p.relative_to(OUT)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
    for p in files:z.write(p,p.relative_to(OUT))
    z.writestr('FILE_MANIFEST.json',json.dumps(inventory,indent=2))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
result={'archive':archive.name,'files':len(files)+1,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'zip_crc':'passed'}
(OUT/'source/package_info.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
