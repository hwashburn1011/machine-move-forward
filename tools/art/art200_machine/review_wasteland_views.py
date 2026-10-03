"""Independent review cameras; opens a saved source without saving it back."""
import bpy, json, sys
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/fine-comb'
S=bpy.context.scene
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=12;S.cycles.use_denoising=True
S.render.resolution_x=900;S.render.resolution_y=650;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=.8
S.world=bpy.data.worlds.new('Independent support review daylight');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.7,.8,1);S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.9
models={o.name:o for o in bpy.data.objects if o.type=='MESH'}
for ob in models.values():ob.hide_render=True;ob.location=(0,0,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object
ma=bpy.data.materials.new('Review floor');ma.diffuse_color=(.28,.28,.26,1);floor.data.materials.append(ma)
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.4,-.5,-.4);sun.data.energy=2;sun.data.angle=.16
bpy.ops.object.light_add(type='AREA',location=(0,5,12));area=bpy.context.object;area.data.energy=1600;area.data.size=8
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';S.camera=cam
choices={
 'wasteland-diner':((-1,1.7,.42),.4),
 'wasteland-greenhouse':((-1,1.5,.45),.4),
 'wasteland-passenger-coach':((1,-1.5,.24),.45),
 'wasteland-solar-farm':((-1,1.5,.36),.4),
 'wasteland-tunnel':((-1,1.6,.65),.5),
 'wasteland-freight-bogie':((1,1.5,.3),.43),
}
if '--' in sys.argv:
 wanted=sys.argv[sys.argv.index('--')+1:]
 if wanted:choices={k:v for k,v in choices.items() if k in wanted}
for key,(angle,height) in choices.items():
 ob=models[key];ob.hide_render=False
 vs=[v.co for v in ob.data.vertices];lo=Vector(tuple(min(v[i]for v in vs)for i in range(3)));hi=Vector(tuple(max(v[i]for v in vs)for i in range(3)));size=hi-lo
 target=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z+size.z*height))
 cam.location=target+Vector(angle).normalized()*max(size)*3;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(size.x*1.12,size.y*1.3,size.z*1.7)*1.16
 area.location=target+Vector((-4,6,10));area.rotation_euler=(target-area.location).to_track_quat('-Z','Y').to_euler()
 S.render.filepath=str(OUT/(key+'-reverse.png'));bpy.ops.render.render(write_still=True);ob.hide_render=True
