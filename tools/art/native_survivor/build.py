"""Original salvage tools, refuge and two-entry workshop. Blender 5.1, metres."""
import bpy, math, sys, json, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
OUT=ROOT/'godot/art'; SOURCE=ROOT/'assets/native-survivor'
OUT.mkdir(exist_ok=True,parents=True); SOURCE.mkdir(exist_ok=True,parents=True)
steel=c.flat('Survivor charcoal steel',(.065,.08,.068),.25,.88)
edge=c.flat('Worn oxidized alloy',(.19,.225,.19),.18,.93)
paint=c.flat('Faded safety ochre',(.31,.17,.05),.10,.90)
rubber=c.flat('Rubber grips',(.027,.032,.027),.05,.86)
canvas=c.flat('Faded canvas',(.31,.36,.21),0,.94)
green=c.flat('Service phosphor',(.1,.8,.33),.1,.4)
s=green.node_tree.nodes.get('Principled BSDF');s.inputs['Emission Color'].default_value=(.1,.7,.25,1);s.inputs['Emission Strength'].default_value=1.4
ivory=c.flat('Aged supplies enamel',(.34,.33,.24),0,.94)
# Original small baked surface maps survive glTF export. Broad oxidation plus
# sparse chips replace mirror-like bare plate without adding geometry/draw calls.
texture_dir=SOURCE/'textures';texture_dir.mkdir(exist_ok=True)
for i,mat in enumerate([steel,edge,paint,ivory,canvas]):
    shader=mat.node_tree.nodes.get('Principled BSDF');base=tuple(shader.inputs['Base Color'].default_value[:3])
    rng=random.Random(2307+i);pixels=[]
    for y in range(128):
        for x in range(128):
            coarse=.84+.08*math.sin(x*.16+math.sin(y*.09)*2)+.045*math.sin(y*.21)
            noise=rng.random();factor=coarse+noise*.10
            color=tuple(v*factor for v in base)
            if noise>.982 and mat!=canvas:color=tuple(v*.68+w*.32 for v,w in zip(color,(.20,.10,.038)))
            if y%31==0 and noise>.55:color=tuple(v*.72 for v in color)
            pixels.extend((*color,1))
    image=bpy.data.images.new(mat.name+' original wear',128,128);image.pixels[:]=pixels
    image.filepath_raw=str(texture_dir/('surface-%d.png'%i));image.file_format='PNG';image.save();image.pack()
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
def box(n,p,d,m,r,b=.015):return c.box(n,p,d,m,r,b)
def tube(n,a,b,r,m,p):return c.tube(n,a,b,r,m,p,16)
def merge(root):
    for mat in [steel,edge,paint,rubber,canvas,green,ivory]:
        parts=[o for o in root.children if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=root.name+'_'+mat.name
def export(root,name,ortho,eye,target):
    merge(root)
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')),compress=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.world=bpy.data.worlds.new(name+' studio');scene.world.color=(.19,.19,.19)
    bpy.ops.object.camera_add(location=c.xyz(eye));camera=bpy.context.object
    camera.rotation_euler=(c.xyz(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=ortho;scene.camera=camera
    for at,power,size in [((2,8,-5),1100,6),((-4,5,3),900,4)]:
        bpy.ops.object.light_add(type='AREA',location=c.xyz(at));light=bpy.context.object;light.data.energy=power;light.data.size=size
        light.rotation_euler=(c.xyz(target)-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.filepath=str(SOURCE/(name+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

r=c.empty('SalvageCutter')
box('Insulated grip',(0,.045,0),(.052,.20,.06),rubber,r,.012)
for y in [0,.03,.06,.09]:box('Grip rib',(0,y,-.033),(.055,.011,.008),edge,r,.003)
box('Trigger guard',(.048,.065,0),(.012,.115,.045),paint,r,.008)
box('Motor body',(0,.205,0),(.105,.13,.085),paint,r,.022)
tube('Jaw pivot',(-.062,.27,0),(.062,.27,0),.035,edge,r)
for x in [-1,1]:
    box('Cutter jaw',(x*.043,.327,0),(.045,.13,.08),steel,r,.012)
    box('Hardened blade',(x*.026,.374,0),(.015,.055,.06),edge,r,.006)
box('Status lamp',(0,.208,-.046),(.029,.011,.006),green,r,.002)
c.empty('GripOrigin',(0,0,0),r);c.empty('WorkingContact',(0,.39,0),r)
export(r,'native-salvage-tool',.65,(.65,.55,-1),(0,.19,0))
r=c.empty('SalvageLocker')
box('Locker casing',(0,.35,0),(.8,.70,.48),steel,r,.045)
box('Ochre recessed door',(0,.36,-.253),(.70,.59,.035),paint,r,.025)
box('Door gasket',(0,.36,-.276),(.61,.49,.015),rubber,r,.015)
box('Cutter silhouette',(0,.4,-.287),(.12,.32,.013),edge,r,.013)
box('Locker handle',(.24,.35,-.30),(.035,.16,.055),edge,r,.008)
c.label('Tool legend','SALVAGE / 03',(0,.64,-.28),.048,r)
export(r,'native-salvage-locker',1.3,(1,1.1,-2),(0,.35,0))
r=c.empty('BoardingExtension')
box('Bridge deck',(0,-.09,0),(1.7,.18,4),steel,r,.025)
for z in [i*.24-1.8 for i in range(16)]:box('Anti slip tread',(0,.012,z),(1.6,.024,.055),edge,r,.004)
for x in [-.80,.80]:
    for z in [-1.8,0,1.8]:tube('Rail upright',(x,0,z),(x,1,z),.027,paint,r)
    tube('Bridge rail',(x,1,-1.9),(x,1,1.9),.027,paint,r)
    tube('Underdeck stringer',(x,-.18,-1.9),(x,-.18,1.9),.045,edge,r)
c.empty('Mount',(0,0,0),r);c.empty('DockTip',(0,0,-2),r)
export(r,'native-boarding-extension',5.4,(4,3,-5),(0,.3,0))

def site_base(name):
    r=c.empty(name)
    box('Roof slab',(0,-.23,0),(12,.46,10),steel,r,.08)
    for x in [-5,-3,-1,1,3,5]:
        for z in [-4,-2,0,2,4]:box('Roof plate',(x,.007,z),(1.95,.026,1.95),edge,r,.006)
    for x in [-5,5]:
        for z in [-4,4]:tube('Ruined building column',(x,-16,z),(x,-.2,z),.24,steel,r)
    box('Arrival gangway',(-6.5,-.08,0),(1,.16,2),edge,r)
    for z in [-4.9,4.9]:tube('Roof safety rail',(-5.9,1.1,z),(5.9,1.1,z),.035,paint,r)
    for z in [-4,-2,2,4]:tube('Edge post',(-5.9,0,z),(-5.9,1.1,z),.035,paint,r)
    for a,b in [(-4.9,-1.15),(1.15,4.9)]:tube('Edge rail',(-5.9,1.1,a),(-5.9,1.1,b),.035,paint,r)
    return r
r=site_base('FriendlyRefuge')
for x in [-.5,4]:
    for z in [-3,2.5]:tube('Shelter post',(x,0,z),(x,2.6,z),.06,steel,r)
box('Shade canopy',(1.75,2.63,-.25),(5.3,.09,6.2),canvas,r,.05)
box('Small human cot',(2,.45,-2.2),(1.1,.24,2),ivory,r,.06)
box('Water ration vessel',(3.25,.7,1),(1,1.4,.8),ivory,r,.15)
box('Common charger',(.0,.6,1),(.65,1.2,.65),paint,r)
for x in [-.2,0,.2]:box('Charging sockets',(x,.9,.66),(.12,.12,.05),rubber,r)
# Original patient, utilitarian service robot with no weapon silhouette.
for x in [-2.72,-2.28]:
    box('R9 planted foot',(x,.12,1.9),(.25,.22,.42),steel,r)
    tube('R9 leg',(x,.24,1.9),(x,.88,1.9),.07,edge,r)
box('R9 torso',(-2.5,1.18,1.9),(.66,.70,.40),paint,r,.09)
box('R9 head',(-2.5,1.78,1.9),(.48,.32,.36),steel,r,.06)
box('R9 optical strip',(-2.5,1.81,1.704),(.32,.055,.025),green,r)
for x in [-2.96,-2.04]:tube('R9 arm',(x,1.43,1.9),(x,1.02,1.77),.075,edge,r)
box('Relay cabinet',(-.2,.75,3.5),(1.2,1.5,.7),steel,r)
for x in [-.5,-.2,.1]:box('Replaceable relay',(x,1,3.13),(.16,.43,.05),paint,r)
c.label('Refuge stencil','WATER / CHARGE / REST',(1.6,2.22,2.61),.19,r)
export(r,'native-friendly-refuge',20,(17,14,-20),(0,-1,0))
r=site_base('SharedWorkshop')
box('Workshop east wall',(5.6,1.8,0),(.35,3.6,9.5),paint,r,.07)
box('Workshop north wall',(1.8,1.8,-4.7),(7.6,3.6,.32),paint,r,.06)
for x in [-1.4,1.6,4.6]:
    box('Human and robot workbench',(x,.96,-3.4),(2.4,.16,1.05),steel,r)
    for xx in [x-.9,x+.9]:box('Bench foot',(xx,.45,-3.4),(.10,.9,.70),edge,r)
    box('Parts tray',(x,1.13,-3.4),(.8,.19,.6),paint,r)
box('Isolator',(-3.3,.85,-2.5),(1,1.7,.8),steel,r)
box('Fuse cupboard',(3.8,.9,1.5),(.7,1.8,.8),ivory,r)
box('Restart console',(1.0,.75,.2),(1.25,1.5,.7),paint,r)
box('Console face',(1,1.18,-.17),(.95,.36,.035),rubber,r)
for x in [.7,1,1.3]:box('Console button',(x,1.18,-.20),(.11,.11,.03),green,r)
# Raised archive room is only reachable via the player-supported bridge.
box('Upper room deck',(0,3.48,3.0),(6,.24,4),steel,r)
for x in [-3,3]:box('Upper side wall',(x,4.7,3),(.16,2.2,4),paint,r)
# Split west wall leaves a real 2m entrance at z=3, matching extension z=6 world.
for z in [1.35,4.65]:box('Upper entrance jamb',(-3,4.7,z),(.22,2.2,.7),paint,r)
# Replace full west wall with the two jambs for a genuinely navigable opening.
west=next(o for o in r.children if o.name.startswith('Upper side wall') and o.location.x<0)
bpy.data.objects.remove(west,do_unlink=True)
box('Upper rear wall',(0,4.7,4.95),(6,2.2,.16),paint,r)
box('Upper roof',(0,5.83,3),(6.3,.14,4.3),steel,r)
box('Archive storage',(1.6,4.15,3),(.9,1.1,1),ivory,r)
for o in r.children:
    if o.name.startswith('Upper') or o.name.startswith('Archive storage'):o.location.y-=3
door=box('BridgeInterlockDoor',(-3,4.7,6),(.16,2.2,2.55),steel,None)
door.parent=r
# Keep named moving hardware separate from per-material static merge.
anchor=c.empty('BridgeDoorAssembly',parent=r);door.parent=anchor
for x in [-2.7,2.7]:tube('Archive support',(x,-.15,4),(x,3.45,7.7),.12,edge,r)
c.empty('PrimaryEntry',(-7,0,0),r);c.empty('SecondaryEntry',(-3,3.6,6),r)
motto=c.label('Workshop motto','HANDS / TOOLS / SHARED WORK',(1.4,2.65,-4.51),.18,r)
motto.rotation_euler.z=0 # This rear-wall legend faces the +Z workshop interior.
export(r,'native-rooftop-workshop',21,(17,15,-21),(0,-1,0))
# Loading a saved assembly drops unused imported palette datablocks. Re-save
# each standalone editable source without carrying unrelated source images.
for source_file in SOURCE.glob('*.blend'):
    bpy.ops.wm.open_mainfile(filepath=str(source_file))
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source_file),compress=True)
(SOURCE/'README.md').write_text('Original Blender-authored survivor content. Rebuild with Blender 5.1 --background --python tools/art/native_survivor/build.py. Runtime imports are Godot Y-up metres. The cutter grip is its origin, jaws +Y. The extension is 4m along local Z. Workshop named PrimaryEntry and SecondaryEntry match authored collision/interaction anchors. No downloaded assets.\n')
