"""Four detailed native switchgear cabinets from one original Blender master.

Run in isolated background Blender. Frozen/browser masters remain read-only.
Retained shared batches are rebuilt from the original bake, including the prior
vessel removal, so this pass cannot resurrect replaced tank fittings.
"""
import bpy,bmesh,math,json,sys,ast,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-switchgear';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
SITES=[(-6,12.43,-11,math.pi),(1,12.43,-11,math.pi),(9.6,12.43,-9.8,math.pi/2),(9.6,12.43,9,math.pi/2)]
# Measured from the evaluated source, including curved conduits and handles.
BOXES=[{'min':[-6.46,12.43,-11.44501],'max':[-5.54,14.14001,-10.55789]}, {'min':[.54,12.43,-11.44501],'max':[1.46,14.14001,-10.55789]}, {'min':[9.18552,12.43,-10.29068],'max':[10.01720,14.14001,-9.30932]}, {'min':[9.18552,12.43,8.50932],'max':[10.01720,14.14001,9.49068]}]
def cabinet_selected(p):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in BOXES)
def vessel_selected(p):return 12.425<p[1]<14.59 and 9.91<p[2]<10.85 and any(-.40<p[0]-x<.32 for x in [8,4,0,-4,-8])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();kept=[];trim=[]
for index in range(6):
    frozen='Brace_welded_receiver001'+('_'+str(index) if index else '')
    current='VesselRetained1' if index==0 else 'VesselRetained2' if index==5 else frozen
    obj=bpy.data.objects[frozen];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    cabinet={v.index for v in obj.data.vertices if cabinet_selected((v.co.x,v.co.z,-v.co.y))}
    prior={v.index for v in obj.data.vertices if index in [0,5] and vessel_selected((v.co.x,v.co.z,-v.co.y))}
    assert cabinet and not cabinet.intersection(prior),frozen
    chosen=cabinet|prior
    for f in obj.data.polygons:
        n=sum(v in chosen for v in f.vertices);assert n==0 or n==len(f.vertices),(frozen,f.index,'Partial face')
    before=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    obj.data.calc_loop_triangles();old_triangles=len(obj.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert sorted(tuple(v.co) for v in obj.data.vertices)==before
    obj.data.calc_loop_triangles();name=current if before else ''
    trim.append({'frozen':frozen,'original':current,'replacement':name,'priorVesselRemoval':bool(prior),'removedCabinetVertices':len(cabinet),'priorRemovedVertices':len(prior),'unchangedVertices':len(before),'originalTriangles':old_triangles,'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(before).encode()).hexdigest()})
    if name:obj.name=name;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedWorkshopStructure.blend'),compress=True)
for obj in kept:
    m=bpy.data.materials.new('Original_'+obj.name);m.diffuse_color=(.1,.1,.1,1);obj.data.materials.clear();obj.data.materials.append(m)
    for f in obj.data.polygons:f.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-switchgear-retained.glb'),export_format='GLB',export_animations=False)

sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'));fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<project wear material>','exec'))
paint=wear_material('Switchgear worn mineral enamel',(.255,.266,.222),.39,.72,1210)
metal=c.flat('Switchgear brushed hardware',(.21,.212,.185),.81,.47)
dark=c.flat('Switchgear recessed rubber and ink',(.017,.023,.021),.10,.82)
ivory=c.flat('Switchgear engraved lettering',(.69,.65,.49),.03,.75)
lamp=c.flat('Switchgear indicator lenses',(.024,.11,.08),.09,.29)
root=c.empty('NomadSwitchgear');MATS=[paint,metal,dark,ivory,lamp]
def box(name,at,size,mat=paint,bevel=.003):
    # Leave a real planar strip on thin sheet edges. Bevels clamped at half
    # thickness create long slivers which collapse during Godot compression.
    return c.box(name,at,size,mat,root,min(bevel,min(size)*.4))
def tube(name,a,b,r,mat=metal,n=24,bevel=.0007):
    a,b=c.xyz(a),c.xyz(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);c.finish(o,name,mat,root,bevel)
    for f in o.data.polygons:
        if len(f.vertices)>4:f.use_smooth=False
    return o
def torus(name,at,r,minor,mat=metal,front=False,n=40,m=8):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=m,major_radius=r,minor_radius=minor,location=c.xyz(at));o=bpy.context.object
    if front:o.rotation_euler.x=math.pi/2
    return c.finish(o,name,mat,root)
