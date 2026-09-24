"""Original grounded generator, built in an isolated Blender process.

Metres, game Y-up. Preserve the existing .85 x .65 x .72 half-extents
and 1.3m height. Semantic instruments remain independent of static batches.
"""
import bpy, math, sys, ast, json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-generator';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'))
function=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[function],type_ignores=[]),'<project wear material>','exec'))
paint=wear_material('Generator worn ivory',(.43,.405,.32),.42,.72,711)
steel=wear_material('Generator charcoal steel',(.070,.080,.073),.74,.68,712)
oxide=wear_material('Generator oxide primer',(.235,.106,.060),.48,.74,713)
edge=c.flat('Generator machined alloy',(.29,.305,.28),.84,.48)
dark=c.flat('Generator recess rubber',(.016,.021,.019),.06,.9)
letter=c.flat('Generator faded stencil',(.65,.62,.51),0,.79)
brass=c.flat('Generator aged brass',(.27,.195,.08),.78,.58)
glass=c.flat('Generator instrument face',(.025,.039,.037),.18,.37)
c.letter=letter
def glow(name,color):
    m=c.flat(name,color,.12,.38);s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Emission Color'].default_value=(*color,1);s.inputs['Emission Strength'].default_value=.9
    return m
green=glow('Generator running phosphor',(.05,.59,.36))
amber=glow('Generator reserve phosphor',(.95,.38,.045))
red=glow('Generator service phosphor',(.78,.055,.018))
root=c.empty('NomadGenerator')
root['purpose']='Native presentation only; shared machine fuel and existing power rules'
def box(name,at,size,mat=steel,parent=root,bevel=.015):return c.box(name,at,size,mat,parent,bevel)
def tube(name,a,b,r,mat=edge,parent=root,n=24):return c.tube(name,a,b,r,mat,parent,n)
def bolt(at,axis=(0,0,-1),radius=.013):
    a=Vector(at);v=Vector(axis)
    tube('Captive washer',a,a+v*.004,radius*1.35,dark,n=16)
    tube('Hex service fastener',a+v*.004,a+v*.010,radius,edge,n=6)
def label(text,at,size=.035):return c.label('Stencil '+text,text,at,size,root)
def ring(name,at,outer,inner,depth,mat=steel,axis='z'):
    verts=[];faces=[];n=48;x,y,z=at
    for along,r in [(-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)]:
        for i in range(n):
            a=i*math.tau/n
            verts.append(c.xyz((x+r*math.cos(a),y+r*math.sin(a),z+along) if axis=='z' else (x+along,y+r*math.sin(a),z+r*math.cos(a))))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);c.finish(o,name,mat,root)
    return o

# Steel skids are the only ground contacts; isolation mounts carry the engine.
for x in [-.67,.67]:
    box('Grounded box section skid',(x,.045,0),(.23,.09,1.34),steel,bevel=.012)
    for z in [-.54,.54]:
        box('Mount saddle',(x,.104,z),(.19,.028,.18),edge,bevel=.007)
        tube('Rubber isolation mount',(x,.115,z),(x,.188,z),.060,dark,n=32)
        tube('Mount load washer',(x,.185,z),(x,.20,z),.070,edge,n=32)
        bolt((x,.205,z),(0,1,0),.018)
box('Oil retaining base tray',(0,.215,0),(1.59,.065,1.29),steel,bevel=.018)
for z in [-.627,.627]:box('Raised drip tray lip',(0,.263,z),(1.59,.045,.028),oxide,bevel=.006)
for x in [-.782,.782]:box('Tray end lip',(x,.263,0),(.027,.045,1.25),oxide,bevel=.006)
# Independent engine enclosure and bolted auxiliary tank, with a narrow seam.
box('Acoustic engine core',(-.21,.694,.015),(1.085,.854,1.10),steel,bevel=.065)
box('Rolled enclosure crown',(-.21,1.138,.015),(1.13,.052,1.145),paint,bevel=.023)
box('Fuel tank',(.548,.632,.06),(.417,.726,.96),oxide,bevel=.063)
for z in [-.275,.390]:
    box('Tank strap outer',(.767,.632,z),(.026,.676,.060),steel,bevel=.008)
    box('Tank strap top',(.552,1.001,z),(.432,.022,.060),steel,bevel=.008)
    box('Tank strap bottom',(.552,.263,z),(.432,.02,.060),steel,bevel=.006)
    bolt((.791,.370,z),(1,0,0))
# Front door, visible gasket and hinge/latch hardware.
box('Front door rubber seal',(-.22,.69,-.555),(1.04,.768,.029),dark,bevel=.041)
box('Front service door',(-.22,.69,-.578),(1.002,.729,.026),paint,bevel=.034)
for y in [.440,.926]:
    box('Door hinge leaf',(-.713,y,-.603),(.09,.077,.023),steel,bevel=.006)
    tube('Door hinge pin',(-.725,y-.053,-.622),(-.725,y+.053,-.622),.018,edge)
    for dy in [-.021,.021]:bolt((-.686,y+dy,-.619),radius=.009)
