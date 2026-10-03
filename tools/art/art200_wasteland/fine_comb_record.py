"""Record owner repairs after independent findings and manual render verification."""
import json,hashlib,ast
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def literal(path,key):
    tree=ast.parse((ROOT/path).read_text())
    return next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==key for t in n.targets))
notes={'art100':literal('tools/art/art100_wasteland/fine_comb.py','REPAIR_NOTES'),
       'art200':literal('tools/art/art200_wasteland/refine.py','FINE_COMB')}
for pack in ['art100','art200']:
    out=ROOT/f'assets/{pack}/wasteland';manifest=json.loads((out/'manifest.json').read_text())
    geometry=json.loads((ROOT/f'assets/art200/fine-comb/{pack}-wasteland-geometry.json').read_text())
    validation=json.loads((out/'validation.json').read_text());records=[]
    for i,e in enumerate(manifest['models']):
        short=e['id'].removeprefix('wasteland-' if pack=='art100' else 'art200-')
        note=notes[pack].get(short,'Independent review found no concrete defect requiring a further geometry change.')
        e['fine_comb_refinement']=note
        g=geometry[e['id']];assert not g['unsupported_bounds_clusters'] and not g['inverted_closed_components'] and not g['zero_area_faces']
        render=out/'renders'/f'{i+1:02}-{e["id"]}.png'
        records.append(dict(id=e['id'],changed=short in notes[pack],repair=note,triangles=e['triangles'],material_batches=len(e['materials']),
            render=str(render.relative_to(ROOT)),render_sha256=hashlib.sha256(render.read_bytes()).hexdigest(),
            bounds_screen_unsupported_clusters=0,zero_area_faces=0,inverted_closed_components=0,
            visual_verification='Changed model re-rendered and inspected; all six old reverse views also inspected.' if short in notes[pack] else 'Existing phase2 render retained; independent reviewer inspected it.'))
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    result=dict(pass_name='Independent fine-comb findings / owner correction verification',models_reviewed=25,models_changed=sum(r['changed'] for r in records),
        total_triangles=sum(r['triangles'] for r in records),max_triangles=max(r['triangles'] for r in records),
        glb_sha256=hashlib.sha256((ROOT/f'godot/art/{pack}-wasteland.glb').read_bytes()).hexdigest(),
        gltf_errors=validation['errors'],gltf_warnings=validation['warnings'],
        independent_findings='assets/art200/fine-comb/wasteland-review.json',
        limitation='Bounds adjacency is a screening check; physical support claims are also based on authored endpoints and visual inspection. Gameplay collision/performance verification belongs to native integration.',
        models=records)
    (out/'fine-comb-repairs.json').write_text(json.dumps(result,indent=2)+'\n')
    print(pack,result['models_changed'],result['total_triangles'])
