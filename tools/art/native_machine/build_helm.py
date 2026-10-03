"""Original detailed helm, preserving the existing deck and upgrade envelopes."""
import bpy,bmesh,math,json,sys,ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-helm';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text());fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Helm aged mineral enamel',(.24,.267,.219),.41,.71,1701)
metal=wear_material('Helm weathered brushed steel',(.20,.215,.199),.75,.58,1702)
brass=c.flat('Helm aged bronze hardware',(.29,.205,.104),.69,.58)
dark=c.flat('Helm recess and seals',(.016,.023,.020),.08,.83)
ivory=c.flat('Helm ceramic legends',(.73,.71,.59),.02,.72)
lamp=c.flat('Helm status lens',(.035,.075,.058),.05,.38)
MATS=[paint,metal,brass,dark,ivory,lamp]
assembly=c.empty('NativeHelm');root=assembly

def box(name,at,size,mat=paint,bevel=.003):return c.box(name,at,size,mat,root,min(bevel,min(size)*.4))
def tube(name,a,b,r,mat=metal,n=32,bevel=.0006):
    a,b=c.xyz(a),c.xyz(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);c.finish(o,name,mat,root,bevel)
    for face in o.data.polygons:
        if len(face.vertices)>4:face.use_smooth=False
    return o
def ring(name,at,r,minor,mat=metal,n=64):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=8,major_radius=r,minor_radius=minor,location=c.xyz(at));return c.finish(bpy.context.object,name,mat,root)
def text(value,at,size,mat=ivory,up=False,rear=False):
    bpy.ops.object.text_add(location=c.xyz(at));o=bpy.context.object;o.name='Legend '+value;o.parent=root;o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=4;o.data.extrude=0
    o.rotation_euler=(0,0,0) if up else (math.pi/2,0,math.pi if rear else 0);o.data.materials.append(mat);bpy.ops.object.convert(target='MESH');return bpy.context.object
def screw(x,y,z,rear=False):
    s=-1 if rear else 1;tube('Panel captive washer',(x,y,z),(x,y,z+s*.002),.010,metal,24)
    tube('Recessed captive head',(x,y,z+s*.002),(x,y,z+s*.005),.0065,brass,16)
    box('Fastener slot',(x,y,z+s*.0052),(.009,.0016,.0005),dark,.0001)