box('Recessed latch pocket',(.222,.608,-.602),(.076,.170,.013),dark,bevel=.018)
box('Service door quarter turn latch',(.22,.61,-.621),(.027,.112,.026),edge,bevel=.009)
for x in [-.60,.15]:
    for y in [.392,.99]:bolt((x,y,-.602))
box('Intake shadow',(-.285,.578,-.601),(.52,.205,.014),dark,bevel=.009)
for i in range(6):
    slat=box('Formed downward intake louvre',(-.285,.494+i*.034,-.619),(.496,.013,.032),steel,bevel=.005)
    slat.rotation_euler.x=math.radians(-18)
label('NOMAD  /  AUX POWER',(-.225,.926,-.609),.040)
label('16  /  SERVICE ACCESS',(-.28,.754,-.609),.030)
label('KEEP VENTS CLEAR',(-.29,.379,-.609),.024)
# Clearly labelled state lamps sit in dark sockets; only inner lenses light up.
for name,x,mat,text in [('RunLamp',-.51,green,'RUN'),('ReserveLamp',-.28,amber,'LOW'),('ServiceLamp',-.05,red,'SERVICE')]:
    tube('Indicator bezel',(x,.823,-.606),(x,.823,-.628),.027,edge,n=32)
    tube('Unlit indicator',(x,.823,-.629),(x,.823,-.634),.019,dark,n=32)
    part=c.empty(name,(x,.823,-.636),root)
    tube(name+' lens',(0,0,0),(0,0,-.003),.017,mat,part,n=32)
    label(text,(x,.859,-.635),.022)
# Protected mechanical fuel gauge; scale is left anchored by a rotating pivot.
box('Fuel control bridge',(.515,.716,-.471),(.416,.48,.14),steel,bevel=.033)
ring('Fuel dial machined bezel',(.515,.76,-.560),.127,.105,.029,edge)
tube('Dial recess',(.515,.76,-.561),(.515,.76,-.578),.105,glass,n=48)
for i in range(11):
    angle=math.radians(-110+i*22)
    a=(.515-math.sin(angle)*.083,.76+math.cos(angle)*.083,-.584)
    b=(.515-math.sin(angle)*(.066 if i%5==0 else .073),.76+math.cos(angle)*(.066 if i%5==0 else .073),-.584)
    tube('Dial engraved graduation',a,b,.0016,letter,n=8)
needle=c.empty('FuelNeedle',(.515,.76,-.589),root)
box('Fuel gauge pointer',(0,.033,0),(.006,.080,.006),amber,needle,.002)
tube('Needle hub',(0,0,-.001),(0,0,-.009),.012,brass,needle,n=24)
label('E',(.602,.702,-.591),.024);label('F',(.428,.702,-.591),.024)
label('COMMON FUEL',(.515,.574,-.55),.027)
label('MANUAL FILL',(.515,.914,-.55),.027)
# Filler is visibly attached to the tank, with a restrained cap and tether.
tube('Welded filler riser',(.535,.951,-.185),(.535,1.123,-.185),.070,steel,n=40)
tube('Filler collar',(.535,1.116,-.185),(.535,1.153,-.185),.092,edge,n=40)
tube('Dust sealed cap',(.535,1.153,-.185),(.535,1.186,-.185),.099,oxide,n=48)
box('Cap grip',(.535,1.205,-.185),(.128,.028,.030),edge,bevel=.008)
for i in range(12):
    a=i*math.tau/12
    box('Cap edge grip',(.535+.096*math.cos(a),1.170,-.185+.096*math.sin(a)),(.014,.019,.014),steel,bevel=.003)
c.empty('FuelPort',(.535,1.221,-.185),root)
c.cable('Cap safety tether',[(.61,1.17,-.18),(.70,1.045,-.22),(.735,.99,-.31),(.70,1.002,-.375)],.005,edge,root)
# Supply and return route end at actual fittings, never as dangling hoses.
for y in [.33,.42]:
    tube('Tank banjo fitting',(.34,y,-.32),(.29,y,-.32),.026,brass)
    c.cable('Protected fuel line',[(.29,y,-.32),(.22,y,-.42),(.12,y-.035,-.44),(.04,y-.035,-.47)],.013,dark,root)
    tube('Engine inlet union',(.04,y-.035,-.47),(.04,y-.035,-.50),.021,brass,n=12)
# Large radiator on the engine's left face with recessed blades and guard.
tube('Radiator inner recess',(-.738,.699,.03),(-.767,.699,.03),.31,dark,n=48)
ring('Radiator rolled rim',(-.784,.699,.03),.331,.303,.029,paint,axis='x')
for i in range(9):
    a=i*math.tau/9
    blade=box('Cooling impeller blade',(-.773,.699+.161*math.sin(a),.03+.161*math.cos(a)),(.009,.067,.231),steel,bevel=.009)
    blade.rotation_euler.x=-a
