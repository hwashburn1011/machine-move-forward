"""Front and rear studio review of six complete original rigged assemblies."""
import bpy,json,sys
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';D=O/'review'
bpy.ops.wm.open_mainfile(filepath=str(O/'CompleteCharacterAssemblies.blend'))
entries=json.loads((O/'manifest.json').read_text())['models'][19:];roots=[bpy.data.objects[e['complete_assembly_root']] for e in entries]
for root in roots:
 for obj in [root,*root.children_recursive]:obj.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=760;scene.render.resolution_y=880;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Complete character neutral review');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.27,.29,.30,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.view_settings.view_transform='AgX'
mat=bpy.data.materials.new('Neutral character review ground');mat.diffuse_color=(.17,.19,.19,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object;floor.data.materials.append(mat)
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
lights=[]
for power,size,at in [(650,4,(2,-3,5)),(390,3,(-3,-1,3)),(490,3,(1,3,4))]:
 bpy.ops.object.light_add(type='AREA',location=at);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;lights.append(light)
for entry,root in zip(entries,roots):
 if '--' in sys.argv and entry['runtime_target'].split(':')[1] not in sys.argv[sys.argv.index('--')+1:]:continue
 root.location.x=0
 for obj in [root,*root.children_recursive]:obj.hide_render=bool(obj.get('review_rig_helper',False))
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 pts=[]
 for obj in root.children_recursive:
  if obj.type!='MESH' or obj.get('review_rig_helper'):continue
  evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
  pts.extend(evaluated.matrix_world@v.co for v in mesh.vertices);evaluated.to_mesh_clear()
 lo=Vector(tuple(min(p[k] for p in pts) for k in range(3)));hi=Vector(tuple(max(p[k] for p in pts) for k in range(3)));center=(hi+lo)/2;span=max(hi-lo)*1.36
 floor.location.z=lo.z-.006
 for view,direction in [('front',Vector((.85,-1.5,.48))),('rear',Vector((-.85,1.5,.48)))]:
  camera.location=center+direction*span;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span
  for light in lights:light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=str(D/('blender-complete-'+entry['runtime_target'].split(':')[1]+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
 for obj in [root,*root.children_recursive]:obj.hide_render=True
 print('REVIEW_COMPLETE_CHARACTER',entry['id'],flush=True)
