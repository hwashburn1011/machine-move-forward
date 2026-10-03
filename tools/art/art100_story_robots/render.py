"""Neutral native Blender review for all nineteen story prop assemblies."""
import bpy,json,math,sys
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';D=O/'review';D.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(O/'StoryRobots-runtime.blend'))
data=json.loads((O/'manifest.json').read_text())
roots=[bpy.data.objects[m['id']] for m in data['models']]
for r in roots:
 for o in [r,*r.children_recursive]:o.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=680;scene.render.resolution_y=680;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Neutral industrial studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.23,.24,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
scene.view_settings.view_transform='AgX'
mat=bpy.data.materials.new('Review neutral ground');mat.diffuse_color=(.13,.15,.15,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object;floor.data.materials.append(mat)
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
lights=[]
for power,size,at in [(550,4,(2,-3,5)),(330,3,(-3,-1,3)),(430,3,(1,3,4))]:
 bpy.ops.object.light_add(type='AREA',location=at);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;lights.append(light)
for entry,r in zip(data['models'][:19],roots[:19]):
 if '--' in sys.argv and entry['id'] not in sys.argv[sys.argv.index('--')+1:]:continue
 for o in [r,*r.children_recursive]:o.hide_render=False
 lo=entry['bounds_min'];hi=entry['bounds_max'];center=Vector(((lo[0]+hi[0])/2,-(lo[2]+hi[2])/2,(lo[1]+hi[1])/2))
 dims=entry['dimensions_m'];span=max(dims)*1.4
 camera.location=center+Vector((span*.9,-span*1.45,span*.83));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span
 for light in lights:light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(D/(entry['id']+'.png'));bpy.ops.render.render(write_still=True)
 for o in [r,*r.children_recursive]:o.hide_render=True
 print('REVIEW_COMPLETE',entry['id'],flush=True)
