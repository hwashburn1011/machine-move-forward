"""Original native campaign instruments. Run in a separate Blender 5.x process."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/art/glass_orchard'))
import common as c
OUT = ROOT / 'godot/art'
SOURCE = ROOT / 'assets/native-story'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
# Portable, deliberately modest PBR materials; geometry supplies edge detail.
c.steel=c.flat('Instrument graphite',(.065,.085,.083),.75,.38)
c.bare=c.flat('Brushed edge alloy',(.34,.39,.36),.8,.32)
c.brass=c.flat('Aged copper',(.38,.22,.08),.7,.46)
c.ivory=c.flat('Ceramic enamel',(.50,.49,.37),.25,.5)
c.dark=c.flat('Screen recess',(.008,.022,.025),.15,.25)
c.letter=c.flat('Engraved ivory',(.8,.84,.67),.2,.5)
def luminous(name,color):
    m=c.flat(name,color,.1,.4);s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Emission Color'].default_value=(*color,1);s.inputs['Emission Strength'].default_value=2
    return m
c.cyan=luminous('Phosphor cyan',(.03,.65,.68))
c.amber=luminous('Service amber',(.9,.32,.035))
green=luminous('Preservation green',(.15,.48,.12))
roots=[]
def bolt(x,y,z,parent):
    c.tube('Socket fastener',(x,y,z),(x,y,z-.013),.016,c.bare,parent,12)
    c.box('Fastener slot',(x,y,z-.015),(.019,.004,.004),c.dark,parent,.001)
def instrument(name,title,mode):
    p=c.empty(name);roots.append(p)
    c.box('Mounting plate',(0,.26,.048),(.57,.55,.035),c.bare,p,.026)
    c.box('Gasket',(0,.26,.018),(.53,.50,.025),c.dark,p,.03)
    c.box('Cast instrument shell',(0,.26,-.022),(.5,.47,.07),c.steel,p,.045)
    c.box('Inset screen surround',(0,.32,-.070),(.405,.235,.026),c.bare,p,.016)
    c.box('Recessed display',(0,.32,-.086),(.373,.205,.008),c.dark,p,.01)
    c.label('Instrument legend',title,(0,.452,-.094),.024,p)
    for x in [-.234,.234]:
        for y in [.042,.478]:bolt(x,y,-.064,p)
    for x in [-.18,.18]:
        c.tube('Rotary shaft',(x,.106,-.065),(x,.106,-.102),.047,c.bare,p,32)
        c.tube('Knurled knob',(x,.106,-.103),(x,.106,-.126),.036,c.steel,p,32)
        c.box('Knob pointer',(x,.125,-.13),(.007,.025,.005),c.letter,p,.001)
        for j in range(12):
            a=j*math.tau/12
            c.tube('Knurl',(x+.034*math.sin(a),.106+.034*math.cos(a),-.106),(x+.034*math.sin(a),.106+.034*math.cos(a),-.122),.002,c.bare,p,6)
    for i in range(7):c.box('Cooling louvre',(-.075+i*.025,.074,-.063),(.013,.035,.01),c.dark,p,.003)
    for i in range(3):
        y=.263+i*.055
        if mode=='wave':
            c.cable('Calibration trace',[(x/100,y+.016*math.sin(x*.7+i),-.093) for x in range(-16,17,2)],.002,c.cyan,p)
        else:
            c.box('Instrument track',(0,y,-.093),(.31,.008,.003),c.bare,p,.002)
            c.box('Live readout',(-.052+i*.026,y,-.097),(.15+i*.045,.014,.004),green if mode=='archive' else c.cyan,p,.003)
    c.cable('Strain relieved cable',[(.21,.05,.06),(.28,-.025,.06),(0,-.055,.07),(-.2,.02,.06)],.009,c.dark,p)
    for x in [-.2,.2]:c.tube('Cable gland',(x,.02,.045),(x,.02,.09),.025,c.brass,p,20)
    return p
instrument('GyroPanel','GYRO / SAFE RELEASE','meter')
instrument('PowerRouter','FOUNDRY / 3A BUS','meter')
instrument('ArrayTuner','ARRAY / PHASE LOCK','wave')
instrument('Isolator','ORCHARD / ISOLATOR','meter')
instrument('ArchiveConsole','MERIDIAN / ARCHIVE','archive')
w=instrument('WristHousing','S-07 / LINEKEEPER','wave')
# Integral straps and raised glass bezel, modelled in Blender rather than a HUD texture.
for y in [.08,.43]:
    c.box('Woven cuff',(0,y,.102),(.63,.07,.055),c.dark,w,.026)
    c.box('Strap buckle',(.285,y,.085),(.07,.10,.022),c.brass,w,.015)
p=c.empty('SeedTerrarium');roots.append(p)
c.box('Receiver saddle',(0,0,.10),(.62,.07,.32),c.steel,p,.026)
c.box('Seed tray',(0,.062,-.04),(.55,.095,.35),c.ivory,p,.035)
c.box('Cultivation substrate',(0,.114,-.04),(.48,.025,.28),c.soil,p,.012)
for x in [-.18,0,.18]: c.plant((x,.126,-.04),.37,p,int(x*10))
for x in [-.28,.28]:
    c.tube('Cage upright',(x,.07,-.19),(x,.50,-.19),.012,c.bare,p,16)
    c.tube('Grow lamp',(x,.50,-.19),(-x,.50,-.19),.008,green,p,16)
c.box('Guard roof',(0,.515,-.04),(.60,.024,.36),c.steel,p,.015)
c.label('Preservation label','ORCHARD / LIVING SEED',(0,.052,-.219),.025,p)
c.flush_plants()
# Merge static pieces per material under each named runtime part to cap draw calls.
for root in roots:
    for mat in list(bpy.data.materials):
        parts=[o for o in root.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=root.name+'_'+mat.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'story-instruments.glb'),export_format='GLB',export_animations=False,export_tangents=False)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'StoryInstruments.blend'))
# Contact sheet: presentation positions only, exported parts remain origin based.
for i,root in enumerate(roots):root.location=c.xyz(((i%4)*.82,(1-i//4)*.85,0))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world=bpy.data.worlds.new('Instrument studio');scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=(1.2,4.8,2.5));camera=bpy.context.object
target=Vector((1.2,0,.85));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.55;scene.camera=camera
for location,power,size in [((0,3,4),500,4),((3,-1,3),650,3)]:
    bpy.ops.object.light_add(type='AREA',location=location);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(SOURCE/'instrument-contact-sheet.png');bpy.ops.render.render(write_still=True)
report={'parts':[p.name for p in roots],'meshes':sum(o.type=='MESH' for o in bpy.data.objects),'triangles':sum(len(o.data.loop_triangles) for o in bpy.data.objects if o.type=='MESH')}
(SOURCE/'manifest.json').write_text(json.dumps(report,indent=2))
print('STORY_KIT_COMPLETE',report)
