"""Original small recoverable robot supplies, in an isolated Blender process."""
import bpy,bmesh,math,json,sys,ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-loot';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
steel=wear_material('Recovered worn steel',(.20,.23,.22),.78,.6,2281)
paint=wear_material('Recovered oxide enamel',(.26,.135,.054),.5,.64,2282)
bronze=c.flat('Recovered copper and brass',(.34,.20,.09),.79,.43)
dark=c.flat('Recovered rubber and recesses',(.014,.02,.02),.12,.8)
board=c.flat('Recovered circuit laminate',(.055,.105,.078),.12,.64)
ivory=c.flat('Recovered ceramic labels',(.68,.64,.48),0,.7)
lamp=c.flat('Recovered cyan identifier',(.025,.27,.25),.05,.35)
bs=lamp.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.02,.5,.45,1);bs.inputs['Emission Strength'].default_value=.8
MATS=[steel,paint,bronze,dark,board,ivory,lamp];roots=[];root=None;metal=steel
helpers=ast.parse((ROOT/'tools/art/native_machine/build_helm.py').read_text());fns=[n for n in helpers.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','ring','text','profile']];exec(compile(ast.Module(body=fns,type_ignores=[]),'<machining helpers>','exec'))

def bolt(x,z,y=.026):
    tube('Seated mounting washer',(x,y,z),(x,y+.002,z),.009,steel,20,0)
    tube('Captive hex head',(x,y+.002,z),(x,y+.007,z),.005,bronze,6,.0003)
def base(name):
    global root
    root=c.empty(name);roots.append(root)
    box('Grounded rubber feet',(0,.004,0),(.30,.008,.20),dark,.002)
    box('Recovered equipment skid',(0,.015,0),(.37,.018,.24),steel,.003)
    for x in [-.17,.17]:
        box('Folded skid flange',(x,.025,0),(.015,.026,.24),paint,.003)
        for z in [-.09,.09]:bolt(x,z,.037)
    # A passive small identifier stays readable without a floating beacon.
    box('Identifier recess',(0,.022,.122),(.083,.020,.008),dark,.001)
    box('Cyan ceramic identifier',(0,.023,.1265),(.060,.006,.002),lamp,.0005)

base('ScrapDrop')
# Debris is visibly retained in the skid instead of balanced in empty space.
profile('Bent armor remnant',[(.030,-.091),(.065,-.091),(.093,-.046),(.068,.055),(.039,.082),(.030,.082)],.23,paint,.002)
for x in [-.083,.083]:
    for z in [-.062,.052]:bolt(x,z,.083 if z<0 else .069)
tube('Broken actuator casing',(-.12,.118,-.015),(.10,.118,-.015),.026,steel,32,.001)
for x in [-.103,-.09,.068,.087]:
    obj=ring('Actuator collar',(x,.118,-.015),.026,.003,bronze,32);obj.rotation_euler.y=math.pi/2
tube('Exposed actuator shaft',(.09,.118,-.015),(.145,.118,-.015),.011,bronze,24,.0008)
for x in [-.095,.11]:
    tube('Actuator saddle',(x,.082,-.015),(x,.099,-.015),.017,dark,24,.001)
    obj=ring('Retaining band',(x,.118,-.015),.026,.003,dark,32);obj.rotation_euler.y=math.pi/2
for x in [-.053,.020,.093]:
    obj=ring('Salvaged bearing',(x,.044,.080),.023,.006,steel,32)
    tube('Bearing retained pin',(x,.025,.080),(x,.038,.080),.009,bronze,16,0)
for i in range(4):box('Sheared heat sink tooth',(-.125+i*.027,.055,-.086),(.014,.062,.016),steel,.001)
text('SCRAP',(0,.025,-.103),.018,up=True)

base('ComponentDrop')
box('Electronics isolation pad',(0,.036,0),(.302,.026,.195),dark,.005)
box('Recovered circuit board',(-.018,.054,.013),(.256,.010,.165),board,.001)
for x,z,w,d in [(-.09,-.04,.047,.035),(-.02,-.045,.039,.048),(-.035,.036,.067,.043),(.068,.028,.041,.060)]:
    box('Integrated circuit package',(x,.067,z),(w,.016,d),dark,.002)
    box('Ceramic chip marking',(x,.0755,z),(.014,.001,.004),ivory,.0002)
    for s in [-1,1]:
        for k in range(5):box('Tinned component contact',(x+s*(w/2+.003),.060,z-d*.36+k*d*.18),(.008,.004,.0024),steel,.0003)
for i in range(9):
    x=-.115+i*.018;box('Etched copper trace',(x,.0597,.077),(.0012,.001,.019),bronze,.0002)
for x in [.082,.127]:
    tube('Capacitor base',(x,.048,-.062),(x,.065,-.062),.019,dark,24,.001)
    tube('Sealed radial capacitor',(x,.063,-.062),(x,.127,-.062),.016,steel,32,.001)
    box('Capacitor top vent',(x,.128,-.062),(.019,.0015,.002),dark,.0003)
box('Shielded connector socket',(.139,.073,.048),(.030,.035,.11),steel,.002)
box('Connector insulating well',(.156,.073,.048),(.006,.023,.090),dark,.001)
for z in np.linspace(.01,.085,7):tube('Exposed plated connector pin',(.156,.073,float(z)),(.168,.073,float(z)),.002,bronze,12,0)
for x in [-.134,.095]:
    for z in [-.061,.085]:bolt(x,z,.060)
c.cable('Terminated power lead',[(-.13,.068,-.09),(-.145,.098,-.08),(-.148,.096,.0),(-.136,.073,.03)],.003,dark,root)
for z in [-.09,.03]:tube('Crimped lead terminal',(-.135,.070,z),(-.122,.070,z),.005,bronze,16,0)
text('COMPONENTS',(0,.025,-.103),.016,up=True)

base('FuelDrop')
tube('Horizontal recovered fuel cell',(-.115,.096,0),(.115,.096,0),.064,paint,48,.0015)
for x in [-.11,.11]:
    tube('Dished end cap',(x-.006,.096,0),(x+.006,.096,0),.061,steel,48,.001)
    obj=ring('Rolled fuel seam',(x,.096,0),.062,.004,steel,48);obj.rotation_euler.y=math.pi/2
    box('Grounded saddle',(x,.038,0),(.030,.055,.115),dark,.008)
for x in [-.066,.066]:
    obj=ring('Retaining fuel band',(x,.096,0),.064,.003,bronze,48);obj.rotation_euler.y=math.pi/2
tube('Fuel shutoff neck',(.12,.096,0),(.145,.096,0),.024,bronze,24,.001)
tube('Closed knurled filler',(.142,.096,0),(.160,.096,0),.028,steel,32,.001)
for i in range(16):
    a=i*math.tau/16;tube('Cap grip flute',(.145,.096+.027*math.cos(a),.027*math.sin(a)),(.156,.096+.027*math.cos(a),.027*math.sin(a)),.0018,bronze,8,0)
box('Fuel rating plaque',(0,.162,0),(.108,.007,.063),dark,.003)
text('FUEL',(0,.166,-.003),.023,up=True)
text('SEALED',(0,.166,.019),.008,up=True)
for z in [-.085,.085]:
    tube('Protective transport rail',(-.12,.10,z),(.12,.10,z),.006,steel,20,.0006)
    for x in [-.12,.12]:tube('Connected handle leg',(x,.023,z),(x,.101,z),.006,steel,20,.0006)
text('FUEL',(0,.025,-.103),.018,up=True)

report={'models':[],'reference':'Original fictional salvage assemblies consistent with existing Nomad equipment; no external assets','units':'metres','up':'+Y'}
for root in roots:
    objs=[o for o in root.children_recursive if o.type=='MESH'];parts=len(objs)
    for obj in objs:
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for face in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[loop].vertex_index].co+obj.location;uv.data[loop].uv=(p[a]*5,p[b]*5)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        if not obj.name.startswith('Legend '):
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
        mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.calc_loop_triangles()
    report['models'].append({'name':root.name,'editableParts':parts,'triangles':sum(len(o.data.loop_triangles) for o in objs)})
