"""Refresh the owned review only; used after inspecting assembly transforms."""
import bpy,json,re
from pathlib import Path
from mathutils import Matrix
root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
scene=bpy.data.scenes['MMF_Cohesive_Walker_V3_Assembled']
assembly=json.loads((root/'docs/art/graphics-v3/walker-assembled.json').read_text())
basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
count=0
for obj in scene.objects:
    name=re.sub(r'\.\d+$','',obj.name)
    if obj.type!='EMPTY' or name not in assembly['roots']:continue
    values=assembly['roots'][name]
    matrix=Matrix(tuple(tuple(values[c*4+r] for c in range(4)) for r in range(4)))
    obj.matrix_world=basis@matrix@basis.inverted();count+=1
scene.view_layers[0].update()
bpy.data.libraries.write(str(root/'assets/blender/graphics-v3/walker-review.blend'),{scene},fake_user=True)
print({'posedRoots':count})