def text(value,at,size,mat=ivory):
    bpy.ops.object.text_add(location=c.xyz(at));o=bpy.context.object;o.name='Engraved '+value;o.parent=root;o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=4;o.data.extrude=0;o.rotation_euler=(math.pi/2,0,math.pi);o.data.materials.append(mat);bpy.ops.object.convert(target='MESH');return bpy.context.object
def screw(x,y,z,front=True):
    s=-1 if front else 1
    tube('Recessed screw washer',(x,y,z),(x,y,z+s*.002),.007,metal,16)
    tube('Captive slotted screw',(x,y,z+s*.002),(x,y,z+s*.005),.0045,metal,12)
    box('Screwdriver slot',(x,y,z+s*.0052),(.006,.0012,.0006),dark,.0001)
def ring_box(name,at,w,h,d,border,mat):
    x,y,z=at
    for side in [-1,1]:box(name+' upright',(x+side*(w-border)/2,y,z),(border,h,d),mat,.002)
    for side in [-1,1]:box(name+' crosspiece',(x,y+side*(h-border)/2,z),(w-2*border,border,d),mat,.002)

# Grounded plinth: folded edges, recessed access skin and captive deck fixings.
box('Continuous deck plinth',(0,.069,0),(.90,.138,.60),metal,.010)
box('Inset plinth service cover',(0,.075,-.302),(.716,.088,.012),paint,.004)
for x in [-.315,.315]:screw(x,.075,-.309)
for x in [-.423,.423]:
    for z in [-.233,.233]:
        tube('Plinth anchor washer',(x,.137,z),(x,.141,z),.018,dark,20)
        tube('Plinth anchor hex',(x,.141,z),(x,.153,z),.012,metal,6)
        box('Anchor hex recess',(x,.1536,z),(.010,.0012,.003),dark,.0001)
# Slightly narrower depth respects both the original fore and rotated side bays.
box('Continuous folded enclosure',(0,.914,0),(.808,1.552,.496),paint,.018)
box('Rear removable gland plate',(0,.285,.252),(.577,.201,.015),metal,.005)
for x in [-.254,.254]:
    for y in [.212,.358]:screw(x,y,.261,False)
# Door gasket and stepped return: fine continuous perimeter reveals.
box('Door sealing gasket',(0,.938,-.251),(.758,1.447,.013),dark,.017)
box('Pressed inset service door',(0,.938,-.266),(.728,1.42,.023),paint,.012)
ring_box('Rolled door return',(0,.938,-.282),.731,1.423,.009,.008,metal)
box('Top drip lip',(0,1.699,-.010),(.838,.018,.550),paint,.006)
# Three hinge barrels have interleaved knuckles and a captive axial pin.
for y in [.416,.929,1.452]:
    box('Hinge door leaf',(.341,y,-.280),(.062,.095,.013),metal,.004)
    box('Hinge frame leaf',(.380,y,-.251),(.051,.095,.022),metal,.004)
    for j in range(5):tube('Interleaved sealed hinge',(.369,y-.050+j*.020,-.290),(.369,y-.032+j*.020,-.290),.014,metal,20)
    tube('Hinge captive pin',(.369,y-.054,-.290),(.369,y+.054,-.290),.006,dark,16)
    for yy in [y-.034,y+.034]:screw(.338,yy,-.288)
