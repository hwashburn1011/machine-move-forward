import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3];out=root/'assets/gunner-s07';scene=bpy.context.scene
for name in ['Wind-shaped shredded shoulder cloak','Layered folded neck scarf']:
 o=bpy.data.objects[name];points=[o.matrix_world@v.co for v in o.data.vertices];print(name,[[min(p[i] for p in points),max(p[i] for p in points)]for i in range(3)],flush=True)
scene.camera=bpy.data.objects['04 • Helmet study'];scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.cycles.samples=48;scene.render.filepath=str(out/'preview'/'helmet_draft.png');bpy.ops.render.render(write_still=True)
