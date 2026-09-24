"""Original detailed service pumps. Isolated Blender process; frozen masters read-only."""
import bpy,bmesh,math,json,sys,ast,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-pumps';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
SITES=[(4.5,12.43,-2.8),(4.5,12.43,2.8)]
BOXES=[{'min':[3.49654,12.43,z-1.07523],'max':[5.47501,14.08860,z+.96001]} for x,y,z in SITES]
cabinet_manifest=json.loads((ART/'nomad-switchgear.json').read_text())
OLD=['Brace_welded_receiver001'+suffix for suffix in ['', '_1','_3','_5']]+['Suspended_undercarriage_reduction_gearbox001'+suffix for suffix in ['', '_1','_2','_4','_5']]
def inside(p,boxes):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
def prior(p,name):
    if not name.startswith('Brace_welded_receiver001'):return False
    return inside(p,cabinet_manifest['originalBoxes']) or (name in ['Brace_welded_receiver001','Brace_welded_receiver001_5'] and 12.425<p[1]<14.59 and 9.91<p[2]<10.85 and any(-.40<p[0]-x<.32 for x in [8,4,0,-4,-8]))
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();kept=[];trim=[]
for name in OLD:
    current={'Brace_welded_receiver001':'VesselRetained1','Brace_welded_receiver001_5':'VesselRetained2','Suspended_undercarriage_reduction_gearbox001_5':'NativeSideWiring'}.get(name,name)
    obj=bpy.data.objects[name];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    selected={v.index for v in obj.data.vertices if inside((v.co.x,v.co.z,-v.co.y),BOXES)}
    earlier={v.index for v in obj.data.vertices if prior((v.co.x,v.co.z,-v.co.y),name)};assert selected and not selected.intersection(earlier),name
    chosen=selected|earlier
    for f in obj.data.polygons:
        n=sum(i in chosen for i in f.vertices);assert n==0 or n==len(f.vertices),(name,'Partial face')
    # Preserve the access pass's rerouted complete side cable. Reapply its exact
    # source transform, avoiding a second glTF quantization of the whole batch.
    cable=set()
    if current=='NativeSideWiring':
        lo=(-11.453,14.601,-.807);hi=(-11.330,15.068,.802)
        cable={v.index for v in obj.data.vertices if all(lo[i]-.012<=(v.co.x,v.co.z,-v.co.y)[i]<=hi[i]+.012 for i in range(3))}
        assert cable and not cable.intersection(chosen)
        for face in obj.data.polygons:
            n=sum(i in cable for i in face.vertices);assert n==0 or n==len(face.vertices)
        for index in cable:obj.data.vertices[index].co.x+=.45
    unchanged=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert unchanged==sorted(tuple(v.co) for v in obj.data.vertices)
    obj.data.calc_loop_triangles();replacement=current if unchanged else ''
    trim.append({'frozen':name,'original':current,'replacement':replacement,'priorWorkshopRemoval':bool(earlier),'priorCableVertices':len(cable),'removedPumpVertices':len(selected),'priorRemovedVertices':len(earlier),'unchangedVertices':len(unchanged),'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(unchanged).encode()).hexdigest()})
    if replacement:obj.name=replacement;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedPumpHardware.blend'),compress=True)
for obj in kept:
    material=bpy.data.materials.new('Original_'+obj.name);material.diffuse_color=(.1,.1,.1,1);obj.data.materials.clear();obj.data.materials.append(material)
    for f in obj.data.polygons:f.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-pumps-retained.glb'),export_format='GLB',export_animations=False)

sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
tree=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Pump weathered graphite enamel',(.14,.178,.167),.53,.65,1391)
metal=wear_material('Pump machined oxidized hardware',(.21,.23,.215),.69,.68,1393)
dark=c.flat('Pump recessed rubber and ink',(.018,.022,.020),.07,.77)
ivory=c.flat('Pump engraved legends',(.73,.69,.54),.03,.64)
red=wear_material('Pump faded oxide casting',(.29,.090,.051),.37,.69,1392)
MATS=[paint,metal,dark,ivory,red];root=c.empty('NomadServicePump')
# Reuse only pure geometry helpers, never execute the cabinet builder.
tree=ast.parse((ROOT/'tools/art/native_machine/build_switchgear.py').read_text())
helpers=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','torus','text','screw']]
exec(compile(ast.Module(body=helpers,type_ignores=[]),'<shared hard surface helpers>','exec'))

def lathe_x(name,profile,center=(0,.65,0),mat=paint,n=64):
    vertices=[];faces=[]
    for x,r in profile:
        for j in range(n):
            angle=j*math.tau/n;vertices.append(c.xyz((x+center[0],center[1]+r*math.cos(angle),center[2]+r*math.sin(angle))))
    for k in range(len(profile)-1):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,root)
    uv=mesh.uv_layers.new(name='UVMap');arc=[0]
    for a,b in zip(profile,profile[1:]):arc.append(arc[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
    for f in mesh.polygons:
        wrap=any(i%n==0 for i in f.vertices) and any(i%n==n-1 for i in f.vertices)
        for loop in f.loop_indices:
            row,col=divmod(mesh.loops[loop].vertex_index,n);uv.data[loop].uv=(arc[row]*1.2,1 if wrap and col==0 else col/n)
    return obj

def hex_bolt(name,a,b,r=.015):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    tube(name+' washer',tuple(a-direction*.002),tuple(a+direction*.003),r*1.45,metal,20)
    tube(name+' hex head',tuple(a+direction*.003),tuple(b),r,metal,6)

def flange_y(name,x,y,z,r=.135):
    tube(name+' lower',(x,y-.028,z),(x,y-.003,z),r,metal,48)
    tube(name+' gasket',(x,y-.003,z),(x,y+.003,z),r*.96,dark,48)
    tube(name+' upper',(x,y+.003,z),(x,y+.028,z),r,metal,48)
    for i in range(8):
        a=i*math.tau/8;xx=x+math.cos(a)*r*.77;zz=z+math.sin(a)*r*.77
        tube(name+' through stud',(xx,y-.037,zz),(xx,y+.044,zz),.006,metal,12)
        hex_bolt(name+' captive nut',(xx,y+.029,zz),(xx,y+.042,zz),.011)

# A drained steel tray on low isolators, with explicit four-point deck anchors.
box('Continuous rubber isolation pad',(0,.024,0),(1.86,.048,1.14),dark,.015)
box('Welded skid tray',(0,.112,0),(1.91,.128,1.18),paint,.018)
for z in [-.577,.577]:box('Folded tray retaining lip',(0,.187,z),(1.90,.045,.024),metal,.005)
for x in [-.88,.88]:
    for z in [-.49,.49]:hex_bolt('Deck restraint',(x,.177,z),(x,.202,z),.019)
for x in [-.60,.02,.50]:
    box('Machined mounting crossrail',(x,.207,0),(.16,.062,.73),metal,.006)
    for z in [-.29,.29]:hex_bolt('Rail fixing',(x,.238,z),(x,.258,z),.016)

# Finned motor: smooth cast barrel, longitudinal fins, fitted end bells.
lathe_x('Cast motor barrel',[(-.18,.001),(-.18,.218),(-.15,.251),(-.10,.266),(.50,.266),(.54,.25),(.54,.001)])
for i in range(22):
    angle=i*math.tau/22
    if math.cos(angle)<-.72:continue
    rib=box('Longitudinal cooling fin',(.205,.65+.28*math.cos(angle),.28*math.sin(angle)),(.58,.052,.011),paint,.003)
    rib.rotation_euler.x=angle
for x in [.02,.50]:
    for z in [-.19,.19]:
        box('Cast motor mounting foot',(x,.332,z),(.16,.189,.16),paint,.012)
        hex_bolt('Motor foot bolt',(x,.26,z),(x,.281,z),.015)
lathe_x('Motor fan cowl',[(.49,.248),(.52,.284),(.67,.284),(.715,.247),(.716,.224),(.695,.224),(.65,.264),(.53,.264),(.49,.248)])
# Real grille gaps with recessed fan hub, rather than painted black slots.
tube('Recessed fan hub',(.672,.65,0),(.695,.65,0),.058,dark,32)
for i in range(-6,7):
    yy=i*.032;half=math.sqrt(max(0,.224**2-yy**2))
    box('Fan guard grille blade',(.713,.65+yy,0),(.018,.012,half*2),metal,.003)
for z in [-.13,.13]:box('Fan grille reinforcing bar',(.704,.65,z),(.012,.36,.010),metal,.002)
for i in range(4):
    a=math.pi/4+i*math.pi/2;yy=.65+.268*math.cos(a);zz=.268*math.sin(a)
    hex_bolt('End shield fastener',(.50,yy,zz),(.532,yy,zz),.016)
box('Terminal box neck',(.24,.925,0),(.26,.12,.25),paint,.012)
box('Sealed motor terminal box',(.24,1.019,0),(.31,.10,.31),paint,.012)
box('Terminal lid gasket',(.24,1.075,0),(.307,.012,.307),dark,.004)
box('Terminal box cap',(.24,1.088,0),(.321,.016,.321),metal,.006)
for x in [.115,.365]:
    for z in [-.12,.12]:hex_bolt('Terminal cap screw',(x,1.096,z),(x,1.106,z),.008)
box('Motor specification plate',(.24,.74,-.291),(.295,.090,.010),ivory,.005)
text('NOMAD / AUX DRIVE',(.24,.756,-.297),.018,dark)
text('ISOLATE BEFORE SERVICE',(.24,.727,-.297),.012,dark)
for x in [.108,.372]:screw(x,.740,-.298)

# Short covered coupling bridges the motor and the cast pump body.
lathe_x('Covered shaft coupling',[(-.39,.001),(-.39,.18),(-.35,.22),(-.19,.22),(-.15,.19),(-.15,.001)],mat=metal,n=48)
for z in [-.15,.15]:box('Coupling casting reinforcement',(-.27,.65,z),(.15,.27,.029),paint,.008)
lathe_x('Formed volute casing',[(-.765,.001),(-.765,.155),(-.735,.273),(-.687,.342),(-.62,.365),(-.48,.365),(-.435,.324),(-.408,.224),(-.405,.001)],mat=red,n=80)
lathe_x('Volute parting flange',[(-.700,.31),(-.700,.368),(-.674,.373),(-.651,.368),(-.651,.31)],mat=metal,n=80)
box('Cast volute support',(-.558,.281,0),(.28,.092,.37),red,.016)
for i in range(10):
    a=(i+.5)*math.tau/10;yy=.65+.328*math.cos(a);zz=.328*math.sin(a)
    hex_bolt('Volute perimeter bolt',(-.705,yy,zz),(-.729,yy,zz),.016)

# Suction enters the axial port and bends down to a sealed deck penetration.
c.cable('Suction elbow',[(-.738,.65,0),(-.857,.65,0),(-.9,.61,-.11),(-.9,.38,-.32),(-.9,.12,-.37)],.067,metal,root)
tube('Axial suction collar',(-.752,.65,0),(-.805,.65,0),.121,metal,48)
for i in range(6):
    a=i*math.tau/6;yy=.65+.096*math.cos(a);zz=.096*math.sin(a)
    hex_bolt('Suction union',(-.805,yy,zz),(-.824,yy,zz),.011)
flange_y('Inlet deck union',-.9,.089,-.37,.089)
tube('Inlet sealed deck neck',(-.9,0,-.37),(-.9,.062,-.37),.074,dark,40)

# Discharge is a complete continuous route, with an in-line isolation valve.
c.cable('Discharge return riser',[(-.52,.937,0),(-.52,1.22,0),(-.52,1.37,.15),(-.52,1.40,.47),(-.52,1.28,.70),(-.52,.72,.76),(-.52,.11,.76)],.066,metal,root)
flange_y('Discharge bolted union',-.52,1.05,0)
tube('Valve cast body',(-.52,1.082,0),(-.52,1.266,0),.099,red,48,.012)
tube('Valve bonnet',(-.52,1.19,-.02),(-.52,1.19,-.155),.074,red,40,.006)
tube('Valve gland',(-.52,1.19,-.145),(-.52,1.19,-.208),.042,metal,6)
tube('Valve operating spindle',(-.52,1.19,-.20),(-.52,1.19,-.34),.014,metal,24)
torus('Isolation handwheel',(-.52,1.19,-.344),.148,.012,red,True,n=56)
tube('Handwheel fitted hub',(-.52,1.19,-.323),(-.52,1.19,-.36),.030,metal,32)
for i in range(3):
    a=i*math.tau/3;tube('Handwheel cast spoke',(-.52,1.19,-.344),(-.52+.146*math.cos(a),1.19+.146*math.sin(a),-.344),.009,red,16)
flange_y('Outlet sealed deck union',-.52,.071,.76,.119)
tube('Outlet deck neck',(-.52,0,.76),(-.52,.10,.76),.082,dark,40)
# Return pipe support attaches to the skid, with clamp halves and captive bolts.
box('Return pipe support shoe',(-.52,.16,.51),(.20,.032,.17),metal,.005)
box('Return pipe support bracket',(-.52,.35,.60),(.040,.39,.034),metal,.004)
box('Return pipe saddle arm',(-.52,.527,.683),(.04,.035,.199),metal,.004)
torus('Return pipe split clamp',(-.52,.527,.76),.068,.006,paint,n=40)
for x in [-.60,-.44]:hex_bolt('Pipe support deck fixing',(x,.177,.51),(x,.193,.51),.010)

# A fully terminated electrical lead enters the terminal box and deck gland.
tube('Motor electrical gland',(.39,1.028,.02),(.433,1.028,.02),.025,metal,6)
c.cable('Motor supply conduit',[(.425,1.028,.02),(.52,.97,.05),(.69,.59,.20),(.72,.22,.40),(.72,.072,.40)],.017,dark,root)
tube('Electrical deck gland',(.72,.016,.40),(.72,.092,.40),.029,metal,6)
box('Electrical gland footing',(.72,.014,.40),(.11,.028,.11),metal,.004)
box('Skid identification plate',(0,.115,-.596),(.55,.077,.012),dark,.004)
text('AUXILIARY CIRCULATION',(0,.125,-.603),.029)
text('NOMAD  /  SERVICE BAY',(0,.098,-.603),.015)
for x in [-.25,.25]:screw(x,.115,-.604)
for name,at in [('DeckContact',(0,0,0)),('SuctionDeck',(-.9,0,-.37)),('DischargeDeck',(-.52,0,.76)),('ElectricalDeck',(.72,0,.40)),('ValveHub',(-.52,1.19,-.344))]:c.empty(name,at,root)

parts=sum(o.type=='MESH' for o in root.children_recursive)
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    if not obj.data.uv_layers:
        uv=obj.data.uv_layers.new(name='UVMap')
        for f in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(f.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in f.loop_indices:
                p=obj.data.vertices[obj.data.loops[loop].vertex_index].co;uv.data[loop].uv=(p[a]*1.5,p[b]*1.5)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Engraved '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad service pump studio';scene.world=bpy.data.worlds.new('Pump studio world');scene.world.color=(.20,.20,.20)
bpy.ops.object.camera_add(location=c.xyz((-3,2.1,-3.5)));cam=bpy.context.object;target=c.xyz((0,.70,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.85;scene.camera=cam
for at,power,size in [((-2,-3,4),480,3),((2,-1,2),260,2),((0,2,3),340,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1600;scene.render.resolution_y=1250;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'pump-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadServicePump.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    cam.location=c.xyz((2.7,1.8,3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'pump-rear.png');bpy.ops.render.render(write_still=True)
for mat in MATS:
    meshes=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    bpy.context.object.name='Pump_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
path=ART/'nomad-service-pump.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for o in meshes:o.data.calc_loop_triangles()
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];points=[(p.x,p.z,-p.y) for p in points]
report={'sourceRevision':'bad213b','trim':trim,'originalBoxes':BOXES,'sites':[{'name':'ServicePump'+str(i+1),'position':list(p)} for i,p in enumerate(SITES)],'editableParts':parts,'masterTriangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]},'reference':'https://www.grundfos.com/content/dam/local/en-gb/page-assets/end-suction-fast-track/documents/grundfos-end-suction-pumps-brochure.pdf'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-pumps.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('PUMPS_COMPLETE',json.dumps(report),flush=True)

# A small independent collision skin follows the new silhouette. Do not feed
# tens of thousands of cosmetic bolts/fins/letters into physics or navigation.
root=c.empty('PumpCollision');collision_mat=c.flat('Pump collision preview',(.25,.3,.28))
box('Collision skid',(0,.102,0),(1.91,.204,1.18),collision_mat,0)
tube('Collision motor',(-.18,.65,0),(.716,.65,0),.302,collision_mat,32,0)
tube('Collision volute',(-.765,.65,0),(-.405,.65,0),.365,collision_mat,40,0)
tube('Collision coupling',(-.408,.65,0),(-.15,.65,0),.22,collision_mat,24,0)
box('Collision terminal',(.24,1.013,0),(.321,.19,.321),collision_mat,0)
for x in [.02,.50]:
    for z in [-.19,.19]:box('Collision motor support',(x,.327,z),(.16,.245,.16),collision_mat,0)
box('Collision volute support',(-.558,.267,0),(.28,.126,.37),collision_mat,0)
for name,points,r in [('Collision suction',[(-.738,.65,0),(-.857,.65,0),(-.9,.61,-.11),(-.9,.38,-.32),(-.9,.12,-.37)],.067),('Collision return',[(-.52,.937,0),(-.52,1.22,0),(-.52,1.37,.15),(-.52,1.40,.47),(-.52,1.28,.70),(-.52,.72,.76),(-.52,.11,.76)],.066)]:
    # Same fitted Bezier path, with a modest collision-only tessellation.
    obj=c.cable(name,points,r,collision_mat,root)
    modifier=obj.modifiers.new('Collision curve simplification','DECIMATE');modifier.ratio=.12;bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
tube('Collision valve',(-.52,1.082,0),(-.52,1.266,0),.099,collision_mat,24,0)
tube('Collision valve bonnet',(-.52,1.19,-.02),(-.52,1.19,-.34),.045,collision_mat,16,0)
torus('Collision wheel',(-.52,1.19,-.344),.148,.012,collision_mat,True,n=24,m=6)
for x,z,r in [(-.9,-.37,.089),(-.52,.76,.119)]:tube('Collision deck union',(x,0,z),(x,.116,z),r,collision_mat,20,0)
bpy.ops.object.select_all(action='DESELECT')
collision_meshes=[o for o in root.children if o.type=='MESH']
for o in collision_meshes:o.select_set(True)
bpy.context.view_layer.objects.active=collision_meshes[0];bpy.ops.object.join();bpy.context.object.name='PumpCollisionSurface'
bpy.context.object.data.calc_loop_triangles();collision_triangles=len(bpy.context.object.data.loop_triangles)
root.select_set(True);bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-pump-collision.glb'),export_format='GLB',use_selection=True,export_animations=False)

# The frozen physics bake stores all original pump parts in one shared mesh.
# Export retained index ranges; runtime copies the exact untouched triangles.
data=json.loads((ROOT/'godot/data/runtime.json').read_text());collision={}
for index,raw in enumerate(data['colliders']):
    if 'vertices' not in raw:continue
    vertices=list(zip(*[iter(raw['vertices'])]*3));chosen={i for i,p in enumerate(vertices) if inside(p,BOXES)}
    if not chosen:continue
    assert raw['position']=={'x':0,'y':0,'z':0} and raw['rotation']=={'x':0,'y':0,'z':0,'w':1}
    removed=[];indices=raw['indices']
    for j in range(0,len(indices),3):
        n=sum(indices[k] in chosen for k in range(j,j+3));assert n in [0,3],('Partial collision triangle',index,j)
        if n==3:removed.append(j)
    if not removed:continue
    assert not collision,'Unexpected second source collider'
    ranges=[];start=0
    for j in removed:
        if start<j:ranges.append([start,j])
        start=j+3
    if start<len(indices):ranges.append([start,len(indices)])
    collision={'sourceCollider':index,'sourceIndexCount':len(indices),'removedTriangles':len(removed),'retainedIndexRanges':ranges,'replacementTrianglesPerPump':collision_triangles,'sourceSha256':hashlib.sha256(json.dumps(raw,separators=(',',':')).encode()).hexdigest()}
assert collision['removedTriangles']==4000
(ART/'nomad-pumps-collision.json').write_text(json.dumps(collision,indent=2),encoding='utf-8');(OUT/'collision-manifest.json').write_text(json.dumps(collision,indent=2),encoding='utf-8');print('PUMP_COLLISION',json.dumps(collision),flush=True)
