"""Detailed native service benches. Run only in an isolated Blender process."""
import bpy,bmesh,math,json,sys,ast,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-benches';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
SITES=[(x,12.43,z) for x in [-7.2,1.5,6.5] for z in [-7,7.2]]
BOXES=[{'min':[x-.97501,12.40499,z-.34001],'max':[x+.97501,13.48001,z+.34001]} for x,y,z in SITES]
cab=json.loads((ART/'nomad-switchgear.json').read_text());pump=json.loads((ART/'nomad-pumps.json').read_text())
OLD=['Brace_welded_receiver001','Brace_welded_receiver001_5','Workshop_overhead_cable_tray004_1','Workshop_overhead_cable_tray004_3','Workshop_overhead_cable_tray004_4']
ALIASES={'Brace_welded_receiver001':'VesselRetained1','Brace_welded_receiver001_5':'VesselRetained2','Workshop_overhead_cable_tray004_3':'VesselRetained4','Workshop_overhead_cable_tray004_4':'VesselRetained5'}
def inside(p,boxes):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
def prior(p,name):
    vessels=12.425<p[1]<14.59 and 9.91<p[2]<10.85 and any(-.40<p[0]-x<.32 for x in [8,4,0,-4,-8])
    if name.startswith('Brace_welded_receiver001'):return vessels or inside(p,cab['originalBoxes']) or inside(p,pump['originalBoxes'])
    return name in ['Workshop_overhead_cable_tray004_3','Workshop_overhead_cable_tray004_4'] and vessels
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();kept=[];trim=[]
for name in OLD:
    current=ALIASES.get(name,name);obj=bpy.data.objects[name];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen={v.index for v in obj.data.vertices if inside((v.co.x,v.co.z,-v.co.y),BOXES)}
    earlier={v.index for v in obj.data.vertices if prior((v.co.x,v.co.z,-v.co.y),name)};assert chosen and not chosen.intersection(earlier)
    removed=chosen|earlier
    for face in obj.data.polygons:
        n=sum(i in removed for i in face.vertices);assert n==0 or n==len(face.vertices),(name,'Partial face')
    unchanged=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in removed)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert unchanged==sorted(tuple(v.co) for v in obj.data.vertices)
    obj.data.calc_loop_triangles();replacement=current if unchanged else ''
    trim.append({'frozen':name,'original':current,'replacement':replacement,'removedBenchVertices':len(chosen),'priorRemovedVertices':len(earlier),'unchangedVertices':len(unchanged),'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(unchanged).encode()).hexdigest()})
    if replacement:obj.name=replacement;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedBenchHardware.blend'),compress=True)
for obj in kept:
    mat=bpy.data.materials.new('Original_'+obj.name);mat.diffuse_color=(.1,.1,.1,1);obj.data.materials.clear();obj.data.materials.append(mat)
    for face in obj.data.polygons:face.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-benches-retained.glb'),export_format='GLB',export_animations=False)

sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text());fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Bench worn mineral enamel',(.21,.239,.218),.43,.72,1461)
metal=wear_material('Bench oxidized work steel',(.22,.232,.219),.67,.65,1462)
dark=c.flat('Bench rubber and recessed ink',(.019,.024,.021),.07,.79)
ivory=c.flat('Bench aged lettering',(.69,.66,.51),.08,.70)
red=wear_material('Bench muted oxide cast iron',(.25,.081,.045),.34,.73,1463)
MATS=[paint,metal,dark,ivory,red];root=c.empty('NomadServiceBench');TOP=.7583333333
recipe=ast.parse((ROOT/'tools/art/native_machine/build_switchgear.py').read_text());helpers=[n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','torus','text','screw']];exec(compile(ast.Module(body=helpers,type_ignores=[]),'<hard surface helpers>','exec'))
def bolt(name,x,y,z,r=.01):
    tube(name+' washer',(x,y,z),(x,y+.002,z),r*1.5,metal,16)
    tube(name+' head',(x,y+.002,z),(x,y+.012,z),r,metal,6)

# Fitted welded frame with four complete, anchored feet and usable knee space.
for x in [-.81,.81]:
    for z in [-.235,.235]:
        box('Continuous deck shoe',(x,.014,z),(.15,.028,.15),metal,.006)
        box('Square welded leg',(x,.364,z),(.068,.672,.068),paint,.005)
        for dx in [-.052,.052]:bolt('Bench deck anchor',x+dx,.028,z)
    # Crossmembers terminate at the inner leg faces. Extending them through
    # the legs creates coplanar outer skins and black bands in the render.
    for y in [.175,TOP-.075]:box('Endframe crossmember',(x,y,0),(.068,.07,.402),paint,.005)
for z in [-.235,.235]:box('Upper longitudinal bearer',(0,TOP-.075,z),(1.62,.07,.058),paint,.004)
box('Rear lower stringer',(0,.184,.235),(1.62,.055,.049),paint,.004)
box('Lower folded parts shelf',(0,.218,.032),(1.57,.027,.425),metal,.005)
for z in [-.18,.244]:box('Shelf folded return',(0,.237,z),(1.57,.038,.014),paint,.004)
for x in [-.72,.72]:
    for z in [-.235,.235]:
        plate=box('Welded corner gusset',(x,.621,z),(.16,.12,.018),metal,.003)
        for xx in [x-.049,x+.049]:screw(xx,.629,z-.012)
box('Full steel worktop',(0,TOP-.020,0),(1.93,.040,.66),metal,.010)
for z in [-.312,.312]:box('Worktop folded skirt',(0,TOP-.060,z),(1.93,.082,.032),paint,.006)
box('Rear retaining upstand',(0,TOP+.016,.312),(1.92,.032,.028),paint,.004)

# Closed under-bench tool drawer, mechanically connected to the upper frame.
box('Drawer suspension housing',(.47,.543,0),(.55,.31,.47),paint,.014)
for x in [.23,.71]:box('Drawer welded suspension strap',(x,.708,0),(.032,.026,.47),metal,.003)
for y in [.467,.603]:
    box('Drawer sealing reveal',(.47,y,-.240),(.516,.120,.014),dark,.005)
    box('Pressed service drawer',(.47,y,-.253),(.497,.101,.012),paint,.006)
    box('Drawer recessed grip',(.47,y+.007,-.262),(.255,.034,.006),dark,.004)
    box('Drawer folded pull',(.47,y+.018,-.278),(.264,.023,.029),metal,.005)
    box('Drawer label holder',(.65,y-.024,-.261),(.08,.025,.004),metal,.002)
    text('TOOLS' if y>.5 else 'PARTS',(.65,y-.024,-.264),.011,dark)
box('Bench identification plate',(-.35,TOP-.061,-.331),(.51,.047,.007),dark,.004)
text('NOMAD / SERVICE TOOLS',(-.35,TOP-.061,-.335),.022)
for x in [-.59,-.11]:screw(x,TOP-.061,-.334)

# A complete compact vise: swivel base, fixed/moving jaws, sliding screw and bar.
tube('Vise swivel base',(-.62,TOP,.02),(-.62,TOP+.040,.02),.112,metal,48)
for x in [-.7,-.54]:bolt('Vise base fixing',x,TOP+.04,.045,.013)
box('Vise fixed body',(-.62,TOP+.117,.047),(.16,.157,.20),red,.019)
box('Vise slide rail',(-.62,TOP+.074,-.085),(.087,.07,.285),metal,.005)
box('Vise moving body',(-.62,TOP+.119,-.110),(.15,.119,.061),red,.012)
for z in [-.074,-.048]:
    box('Replaceable vise jaw',(-.62,TOP+.198,z),(.205,.055,.019),metal,.003)
    for x in [-.69,-.55]:screw(x,TOP+.198,z-.011)
    for j in range(12):box('Jaw grip serration',(-.708+j*.016,TOP+.207,z-.0105),(.003,.021,.0015),dark,.0004)
tube('Vise drive spindle',(-.62,TOP+.075,-.052),(-.62,TOP+.075,-.261),.020,metal,28)
for i in range(10):torus('Vise exposed screw thread',(-.62,TOP+.075,-.169-i*.008),.021,.002,metal,True,n=24,m=6)
tube('Vise spindle hub',(-.62,TOP+.075,-.244),(-.62,TOP+.075,-.280),.031,red,28)
tube('Vise sliding handle',(-.752,TOP+.075,-.278),(-.475,TOP+.075,-.278),.009,metal,20)
for x in [-.757,-.47]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=.016,location=c.xyz((x,TOP+.075,-.278)));c.finish(bpy.context.object,'Vise handle retained end',metal,root)

def case(name,x,w,h,mat):
    z=.027;bottom=TOP+.012
    for xx in [x-w*.35,x+w*.35]:
        for zz in [z-.093,z+.093]:box(name+' rubber foot',(xx,TOP+.006,zz),(.048,.012,.038),dark,.003)
    box(name+' formed lower shell',(x,bottom+(h-.044)/2,z),(w,h-.044,.264),mat,.012)
    box(name+' continuous lid gasket',(x,bottom+h-.039,z),(w-.012,.010,.255),dark,.004)
    box(name+' fitted lid',(x,bottom+h-.018,z),(w+.002,.036,.266),mat,.009)
    for xx in [x-w/2+.013,x+w/2-.013]:
        for zz in [z-.120,z+.120]:box(name+' rolled corner guard',(xx,bottom+h*.42,zz),(.034,h*.72,.029),metal,.005)
    for xx in [x-w*.29,x+w*.29]:
        box(name+' latch keeper',(xx,bottom+h-.039,z-.14),(.036,.037,.012),metal,.003)
        box(name+' latch overcentre lever',(xx,bottom+h-.072,z-.152),(.026,.039,.017),metal,.004)
        tube(name+' latch pivot',(xx-.023,bottom+h-.057,z-.151),(xx+.023,bottom+h-.057,z-.151),.006,metal,16)
        tube(name+' hinge barrel',(xx-.027,bottom+h-.032,z+.135),(xx+.027,bottom+h-.032,z+.135),.011,metal,20)
    for dx in [-.071,.071]:box(name+' handle mounting',(x+dx,bottom+h+.006,z),(.027,.015,.035),metal,.003)
    c.cable(name+' folded carry handle',[(x-.071,bottom+h+.008,z),(x-.060,bottom+h+.029,z),(x+.060,bottom+h+.029,z),(x+.071,bottom+h+.008,z)],.008,dark,root)
    box(name+' label plate',(x,bottom+h*.48,z-.138),(w*.61,.047,.008),dark,.003)
    text('SERVICE KIT' if w>.36 else 'FASTENERS',(x,bottom+h*.48,z-.143),.018 if w>.36 else .015)
case('Sealed field tool case',.045,.37,.223,paint)
case('Fastener case',.573,.30,.175,red)

# Small hand tools lie on the actual steel top, held within the retaining edge.
box('Parts tray base',(-.31,TOP+.006,.025),(.185,.012,.225),metal,.004)
for x in [-.396,-.224]:box('Tray side lip',(x,TOP+.024,.025),(.013,.036,.225),paint,.003)
for z in [-.080,.130]:box('Tray end lip',(-.31,TOP+.024,z),(.16,.036,.012),paint,.003)
for x,z in [(-.35,0),(-.29,.03),(-.32,.083)]:
    tube('Tray spare bolt shaft',(x,TOP+.023,z),(x+.037,TOP+.023,z),.006,metal,12)
    tube('Tray spare bolt head',(x-.003,TOP+.023,z),(x+.009,TOP+.023,z),.012,metal,6)
box('Spanner handle',(.093,TOP+.006,-.233),(.24,.010,.026),metal,.004)
for x in [-.043,.229]:
    torus('Spanner ring end',(x,TOP+.006,-.233),.025,.007,metal,n=28,m=6)
for name,at in [('DeckContact',(0,0,0)),('WorkSurface',(0,TOP,0)),('ServiceFace',(0,.6,-.33))]:c.empty(name,at,root)

parts=sum(o.type=='MESH' for o in root.children_recursive)
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    if obj.data.materials[0] in [paint,metal,red] or not obj.data.uv_layers:
        # Metre-based projection prevents primitive UVs stretching the wear
        # into wood-like stripes along long, thin steel rails and skirts.
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for f in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(f.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in f.loop_indices:
                p=obj.data.vertices[obj.data.loops[loop].vertex_index].co+obj.location;uv.data[loop].uv=(p[a]*1.7,p[b]*1.7)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Engraved '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad service bench studio';scene.world=bpy.data.worlds.new('Bench studio world');scene.world.color=(.20,.20,.20)
bpy.ops.object.camera_add(location=c.xyz((-2.3,1.8,-3.1)));cam=bpy.context.object;target=c.xyz((0,.52,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.55;scene.camera=cam
for at,power,size in [((-2,-3,4),460,3),((2,-1,2),290,2),((0,2,3),290,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'bench-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadServiceBench.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    cam.location=c.xyz((1.8,1.6,2.7));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'bench-rear.png');bpy.ops.render.render(write_still=True)
for mat in MATS:
    meshes=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    bpy.context.object.name='Bench_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
path=ART/'nomad-service-bench.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for obj in meshes:obj.data.calc_loop_triangles()
pts=[obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices];pts=[(p.x,p.z,-p.y) for p in pts]
report={'sourceRevision':'d4f74bc','trim':trim,'originalBoxes':BOXES,'sites':[{'name':'ServiceBench'+str(i+1),'position':list(at),'yaw':math.pi if at[2]<0 else 0} for i,at in enumerate(SITES)],'editableParts':parts,'masterTriangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]},'workSurface':TOP,'reference':'https://webcat.bottltd.co.uk/41401009-16v-cubio-height-adjustable-workbench-leg.html'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-benches.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('BENCHES_COMPLETE',json.dumps(report),flush=True)
