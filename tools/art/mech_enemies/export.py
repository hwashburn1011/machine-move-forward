"""Portable exports from a reviewed source; never modifies the source file."""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies'
kind=sys.argv[sys.argv.index('--')+1];scene=bpy.context.scene
rig=bpy.data.objects[kind+'_Rig'];parts=[o for o in scene.objects if o.type=='MESH' and o.parent==rig]
gear=[o for o in scene.objects if o.type=='EMPTY' and (o.name.startswith('Weapon_') or o.name=='Sovereign_Drone')]
def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
def joined(objects,name,posed=False):
    copies=[];dg=bpy.context.evaluated_depsgraph_get()
    for src in objects:
        if posed:o=bpy.data.objects.new(name,bpy.data.meshes.new_from_object(src.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg))
        else:
            o=src.copy();o.data=src.data.copy()
            for mod in list(o.modifiers):o.modifiers.remove(mod)
        o.parent=None;o.matrix_world=src.matrix_world.copy();scene.collection.objects.link(o);copies.append(o)
    select(copies);bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Defined triangulation and compact draw-call material table.
    tri=o.modifiers.new('Portable triangular topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    old=list(o.data.materials);unique=[];remap={}
    for i,m in enumerate(old):
        if m not in unique:unique.append(m)
        remap[i]=unique.index(m)
    indices=[remap[p.material_index] for p in o.data.polygons];o.data.materials.clear()
    for m in unique:o.data.materials.append(m)
    for p,i in zip(o.data.polygons,indices):p.material_index=i
    return o
def glb(name,objects):
    select(objects);bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/f'{name}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True,export_skins=True,export_tangents=True)
def fbx(name,objects):
    select(objects);bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/f'{name}.fbx'),use_selection=True,object_types={'ARMATURE','MESH','EMPTY'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',add_leaf_bones=False,bake_anim=False,mesh_smooth_type='FACE',path_mode='COPY',embed_textures=True,axis_forward='-Y',axis_up='Z')
def stats(o):
    o.data.calc_loop_triangles();return {'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'materials':len(o.data.materials)}
def reduce(o,ratio):
    select([o]);dec=o.modifiers.new('Game detail reduction','DECIMATE');dec.ratio=ratio
    if len(o.modifiers)>1:bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)

pose=joined(parts,kind+'_ReferenceBody',True);posed_gear=[]
for root in gear:posed_gear.append(joined([o for o in root.children if o.type=='MESH'],root.name+'_Reference',True))
glb(kind+'_showcase',[pose]+posed_gear)
for o in [pose]+posed_gear:bpy.data.objects.remove(o,do_unlink=True)

scale=rig.scale.copy();rig.scale=(1,1,1);rig.animation_data_clear()
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
skin=joined(parts,kind+'_Body');skin.parent=rig
mod=skin.modifiers.new('Mechanical deformation','ARMATURE');mod.object=rig
uniform=Matrix.Scale(scale.x,4)
rig.data.transform(uniform);skin.data.transform(uniform)
rig.scale=(1,1,1);skin.matrix_basis=Matrix.Identity(4);bpy.context.view_layer.update()
glb(kind+'_rigged',[skin,rig]);fbx(kind+'_rigged',[skin,rig])
manifest={'asset':kind,'body':stats(skin),'bones':len(rig.data.bones),'sourceComponents':len(parts),'units':'meters','pose':'Neutral A pose. Editable Reference_Pose action remains in source. No locomotion or attack animations.','equipment':[]}
for i,root in enumerate(gear):
    if i>0 and kind=='revenant':continue
    source=[o for o in root.children if o.type=='MESH'];root.matrix_world=Matrix.Identity(4);bpy.context.view_layer.update()
    item=joined(source,kind+'_Equipment');item.parent=root;root.scale=scale;bpy.context.view_layer.update()
    sockets=[o for o in root.children if o.type=='EMPTY'];glb(kind+'_equipment',[item,root]+sockets);fbx(kind+'_equipment',[item,root]+sockets)
    manifest['equipment'].append(stats(item));bpy.data.objects.remove(item,do_unlink=True)
reduce(skin,.38 if kind=='warden' else .48);glb(kind+'_game',[skin,rig]);manifest['gameBody']=stats(skin)
(OUT/'source'/f'{kind}_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('MECH EXPORT COMPLETE',json.dumps(manifest),flush=True)
