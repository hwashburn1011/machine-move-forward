"""Original aisle-facing receiver, built in a separate Blender process."""
import bpy,bmesh,math,json,sys,ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-receiver';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text());fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Receiver weathered ivory enamel',(.46,.445,.354),.32,.72,1801)
metal=wear_material('Receiver oxidised steel',(.18,.209,.194),.7,.61,1802)
brass=c.flat('Receiver aged bronze',(.30,.212,.118),.65,.59)
dark=c.flat('Receiver seals and recesses',(.014,.022,.021),.1,.85)
ivory=c.flat('Receiver ceramic legends',(.76,.75,.65),.03,.7)
screen=c.flat('Receiver screen glass',(.011,.030,.028),.1,.32)
cyan=c.flat('Receiver phosphor',(.07,.58,.43),.05,.5)
shader=cyan.node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(.07,.58,.43,1);shader.inputs['Emission Strength'].default_value=.5
MATS=[paint,metal,brass,dark,ivory,screen,cyan]
assembly=c.empty('NativeReceiver');root=assembly
helpers=ast.parse((ROOT/'tools/art/native_machine/build_helm.py').read_text())
exec(compile(ast.Module(body=[n for n in helpers.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','ring','text']],type_ignores=[]),'<shared hard-surface helpers>','exec'))

def screw(x,y,z,rear=False):
    sign=-1 if rear else 1
    tube('Captive panel washer',(x,y,z),(x,y,z+sign*.002),.008,metal,20)
    tube('Captive slotted screw',(x,y,z+sign*.002),(x,y,z+sign*.005),.0055,brass,16)
    box('Recessed screw slot',(x,y,z+sign*.0053),(.007,.0014,.0006),dark,.0001)

def cable(name,points,r,mat,parent):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=8;curve.bevel_depth=r;curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    positions=[c.xyz(co) for co in points]
    for i,point in enumerate(spline.bezier_points):
        co=positions[i]
        if i==0:tangent=(positions[1]-co)/3
        elif i==len(positions)-1:tangent=(co-positions[i-1])/3
        else:
            before=co-positions[i-1];after=positions[i+1]-co
            tangent=Vector([math.copysign(min(abs(before[axis]),abs(after[axis]))/3,before[axis]) if before[axis]*after[axis]>0 else 0 for axis in range(3)])
        point.co=co;point.handle_left_type=point.handle_right_type='FREE';point.handle_left=co-tangent;point.handle_right=co+tangent
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat);obj.parent=parent
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False);return obj

# Anchored hollow pedestal, complete neck plates and restrained deck service.
box('Deck isolation pad',(0,.009,0),(.66,.018,.47),dark,.007)
box('Bolted base plate',(0,.041,0),(.656,.046,.466),metal,.008)
for x in [-.271,.271]:
    for z in [-.177,.177]:
        tube('Anchor washer',(x,.064,z),(x,.068,z),.023,metal,32)
        tube('Hexagonal deck anchor',(x,.068,z),(x,.082,z),.014,brass,6)
tube('Pedestal bottom flange',(0,.062,0),(0,.092,0),.153,metal,64)
tube('Sealed pedestal column',(0,.09,0),(0,.79,0),.102,paint,64)
for y in [.13,.73]:
    tube('Split column collar',(0,y-.016,0),(0,y+.016,0),.112,metal,48)
    for x in [-.112,.112]:
        box('Column clamp ear',(x,y,0),(.027,.028,.04),metal,.002)
        tube('Clamp cross bolt',(x,y,-.025),(x,y,.025),.007,brass,16)
tube('Pedestal head flange',(0,.785,0),(0,.825,0),.16,metal,64)
box('Instrument support tray',(0,.8515,0),(.89,.054,.54),metal,.008)
for x in [-.30,.30]:
    cable('Curved load-bearing saddle',[(x,.827,0),(x*.7,.80,0),(x*.25,.70,0)],.018,metal,root)
box('Formed shielded receiver case',(0,1.158,0),(.862,.559,.422),paint,.020)
box('Rear removable gasket',(0,1.161,-.213),(.80,.49,.008),dark,.003)
box('Rear service cover',(0,1.161,-.219),(.774,.465,.007),metal,.003)
box('Front panel seal',(0,1.163,.212),(.81,.484,.008),dark,.003)
box('Removable front fascia',(0,1.163,.218),(.788,.458,.008),metal,.003)
for x in [-.376,.376]:
    for y in [.953,1.37]:screw(x,y,.222);screw(x,y,-.223,True)
# Protective handles fit inside the old main box footprint.
for x in [-.409,.409]:
    for y in [1.02,1.31]:tube('Handle mounting boss',(x,y,.208),(x,y,.242),.014,brass,24)
    cable('Bent protective handle',[(x,1.02,.236),(x,1.036,.26),(x,1.294,.26),(x,1.31,.236)],.009,metal,root)

# Recessed readable display, fixed zero-to-full track and real dynamic fill.
box('Display compression gasket',(-.124,1.252,.2275),(.492,.241,.011),dark,.007)
box('Machined display bezel',(-.124,1.252,.236),(.475,.227,.010),brass,.006)
box('Recessed phosphor glass',(-.124,1.252,.243),(.447,.20,.007),screen,.004)
text('SIGNAL / RX-07',(-.124,1.324,.248),.023)
box('Scan meter track',(-.124,1.193,.248),(.399,.015,.002),dark,.001)
for i in range(11):box('Scan meter graduation',(-.319+i*.039,1.177,.248),(.0012,.008 if i%5 else .013,.001),ivory,.0001)
progress=c.empty('ScanProgress',(-.319,1.193,.25),assembly);root=progress
box('ScanProgressFill',(.195,0,0),(.39,.011,.002),cyan,.0005)
root=assembly;c.empty('ScreenStatus',(-.124,1.258,.248),assembly)
text('NOMAD / RECEIVER',(-.124,.999,.224),.026)
for x,label in [(-.285,'GAIN'),(.013,'TUNE')]:
    tube('Selector sealed boot',(x,1.067,.222),(x,1.067,.232),.036,dark,32)
    tube('Selector bezel',(x,1.067,.232),(x,1.067,.239),.033,metal,40)
    tube('Fluted control knob',(x,1.067,.239),(x,1.067,.269),.026,brass,48)
    tube('Selector cap',(x,1.067,.269),(x,1.067,.271),.021,dark,40)
    box('Selector index',(x,1.078,.272),(.003,.015,.001),ivory,.0003)
    for i in range(20):
        angle=i*math.tau/20
        tube('Grip knurl',(x+.0255*math.cos(angle),1.067+.0255*math.sin(angle),.242),(x+.0255*math.cos(angle),1.067+.0255*math.sin(angle),.265),.0012,metal,8,0)
    text(label,(x,1.113,.224),.014)
# Installed cartridge and its empty electrical bay are independently exposed.
box('Scanner cartridge socket',(.253,1.193,.232),(.192,.292,.024),dark,.006)
for x in [.170,.336]:box('Socket slide rail',(x,1.193,.25),(.011,.249,.027),metal,.002)
contacts=c.empty('EmptyModuleContacts',parent=assembly);root=contacts
for x in [.211,.233,.255,.277,.299]:box('Recessed edge connector',(x,1.112,.247),(.011,.035,.008),brass,.001)
text('FIT MODULE',(.253,1.265,.246),.017)
module=c.empty('ScannerModule',(.253,1.193,.233),assembly);root=module
box('Sealed plug-in scanner cartridge',(0,0,0),(.150,.254,.034),paint,.004)
box('Cartridge face gasket',(0,0,.019),(.135,.235,.006),dark,.002)
box('Cartridge removable lid',(0,0,.024),(.126,.225,.005),metal,.002)
for y in [-.068,-.043,-.018]:box('Cartridge ventilation slot',(0,y,.028),(.078,.007,.002),dark,.001)
for x in [-.043,.043]:tube('Cartridge pull handle stand',(x,.067,.027),(x,.067,.040),.005,brass,16)
tube('Cartridge pull bar',(-.043,.067,.040),(.043,.067,.040),.005,metal,24)
text('SCN-07',(0,.029,.028),.017)
root=assembly;lamp=c.empty('SignalLamp',(.254,1.375,.232),assembly);root=lamp
box('RadioPowerLens',(0,0,0),(.072,.014,.01),cyan,.003)
root=assembly;box('Power lamp surround',(.254,1.375,.227),(.092,.026,.011),dark,.003)
text('POWER',(.254,1.343,.223),.014)
# Rear screened intake, service lock and terminated coax/power connections.
box('Screened rear air intake',(-.09,1.15,-.225),(.37,.185,.005),dark,.002)
for x in range(15):tube('Rear grille vertical',(-.257+x*.024,1.07,-.23),(-.257+x*.024,1.23,-.23),.0015,metal,8,0)
for y in range(8):tube('Rear grille crosswire',(-.257,1.073+y*.022,-.231),(.079,1.073+y*.022,-.231),.0015,metal,8,0)
for y in [1.083,1.134,1.185,1.236]:
    box('Louvred weather vane',(-.09,y,-.24),(.388,.017,.029),paint,.002).rotation_euler.x=.32
box('Rear identification plate',(-.09,1.303,-.2245),(.46,.053,.004),dark,.002)
text('RX-07 / ISOLATE TO SERVICE',(-.09,1.303,-.227),.020,rear=True)
for y,label in [(1.245,'RF'),(1.04,'PWR')]:
    tube('Rear keyed connector',(.283,y,-.222),(.283,y,-.244),.025,brass,24)
    tube('Connector compression sleeve',(.283,y,-.244),(.283,y,-.263),.018,metal,32)
    text(label,(.282,y+.042,-.225),.015,rear=True)
cable('Connected deck power lead',[(.283,1.04,-.257),(.30,.957,-.258),(.20,.855,-.20),(.113,.71,-.043),(.11,.28,-.027),(.145,.108,-.08),(.22,.067,-.17)],.009,dark,root)
tube('Deck power termination',(.22,.029,-.17),(.22,.077,-.17),.019,brass,20)
for y in [.31,.66]:
    box('Cable saddle',(.112,y,-.019),(.025,.027,.020),metal,.003)
    tube('Cable restraint fastener',(.111,y,-.027),(.111,y,-.040),.004,brass,16)
cable('Terminated antenna coax',[(.283,1.245,-.260),(.26,1.365,-.259),(.04,1.387,-.25),(0,1.43,-.25)],.006,dark,root)
box('Antenna mounting heel',(0,1.397,-.230),(.073,.080,.034),metal,.004)
tube('Weather-sealed antenna socket',(0,1.42,-.241),(0,1.467,-.241),.018,brass,32)
for y in [1.475,1.485,1.495,1.505,1.515]:ring('Flexible antenna boot',(0,y,-.241),.012,.002,dark,32)
tube('Tapered whip lower section',(0,1.462,-.241),(0,1.70,-.241),.007,metal,32)
tube('Whip upper section',(0,1.698,-.241),(0,1.859,-.241),.004,metal,24)
tube('Sealed antenna tip',(0,1.858,-.241),(0,1.868,-.241),.006,dark,24)
# Existing archive and seed saddles contact the reinforced case top at 1.4375 m.
for x in [-.22,.22]:
    box('Reward mounting pad',(x,1.436,0),(.389,.006,.35),metal,.002)
c.empty('OperatorFace',(0,1.2,.28),assembly);c.empty('DeckContact',(0,0,0),assembly)

parts=sum(o.type=='MESH' for o in assembly.children_recursive)
for obj in assembly.children_recursive:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            p=obj.data.vertices[obj.data.loops[loop].vertex_index].co+obj.location;uv.data[loop].uv=(p[a]*2,p[b]*2)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Legend '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad receiver studio';scene.world=bpy.data.worlds.new('Receiver studio world');scene.world.color=(.19,.19,.19)
bpy.ops.object.camera_add(location=c.xyz((2.0,2.0,3.0)));camera=bpy.context.object;target=c.xyz((0,.97,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.14;scene.camera=camera
for at,power,size in [((-3,-4,5),650,4),((4,1,4),500,3),((0,4,5),550,3)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1500;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
for obj in module.children_recursive:obj.hide_render=True
for obj in progress.children_recursive:obj.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadReceiver.blend'),compress=True)
if '--no-render' not in sys.argv:
    scene.render.filepath=str(OUT/'receiver-front.png');bpy.ops.render.render(write_still=True)
    camera.location=c.xyz((-2,2,-3));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'receiver-rear.png');bpy.ops.render.render(write_still=True)
for obj in module.children_recursive:obj.hide_render=False
for obj in progress.children_recursive:obj.hide_render=False
for parent in [assembly,module,contacts,progress,lamp]:
    for mat in MATS:
        objects=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name=str(parent.name)+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT');assembly.select_set(True)
for obj in assembly.children_recursive:obj.select_set(True)
path=ART/'nomad-receiver.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
objects=[o for o in assembly.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for obj in objects:obj.data.calc_loop_triangles()
points=[obj.matrix_world@v.co for obj in objects for v in obj.data.vertices];points=[(p.x,p.z,-p.y) for p in points]
report={'sourceRevision':'77c4798','position':[1,16.03,-9.8],'editableParts':parts,'materialBatches':len(objects),'masterTriangles':sum(len(o.data.loop_triangles) for o in objects),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]},'reference':'https://scdn.rohde-schwarz.com/ur/pws/dl_downloads/dl_common_library/dl_brochures_and_datasheets/pdf_1/EB500_bro_en_5214-3800-12_v0500.pdf'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-receiver.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('RECEIVER_COMPLETE',json.dumps(report),flush=True)
