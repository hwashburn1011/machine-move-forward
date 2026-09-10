"""Export the reviewed source without damaging its editable components.
Run Blender -b source/S07_Gunner.blend --python tools/art/gunner_s07/deliver.py
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07';scene=bpy.context.scene
rig=bpy.data.objects['S07_Rig'];weapon=bpy.data.objects['S07_Weapon']
char_parts=[o for o in bpy.data.objects if o.type=='MESH' and o.parent==rig]
gun_parts=[o for o in bpy.data.objects if o.type=='MESH' and o.parent==weapon]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def select(objects):
    for o in bpy.context.selected_objects:o.select_set(False)
    for o in objects:o.hide_set(False);o.select_set(True)
    if objects:bpy.context.view_layer.objects.active=objects[0]
def png(name,camera,w,h,samples=80):
    scene.camera=bpy.data.objects[camera];scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100;scene.cycles.samples=samples
    scene.render.filepath=str(OUT/'preview'/name);bpy.ops.render.render(write_still=True)
def count(o):
    o.data.calc_loop_triangles();return {'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'materials':len(o.data.materials)}
def joined_copy(objects,name,posed=False):
    copies=[];dg=bpy.context.evaluated_depsgraph_get()
    for original in objects:
        if posed:
            ob=bpy.data.objects.new(name,bpy.data.meshes.new_from_object(original.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg));ob.matrix_world=original.matrix_world
        else:
            ob=original.copy();ob.data=original.data.copy();ob.parent=None;ob.matrix_world=original.matrix_world.copy()
            for mod in list(ob.modifiers):ob.modifiers.remove(mod)
        scene.collection.objects.link(ob);copies.append(ob)
    select(copies);bpy.ops.object.join();ob=bpy.context.object;ob.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Triangles give both FBX and glTF a defined tangent basis for normal maps.
    tri=ob.modifiers.new('Portable triangle topology','TRIANGULATE');tri.quad_method='FIXED'
    if hasattr(tri,'keep_custom_normals'):tri.keep_custom_normals=True
    bpy.ops.object.modifier_apply(modifier=tri.name)
    # Join can leave redundant slots. Remap by material identity to reduce draws.
    old=list(ob.data.materials);unique=[];remap={}
    for i,m in enumerate(old):
        if m not in unique:unique.append(m)
        remap[i]=unique.index(m)
    indices=[remap[p.material_index] for p in ob.data.polygons];ob.data.materials.clear()
    for m in unique:ob.data.materials.append(m)
    for p,i in zip(ob.data.polygons,indices):p.material_index=i
    return ob

def glb(path,objects):
    select(objects);bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_yup=True,export_apply=False,export_texcoords=True,export_normals=True,export_tangents=True)
def fbx(path,objects):
    select(objects);bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/path),use_selection=True,object_types={'ARMATURE','MESH','EMPTY'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',add_leaf_bones=False,bake_anim=False,mesh_smooth_type='FACE',use_tspace=True,path_mode='COPY',embed_textures=True,axis_forward='-Y',axis_up='Z')

if 'renders' in args:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
    png('01_S07_reference_pose.png','01 • Reference three-quarter',1400,1800,112)
    png('04_S07_helmet_detail.png','04 • Helmet study',1400,1400,112)
    # Neutral front and back are essential for assessing the inferred surfaces.
    rig.data.pose_position='REST';weapon.hide_render=True
    for o in gun_parts:o.hide_render=True
    bpy.context.view_layer.update()
    png('02_S07_neutral_front.png','02 • Neutral front',1200,1600,80)
    bpy.data.objects['Neutral studio cyclorama'].rotation_euler.z=math.pi
    cam=bpy.data.objects['03 • Back equipment'];cam.location=(3,6,3);cam.rotation_euler=(Vector((.25,.07,1.10))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
    png('03_S07_back_equipment.png','03 • Back equipment',1200,1600,80)
    print('REVIEW RENDERS COMPLETE',flush=True)
    sys.exit()

# Preserve the visible Gun_Ready stance as a static portable showcase.
body_pose=joined_copy(char_parts,'S07_Posed_Character',True)
gun_pose=joined_copy(gun_parts,'S07_Posed_Weapon',True)
glb('S07_Showcase.glb',[body_pose,gun_pose])
posed_stats={'character':count(body_pose),'weapon':count(gun_pose)}
bpy.data.objects.remove(body_pose,do_unlink=True);bpy.data.objects.remove(gun_pose,do_unlink=True)

# Neutral skeletal export: clear action, transforms and weapon presentation.
rig.animation_data_clear()
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
rig.data.pose_position='REST';weapon.matrix_world=Matrix.Identity(4);bpy.context.view_layer.update()
body=joined_copy(char_parts,'S07_Character')
body.parent=rig;mod=body.modifiers.new('S07 skeletal deformation','ARMATURE');mod.object=rig
rig.data.pose_position='POSE';bpy.context.view_layer.update()
glb('S07_Character_Rigged.glb',[body,rig])
fbx('S07_Character_Rigged.fbx',[body,rig])
char_stats=count(body)
gun=joined_copy(gun_parts,'S07_Heavy_Weapon')
sockets=[o for o in weapon.children if o.type=='EMPTY']
gun.parent=weapon
glb('S07_Heavy_Weapon.glb',[gun,weapon]+sockets)
fbx('S07_Heavy_Weapon.fbx',[gun,weapon]+sockets)
gun_stats=count(gun)
# A clean, combined source for engine users; editable source remains untouched.
for o in char_parts+gun_parts:bpy.data.objects.remove(o,do_unlink=True)
for col in list(bpy.data.collections):
    if 'Review studio' in col.name:
        for o in list(col.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(col)
scene.camera=None
weapon.location=(1.15,.20,1.35)
select([rig,body]);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/'S07_Engine_Setup.blend'))
manifest={'blender':bpy.app.version_string,'character':char_stats,'weapon':gun_stats,'bones':len(rig.data.bones),'source_components':{'character':len(char_parts),'weapon':len(gun_parts)},'units':'meters','blender_forward':'-Y','blender_up':'+Z','rig':'Original named skeleton; no claim of Unreal Mannequin compatibility','materials':'Original tileable BaseColor, OpenGL tangent normal, packed ORM. Textures embedded in GLB and Blender. FBX includes textures; Unreal materials may require reconnecting maps.','pose':'Neutral A-pose skeletal character; Gun_Ready editable static action in source; static posed showcase GLB.','inferred':['back','boots','weapon muzzle','hidden armor and cloth surfaces'],'exports':[]}
for p in sorted((OUT/'exports').iterdir()):
    if p.is_file():manifest['exports'].append({'file':p.name,'bytes':p.stat().st_size})
(OUT/'source'/'asset_manifest.json').write_text(json.dumps(manifest,indent=2))
print('EXPORT COMPLETE',json.dumps(manifest),flush=True)