# A folded flush handle and two quarter-turn service locks secure the door.
box('Handle recessed escutcheon',(-.300,.947,-.284),(.067,.256,.013),metal,.012)
box('Handle recessed pocket',(-.300,.947,-.292),(.048,.224,.010),dark,.010)
for y in [.861,1.035]:tube('Handle pivot boss',(-.300,y,-.298),(-.300,y,-.314),.013,metal,20)
c.cable('Folded service handle',[(-.30,.865,-.313),(-.30,.875,-.342),(-.30,1.021,-.342),(-.30,1.033,-.313)],.010,metal,root)
for y in [.471,1.423]:
    tube('Quarter turn lock bezel',(-.297,y,-.279),(-.297,y,-.294),.022,metal,32)
    tube('Lock key core',(-.297,y,-.294),(-.297,y,-.297),.013,dark,24)
    box('Double bit lock tongue',(-.297,y,-.298),(.006,.017,.003),metal,.0007)

# An engraved distribution diagram, not an invented readout or new interaction.
box('Distribution fascia',(0,1.471,-.287),(.477,.236,.015),metal,.008)
box('Diagram recessed field',(0,1.467,-.297),(.437,.194,.008),dark,.006)
text('NOMAD / DISTRIBUTION',(0,1.522,-.302),.022)
for x in [-.14,0,.14]:
    box('Engraved branch', (x,1.442,-.302),(.0017,.060,.0007),ivory,.0002)
    ring_box('Engraved circuit symbol',(x,1.415,-.302),.030,.025,.0007,.0017,ivory)
box('Engraved supply bus',(0,1.468,-.302),(.281,.0017,.0007),ivory,.0002)
text('DC BUS',(0,1.393,-.302),.014)
for x in [-.219,.219]:
    for y in [1.374,1.568]:screw(x,y,-.296)

for channel,(y,label) in enumerate([(1.205,'SUPPLY'),(.999,'LOAD SHED'),(.793,'ENGINE DAMAGE')]):
    box('Service circuit legend tray',(0,y,-.291),(.430,.148,.019),metal,.006)
    box('Circuit inset rubber surround',(0,y,-.303),(.405,.125,.010),dark,.005)
    text(label,(.008,y+.037,-.309),.019)
    # Lens, retaining bezel and legend ring form a complete mounted pilot light.
    tube('Pilot light socket',(.135,y-.017,-.308),(.135,y-.017,-.324),.030,dark,32)
    torus('Pilot light retaining bezel',(.135,y-.017,-.326),.0255,.004,metal,True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=12,radius=1,location=c.xyz((.135,y-.017,-.327)))
    lens=bpy.context.object;lens.scale=(.022,.008,.022);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);c.finish(lens,'StatusLens'+str(channel),lamp,root)
    color=lens.data.color_attributes.new(name='IndicatorChannel',type='FLOAT_COLOR',domain='CORNER');bits=[0,0,0,1];bits[channel]=1
    for item in color.data:item.color=bits
    # Fixed physical selector with indexed pointer and a shaped, rounded grip.
    tube('Selector gasket',(-.133,y-.017,-.306),(-.133,y-.017,-.314),.034,dark,32)
    tube('Selector metal collar',(-.133,y-.017,-.314),(-.133,y-.017,-.324),.028,metal,32)
    tube('Selector knob body',(-.133,y-.017,-.323),(-.133,y-.017,-.342),.023,dark,32)
    box('Selector raised paddle',(-.133,y-.019,-.349),(.015,.058,.021),dark,.006)
    box('Selector ivory pointer',(-.133,y+.003,-.361),(.003,.015,.0015),ivory,.0004)
    for dx in [-.036,.036]:box('Selector index mark',(-.133+dx,y-.017,-.309),(.004,.011,.002),ivory,.0005)

# Lower labyrinth grille: real shadow gap behind sloped folded louvers.
box('Vent perimeter frame',(0,.555,-.290),(.421,.177,.014),metal,.005)
box('Recessed vent shadow',(0,.555,-.299),(.389,.151,.013),dark,.004)
for i in range(6):
    blade=box('Downward folded vent louver',(0,.495+i*.024,-.316),(.358,.013,.029),paint,.003)
    blade.rotation_euler.x=-.36
