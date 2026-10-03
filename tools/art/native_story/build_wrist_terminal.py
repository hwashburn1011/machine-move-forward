"""Original S-07 field terminal. Blender 5.x: --background --python this_file.

Metres, Godot +Y up, screen normal +Z. The separately named ScreenSurface
has conventional UVs and receives a live SubViewport in the native runtime.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'godot/art'
SOURCE = ROOT / 'assets/native-story/wrist-terminal'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

def xyz(p): return Vector((p[0], -p[2], p[1]))
def material(name, color, metallic=0, roughness=.6, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Metallic'].default_value=metallic
    s.inputs['Roughness'].default_value=roughness
    if emission:
        s.inputs['Emission Color'].default_value=(*color,1)
        s.inputs['Emission Strength'].default_value=emission
    return m

steel=material('Field terminal / graphite enamel',(.072,.098,.083),.65,.42)
edge=material('Field terminal / rubbed alloy',(.37,.43,.35),.85,.32)
rubber=material('Field terminal / rubber isolation',(.018,.024,.019),0,.83)
copper=material('Field terminal / aged copper',(.39,.23,.075),.75,.53)
letter=material('Field terminal / pale engraving',(.56,.65,.44),.25,.5)
green=material('Field terminal / phosphor pilot',(.21,.65,.16),.2,.32,1.7)
screen=material('LiveScreen / runtime viewport',(.008,.03,.013),.1,.3)

def empty(name, at=(0,0,0), parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.location=xyz(at); o.parent=parent; return o

root=empty('S07_FieldTerminal')
def finish(o,name,mat,parent=root,bevel=0):
    o.name=name; o.parent=parent; o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Cast radiused edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(name, at, size, mat, bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at)); o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,bevel=bevel)
    mod=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cylinder(name,at,radius,depth,mat,segments=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=depth,location=xyz(at),rotation=(math.pi/2,0,0))
    o=bpy.context.object; bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,mat,bevel=.001)

# Wide, squat industrial instrument; asymmetrical control spine and two padded
# saddles distinguish it from a watch or a rounded consumer wrist computer.
box('CuffMount',(0,0,-.041),(.17,.245,.023),rubber,.011)
for y in [-.075,.075]:
    box('Cuff band',(0,y,-.056),(.245,.025,.025),rubber,.008)
    box('Cuff buckle',(.105,y,-.052),(.035,.041,.019),copper,.004)
box('WristHousing',(0,0,-.006),(.321,.245,.063),steel,.022)
box('Bezel gasket',(-.018,.008,.028),(.280,.207,.010),rubber,.012)
# Four separate rails leave actual open space above the glass.
for x in [-.153,.117]:box('Protective bezel rail',(x,.009,.039),(.014,.199,.018),edge,.004)
for y in [-.091,.108]:box('Protective bezel rail',(-.018,y,.039),(.270,.013,.018),edge,.004)
box('Display well',(-.018,.009,.033),(.255,.180,.009),screen,.005)

# Flat mesh with UV origin at bottom-left, +Z front normal in Godot.
verts=[xyz((x,y,.039)) for x,y in [(-.144,-.080),(.108,-.080),(.108,.098),(-.144,.098)]]
mesh=bpy.data.meshes.new('ScreenSurface geometry'); mesh.from_pydata(verts,[],[(0,1,2,3)]); mesh.update()
o=bpy.data.objects.new('ScreenSurface',mesh); bpy.context.collection.objects.link(o); finish(o,'ScreenSurface',screen)
uv=mesh.uv_layers.new(name='UVMap')
for face in mesh.polygons:
    for i,li in enumerate(face.loop_indices):uv.data[li].uv=[(0,0),(1,0),(1,1),(0,1)][i]
empty('ScreenCenter',(-.018,.009,.039))
empty('ScreenTopLeft',(-.144,.098,.039))
empty('ScreenBottomRight',(.108,-.080,.039))
empty('ForearmMount',(0,0,-.055))

for x in [-.147,.145]:
    for y in [-.107,.106]:
        cylinder('Recessed hex fastener',(x,y,.027),.006,.006,edge,6)
        box('Fastener drive',(x,y,.031),(.007,.0018,.002),rubber,.0004)
selector=cylinder('SelectorDial',(.141,.052,.041),.016,.025,copper,32)
for i in range(16):
    a=i*math.tau/16
    cylinder('Selector knurl',(.141+math.sin(a)*.015,.052+math.cos(a)*.015,.042),.0015,.020,edge,6)
box('Selector index',(.141,.061,.056),(.003,.012,.002),letter,.0005)
for i,y in enumerate([.009,-.027,-.063]):
    box('TactileKey'+str(i+1),(.141,y,.036),(.021,.021,.015),rubber,.005)
    box('Key engraved stroke',(.141,y,.044),(.009,.002,.001),letter,.0004)
cylinder('LinkPilot',(.137,.090,.034),.004,.004,green,16)
for i in range(9):box('Lower cooling vent',(-.098+i*.022,-.111,.021),(.012,.005,.003),rubber,.001)
# Small metal scuffs, built geometry and deterministic placement.
for i in range(13):
    x=-.12+i*.019
    box('Edge wear', (x,.119,.008),(.005+(i%3)*.003,.001,.009),edge,.0003)
for text,at,size in [('S07',(.141,-.095,.032),.009),('LK / 4',(-.118,-.111,.026),.005)]:
    bpy.ops.object.text_add(location=xyz(at)); t=bpy.context.object;t.data.body=text;t.data.size=size;t.data.align_x='CENTER'
    t.rotation_euler=(math.pi/2,0,0);t.data.extrude=.0002;t.data.materials.append(letter);t.parent=root
    bpy.ops.object.convert(target='MESH')

# Keep interactive names separate and batch the remaining static pieces by
# material. The exported device is intentionally a handful of draw calls.
reserved={'ScreenSurface','SelectorDial','TactileKey1','TactileKey2','TactileKey3'}
for mat in list(bpy.data.materials):
    parts=[o for o in root.children if o.type=='MESH' and o.name not in reserved and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(parts)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name='Housing_'+mat.name.split('/')[-1].strip().replace(' ','_')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'wrist-terminal.glb'),export_format='GLB',export_animations=False,export_tangents=False)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'S07-FieldTerminal.blend'))

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48
scene.world=bpy.data.worlds.new('Wrist studio');scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=xyz((.31,.24,.57)));cam=bpy.context.object
cam.rotation_euler=(xyz((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.47;scene.camera=cam
for at,power,size in [((.1,.4,.6),40,.45),((-.4,-.1,.3),22,.3),((.1,.1,-.3),20,.3)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(at));lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1500;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SOURCE/'hardware-preview.png');bpy.ops.render.render(write_still=True)
for o in bpy.data.objects:
    if o.type=='MESH':o.data.calc_loop_triangles()
report={'original':'S-07 Linekeeper field terminal','units':'metres','screen':{'width':.252,'height':.178,'normal':'+Z','center':[-.018,.009,.039]},'meshes':sum(o.type=='MESH' for o in root.children),'triangles':sum(len(o.data.loop_triangles) for o in root.children if o.type=='MESH'),'runtime_nodes':['ScreenSurface','ScreenCenter','ForearmMount','SelectorDial','TactileKey1','TactileKey2','TactileKey3']}
(SOURCE/'manifest.json').write_text(json.dumps(report,indent=2));print('WRIST_TERMINAL_COMPLETE',report)
