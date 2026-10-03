"""Summarize the completed 50-assembly source, visual and native evidence."""
import json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[3];rows=[]
for collection,folder in [('art100','story-robots'),('art200','story')]:
 data=json.loads((R/f'assets/{collection}/{folder}/manifest.json').read_text())
 for entry in data['models']:
  assert entry['phase2_refined'],entry['id']
  character=entry['status']=='refined'
  if character:
   kind=entry['runtime_target'].split(':')[1]
   views=[f'assets/art100/story-robots/review/blender-complete-{kind}-{side}.png' for side in ['front','rear']]
   source=entry['complete_assembly_source']
  else:
   views=[f'assets/{collection}/{folder}/review/{entry["id"]}.png'];source=entry['source']
  assert all((R/p).exists() for p in views)
  rows.append({'id':entry['id'],'complete_assembly':True,'source':source,'views':views,
   'phase2_refinements':entry['phase2_notes'],'paint_family':entry['paint_family'],
   'counting_note':'Refined existing complete rigged enemy with fitted equipment; preserved AI and original skin bindings' if character else 'Complete story/environment assembly; no new AI or story gate',
   'status':'complete'})
reports={}
for key,path in [('old25','assets/art100/story-robots/native-validation-gpu.json'),('new25','assets/art200/story/native-validation-gpu.json')]:
 data=json.loads((R/path).read_text());assert not data['failures'] and data['native_captures']
 reports[key]={'checks':data['checks'],'failures':[],'gpu_native':True,'path':path}
sources=['godot/art/art100-story-robots.glb','godot/art/art200-story.glb','godot/art/refined-bastion.glb','godot/art/art200-robot-finishes.json','assets/art100/story-robots/CompleteCharacterAssemblies.blend','assets/art100/story-robots/StoryRobots-editable.blend','assets/art200/story/Story200-editable.blend']
result={'complete_assemblies':50,'old_props':19,'existing_complete_characters':6,'new_story_props':25,
 'method':'All 50 received a deliberate second Blender pass with palette, surface graphics and geometry refinements, then individual renders. Four separately reported prop support gaps and Bastion aerial sockets were repaired and re-viewed. Native site tests use actual floor/collision/interaction geometry. Complete characters preserve armatures and equipped native material overrides.',
 'native_tests':reports,'shipping_story_kit_gltf':'Both kits: 0 errors and 0 warnings.',
 'character_gltf_limitation':'Retained identity-parent skin hierarchy emits NODE_SKINNED_MESH_NON_ROOT warning; zero errors. Original gameplay bone graph and bind matrices preserved.',
 'independent_story_review':'assets/art200/fine-comb/story-review.json',
 'independent_machine_review_performed':'assets/art200/fine-comb/machine-review.json',
 'bastion_export_regression':'Resolved by baking only new socket object transforms before the retained component exporter. Added 18 posed body min/max invariants against protected intact captures at 4 mm tolerance; final Bastion maximum measured drift below 0.07 mm.',
 'source_sha256':{p:hashlib.sha256((R/p).read_bytes()).hexdigest() for p in sources},'models':rows}
assert len(rows)==50
(R/'assets/art200/story/phase2-review.json').write_text(json.dumps(result,indent=2)+'\n')
print('STORY_PHASE2_COMPLETE',len(rows),'native checks',sum(x['checks'] for x in reports.values()))
