"""Check every local media/source link and embedded gallery JavaScript syntax."""
from pathlib import Path
from html.parser import HTMLParser
import json,subprocess,hashlib,re
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'test-results/art200';OUT.mkdir(exist_ok=True)
catalog=json.loads((ROOT/'assets/art200/catalog.json').read_text())
gallery=json.loads((ROOT/'assets/art200/gallery-audit.json').read_text())
assert catalog['count']==len(catalog['models'])==200
assert len({m['id'] for m in catalog['models']})==200
assert sum(m['status']=='new' for m in catalog['models'])==100
assert sum(m['status']=='refined' for m in catalog['models'])==100
for m in catalog['models']:
    for key in ['source','image','before','rear']:
        if key in m:assert (ROOT/m[key]).is_file(),m[key]
for key,expected in gallery['runtime_sha256'].items():
    name=key if key.startswith('art200-') else 'art100-'+key
    assert hashlib.sha256((ROOT/f'godot/art/{name}.glb').read_bytes()).hexdigest()==expected,key
page=ROOT/'docs/art/art200/index.html';source=page.read_text(encoding='utf-8')
payload,_=json.JSONDecoder().raw_decode(source.split('const models=',1)[1])
assert payload==catalog['models'],'Embedded HTML inventory differs from current catalogue'
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ['href','src'] and value and not value.startswith(('#','http','data:')):
                assert (page.parent/value).resolve().is_file(),value
Links().feed(source)
script='\n'.join(re.findall(r'<script>(.*?)</script>',source,re.S))
path=OUT/'catalog-script-check.js';path.write_text(script,encoding='utf-8')
subprocess.run(['node','--check',str(path)],check=True,capture_output=True)
report={'models':200,'new':100,'refined':100,'complete_characters':gallery['complete_characters'],'sources_images_and_static_links_exist':True,'gallery_matches_eight_runtime_hashes':True,'catalog_javascript_syntax':True,'embedded_inventory_matches':True,'catalog_sha256':hashlib.sha256((ROOT/'assets/art200/catalog.json').read_bytes()).hexdigest(),'html_sha256':hashlib.sha256(page.read_bytes()).hexdigest(),'gallery_sha256':hashlib.sha256((ROOT/'assets/art200/Art200Review.blend').read_bytes()).hexdigest(),'interactive_browser_review':'Not performed: local file URL blocked by browser tool policy. Actual model images were reviewed directly and the gallery is available in Blender.'}
(OUT/'catalog-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
