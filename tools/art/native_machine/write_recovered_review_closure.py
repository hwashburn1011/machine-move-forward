"""Record the completed native visual inspection without changing any captures."""
from pathlib import Path
import hashlib,json,struct
R=Path(__file__).resolve().parents[3]
OUT=R/'test-results/deck-audio';A=R/'assets/native-recovered-modules'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
data=(R/'godot/art/nomad-recovered-modules.glb').read_bytes()
length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length])
totals={'base':{'triangles':0,'batches':0},'folded':{'triangles':0,'batches':0},'deployed':{'triangles':0,'batches':0}}
def walk(index,mode='base'):
 n=gltf['nodes'][index]
 if n.get('name')=='FoldedGuide':mode='folded'
 if n.get('name')=='ExtendedJib':mode='deployed'
 if 'mesh' in n:
  mesh=gltf['meshes'][n['mesh']];totals[mode]['batches']+=len(mesh['primitives'])
  totals[mode]['triangles']+=sum(gltf['accessors'][p['indices']]['count']//3 for p in mesh['primitives'])
 for child in n.get('children',[]):walk(child,mode)
walk(next(i for i,n in enumerate(gltf['nodes']) if n.get('name')=='salvage-crane'))
counts={mode:{key:totals['base'][key]+totals[mode][key] for key in ['triangles','batches']} for mode in ['folded','deployed']}
observations={
 'quiet-drive-service':'Controls and legible plate face the D1 service approach. Cooling ribs, captured screws, gauge and motor cradle are fitted and grounded.',
 'quiet-drive-reverse':'Bellows, bearing pedestal, cross-drive coupling and floor gland join the gearbox and motor on supported feet.',
 'quiet-drive-context':'The authored drive occupies the flush D1 connection while the surrounding lower deck remains open.',
 'battery-bank-service':'Three insulated cells, breaker controls, charge scale and lower legend are mounted on one grounded service skid.',
 'battery-bank-reverse':'Compression bands, ceramic terminal seats and supported protective hoods remain coherent from the rear.',
 'battery-bank-context':'The D2 power connection sits beside existing service machinery with a clear approach and open floor.',
 'salvage-crane-service':'Inboard console, counterweight, mast and grounded bearing brackets form a supported assembly; the jib points outboard.',
 'salvage-crane-outboard':'Close view confirms winch cheeks, reeved drum, cylinder, clevis and stowed grapple are fitted; the complete jib is covered in the next dedicated view.',
 'salvage-crane-context':'The narrow deployed jib clears the starboard rail and the old floor plate remains readable at the base.',
 'salvage-crane-deployed-jib':'Pinned rise, overlapping telescopic sections, seated rivets, locking collars and terminal sheave are continuously connected.',
 'salvage-crane-ground-catch':'The actual heavy-cargo model is caught from a shader-matched dune trough, with a real gameplay cable clearing the deck edge.',
 'salvage-crane-live-fairlead':'The live cable attaches at the bottom of the final sheave, with no floating cable endpoint or detached visual guide.',
 'salvage-crane-mid-hoist':'The real cargo rises along the working cable outside the railing. The transaction subsequently delivers exactly 48 scrap, 8 components and 4 fuel.',
 'salvage-crane-legacy-folded':'Off-bay legacy mode hides the extended jib and keeps the original compact guide and cable origin; the deployed D3 mode is visible separately behind it.'}
capture=json.loads((OUT/'native-recovered/recovered-module-captures.json').read_text())
test=json.loads((OUT/'recovered-module-models.json').read_text())
support=json.loads((A/'source-support-review.json').read_text())
validation=json.loads((A/'gltf-validation.json').read_text())
assert capture['passed'] and test['passed']
assert all(not v['support_candidates_4mm'] and v['zero_area_faces']==0 for v in support.values())
closure={'passed':True,'humanAcceptance':False,'reviewer':'art100_machine agent','scope':'Final authored recovered-module models, compatible folded/deployed modes and actual grounded-freight native cable inspection. Layout fixtures do not claim earned campaign progression.','sourceHashAtCapture':capture['sourceHash'],'glbSha256':capture['glbSha256'],'blendSha256':sha(A/'NomadRecoveredModules.blend'),'nativeChecks':test['checks'],'sourceSupportScreen':'4 mm evaluated attachment graph: all four configurations have zero unsupported groups, zero nonfinite vertices and zero source degenerate faces.','gltf':{'errors':validation['issues']['numErrors'],'warnings':validation['issues']['numWarnings'],'info':'Seven intentional empty assembly/pivot nodes.'},'craneVisibleGeometry':counts,'liveHoist':capture['operation'],'views':[{'name':v['name'],'result':'pass','observation':observations[v['name']],'sha256':sha(OUT/'native-recovered'/(v['name']+'.png'))} for v in capture['captures']],'diagnosticsPreserved':['recovered-modules-unpowered-diagnostic.zip','recovered-modules-trough-diagnostic.zip','native-recovered/diagnostic/']}
(OUT/'recovered-module-visual-closure.json').write_text(json.dumps(closure,indent=2)+'\n')
composition=json.loads((OUT/'composition-visual-closure.json').read_text())
new_capture=json.loads((OUT/'native/composition-captures.json').read_text())
composition['sourceHashAtCapture']=new_capture['sourceHash'];composition['layoutSha256AtCapture']=new_capture['layoutSha256']
composition['compiledSceneSha256']=sha(R/'godot/art/nomad-native.scn')
composition['refinedModulesSha256']=capture['glbSha256'];composition['priorReviewArchive']='composition-before-recovered-refinement.zip'
for view in composition['views']:
 view['sha256']=sha(OUT/'native'/(view['name']+'.png'))
 if view['name'].startswith('connection-fixture-'):
  id=view['name'].removeprefix('connection-fixture-')
  view['observation']=observations[id+'-context']
(OUT/'composition-visual-closure.json').write_text(json.dumps(composition,indent=2)+'\n')
print(json.dumps({'craneVisibleGeometry':counts,'nativeChecks':test['checks'],'views':len(closure['views']),'glbSha256':capture['glbSha256']}))
