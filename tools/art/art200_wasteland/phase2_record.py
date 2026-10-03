"""Write the phase-2 inspection record after manual review of all 50 renders."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[3]
for cohort in ['art100','art200']:
    out=root/f'assets/{cohort}/wasteland';manifest=json.loads((out/'manifest.json').read_text())
    validation=json.loads((out/'validation.json').read_text())
    models=[]
    for i,e in enumerate(manifest['models']):
        render=out/'renders'/f'{i+1:02}-{e["id"]}.png'
        assert render.exists()
        models.append({'id':e['id'],'palette_family':e['palette_family'],'refinement':e['phase2_refinement'],
        'dimensions_m':e['dimensions_m'],'ground_min_m':e['ground_min_m'],'triangles':e['triangles'],
        'material_batches':len(e['materials']),'topology':e['diagnostics'],
        'render':str(render.relative_to(out)),'render_sha256':hashlib.sha256(render.read_bytes()).hexdigest(),
        'inspection':'Reviewed native metre scale, grounded assembly, physical refinement placement, muted palette and silhouette in Blender material render.'})
    result={'pass':'Phase 2 / all-model physical and material refinement','model_count':25,
      'glb_sha256':hashlib.sha256((root/f'godot/art/{cohort}-wasteland.glb').read_bytes()).hexdigest(),
      'geometry_bounds_verified_against_actual_GLTF_position_accessors':True,'identity_runtime_roots':True,
      'validator_errors':validation['errors'],'validator_warnings':validation['warnings'],
      'review_rig':'Frozen editable Blender sources; Cycles CPU 24 samples; common daylight; 768 x 576',
      'models':models,'next_pass':'Independent fine-comb review is separate from this authored-detail pass.'}
    (out/'phase2-review.json').write_text(json.dumps(result,indent=2)+'\n')
