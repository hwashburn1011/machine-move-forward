"""Original Sovereign support drone; run in an isolated Blender process.

Reference: the user's badmechs.png, orb above the commander's open hand.
The saved source retains individual fitted parts; the runtime GLB is batched.
"""
import bpy, bmesh, math, json, sys, ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-drone'; OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard')); import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Drone charcoal enamel',(.075,.082,.078),.58,.53,2211)
steel=wear_material('Drone worn machined steel',(.26,.275,.27),.82,.47,2212)
bronze=c.flat('Drone aged bronze hardware',(.25,.165,.076),.78,.48)
dark=c.flat('Drone recessed seals',(.009,.014,.016),.14,.74)
lens=c.flat('Drone deep red optical glass',(.16,.003,.006),.4,.17)
light=c.flat('Drone red optical phosphor',(.38,.008,.004),.05,.25)
light.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.012,.004,1)
light.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=2.5
letter=c.flat('Drone worn ceramic index',(.52,.50,.44),.02,.7)
MATS=[paint,steel,bronze,dark,lens,light,letter]
assembly=c.empty('SovereignDrone');root=assembly
helpers=ast.parse((ROOT/'tools/art/native_machine/build_helm.py').read_text())
fns=[n for n in helpers.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','ring','text']]
metal=steel;ivory=letter
exec(compile(ast.Module(body=fns,type_ignores=[]),'<machining helpers>','exec'))

def sphere(name,at,r,mat,scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=r,location=c.xyz(at))
    obj=bpy.context.object;obj.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return c.finish(obj,name,mat,root)

def front_ring(name,z,r,minor,mat):
    obj=ring(name,(0,0,z),r,minor,mat);obj.rotation_euler.x=math.pi/2;return obj

def panel(name,az0,az1,t0,t1):
    # Closed curved shell segment with a consistent gasket gap and real thickness.
    verts=[];faces=[];rows=8;cols=6
    for rad in [.162,.154]:
        for i in range(rows+1):
            t=t0+(t1-t0)*i/rows
            for j in range(cols+1):
                a=az0+(az1-az0)*j/cols
                verts.append(c.xyz((rad*math.sin(t)*math.cos(a),rad*math.sin(t)*math.sin(a),rad*math.cos(t))))
    n=(rows+1)*(cols+1)
    for i in range(rows):
        for j in range(cols):
            k=i*(cols+1)+j;face=(k,k+1,k+cols+2,k+cols+1)
            faces.append(face);faces.append(tuple(v+n for v in reversed(face)))
    boundary=list(range(cols+1))+[i*(cols+1)+cols for i in range(1,rows+1)]+list(range(n-2,n-cols-2,-1))+[i*(cols+1) for i in range(rows-1,0,-1)]
    for i,k in enumerate(boundary):
        following=boundary[(i+1)%len(boundary)];faces.append((k,k+n,following+n,following))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);c.finish(obj,name,paint,root)
    mod=obj.modifiers.new('Rolled armour seam','BEVEL');mod.width=.0009;mod.segments=2
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)

sphere('Continuous sealed inner hull',(0,0,0),.153,dark)
for side,(t0,t1) in enumerate([(.55,1.515),(1.625,2.61)]):
    for i in range(8):
        a=i*math.tau/8
        panel('Formed armour segment %s-%s'%(side,i),a+.022,a+math.tau/8-.022,t0,t1)
        # Captive radial bolts seat in each shell, not floating around it.
        t=1.27 if side==0 else 1.86;az=a+math.pi/8
        direction=Vector((math.sin(t)*math.cos(az),math.sin(t)*math.sin(az),math.cos(t)))
        tube('Armour fixing washer',direction*.160,direction*.165,.008,steel,24,0)
        tube('Armour recessed hex head',direction*.165,direction*.170,.0046,bronze,6,.0003)

front_ring('Equatorial coupling rim',0,.155,.006,steel)
for i in range(6):
    a=i*math.tau/6+math.pi/6;d=Vector((math.cos(a),math.sin(a),0))
    tube('Radial fixture collar',d*.147,d*.170,.017,steel,32,.001)
    tube('Radial fixture socket',d*.166,d*.178,.012,dark,24,.0005)
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.009,radius2=.0025,depth=.04,location=c.xyz(d*.196))
    obj=bpy.context.object;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=c.xyz(d).to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);c.finish(obj,'Short protected locator',bronze,root,.0004)
    # Small red status slivers seated at the base of each locator.
    tube('Radial status lens',d*.171+Vector((0,0,.010)),d*.178+Vector((0,0,.010)),.0045,light,16,0)

