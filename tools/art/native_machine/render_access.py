"""Render the editable source in an isolated Blender; no runtime/source edits."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-machine'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadNativeAccess.blend'))
scene=bpy.context.scene
def xyz(p):return Vector((p[0],-p[2],p[1]))
world=bpy.data.worlds.new('Access neutral inspection');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.28,.33,.40,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7;scene.world=world
for name,at,target,power,size in [('Key',(-18,18,-5),(-12,10,0),2800,6),('Fill',(-18,11,4),(-12,11,0),1700,5),('Top',(-8,21,0),(-12,11,0),3800,8)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=xyz(at);obj.rotation_euler=(xyz(target)-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review lens'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.clip_start=.03
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=1280;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.5
for name,at,target,lens in [('access-stairs',(-18,12,-6.5),(-12,10.8,.2),32),('access-treads',(-13.3,11.15,-.5),(-12,10.9,.5),38),('access-support',(-17,10.4,7),(-12.7,11.5,4.5),36)]:
    camera.location=xyz(at);camera.rotation_euler=(xyz(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=lens
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('ACCESS_RENDERS_COMPLETE',flush=True)