for i,root in enumerate(roots):root.location=c.xyz(((i-1)*.52,0,0))
scene=bpy.context.scene;scene.name='Recovered robot supplies';scene.world=bpy.data.worlds.new('Salvage studio');scene.world.color=(.16,.16,.16)
bpy.ops.object.camera_add(location=c.xyz((.8,1.15,1.6)));camera=bpy.context.object;target=c.xyz((0,.07,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.75;scene.camera=camera
for at,power,size in [((1,-2,3),180,3),((-2,-1,1),100,2),((0,2,2),140,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1600;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'salvage-kit.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RecoveredSupplies.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
for root in roots:
    root.location=(0,0,0);objs=[o for o in root.children_recursive if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:obj.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();obj=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.name=root.name+'Mesh'
    # Collapse duplicate material slots from the join while retaining shading.
    old=list(obj.data.materials);unique=list(dict.fromkeys(old));indices=[unique.index(old[p.material_index]) for p in obj.data.polygons]
    obj.data.materials.clear()
    for mat in unique:obj.data.materials.append(mat)
    for poly,index in zip(obj.data.polygons,indices):poly.material_index=index
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for obj in root.children_recursive:obj.select_set(True)
path=ROOT/'godot/art/recovered-supplies.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_tangents=True)
report['bytes']=path.stat().st_size;(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('RECOVERED_SUPPLIES_COMPLETE',json.dumps(report),flush=True)
