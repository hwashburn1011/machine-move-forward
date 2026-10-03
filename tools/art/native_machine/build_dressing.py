"""Refine the three native service drums without changing other machine parts.

Only run in an isolated Blender process. The frozen native bake and the browser
masters remain untouched. Complete drum components are removed from two batches;
all remaining coordinates are checked for exact preservation before export.
"""
import bpy,bmesh,math,json,sys,ast,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-deck-dressing';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
SITES=[(9.625,16.03,7.8),(-9.625,16.03,-6.5),(5.5,16.03,10.4)]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();kept=[];trim_report=[]
def selected(v):
    x,y,z=v.co.x,v.co.z,-v.co.y
    return any(abs(x-at[0])<.31 and at[1]-.015<y<at[1]+.895 and abs(z-at[2])<.33 for at in SITES)
for old in ['Secured_weatherproof_cargo_locker001_2','Secured_weatherproof_cargo_locker001_5']:
    obj=bpy.data.objects[old];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen={v.index for v in obj.data.vertices if selected(v)}
    assert chosen,f'No selected drum geometry in {old}'
    for face in obj.data.polygons:
        count=sum(v in chosen for v in face.vertices)
        assert count==0 or count==len(face.vertices),f'Partial face in {old}: {face.index}'
    before=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    obj.data.calc_loop_triangles();old_triangles=len(obj.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert sorted(tuple(v.co) for v in obj.data.vertices)==before,'Unselected coordinates changed'
    name='NativeCargoFittings' if obj.data.vertices else ''
    obj.data.calc_loop_triangles()
    trim_report.append({'original':old,'replacement':name,'removedVertices':len(chosen),'unchangedVertices':len(before),'originalTriangles':old_triangles,'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(before).encode()).hexdigest()})
    if name:obj.name=name;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedCargoFittings.blend'),compress=True)
for obj in kept:
    mat=bpy.data.materials.new('Shared_cargo_fittings');mat.diffuse_color=(.15,.15,.15,1)
    obj.data.materials.clear();obj.data.materials.append(mat)
    for face in obj.data.polygons:face.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-cargo-fittings.glb'),export_format='GLB',export_animations=False,export_tangents=True)

# Author complete replacements in game metres, with detailed circular profiles.
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'))
function=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[function],type_ignores=[]),'<project wear material>','exec'))
red=wear_material('Drum faded oxide',(.24,.095,.054),.44,.77,801)
olive=wear_material('Drum faded olive',(.17,.19,.14),.40,.78,802)
steel=c.flat('Drum restraint steel',(.065,.073,.065),.76,.67)
edge=c.flat('Drum worn alloy',(.24,.258,.23),.85,.49)
dark=c.flat('Drum gaskets',(.014,.022,.018),.03,.94)
letter=c.flat('Drum stencil cream',(.61,.60,.49),0,.84);c.letter=letter
roots=[];counts=[]
def box(name,at,size,mat,p,bevel=.004):return c.box(name,at,size,mat,p,bevel)
def tube(name,a,b,r,mat,p,n=24):return c.tube(name,a,b,r,mat,p,n)
def lathe(name,profile,mat,p,n=96,cap=False):
    vertices=[];faces=[]
    for y,r in profile:
        for i in range(n):
            a=i*math.tau/n+math.pi/2;vertices.append(c.xyz((r*math.cos(a),y,r*math.sin(a)*1.0666667)))
    for row in range(len(profile)-1):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    if cap:faces.extend([tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,p)
    # Continuous cylindrical UVs avoid separate rust patches on every strip.
    # The only wrap seam is on the back, beside the real longitudinal seam.
    lengths=[0]
    for a,b in zip(profile,profile[1:]):lengths.append(lengths[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
    uv=mesh.uv_layers.new(name='UVMap');obj['authored_uv']=True
    for face in mesh.polygons:
        wrap=any(v%n==0 for v in face.vertices) and any(v%n==n-1 for v in face.vertices)
        for loop in face.loop_indices:
            vi=mesh.loops[loop].vertex_index;row,col=divmod(vi,n)
            if len(face.vertices)==n:
                at=mesh.vertices[vi].co;uv.data[loop].uv=(at.x/.57+.5,at.y/.61+.5)
            else:uv.data[loop].uv=(1 if wrap and col==0 else col/n,lengths[row]/max(.001,lengths[-1]))
    if cap:
        for f in list(obj.data.polygons)[-2:]:f.use_smooth=False
    return obj
def bolt(x,y,z,p):
    tube('Restraint washer',(x,y,z),(x,y+.003,z),.013,dark,p,20)
    tube('Restraint hex head',(x,y+.003,z),(x,y+.010,z),.010,edge,p,6)
def band(name,y,width,r,p,mat=steel):
    return lathe(name,[(y-width/2,r-.003),(y-width/2,r),(y+width/2,r),(y+width/2,r-.003)],mat,p)
for index,site in enumerate(SITES):
    p=c.empty('ServiceDrum'+str(index+1));roots.append(p);coat=olive if index==1 else red
    # Pressed rolled lips, recessed lid, two strengthening swages and real seam.
    profile=[(.023,.245),(.028,.254),(.039,.263),(.051,.263),(.061,.253),(.080,.251),(.245,.251),(.256,.259),(.264,.264),(.276,.264),(.286,.251),(.572,.251),(.581,.260),(.591,.264),(.602,.264),(.613,.251),(.793,.251),(.815,.255),(.827,.264),(.839,.264),(.847,.252),(.832,.242)]
    body=lathe('Pressed steel drum with rolled chimes',profile,coat,p,cap=True)
    for y in [.041,.833]:band('Scuffed rolled rim',y,.012,.2645,p,edge)
    for y in [.267,.594]:band('Raised swage wear line',y,.006,.2645,p,edge)
    # Slightly inset upper disk and two separately capped bung fittings.
    lid=lathe('Recessed pressed lid',[(.830,.241),(.834,.239)],coat,p,cap=True)
    for x,z,r in [(-.10,-.095,.045),(.115,.10,.022)]:
        tube('Bung welded collar',(x,.834,z),(x,.846,z),r,edge,p,40)
        tube('Bung dust gasket',(x,.846,z),(x,.850,z),r*.91,dark,p,32)
        tube('Bung plug',(x,.850,z),(x,.859,z),r*.81,steel,p,24)
        box('Recessed plug drive',(x,.860,z),(r*.86,.004,r*.22),edge,p,.001)
    seam=c.cable('Folded longitudinal seam',[(0,.069,.268),(0,.27,.283),(0,.593,.283),(0,.80,.268)],.0028,edge,p)
    # A fitted annular deck shoe has captive bolts and compressible feet.
    lathe('Deck cradle shoe',[(0,.271),(.018,.283),(.030,.283),(.030,.241),(.018,.241),(0,.271)],steel,p,72)
    for side in [-1,1]:
        box('Rubber backed clamp foot',(side*.246,.015,0),(.080,.030,.162),dark,p,.009)
        box('Cradle mounting foot',(side*.246,.036,0),(.080,.022,.172),steel,p,.006)
        for z in [-.055,.055]:bolt(side*.263,.047,z,p)
        box('Vertical restraint post',(side*.271,.235,0),(.022,.38,.051),steel,p,.005)
        box('Post welded gusset',(side*.263,.08,0),(.034,.069,.096),edge,p,.004)
    band('Securing hoop',.411,.040,.258,p)
    # Hinged latch stays within the prior outer rim envelope.
    box('Hoop draw latch',(0,.411,-.287),(.094,.045,.025),edge,p,.005)
    box('Latch fold handle',(0,.411,-.300),(.058,.022,.009),steel,p,.003)
    for x in [-.036,.036]:tube('Latch hinge',(x,.401,-.299),(x,.420,-.299),.007,edge,p,16)
    # Riveted small curved stencil patch follows the shell; no floating lettering.
    patch=lathe('Service label backing',[(.315,.2522),(.388,.2522)],steel,p)
    # Keep only the front arc as the dark ID patch instead of a full painted band.
    bm=bmesh.new();bm.from_mesh(patch.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().y<.22],context='FACES');bm.to_mesh(patch.data);bm.free()
    # Raised stencil glyphs laid onto the cylinder one character at a time.
    def curved_label(text,y,size):
        spacing=size*.66;start=-(len(text)-1)*spacing/2
        for j,ch in enumerate(text):
            if ch==' ':continue
            angle=(start+j*spacing)/.255
            x=-math.sin(angle)*.255;z=-math.cos(angle)*.255*1.0666667
            o=c.label('Stencil '+text+' '+str(j),ch,(x,y,z-.001),size,p)
            # Convert the negative-Z-facing text's tangent to the local shell.
            o.rotation_euler.z=math.pi+angle
    curved_label('SERVICE '+str(index+1).zfill(2),.346,.022)
    curved_label('NOMAD',.702,.045)
    curved_label('SEALED',.657,.024)
    for x in [-.068,.068]:
        z=-math.sqrt(.252**2-x*x)*1.0666667
        tube('Label plate rivet',(x,.373,z),(x,.373,z-.005),.0038,edge,p,12)
    counts.append(len([o for o in p.children_recursive if o.type=='MESH']))

# Planar normals on manufactured flat surfaces; portable UVs before batching.
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH':continue
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False)
    if not obj.get('authored_uv'):bpy.ops.uv.smart_project(island_margin=.014)
    bpy.ops.object.mode_set(mode='OBJECT')
    tri=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    # Bevels on very shallow bung collars can collapse their limiting triangles.
    # Remove only zero-area faces; keep the physical lip and its UV boundaries.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-11],context='FACES_ONLY')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
# Studio arrangement only; the runtime export returns each assembly to its site.
for i,p in enumerate(roots):p.location=c.xyz(((i-1)*.83,0,0));p.rotation_euler.z=math.radians([0,-15,20][i])
scene=bpy.context.scene;scene.name='Nomad secured service drums';scene.world=bpy.data.worlds.new('Neutral drum studio');scene.world.color=(.17,.17,.17)
bpy.ops.object.camera_add(location=c.xyz((1.6,1.8,-3.2)));cam=bpy.context.object;target=c.xyz((0,.41,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.8;scene.camera=cam
for at,power,size in [((-2,2,3),380,3),((2,0,3),300,2),((0,-2,1.5),170,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1800;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'service-drums.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadServiceDrums.blend'),compress=True)
bpy.ops.render.render(write_still=True)
for i,p in enumerate(roots):
    p.location=c.xyz(SITES[i]);p.rotation_euler.z=math.pi if i==1 else 0
    for mat in list(bpy.data.materials):
        meshes=[o for o in p.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not meshes:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        if len(meshes)>1:bpy.ops.object.join()
        bpy.context.object.name=p.name+'_'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for p in roots:
    p.select_set(True)
    for o in p.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-service-drums.glb'),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
report={'sourceRevision':'09244a9','trim':trim_report,'sites':[{'name':p.name,'position':site,'yaw':math.pi if i==1 else 0} for i,(p,site) in enumerate(zip(roots,SITES))],'assemblies':[]}
for i,p in enumerate(roots):
    meshes=[o for o in p.children_recursive if o.type=='MESH']
    for o in meshes:o.data.calc_loop_triangles()
    report['assemblies'].append({'name':p.name,'editableParts':counts[i],'triangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes)})
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(ART/'nomad-dressing.json').write_text(json.dumps({'trim':trim_report,'sites':report['sites']},indent=2),encoding='utf-8')
print('NATIVE_DRESSING_COMPLETE',json.dumps(report),flush=True)