def profile(name,outline,width,mat=paint,bevel=.004):
    points=[c.xyz((x,y,z)) for x in [-width/2,width/2] for y,z in outline];n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    data=bpy.data.meshes.new(name);data.from_pydata(points,[],faces);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,root,bevel)
    mod=obj.modifiers.new('Weighted sheet normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name);return obj

# A continuous deck seal and folded plinth carry the entire enclosure.
box('Deck isolation seal',(0,.012,0),(1.16,.024,.72),dark,.007)
box('Folded mounting plinth',(0,.052,0),(1.15,.056,.71),metal,.009)
box('Pedestal bottom rim',(0,.10,-.005),(1.045,.06,.60),dark,.009)
for x in [-.53,.53]:
    for z in [-.305,.305]:
        tube('Deck anchor washer',(x,.08,z),(x,.084,z),.024,metal,32)
        tube('Deck hex anchor',(x,.084,z),(x,.099,z),.015,brass,6)
        box('Anchor recess',(x,.0995,z),(.012,.001,.002),dark,.0001)
profile('Formed sealed control pedestal',[(.10,-.29),(1.324,-.29),(1.045,.35),(1.015,.266),(.10,.266)],1.035,paint,.014)
# The front remains free for the original actuator, governor and authority unit.
box('Front service door gasket',(0,.538,.267),(.95,.80,.008),dark,.003)
box('Front removable service skin',(0,.537,.272),(.916,.766,.006),paint,.002)
for x in [-.475,.475]:
    for y in [.23,.44,.65,.84]:screw(x,y,.275)
# Keep the permanent identity clear of the late-game front-mounted authority unit.
box('Side identification plate',(.5215,.44,-.01),(.008,.071,.46),dark,.003)
text('NOMAD / NAVIGATION', (.526,.450,-.01),.028).rotation_euler.z=math.pi/2
text('FIELD SERVICE 07', (.526,.426,-.01),.015).rotation_euler.z=math.pi/2
# Fitted rear door, interrupted hinge knuckles, recessed latch and screened air.
box('Rear door gasket',(0,.642,-.295),(.878,1.056,.009),dark,.003)
box('Rear service hatch',(0,.642,-.301),(.85,1.026,.007),paint,.002)
for y in [.30,.76,1.02]:
    box('Rear hinge leaf',(-.446,y,-.307),(.10,.10,.010),metal,.003)
    for j in range(5):tube('Alternating hinge knuckle',(-.441,y-.047+j*.019,-.319),(-.441,y-.030+j*.019,-.319),.010,brass if j%2 else metal,24)
    for x in [-.474,-.411]:screw(x,y,-.314,True)
box('Flush latch recess',(.329,.75,-.308),(.112,.147,.010),dark,.008)
box('Captive recessed latch',(.329,.75,-.315),(.074,.106,.008),metal,.006)
box('Latch grip',(.329,.739,-.324),(.013,.064,.012),brass,.003)
box('Rear ventilation opening',(0,.40,-.308),(.61,.24,.008),dark,.002)
for x in np.linspace(-.284,.284,21):tube('Vent mesh upright',(x,.295,-.314),(x,.503,-.314),.0017,metal,8,0)
for y in np.linspace(.30,.50,9):tube('Vent mesh crosswire',(-.294,y,-.315),(.294,y,-.315),.0017,metal,8,0)
for y in [.313,.371,.429,.487]:
    obj=box('Weather louvre',(0,y,-.328),(.632,.025,.035),paint,.003);obj.rotation_euler.x=-.34
box('Rear maintenance label',(0,.95,-.3075),(.51,.115,.006),dark,.003)
text('SEALED NAVIGATION UNIT',(0,.975,-.3115),.024,rear=True)
text('ISOLATE BEFORE SERVICE',(0,.932,-.3115),.019,rear=True)
# Short conduit terminates in the case and the deck penetration.
c.cable('Restrained supply conduit',[(.384,.245,-.311),(.411,.214,-.329),(.438,.117,-.32),(.44,.063,-.27),(.44,.018,-.245)],.011,dark,root)
tube('Cable inlet compression gland',(.384,.245,-.298),(.384,.245,-.326),.023,brass,16)
tube('Deck cable gland',(.44,.016,-.245),(.44,.056,-.245),.023,metal,20)
# Rolled upper edges, a sealed sloping fascia and bolted removable panel.
for x in [-.511,.511]:
    o=profile('Rolled upper cheek',[(1.008,.35),(1.307,-.30),(1.336,-.30),(1.036,.35)],.028,metal,.004);o.location.x=x
panel=c.empty('ControlFascia',(0,1.188,.035),assembly);panel.rotation_euler.x=.41;root=panel
box('Instrument panel gasket',(0,0,0),(.974,.012,.58),dark,.003)
box('Recessed instrument fascia',(0,.010,0),(.946,.014,.556),paint,.003)
for x in [-.443,.443]:
    for z in [-.247,.247]:
        tube('Fascia screw washer',(x,.017,z),(x,.020,z),.012,metal,24)
        tube('Fascia recessed screw',(x,.020,z),(x,.024,z),.008,brass,16)
        box('Fascia screw slot',(x,.0243,z),(.011,.0005,.0015),dark,.0001)
for x,label in [(.15,'COURSE'),(.34,'TRIM')]:
    z=-.04
    tube('Selector sealed boot',(x,.017,z),(x,.031,z),.052,dark,40)
    tube('Selector machined bezel',(x,.031,z),(x,.041,z),.050,metal,48)
    tube('Selector knurled grip',(x,.041,z),(x,.075,z),.036,brass,48)
    tube('Selector inset cap',(x,.075,z),(x,.077,z),.029,dark,40)
    box('Selector index',(x,.078,z-.011),(.004,.002,.020),ivory,.0003)
    for i in range(24):
        a=i*math.tau/24;tube('Grip flute',(x+.0355*math.cos(a),.048,z+.0355*math.sin(a)),(x+.0355*math.cos(a),.068,z+.0355*math.sin(a)),.0013,metal,8,0)
    text(label,(x,.0185,z+.088),.021,up=True)
text('NAVIGATION',(.255,.0185,-.211),.024,up=True)
text('GYRO PWR',(.267,.0185,.203),.019,up=True)
box('Status bezel',(.267,.025,.154),(.118,.024,.041),metal,.004)
box('Status lens recess',(.267,.039,.154),(.098,.006,.029),dark,.002)
box('HelmPowerLamp',(.267,.043,.154),(.082,.007,.021),lamp,.003)
root=assembly
# Retain the exact earned dial pivot and normal used by the current campaign.
dial=c.empty('HelmDialMount',(-.17,1.276,.01),assembly);dial.rotation_euler.x=.41;root=dial
tube('Bearing pod lower mount',(0,-.077,0),(0,-.037,0),.174,paint,80)
tube('Bearing well',(0,-.037,0),(0,-.008,0),.170,dark,80)
ring('Rolled bearing rim',(0,-.018,0),.169,.008,metal,80)
ring('Upper bearing retaining lip',(0,.003,0),.160,.007,brass,80)
for i in range(12):
    a=i*math.tau/12;x=.168*math.sin(a);z=.168*math.cos(a)
    tube('Bearing bezel captive fixing',(x,-.019,z),(x,-.012,z),.005,metal,16)
blank=c.empty('BearingBlank',parent=dial);root=blank
tube('Unfitted gyro blank',(0,-.008,0),(0,-.005,0),.151,dark,80)
text('GYRO',(0,-.004,-.033),.031,up=True);text('NOT FITTED',(0,-.004,.021),.022,up=True)
root=assembly
cover=c.empty('GyroBlank',parent=assembly);root=cover
box('Unfitted cartridge cover',(.25,.65,.283),(.202,.475,.014),metal,.004)
for x in [.171,.329]:
    for y in [.439,.861]:screw(x,y,.29)
text('GYRO',(.25,.69,.291),.026);text('SERVICE',(.25,.647,.291),.018)
gyro=c.empty('GyroInstalled',(.25,.65,.29),assembly);root=gyro
box('Gyro fitted backplate',(0,0,-.01),(.202,.475,.024),dark,.004)
tube('Gyro cartridge casing',(0,-.197,0),(0,.197,0),.062,metal,64)
for y in [-.178,-.104,.080,.178]:ring('Machined gyro collar',(0,y,0),.063,.008,brass,64)
for y in [-.215,.215]:
    tube('Sealed gyro end cap',(0,y-.013,0),(0,y+.013,0),.065,paint,64)
for x in [-.084,.084]:
    tube('Gyro protective stay',(x,-.216,.01),(x,.216,.01),.009,metal,24)
    for y in [-.21,.21]:box('Fitted cartridge clamp',(x,y,-.004),(.027,.029,.034),brass,.003)
box('Gyro rating tab',(0,.019,.062),(.105,.102,.009),dark,.003)
text('G-07',(0,.033,.067),.020);text('SEALED',(0,.004,.067),.013)
root=assembly;c.empty('HelmInteract',(0,.85,.48),assembly);c.empty('DeckContact',(0,0,0),assembly)

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
scene=bpy.context.scene;scene.name='Nomad navigation helm studio';scene.world=bpy.data.worlds.new('Helm studio world');scene.world.color=(.19,.19,.19)
bpy.ops.object.camera_add(location=c.xyz((2.0,2.1,2.7)));camera=bpy.context.object;target=c.xyz((0,.72,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.9;scene.camera=camera
for at,power,size in [((-3,-4,5),650,4),((4,1,4),500,3),((0,4,5),550,3)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1500;scene.render.resolution_y=1500;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'helm-front.png')
for obj in gyro.children_recursive:obj.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadHelm.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True);camera.location=c.xyz((-2,1.9,-2.7));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'helm-rear.png');bpy.ops.render.render(write_still=True)
for obj in gyro.children_recursive:obj.hide_render=False
# Flatten only static fascia/pod meshes for export, preserving their evaluated
# transforms and the named upgrade anchors. The saved Blender source stays split.
bpy.context.view_layer.update()
for parent in [panel,dial]:
    for obj in list(parent.children):
        if obj.type=='MESH':
            placement=obj.matrix_world.copy();obj.parent=assembly;obj.matrix_world=placement
for parent in [assembly,blank,cover,gyro]:
    for mat in MATS:
        objects=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name='HelmStatusLens' if mat==lamp else str(parent.name)+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT');assembly.select_set(True)
for obj in assembly.children_recursive:obj.select_set(True)
path=ART/'nomad-helm.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
objects=[o for o in assembly.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for obj in objects:obj.data.calc_loop_triangles()
points=[obj.matrix_world@v.co for obj in objects for v in obj.data.vertices];points=[(p.x,p.z,-p.y) for p in points]
report={'sourceRevision':'d78eb84','position':[-3,16.03,-9],'collisionIndex':73,'originalBox':{'min':[-.6,0,-.375],'max':[.6,1.35,.375]},'editableParts':parts,'materialBatches':len(objects),'masterTriangles':sum(len(o.data.loop_triangles) for o in objects),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]},'dialPivot':[-.17,1.276,.01],'dialPitch':.41,'reference':'https://www.jrc.co.jp/hubfs/jrc-corp/assets/pdf/product/j_sbj-9200.pdf'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-helm.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('HELM_COMPLETE',json.dumps(report),flush=True)
