"""Narrow editable-master counterpart of patch_wake_roof.py; no full re-export."""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
source=ROOT/'assets/blender/graphics-v2/expedition-wreck.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
obj=bpy.data.objects['Wreck_BrokenRoof_Geometry'];bm=bmesh.new();bm.from_mesh(obj.data)
pending=set(bm.verts);shifted=[]
while pending:
    todo=[pending.pop()];group=[]
    while todo:
        v=todo.pop();group.append(v)
        for edge in v.link_edges:
            other=edge.other_vert(v)
            if other in pending:pending.remove(other);todo.append(other)
    points=[obj.matrix_world@v.co for v in group]
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    # Blender Y=-game Z, Blender Z=game Y.
    sheet=abs(lo[1]-5.25)<2e-5 and abs(hi[1]-6.95)<2e-5 and abs(lo[2]-3.5125)<2e-5
    rib=abs(lo[1]-5.21)<2e-5 and abs(hi[1]-6.99)<2e-5 and abs(lo[2]-3.435)<2e-5
    if sheet or rib:
        for v in group:v.co.z+=.1525
        shifted.append({'part':'sheet' if sheet else 'rib','vertices':len(group)})
assert len(shifted)==6 and sum(p['part']=='sheet' for p in shifted)==1,shifted
bm.to_mesh(obj.data);bm.free();obj.data.update()
obj['supportedRoofLapM']=.1525
bpy.context.preferences.filepaths.save_version=0  # Exact input is already in roof-before.zip.
bpy.ops.wm.save_as_mainfile(filepath=str(source))
(ROOT/'test-results/roof-floor/wake/roof-master-repair.json').write_text(json.dumps({'changed':shifted,'onlyChange':'Translate one existing sheet and its five ribs +0.1525 game Y'},indent=2)+'\n')
