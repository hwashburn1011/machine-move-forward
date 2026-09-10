"""Package the reviewed delivery with reproducible paths and verified ZIP CRCs."""
import json,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/iron-nomad'
manifest=json.loads((OUT/'source/export-manifest.json').read_text())
gltf=json.loads((OUT/'source/gltf-validation.json').read_text())
roundtrip=json.loads((OUT/'source/blender-validation.json').read_text())
browser=json.loads((OUT/'source/browser-validation.json').read_text())
assert len(gltf)==5 and all(r['errors']==0 and r['warnings']==0 and all(r['assertions'].values()) for r in gltf)
assert len(roundtrip)==4 and all(all(r['assertions'].values()) for r in roundtrip)
assert not browser['errors'] and len(browser['reports'])==2
assert all(r['triangles']==manifest[r['quality']]['triangles'] for r in browser['reports'])
for view in ['hero','front','banner','leg','rear','top']:
    assert 'IRON NOMAD RENDER COMPLETE '+view in (OUT/f'render-{view}.log').read_text(),view
assets=[p for p in OUT.rglob('*') if p.is_file() and p.suffix.lower() not in ['.zip','.log','.blend1','.pyc'] and not any(part.endswith('.fbm') for part in p.parts) and p.name not in ['package-manifest.json','.gitignore']]
scripts=[p for p in (ROOT/'tools/art/iron_nomad').iterdir() if p.suffix in ['.py','.mjs'] and p.name!='inspect_scene.py']
files=sorted(assets+scripts)
entries=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
result={'name':'Iron Nomad complete 3D model package','files':entries,'verifiedGLBs':5,'parts':json.loads((OUT/'source/manifest.json').read_text())['parts'],'geometry':manifest}
(OUT/'source/package-manifest.json').write_text(json.dumps(result,indent=2))
package=OUT/'IronNomad_3D_Package.zip'
rootpackage=json.loads((ROOT/'package.json').read_text())
buildpackage={'name':'iron-nomad-art-tools','private':True,'type':'module','devDependencies':{k:rootpackage['devDependencies'][k] for k in ['gltf-validator','meshoptimizer','sharp','@playwright/test']}}
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
    for p in files:z.write(p,p.relative_to(ROOT).as_posix())
    z.write(OUT/'source/package-manifest.json','assets/iron-nomad/source/package-manifest.json')
    z.writestr('package.json',json.dumps(buildpackage,indent=2))
    z.writestr('START_HERE.txt','Open assets/iron-nomad/README.md. Editable model: assets/iron-nomad/source/IronNomad_Master.blend. Viewer: run python -m http.server 5197 --bind 127.0.0.1 --directory assets/iron-nomad then visit http://127.0.0.1:5197/viewer/.\n')
with zipfile.ZipFile(package) as z:assert z.testzip() is None
print(json.dumps({'archive':str(package),'bytes':package.stat().st_size,'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'files':len(files)+3,'crcVerified':True},indent=2))
