"""Record completed Art200 checks against the current immutable runtime files."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
project=ROOT/'godot';paths=[project/'project.godot']
for folder in ['scripts','data','scenes','shaders']:
    paths.extend(p for p in (project/folder).rglob('*') if p.is_file() and p.suffix in {'.gd','.json','.tscn','.gdshader'})
files=sorted(('res://'+p.relative_to(project).as_posix(),p) for p in paths)
fingerprint=hashlib.sha256(''.join(n+'\n'+hashlib.sha256(p.read_bytes()).hexdigest()+'\n' for n,p in files).encode()).hexdigest()
subprocess.run([sys.executable,str(ROOT/'tools/art/art200_catalog_validate.py')],cwd=ROOT,check=True)
catalog=read('assets/art200/catalog.json');gallery=read('assets/art200/gallery-audit.json')
validation=read('assets/art200/validation.json');suites=read('test-results/narrative-regressions/summary.json')
assert catalog['count']==200 and catalog['new_this_iteration']==catalog['existing_refined']==100
character_ids={'enemy-warden':'WardenRangefinder','enemy-revenant':'RevenantPulseRack','enemy-sovereign':'SovereignComms','enemy-bastion':'BastionSiegeRadiator','enemy-raider':'RaiderRecoveryPack','enemy-scavenger':'ScavengerSurveyPack'}
catalog_ids=[character_ids.get(m['id'],m['id']) for m in catalog['models']]
gallery_ids=[m['id'] for m in gallery['records']]
assert len(catalog_ids)==len(set(catalog_ids))==len(gallery_ids)==len(set(gallery_ids))==200
assert set(catalog_ids)==set(gallery_ids)
assert gallery['whole_assembly_count']==200 and gallery['complete_characters']==6
assert gallery['overlapping_gallery_footprints']==0 and gallery['grounded']
assert validation['passed'] and len(validation['packs'])==8
collision=read('godot/data/scenery-collision.json')
assert len(collision['models'])==125 and collision['backface_collision']
for model in collision['models'].values():
    assert sha('godot/'+model['source'].removeprefix('res://'))==model['source_sha256']
    assert sum(chunk['triangles'] for chunk in model['chunks'])==model['triangles']
    for chunk in model['chunks']:
        assert chunk['triangles']<=collision['triangles_per_chunk']
        assert sha('godot/'+chunk['path'].removeprefix('res://'))==chunk['shape_sha256']
for p in validation['packs']:
    assert sha(p['path'])==p['sha256'],p['path']
    key=Path(p['path']).stem
    assert p['sha256']==gallery['runtime_sha256'][key if key.startswith('art200-') else key.removeprefix('art100-')]
assert len(suites)==26 and len({s['suite'] for s in suites})==26
for s in suites:
    logpath=f"test-results/narrative-regressions/{s['suite']}-output.txt"
    log=(ROOT/logpath).read_text(encoding='utf-8')
    s['diagnostics']=[l for l in log.splitlines() if l.startswith(('WARNING:','ERROR:','SCRIPT ERROR:','FAIL '))]
    s['output']=logpath
    assert s['exit_code']==0 and not s['failures'] and not s['diagnostics'],s
    assert s['checks']>0 and s['source_hash']==s['source_hash_end']==fingerprint,s['suite']
reviews={};review_ids=[]
for name in ['legacy-signs','wasteland','machine','story']:
    path=f'assets/art200/fine-comb/{name}-review.json';r=read(path)
    assert r['models_reviewed']==50,name
    ids=[m['id'] for m in r['models']]
    assert len(ids)==len(set(ids))==50,name
    review_ids.extend(ids)
    assert not any(i.get('status') in ['reported_to_owner','open','pending','changes_requested'] for m in r['models'] for i in m.get('issues',[])),name
    assert not any(m.get('status') in ['changes_requested','pending','reported_to_owner'] or m.get('geometry_status')=='changes_requested' for m in r['models']),name
    reviews[name]={'path':path,'sha256':sha(path),'models_reviewed':50}
assert len(review_ids)==len(set(review_ids))==200 and set(review_ids)==set(catalog_ids)
performance=read('test-results/art200/performance/comparison.json')
assert performance['source_hash']==fingerprint and len(performance['scenarios'])==13
timing_runs=read('test-results/art200/performance/final-summary.json')
assert len(timing_runs)==13 and len({r['scenario'] for r in timing_runs})==13
assert all(r['exit_code']==0 and not r['diagnostics'] and r['source_hash']==fingerprint for r in timing_runs)
for path,digest in read('test-results/art200/performance/final-asset-hashes.json').items():
    assert sha(path)==digest,path
assert 'streaming' in performance and 'autosave' in performance
assert performance['streaming']['source_hash']==fingerprint
assert performance['autosave']['source_hash']==fingerprint
assert all(v['validCampaign'] for v in performance['autosave']['scenarios'].values())
assert performance['streaming']['final']['sceneryCollisionCache']<=32
native=read('test-results/art200/native/review.json')
assert len(native['captures'])==12
assert native['source_hash']==fingerprint
catalog_validation=read('test-results/art200/catalog-validation.json')
assert catalog_validation['models']==200 and catalog_validation['sources_images_and_static_links_exist'] and catalog_validation['gallery_matches_eight_runtime_hashes']
opened=read('test-results/art200/gallery-open.json')
assert opened['status']=='success',opened
assert opened['result']['executed'],opened
live_records=[json.loads(line) for line in opened['result']['result'].splitlines() if line.startswith('{')]
assert len(live_records)==1,opened
live=live_records[0]
assert Path(live['file']).resolve()==(ROOT/'assets/art200/Art200Review.blend').resolve()
assert live['whole_assemblies']==200 and Path(live['preserved_session']).is_file()
report={'iteration':'Art200','generated_utc':datetime.now(timezone.utc).isoformat(),'passed':True,
 'models':{'total_reviewed':200,'new':100,'existing_refined':100,'cohorts':gallery['cohorts'],'counting':catalog['counting'],'palette_families':len(read('assets/art200/palette.json')['families'])},
 'runtime_source_sha256':fingerprint,'runtime_packages':validation['packs'],'total_package_bytes':sum(p['bytes'] for p in validation['packs']),
 'scenery_collision_bake':{'manifest':'godot/data/scenery-collision.json','sha256':sha('godot/data/scenery-collision.json'),'models':len(collision['models']),'method':collision['method']},
 'geometry_accounting':'The eight packages contain200 roots including six fitted robot equipment kits. The complete-character gallery counts each equipment kit with its retained body and rig as one assembly, never as two models.',
 'additional_refined_character':{'path':'godot/art/refined-bastion.glb','sha256':sha('godot/art/refined-bastion.glb'),'compiled_sha256':sha('godot/art/refined-bastion.scn'),'change':'Two head-bound antenna sockets; original rigs, skins and weapon bindings retained.','validator':'assets/art100/story-robots/bastion-socket-gltf-validation.json','retained_validator_warning':'NODE_SKINNED_MESH_NON_ROOT: original identity-parent skin hierarchy retained; native absolute-position and animation checks verify the compiled character.'},
 'fine_comb_reviews':reviews,'suites_passed':len(suites),'checks_passed':sum(s['checks'] for s in suites),'suites':suites,
 'performance':performance,'native_render_review':native,'catalog_validation':catalog_validation,
 'gallery':{'path':'assets/art200/Art200Review.blend','audit':'assets/art200/gallery-audit.json','live_blender_result':opened},
 'baseline_archive':read('assets/art200/baseline-archive.json'),
 'scope':['Native Godot art iteration;100 additional complete assemblies plus a refinement and independent fine-comb pass across all200.','Fifty buildable furnishings are cosmetic; story fixtures add environmental context to existing campaign progression.','The six active enemy characters retain existing AI/animation roles; new dormant robots are story props.','Nearby scenery collision follows visible geometry and keeps open gaps; terrain traversal rules remain unchanged.','Performance evidence is limited to the recorded hardware, workloads, durations and stress fixtures.','Full V1 beta acceptance remains a separate milestone.']}
destination=ROOT/'docs/godot-port/results/art200-2026-10-02.json'
destination.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
(ROOT/'test-results/art200/regressions-final.json').write_text(json.dumps(suites,indent=2)+'\n')
print(json.dumps({'report':str(destination),'models':200,'new':100,'suites':len(suites),'checks':report['checks_passed'],'performance':performance['summary']}))
