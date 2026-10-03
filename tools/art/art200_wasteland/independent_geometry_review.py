"""Read-only bounds, shading and attachment evidence for the cross-author review."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/fine-comb'; OUT.mkdir(exist_ok=True,parents=True)

def record(o, origin=Vector((0,0,0))):
    pts=[o.matrix_world@v.co-origin for v in o.data.vertices]
    lo=[min(v[k] for v in pts) for k in range(3)]
    hi=[max(v[k] for v in pts) for k in range(3)]
    return dict(name=o.name, bounds_blender={'min':lo,'max':hi},
        vertices=len(pts),polygons=len(o.data.polygons),
        smooth_faces=sum(p.use_smooth for p in o.data.polygons),
        custom_normals=o.data.has_custom_normals,
        zero_area_faces=sum(p.area<1e-12 for p in o.data.polygons),
        materials=[m.name for m in o.data.materials if m],
        modifiers=[m.type for m in o.modifiers])

results={}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/art100/legacy/Art100_DesertRefinement.blend'))
for c in bpy.data.collections:c.hide_viewport=False
bpy.context.view_layer.update()
legacy=json.loads((ROOT/'assets/art100/legacy/manifest.json').read_text())
for spec in legacy:
    o=bpy.data.objects[spec['id']]
    parts=list(bpy.data.collections[spec['id']+' editable components'].all_objects)
    results[spec['id']]={'runtime':record(o,o.location),
        'components':[record(p,o.location) for p in parts if p.type=='MESH']}

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/art200/signs/Art200_Advertising-editable.blend'))
bpy.context.view_layer.update()
signs=json.loads((ROOT/'assets/art200/signs/manifest.json').read_text())['models']
for spec in signs:
    root=bpy.data.objects[spec['id']]
    results[spec['id']]={'components':[record(p,root.location) for p in root.children_recursive if p.type=='MESH']}
(OUT/'legacy-signs-geometry.json').write_text(json.dumps(results,indent=2))
print('READ_ONLY_GEOMETRY',len(results),sum(len(r['components']) for r in results.values()),flush=True)
