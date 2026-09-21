"""Append and inspect the v3 machine through the local Blender MCP connection."""
import bpy, json
from pathlib import Path
from mathutils import Vector

root=Path('C:/Users/hwash/Documents/MachineMoveForward')
out=root/'test-results/nomad-v3-blender'
out.mkdir(parents=True,exist_ok=True)
with bpy.data.libraries.load(str(root/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'),link=False) as (src,dst):
    dst.scenes=[src.scenes[0]]
scene=dst.scenes[0]
scene.name='Nomad v3 expanded decks review'
bpy.context.window.scene=scene
profile=json.loads((root/'src/data/iron-nomad.json').read_text())
sx,sz,sy=profile['scale'];oy=profile['offsetY']
def source(v):return Vector((-v[0]/sx,v[2]/sy,(v[1]-oy)/sz))
def game(v):return Vector((-v.x*sx,v.z*sz+oy,v.y*sy))
scene.view_layers[0].update()
meshes=[]
for obj in scene.objects:
    if obj.type not in ['MESH','CURVE','FONT']:continue
    pts=[game(obj.matrix_world@Vector(v)) for v in obj.bound_box]
    meshes.append((obj,min(p.y for p in pts),max(p.y for p in pts)))
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12
scene.cycles.use_denoising=True;scene.cycles.max_bounces=3
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=1280;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('V3 inspection ambient');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.2,.26,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
for name,at,target,energy,size in [('Key',(-20,42,-22),(0,10,0),15000,20),('Fill',(25,25,0),(0,10,0),10000,20)]:
    data=bpy.data.lights.new('V3 '+name,'AREA');data.energy=energy;data.size=size
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
    obj.location=source(at);obj.rotation_euler=(source(target)-obj.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('V3 review camera',bpy.data.cameras.new('V3 lens'));scene.collection.objects.link(cam);scene.camera=cam
cam.data.lens=40;cam.data.clip_start=.05
for name,at,target,cut in [('exterior',(-38,29,-44),(0,12,0),None),('middle-cutaway',(-22,32,-25),(0,12.7,0),(12.0,15.6)),('lower-open-prow',(1,11,-23),(0,10.2,0),None),('port-stairs',(-25,18,-9),(-12,12.4,0),None)]:
    for obj,low,high in meshes:obj.hide_render=bool(cut and (low>cut[1] or high<cut[0]))
    cam.location=source(at);cam.rotation_euler=(source(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
for obj,_,_ in meshes:obj.hide_render=False
print('V3_BLENDER_REVIEW',str(out),flush=True)
