"""Native L-12 articulated track derivative. Run in isolated Blender.

Preserves the original fieldwork master and all non-track character geometry.
The runtime link reuses the game's existing materials; Blender keeps the full
authored review assembly with 96 linked shoes and the original body.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-fieldwork';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/fieldwork/fieldwork-kit.blend'
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.name='L12 - articulated drive refinement'
unit=bpy.data.objects['L12'];unit.parent=None
keep={unit,*unit.children_recursive}
for obj in list(scene.objects):
    if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
removed=[]
for obj in list(unit.children_recursive):
    if obj.parent.name in ['L12DriveLeft','L12DriveRight'] and obj.type=='MESH' and obj.data.materials[0].name in ['Field_Rubber','Field_MachinedMetal']:
        removed.append(obj.name);bpy.data.objects.remove(obj,do_unlink=True)
assert len(removed)==4,removed
retained={o.name:hashlib.sha256(bytes(str([(tuple(v.co)) for v in o.data.vertices]),'utf8')).hexdigest() for o in unit.children_recursive if o.type=='MESH'}
rubber=bpy.data.materials['Field_Rubber'];metal=bpy.data.materials['Field_MachinedMetal']
parts=[]

def xyz(v):return Vector((v[0],-v[2],v[1]))

def finish(obj,name,mat,bevel):
    obj.name=name;obj.data.materials.clear();obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Manufactured rounded edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:face.use_smooth=True
    mod=obj.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.append(obj);return obj

def box(name,at,size,mat,bevel):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));obj=bpy.context.object
    obj.dimensions=(size[0],size[2],size[1]);return finish(obj,name,mat,bevel)

def pin(name,a,b,r,mat,segments=16):
    a,b=xyz(a),xyz(b);axis=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=axis.length,location=(a+b)/2)
    obj=bpy.context.object;obj.rotation_euler=axis.to_track_quat('Z','Y').to_euler()
    return finish(obj,name,mat,.0015)

# A steel-backed, replaceable rubber shoe with separated pads, hinge pin ends,
# and machined retention heads. The sole width and drive centreline are retained.
box('Forged link backing',(0,-.012,0),(.298,.012,.041),metal,.003)
for x in [-.096,0,.096]:
    box('Replaceable rubber contact pad',(x,.003,0),(.086,.024,.037),rubber,.005)
    grouser=box('Raised herringbone grip',(x,.018,0),(.074,.010,.012),rubber,.003)
    grouser.rotation_euler.z=.18 if x<0 else -.18 if x>0 else 0
for side in [-1,1]:
    pin('Hardened hinge end',(side*.145,-.009,0),(side*.168,-.009,0),.009,metal)
    pin('Recessed pin retainer',(side*.168,-.009,0),(side*.171,-.009,0),.006,metal,6)

bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();link=bpy.context.object;link.name='L12TrackShoe'
scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
mod=link.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
if not link.data.uv_layers:
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
# Consolidate material slots after joining the separately authored components.
for index in reversed(range(len(link.data.materials))):
    material=link.data.materials[index]
    first=next(i for i,m in enumerate(link.data.materials) if m==material)
    if first!=index:
        for poly in link.data.polygons:
            if poly.material_index==index:poly.material_index=first
        link.data.materials.pop(index=index)
assert len(link.data.materials)==2

# Export only the shoe, with named flat slots. Native code binds the original
# cached character materials; no duplicate image payload is needed in this GLB.
authored_materials=list(link.data.materials)
for index,material in enumerate(authored_materials):
    slot=bpy.data.materials.new(material.name+'_RuntimeSlot');slot.use_nodes=True
    slot.diffuse_color=material.diffuse_color;slot.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=material.diffuse_color
    link.data.materials[index]=slot
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/l12-track-shoe.glb'),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
for index,material in enumerate(authored_materials):link.data.materials[index]=material

half=.29;radius=.17;length=4*half+2*math.pi*radius;count=48
def track_frame(s):
    s%=length
    if s<2*half: z=-half+s;y=.23+radius;angle=0
    elif s<2*half+math.pi*radius:
        angle=(s-2*half)/radius;z=half+radius*math.sin(angle);y=.23+radius*math.cos(angle)
    elif s<4*half+math.pi*radius:z=half-(s-2*half-math.pi*radius);y=.23-radius;angle=math.pi
    else:
        u=(s-4*half-math.pi*radius)/radius;angle=math.pi+u;z=-half-radius*math.sin(u);y=.23-radius*math.cos(u)
    return z,y,angle

for side in [-1,1]:
    drive=bpy.data.objects['L12DriveLeft' if side<0 else 'L12DriveRight']
    for index in range(count):
        obj=bpy.data.objects.new(f'Articulated shoe {side:+d} {index:02d}',link.data);scene.collection.objects.link(obj);obj.parent=drive
        z,y,angle=track_frame(index*length/count)
        obj.location=xyz((side*.44,y,z));obj.rotation_euler.x=angle
bpy.data.objects.remove(link,do_unlink=True)
assert retained=={o.name:hashlib.sha256(bytes(str([tuple(v.co) for v in o.data.vertices]),'utf8')).hexdigest() for o in unit.children_recursive if o.name in retained}
world=bpy.data.worlds.new('L12 neutral inspection');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.23,.27,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55;scene.world=world
for name,at,power,size in [('Key',(-2,3,-3),180,3),('Fill',(3,2,-1),110,2),('Rim',(1,3,3),240,2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=xyz(at);obj.rotation_euler=(xyz((0,.6,0))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.03));floor=bpy.context.object;floor.name='Inspection floor'
floor_mat=bpy.data.materials.new('Review charcoal');floor_mat.diffuse_color=(.055,.061,.067,1);floor.data.materials.append(floor_mat)
camera=bpy.data.objects.new('Drive inspection camera',bpy.data.cameras.new('Drive inspection lens'));scene.collection.objects.link(camera);scene.camera=camera
camera.location=xyz((2.2,1.5,-2.5));camera.rotation_euler=(xyz((0,.65,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=52
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=6;scene.render.resolution_x=1400;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'L12ArticulatedDrive.blend'))
report={'source':'assets/fieldwork/fieldwork-kit.blend','sourceSHA256':source_hash,'removedStaticBatches':removed,'retainedBodyMeshes':len(retained),'unchangedBodyGeometry':True,'linksPerBelt':count,'beltLengthM':length,'wheelRadiusM':.143,'beltRadiusM':radius,'linkTriangles':len(next(o.data for o in unit.children_recursive if o.name.startswith('Articulated shoe')).polygons),'runtimeMaterials':'Rebound to existing Field_Rubber / Field_MachinedMetal; no new textures','license':'Original project-authored derivative; no external models'}
(OUT/'drive-report.json').write_text(json.dumps(report,indent=2))
scene.render.filepath=str(OUT/'l12-drive-review.png');bpy.ops.render.render(write_still=True)
camera.location=xyz((1.35,.53,-.6));camera.rotation_euler=(xyz((.42,.25,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=54
scene.render.filepath=str(OUT/'l12-drive-detail.png');bpy.ops.render.render(write_still=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
print('L12_DRIVE_COMPLETE',json.dumps(report),flush=True)
