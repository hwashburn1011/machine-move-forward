"""Original portable boarding clamp and powered harness, isolated Blender scene."""
import bpy, math, json, sys, ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-boarding';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
tree=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material'],type_ignores=[]),'<wear>','exec'))
steel=wear_material('Boarding worn steel',(.17,.20,.19),.8,.51,2301)
paint=wear_material('Boarding iron enamel',(.09,.10,.088),.6,.65,2302)
bronze=c.flat('Boarding brass',(.29,.18,.07),.8,.42)
dark=c.flat('Boarding elastomer',(.012,.016,.014),.05,.83)
ivory=c.flat('Boarding labels',(.63,.57,.42),0,.72)
red=c.flat('Boarding status',(.31,.016,.009),.2,.35)
bs=red.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.65,.015,.004,1);bs.inputs['Emission Strength'].default_value=.8
metal=steel
tree=ast.parse((ROOT/'tools/art/native_machine/build_helm.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','ring','text','profile']],type_ignores=[]),'<machining>','exec'))
roots=[]
def bolt(at,axis=(0,1,0),r=.023):
    p=Vector(at);d=Vector(axis);tube('Captive washer',p,p+d*.006,r,steel,24,.001)
    tube('Hex locking nut',p+d*.006,p+d*.021,r*.68,bronze,6,.001)

root=c.empty('BoardingClamp');roots.append(root)
# Floor shoes at original hook anchor: origin Y16.25, soles Y16.03.
for z in [-.82,.82]:
    box('Deck contact pad',(0,-.203,z),(.48,.034,.34),dark,.005)
    box('Clamping shoe',(0,-.17,z),(.46,.04,.32),steel,.009)
    for x in [-.17,.17]:
        for zz in [-.11,.11]:bolt((x,-.149,z+zz),r=.018)
    box('Forged rail hook',(0,.36,z),(.12,1.04,.11),paint,.016)
    tube('Diagonal compression brace',(-.19,-.14,z),(.51,1.04,z),.036,steel,24,.004)
    tube('Hook upper bridge',(0,.91,z),(.59,.91,z),.055,paint,28,.005)
    box('Rail jaw',(0.44,.87,z),(.13,.24,.16),steel,.008)
    box('Rail jaw pad',(0.49,.87,z),(.032,.20,.14),dark,.003)
    tube('Threaded jaw spindle',(.25,.78,z),(.51,.78,z),.018,bronze,20,.001)
    for i in range(8):
        o=ring('Jaw screw thread',(.26+i*.026,.78,z),.019,.003,steel,24);o.rotation_euler.y=math.pi/2
    tube('Spindle cross handle',(.25,.71,z),(.25,.85,z),.008,dark,16,.001)
    tube('Upper roller carrier',(0,.96,z),(.60,1.14,z),.043,paint,24,.004)
    tube('Grooved cable roller',(.60,1.14,z-.095),(.60,1.14,z+.095),.086,steel,32,.003)
    for zz in [-.075,.075]:
        o=ring('Roller retaining flange',(.60,1.14,z+zz),.088,.010,bronze,32);o.rotation_euler.x=math.pi/2
    for zz in [-.125,.125]:
        box('Roller cheek plate',(.60,1.10,z+zz),(.25,.24,.025),paint,.010)
        bolt((.60,1.14,z+zz),(0,0,1 if zz>0 else -1),.022)
    c.empty('Fairlead_'+('A' if z<0 else 'B'),(.60,1.229,z),root)
for y in [-.09,.65]:tube('Cross tie',(0,y,-.82),(0,y,.82),.038,steel,24,.003)
box('Release latch housing',(-.08,.025,0),(.27,.35,.40),paint,.025)
for z in [-.14,.14]:bolt((-.221,.025,z),(-1,0,0),.023)
tube('Release handle',(-.26,-.04,-.10),(-.26,-.04,.10),.027,red,24,.002)
box('Latch identity plate',(-.224,.105,0),(.008,.072,.20),dark,.002)
text('CUT',(0,.2015,0),.055,up=True)

