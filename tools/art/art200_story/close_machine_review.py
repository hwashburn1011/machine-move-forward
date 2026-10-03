"""Record the completed independent visual/geometry review of 50 furnishings."""
import json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art200/fine-comb'
before=json.loads((O/'machine-geometry-independent-before.json').read_text())
after=json.loads((O/'machine-geometry-independent.json').read_text())
specific={
 'nomad-air-filter-tower':'Filter column is supported by a compact mounting shoe on the skid, with a connected inlet cap.',
 'nomad-repair-trestle':'The vise swivel shoe now bears on the workbench through a visible mounting pad.',
 'nomad-archive-vitrine':'All six specimen tubes have seated mounts; the archive label is attached to the cabinet face.',
 'nomad2-instrument-bench':'Oscilloscope case sits on a thin pad; control knobs and indicator have their own shafts/mounts.',
 'nomad2-microscope-bench':'The slide drawer case sits on its thin support pad; microscope foot remains seated.',
 'nomad2-exercise-rack':'Upper dumbbell weights rest on individual small retainers connected to the rack.',
 'nomad-radio-cabinet':'Both speaker units have individual housing backings.',
 'nomad2-clock-rack':'Each of the three clock dials has its own backing connected to its housing.',
 'nomad-field-chair':'Stitched back channels and identifying plate sit close to their supporting surfaces.',
 'nomad-memory-board':'Pinned cards, pins and route thread are seated on the backing board.',
 'nomad-coat-rack':'Chest patch and opening seam sit on the garment rather than ahead of it.',
 'nomad2-map-roll-rack':'Roll numbers are seated on their slots; zero-area ring faces were removed.'}
rows=[]
for collection in ['art100','art200']:
 manifest=json.loads((R/f'assets/{collection}/machine/manifest.json').read_text())
 for index,(id,entry) in enumerate(manifest.items()):
  first=before[id];last=after[id]
  assert last['finite'] and last['degenerate_faces']==0 and not last['support_candidates_4mm'],id
  issues=[]
  for group in first['support_candidates_4mm']:
   issues.append({'type':'component support gap','parts':group['parts'],'before_nearest_gap_m':group['nearest_gap_m'],
    'status':'closed','closure':'Owner added appropriate hardware mounts or seated the raised surface detail. Independently rerun evaluated-component adjacency reaches the base within 4 mm; final visual review shows no exposed floating group.'})
  if first['degenerate_faces']:
   issues.append({'type':'zero-area source faces','before_count':first['degenerate_faces'],'status':'closed',
    'closure':'Removed only degenerate/loose geometry; final evaluated source has zero zero-area faces and the complete silhouette remains intact.'})
  rows.append({'id':id,'collection':collection,'complete_assembly':True,'status':'reviewed_closed',
   'views':[f'assets/{collection}/machine/{id}.png',f'assets/{collection}/machine/contact-sheet-{index//5+1:02d}.png'],
   'visual_checks':['whole-model silhouette and manufactured edge quality','muted finish separation','graphics seating and readability','floor contact and component support'],
   'observation':specific.get(id,'Complete assembly reviewed in the collection panel; coherent muted materials, connected visible hardware and a grounded base. Raised graphics and other support candidates are recorded individually below.'),
   'issues':issues,'final_geometry':{'source':last['source'],'parts':len(last['parts']),'finite':True,'zero_area_faces':0,'support_candidates_4mm':0}})
assert len(rows)==50
report={'reviewer':'Independent story/robot agent reviewing machine-agent output','models_reviewed':50,
 'method':'Viewed all 50 complete assemblies across ten collection sheets, then inspected individual final renders for the six substantive mounting repairs. Independently executed review_machine_geometry.py against both final saved Blender masters. AABB adjacency at 4 mm is a screening test, not a proof of exact mesh intersection. Runtime placement/collision and performance are separate root checks.',
 'initial_evidence':'assets/art200/fine-comb/machine-geometry-independent-before.json',
 'final_evidence':'assets/art200/fine-comb/machine-geometry-independent.json',
 'source_sha256':{p:hashlib.sha256((R/p).read_bytes()).hexdigest() for p in ['assets/art100/machine/NomadFurnishings.blend','assets/art200/machine/NomadLivingArchive.blend']},'models':rows}
(O/'machine-review.json').write_text(json.dumps(report,indent=2)+'\n')
print('MACHINE_REVIEW_CLOSED',len(rows),'issues',sum(len(x['issues']) for x in rows))
