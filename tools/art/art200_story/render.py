"""Neutral Blender CPU review of each complete new story assembly."""
import bpy,json,math,sys
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art200/story';D=O/'review';D.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(O/'Story200-runtime.blend'))
data=json.loads((O/'manifest.json').read_text());roots=[bpy.data.objects[e['id']] for e in data['models']]
for r in roots:
 for o in [r,*r.children_recursive]:o.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=True;scene.cycles.device='CPU'
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=760;scene.render.resolution_y=760;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Neutral overcast art review');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.27,.29,.30,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
scene.view_settings.view_transform='AgX'
mat=bpy.data.materials.new('Neutral review floor');mat.diffuse_color=(.17,.19,.19,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object;floor.data.materials.append(mat)
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
lights=[]
for power,size,at in [(650,4,(2,-3,5)),(390,3,(-3,-1,3)),(490,3,(1,3,4))]:
 bpy.ops.object.light_add(type='AREA',location=at);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;lights.append(light)
for entry,r in zip(data['models'],roots):
 if '--' in sys.argv and entry['id'] not in sys.argv[sys.argv.index('--')+1:]:continue
 for o in [r,*r.children_recursive]:o.hide_render=False
 lo=entry['bounds_min'];hi=entry['bounds_max'];center=Vector(((lo[0]+hi[0])/2,-(lo[2]+hi[2])/2,(lo[1]+hi[1])/2))
 span=max(entry['dimensions_m'])*1.42
 camera.location=center+Vector((span*.95,-span*1.50,span*.78));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span
 for light in lights:light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(D/(entry['id']+'.png'));bpy.ops.render.render(write_still=True)
 for o in [r,*r.children_recursive]:o.hide_render=True
 print('REVIEW_COMPLETE',entry['id'],flush=True)