# Concentric optics: a recessed glass lens, retaining rings and an iris.
tube('Optical carrier',(0,0,.126),(0,0,.153),.087,steel,80,.001)
tube('Optical gasket',(0,0,.152),(0,0,.160),.079,dark,80,.0005)
front_ring('Machined optical rim',.160,.075,.0045,steel)
front_ring('Retaining ring',.161,.065,.0025,bronze)
sphere('Convex red lens',(0,0,.159),.063,lens,(1,1,.17))
front_ring('Outer illuminated focus ring',.168,.053,.0018,light)
front_ring('Inner illuminated focus ring',.170,.035,.0012,light)
tube('Dark iris',(0,0,.167),(0,0,.171),.024,dark,64,0)
sphere('Central optical emitter',(0,0,.172),.015,light,(1,1,.12))
for i in range(12):
    a=i*math.tau/12;x=.083*math.cos(a);y=.083*math.sin(a)
    tube('Optic captive screw',(x,y,.151),(x,y,.159),.0034,bronze,12,.0002)
    if i%3==0:
        obj=box('Optical calibration mark',(.058*math.cos(a),.058*math.sin(a),.168),(.006,.0015,.0007),letter,.0001);obj.rotation_euler.y=-a

# Rear service cap with a guarded heat exchanger and readable maintenance tab.
tube('Rear cap gasket',(0,0,-.139),(0,0,-.147),.083,dark,64,.0006)
tube('Rear machined cap',(0,0,-.146),(0,0,-.152),.078,steel,64,.0006)
front_ring('Rear cap retaining rim',-.154,.077,.003,bronze)
box('Rear heat exchanger recess',(0,0,-.154),(.100,.084,.007),dark,.003)
for x in np.linspace(-.043,.043,13):box('Rear screened vent upright',(float(x),0,-.159),(.0012,.072,.0014),steel,.0002)
for y in np.linspace(-.034,.034,9):box('Rear screened vent crosswire',(0,float(y),-.160),(.091,.0012,.0014),steel,.0002)
for y in [-.025,0,.025]:box('Rear weather louvre',(0,y,-.165),(.093,.006,.012),paint,.001)
text('S-07',(0,.057,-.155),.013,rear=True)
text('SEALED',(0,-.056,-.155),.009,rear=True)
for a in [0,math.pi/2,math.pi,math.pi*1.5]:
    tube('Rear cap fixing',(.069*math.cos(a),.069*math.sin(a),-.152),(.069*math.cos(a),.069*math.sin(a),-.157),.0038,bronze,12,.0002)
c.empty('DroneMuzzle',(0,0,.180),assembly)
c.empty('DroneCenter',parent=assembly)

parts=sum(o.type=='MESH' for o in assembly.children_recursive)
degenerate=0
for obj in assembly.children_recursive:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            p=obj.data.vertices[obj.data.loops[loop].vertex_index].co+obj.location;uv.data[loop].uv=(p[a]*7,p[b]*7)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Legend '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bad=[f for f in bm.faces if f.calc_area()<1e-12];degenerate+=len(bad)
    bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Sovereign support drone studio';scene.world=bpy.data.worlds.new('Drone neutral studio');scene.world.color=(.16,.16,.16)
bpy.ops.object.camera_add(location=c.xyz((.49,.30,.77)));camera=bpy.context.object;target=Vector((0,0,0))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=.57;scene.camera=camera
for at,power,size in [((1,-1,1.5),90,1.5),((-1,-.5,.3),45,1),((0,1,1),60,1)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'drone-front.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'SovereignDrone.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True);camera.location=c.xyz((-.5,.25,-.75));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'drone-rear.png');bpy.ops.render.render(write_still=True)
for mat in MATS:
    objects=[o for o in assembly.children if o.type=='MESH' and o.data.materials[0]==mat]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    bpy.context.object.name=mat.name
bpy.ops.object.select_all(action='DESELECT');assembly.select_set(True)
for obj in assembly.children_recursive:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ART/'sovereign-drone.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT')
meshes=[o for o in assembly.children_recursive if o.type=='MESH']
for obj in meshes:obj.data.calc_loop_triangles()
report={'sourceParts':parts,'runtimeMeshes':len(meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes),'removedDegenerateFaces':degenerate,'materials':len(MATS),'bytes':(ART/'sovereign-drone.glb').stat().st_size,'reference':'User-supplied badmechs.png; Sovereign orb','front':'+Z','units':'metres before original character fit'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('NATIVE_DRONE_COMPLETE',json.dumps(report),flush=True)