tube('Fan hub',(-.777,.699,.03),(-.798,.699,.03),.079,edge,n=40)
for r in [.14,.22,.292]:ring('Radiator guard concentric',(-.805,.699,.03),r+.004,r-.004,.009,edge,axis='x')
for i in range(8):
    a=i*math.tau/8
    tube('Radiator guard spoke',(-.81,.699+.07*math.sin(a),.03+.07*math.cos(a)),(-.81,.699+.302*math.sin(a),.03+.302*math.cos(a)),.004,edge,n=10)
for y in [.391,1.007]:
    for z in [-.278,.338]:bolt((-.786,y,z),(-1,0,0))
# Rear alternator cover, contained exhaust and connected distribution socket.
box('Rear service panel',(-.21,.69,.584),(.99,.75,.035),paint,bevel=.033)
for y in [.43,.96]:
    for x in [-.64,.21]:bolt((x,y,.609),(0,0,1))
box('Rear cooling outlet',(-.22,.69,.612),(.57,.31,.014),dark,bevel=.012)
for i in range(7):box('Rear outlet blade',(-.22,.565+i*.041,.628),(.542,.011,.026),steel,bevel=.004)
c.cable('Exhaust elbow',[(-.50,.925,.47),(-.50,1.049,.56),(-.40,1.092,.56),(-.28,1.092,.56)],.030,steel,root)
tube('Contained muffler',(-.27,1.092,.558),(.14,1.092,.558),.068,steel,n=40)
for x in [-.20,.08]:
    tube('Muffler clamp',(x-.012,1.092,.558),(x+.012,1.092,.558),.074,edge,n=32)
    box('Muffler bracket',(x,1.06,.517),(.05,.11,.05),steel,bevel=.006)
c.cable('Downward exhaust outlet',[(.14,1.092,.558),(.23,1.092,.57),(.25,1.04,.596)],.025,steel,root)
box('Rear distribution box',(.536,.643,.565),(.293,.327,.093),steel,bevel=.024)
tube('Armored output plug',(.536,.565,.61),(.536,.565,.652),.040,edge,n=24)
c.cable('Secured output conduit',[(.536,.565,.652),(.58,.42,.654),(.62,.29,.56),(.55,.254,.36)],.022,dark,root)
box('Tray feedthrough',(.55,.251,.36),(.10,.016,.10),edge,bevel=.010)
for x in [-.55,.12]:
    c.cable('Enclosure lifting bail',[(x,1.158,-.26),(x,1.227,-.20),(x,1.227,.14),(x,1.158,.20)],.016,edge,root)
    for z in [-.26,.20]:box('Lifting bail shoe',(x,1.168,z),(.077,.021,.077),steel,bevel=.006)

source_count=len([o for o in root.children_recursive if o.type=='MESH'])
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
    m=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name)

# Save editable parts, review camera and lighting before joining export batches.
scene=bpy.context.scene;scene.name='Nomad generator studio'
scene.world=bpy.data.worlds.new('Neutral generator studio');scene.world.color=(.17,.17,.17)
bpy.ops.object.camera_add(location=c.xyz((-2.4,2.15,-3.1)));cam=bpy.context.object
target=c.xyz((0,.64,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.54;scene.camera=cam
for at,power,size in [((-2,-2,4),470,3),((2,1,3),370,2.5),((0,3,1.5),180,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48
scene.render.resolution_x=1600;scene.render.resolution_y=1300;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'generator-studio.png')
needle.rotation_euler.y=math.radians(-22) # Studio depicts sixty percent; runtime sets the pivot.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadGenerator.blend'))
needle.rotation_euler.y=0
for parent in [root]+[o for o in root.children if o.type=='EMPTY']:
    for mat in list(bpy.data.materials):
        meshes=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not meshes:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        if len(meshes)>1:bpy.ops.object.join()
        bpy.context.object.name=parent.name+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
path=ROOT/'godot/art/native-generator.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH']
for obj in meshes:obj.data.calc_loop_triangles()
report={'editableParts':source_count,'triangles':sum(len(o.data.loop_triangles) for o in meshes),'meshBatches':len(meshes),'bytes':path.stat().st_size,'semanticParts':['FuelPort','FuelNeedle','RunLamp','ReserveLamp','ServiceLamp']}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
needle.rotation_euler.y=math.radians(-22)
for name in ['ReserveLamp','ServiceLamp']:
    for obj in bpy.data.objects[name].children_recursive:obj.hide_render=True
bpy.ops.render.render(write_still=True)
cam.location=c.xyz((2.4,1.8,3.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'generator-rear.png');bpy.ops.render.render(write_still=True)
print('GENERATOR_COMPLETE',json.dumps(report),flush=True)
