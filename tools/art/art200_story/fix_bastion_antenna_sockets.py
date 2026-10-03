"""Support the two original aerials on their unchanged original head binding."""
import bpy,ast,math,shutil,json
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[3];path=R/'assets/native-character-refinement/bastion-components.blend'
backup=R/'assets/art100/story-robots/art200-before/bastion-components.blend'
if not backup.exists():shutil.copy2(path,backup)
bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.preferences.filepaths.save_version=0
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mat=bpy.data.objects['Cranial stub antenna'].data.materials[0]
tree=ast.parse((R/'tools/art/art100_story_robots/build.py').read_text())
for fn in tree.body:
 if isinstance(fn,ast.FunctionDef) and fn.name in {'xyz','finish','tube'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'<retained primitive>','exec'))
added=[]
for x in [-.125,.125]:
 name='Retained cranial aerial socket '+('port' if x<0 else 'starboard')
 if bpy.data.objects.get(name):continue
 obj=tube(name,(x,1.875,-.070),(x,1.929,-.070),.028,mat,rig,24)
 # All new socket vertices use the exact existing head group. No original
 # vertex, rest transform, inverse bind, animation or weapon is changed.
 group=obj.vertex_groups.new(name='head');group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
 mod=obj.modifiers.new('Original retained head binding','ARMATURE');mod.object=rig
 added.append(name)
# The retained component exporter joins onto the first part and requires every
# component's geometry to already be in the rig's identity coordinate frame.
# Newly authored primitives still have an object translation; bake only those
# two transforms, retaining the original body vertices and rig untouched.
for obj in rig.children:
 if not obj.name.startswith('Retained cranial aerial socket '):continue
 matrix=obj.matrix_world.copy();obj.data.transform(matrix);obj.matrix_world=Matrix.Identity(4)
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
(R/'assets/art100/story-robots/bastion-socket-fix.json').write_text(json.dumps({'original_antenna_gap_m':.01458257,'added_components':[o.name for o in rig.children if o.name.startswith('Retained cranial aerial socket ')],'binding':'head','original_component_vertices_changed':False,'new_component_transforms_baked':True,'source':str(path.relative_to(R))},indent=2)+'\n')
print('BASTION_AERIAL_SOCKETS',added)