for x in [-.196,.196]:
    for y in [.483,.628]:screw(x,y,-.299)
box('Service identification plate',(0,.339,-.285),(.309,.082,.013),dark,.005)
text('ISOLATE BEFORE SERVICE',(0,.348,-.293),.018)
text('NOMAD / ELECTRICAL',(0,.323,-.293),.014)
for x in [-.137,.137]:screw(x,.338,-.294)

# Both cable ends enter physical glands: the hose does not terminate in mid-air.
for z in [.253,.276]:tube('Rear cable gland nut',(-.25,.272,z),(-.25,.272,z+.018),.031,metal,6)
c.cable('Armoured deck conduit',[(-.25,.272,.271),(-.25,.211,.316),(-.25,.15,.355),(-.25,.105,.355)],.022,dark,root)
for i in range(5):torus('Conduit strain relief rib',(-.25,.120+i*.009,.354),.024,.0025,metal,n=32)
tube('Deck sealed cable gland',(-.25,.027,.355),(-.25,.115,.355),.036,metal,6)
tube('Deck gland base gasket',(-.25,0,.355),(-.25,.025,.355),.046,dark,32)
box('Cable gland deck flange',(-.25,.015,.355),(.123,.030,.119),metal,.005)
for x in [-.29,-.21]:
    tube('Gland flange fixing',(x,.029,.355),(x,.039,.355),.008,metal,6)
c.empty('DoorFace',(0,.938,-.29),root);c.empty('DeckContact',(0,0,0),root);c.empty('Indicators',(0,1,-.327),root)

parts=sum(o.type=='MESH' for o in root.children_recursive)
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    mesh=obj.data
    if not mesh.uv_layers:
        uv=mesh.uv_layers.new(name='UVMap')
        for f in mesh.polygons:
            axis=max(range(3),key=lambda i:abs(f.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in f.loop_indices:
                p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p[a]*1.8,p[b]*1.8)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Engraved '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    # Remove microscopic bevel slivers below 0.001 mm² before float32 export.
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad electrical cabinet studio';scene.world=bpy.data.worlds.new('Switchgear studio world');scene.world.color=(.19,.19,.19)
bpy.ops.object.camera_add(location=c.xyz((-2.2,1.75,-3.7)));cam=bpy.context.object;target=c.xyz((0,.86,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.15;scene.camera=cam
for at,power,size in [((-2,-3,4),390,3),((2,-1,2),240,2),((0,2,3),290,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1400;scene.render.resolution_y=1500;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'switchgear-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadSwitchgear.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    cam.location=c.xyz((1.8,1.55,3));target=c.xyz((0,.68,.16));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=2.0;scene.render.filepath=str(OUT/'switchgear-rear.png');bpy.ops.render.render(write_still=True)
for mat in MATS:
    meshes=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    bpy.context.object.name='SwitchgearIndicators' if mat==lamp else 'Switchgear_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
path=ART/'nomad-switchgear.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_vertex_color='NAME',export_vertex_color_name='IndicatorChannel',export_all_vertex_colors=False)
meshes=[o for o in root.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for o in meshes:o.data.calc_loop_triangles()
pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];pts=[(p.x,p.z,-p.y) for p in pts]
report={'sourceRevision':'2a0fa07','trim':trim,'originalBoxes':BOXES,'sites':[{'name':'ServiceCabinet'+str(i+1),'position':list(at[:3]),'yaw':at[3]} for i,at in enumerate(SITES)],'editableParts':parts,'masterTriangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]},'indicatorChannels':['supply','loadShed','engineDamage'],'references':['https://www.rittal.com/com-en/products/PG20231215SCH101/PG20231512SCH301/PRO0023?variantId=1376500','https://productinfo.se.com/nadigest/5c51d645347bdf0001f1f280/Master/17719_MAIN%20%28bookmap%29_0000052086.xml/%24/XB4-XB5CommonOperatorsCompletewithContactBlocksCPT_0000051349']}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-switchgear.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('SWITCHGEAR_COMPLETE',json.dumps(report),flush=True)