root=c.empty('BoardingAscender');roots.append(root)
# Front of harness is +Z. Native poses position it against the lower chest.
box('Padded harness mount',(0,0,-.036),(.32,.30,.068),dark,.025)
box('Cast gearbox',(0,0,.035),(.26,.24,.13),paint,.035)
tube('Winch drum',(-.13,0,.115),(.13,0,.115),.075,steel,32,.003)
for x in [-.14,.14]:
    o=ring('Drum flange',(x,0,.115),.079,.009,bronze,32);o.rotation_euler.y=math.pi/2
    bolt((x,0,.115),(1 if x>0 else -1,0,0),.029)
for i in range(13):
    o=ring('Wound cable',(-.112+i*.018,0,.115),.076,.0035,dark,24);o.rotation_euler.y=math.pi/2
for x in [-.19,.19]:
    tube('Connected grip bracket',(x*.65,-.07,.06),(x,-.07,.07),.015,steel,20,.002)
    tube('Connected grip bracket',(x*.65,.09,.06),(x,.09,.07),.015,steel,20,.002)
    tube('Rubber control grip',(x,-.07,.07),(x,.09,.07),.025,dark,24,.003)
    for i in range(6):
        o=ring('Grip rib',(x,-.045+i*.022,.07),.025,.002,steel,24)
    c.empty('Grip_'+('R' if x<0 else 'L'),(x,.02,.07),root)
tube('Cable throat',(0,.09,.11),(0,.18,.11),.022,steel,24,.003)
o=ring('Cable fairlead eye',(0,.19,.11),.026,.006,bronze,28)
c.empty('TetherEye',(0,.22,.11),root)
box('Engaged lamp',(0,.08,.107),(.04,.012,.009),red,.002)
box('Rating plate',(0,-.095,.108),(.16,.035,.006),dark,.003)
text('ASC-7',(0,-.10,.112),.018)
for x in [-.15,.15]:
    for y in [-.105,.105]:bolt((x,y,-.004),(0,0,1),.009)

report={'models':[],'source':'Original fictional boarding hardware; no external assets','up':'+Y','units':'metres'}
for r in roots:
    parts=[o for o in r.children_recursive if o.type=='MESH']
    for o in parts:
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for face in o.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in face.loop_indices:
                p=o.data.vertices[o.data.loops[loop].vertex_index].co+o.location;uv.data[loop].uv=(p[a]*2,p[b]*2)
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name);o.data.calc_loop_triangles()
    report['models'].append({'name':r.name,'editableParts':len(parts),'triangles':sum(len(o.data.loop_triangles) for o in parts)})
roots[1].location=c.xyz((-.7,.12,.75))
scene=bpy.context.scene;scene.name='Boarding hardware review';scene.world=bpy.data.worlds.new('Boarding studio');scene.world.color=(.13,.13,.13)
bpy.ops.object.camera_add(location=c.xyz((3,2.3,3)));camera=bpy.context.object;target=c.xyz((0,.40,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.6;scene.camera=camera
for at,power,size in [((1,-2,4),400,3),((-2,-1,2),250,2),((0,2,3),350,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'boarding-kit.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'BoardingHardware.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    for o in [roots[0],*roots[0].children_recursive]:o.hide_render=True
    roots[1].location=(0,0,0);target=c.xyz((0,.03,.04));camera.location=c.xyz((.52,.40,.74));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.67
    scene.render.filepath=str(OUT/'ascender-close.png');bpy.ops.render.render(write_still=True)
    for o in [roots[0],*roots[0].children_recursive]:o.hide_render=False
for r in roots:
    r.location=(0,0,0);parts=[o for o in r.children_recursive if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.name=r.name+'Mesh'
    old=list(o.data.materials);mats=list(dict.fromkeys(old));indices=[mats.index(old[p.material_index]) for p in o.data.polygons];o.data.materials.clear()
    for mat in mats:o.data.materials.append(mat)
    for poly,index in zip(o.data.polygons,indices):poly.material_index=index
bpy.ops.object.select_all(action='DESELECT')
for r in roots:
    r.select_set(True)
    for o in r.children_recursive:o.select_set(True)
path=ROOT/'godot/art/boarding-hardware.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
report['bytes']=path.stat().st_size;(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('BOARDING_HARDWARE_COMPLETE',report,flush=True)
