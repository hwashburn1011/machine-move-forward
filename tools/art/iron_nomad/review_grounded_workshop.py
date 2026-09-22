"""Non-destructive Blender MCP inspection of the playable master."""
import bpy, json, math, os
from pathlib import Path
from mathutils import Vector

root = Path('C:/Users/hwash/Documents/MachineMoveForward')
out = root / 'test-results/grounded-workshop-blender'
out.mkdir(parents=True, exist_ok=True)
with bpy.data.libraries.load(str(root / 'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'), link=False) as (src, dst):
    dst.scenes = [src.scenes[0]]
scene = dst.scenes[0]
scene.name = 'Nomad physical detail inspection'
bpy.context.window.scene = scene
profile = json.loads((root / 'src/data/iron-nomad.json').read_text())
sx, sz, sy = profile['scale']; oy = profile['offsetY']
def source(v): return Vector((-v[0]/sx, v[2]/sy, (v[1]-oy)/sz))
def game(v): return Vector((-v.x*sx, v.z*sz+oy, v.y*sy))
scene.view_layers[0].update()
rows = []
for obj in scene.objects:
    if obj.type not in ['MESH','CURVE','FONT']: continue
    points = [game(obj.matrix_world @ Vector(v)) for v in obj.bound_box]
    ancestry=[]; parent=obj.parent
    while parent: ancestry.append(parent.name); parent=parent.parent
    rows.append({'name':obj.name,'parents':ancestry,'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]})
(out/'mesh-bounds.json').write_text(json.dumps(rows,indent=2))
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
scene.cycles.use_denoising=True;scene.cycles.max_bounces=3
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=1280;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=1.1
scene.world=bpy.data.worlds.new('Nomad detail inspection ambient');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.40,.47,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,at,target,energy,size in [('Key',(-20,42,-22),(0,10,0),25000,20),('Fill',(25,30,0),(0,10,0),22000,20),('Rear',(0,30,25),(0,12,0),17000,15)]:
    data=bpy.data.lights.new('Inspection '+name,'AREA');data.energy=energy;data.size=size
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
    obj.location=source(at);obj.rotation_euler=(source(target)-obj.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('Inspection camera',bpy.data.cameras.new('Inspection lens'));scene.collection.objects.link(cam);scene.camera=cam
cam.data.lens=42;cam.data.clip_start=.05
views=[
 ('fore-controls',(3,14.5,-6),(-3,13.6,-11),None),
 ('starboard-controls',(5,14.5,-6),(9.5,13.4,-10),None),
 ('port-machinery',(-3,14.5,-4),(-9.5,13.5,-7),None),
 ('aft-braces',(17,15.1,18),(9.8,14.5,10),None),
]
for name,at,target,cut in views:
    for row in rows:
        obj=scene.objects.get(row['name'])
        obj.hide_render=bool(cut and (row['min'][1]>cut[1] or row['max'][1]<cut[0]))
    cam.location=source(at);cam.rotation_euler=(source(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
for row in rows:scene.objects[row['name']].hide_render=False
print('NOMAD_INSPECTION',str(out),len(rows),flush=True)
