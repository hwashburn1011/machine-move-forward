"""Preserve open scenes and inspect the original editable stair obstructions."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'),link=False) as (source,target):
    target.scenes=[source.scenes[0]]
scene=target.scenes[0];scene.name='Nomad native stair clearance inspection';bpy.context.window.scene=scene
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text());sx,sz,sy=profile['scale'];oy=profile['offsetY']
def game(v):return Vector((-v.x*sx,v.z*sz+oy,v.y*sy))
def source(v):return Vector((-v[0]/sx,v[2]/sy,(v[1]-oy)/sz))
scene.view_layers[0].update();rows=[]
for obj in scene.objects:
    if obj.type not in ['MESH','CURVE','FONT']:continue
    points=[game(obj.matrix_world@Vector(v)) for v in obj.bound_box]
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    if all(hi[i]>=a and lo[i]<=b for i,(a,b) in enumerate([(-12.35,-11.65),(15.65,16.0),(-.1,.1)])):
        rows.append({'name':obj.name,'min':lo,'max':hi})
camera=bpy.data.objects.new('Stair inspection camera',bpy.data.cameras.new('Stair inspection lens'));scene.collection.objects.link(camera)
camera.location=source((-16,12,-6));camera.rotation_euler=(source((-12,10.8,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=32;scene.camera=camera
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
(ROOT/'test-results/godot-native/access-upper-candidates.json').write_text(json.dumps(rows,indent=2))
print(json.dumps({'scene':scene.name,'upperFlightCandidates':rows,'previousScenesPreserved':True}))
