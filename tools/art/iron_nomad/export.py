"""Portable pivot hierarchy and collider proxies from the untouched master."""
import bpy, json, sys, math, os
from pathlib import Path
from mathutils import Matrix, Vector
sys.path.insert(0,str(Path(__file__).parent))
from kit import uvmap
ROOT=Path(__file__).resolve().parents[3];OUT=Path(os.environ.get('MMF_NOMAD_OUT', ROOT/'assets/iron-nomad'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/IronNomad_Master.blend'))
source=bpy.context.scene;root=bpy.data.objects['IronNomad_FourLegWalker'];source_objects=list(source.objects)
source.view_layers[0].update();dg=bpy.context.evaluated_depsgraph_get()
preserved={o for o in source_objects if o==root or o.get('module') or o.get('anchorRole') or o.name in ['Turbine_Rotor','Crane_Jib','Hoist_Load']}
def owner(o):
    p=o.parent
    while p and p not in preserved:p=p.parent
    return p
portable=bpy.data.scenes.new('Iron Nomad - portable articulated asset')
copies={};worlds={o:o.matrix_world.copy() for o in source_objects}
for src in preserved:
    o=src.copy();o['_exportName']=src.name;portable.collection.objects.link(o);copies[src]=o
for src,o in copies.items():
    p=owner(src);o.parent=copies.get(p);o.matrix_parent_inverse=Matrix.Identity(4)
    o.matrix_basis=worlds[p].inverted()@worlds[src] if p else worlds[src]
groups={}
for src in source_objects:
    if src.type not in ['MESH','CURVE','FONT']:continue
    parent=owner(src)
    if parent is None:continue
    m=bpy.data.meshes.new_from_object(src.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    if not m.uv_layers:uvmap(m)
    m.materials.clear()
    for slot in src.material_slots:m.materials.append(slot.material)
    o=bpy.data.objects.new(src.name+'_Export',m);portable.collection.objects.link(o);o.matrix_world=worlds[src]
    groups.setdefault(parent,[]).append(o)
bpy.context.window.scene=portable
def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
meshes=[]
for parent,objects in groups.items():
    select(objects);bpy.ops.object.join();o=bpy.context.object
    local=worlds[parent].inverted()@o.matrix_world;o.data.transform(local)
    o.parent=copies[parent];o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=Matrix.Identity(4)
    o.name=parent.name+'_Geometry'
    old=list(o.data.materials);unique=list(dict.fromkeys(old));indices=[unique.index(old[p.material_index]) for p in o.data.polygons]
    o.data.materials.clear()
    for m in unique:o.data.materials.append(m)
    for p,i in zip(o.data.polygons,indices):p.material_index=i
    meshes.append(o)
for o in meshes:
    select([o]);tri=o.modifiers.new('Portable explicit triangulation','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)
for src in source_objects:bpy.data.objects.remove(src,do_unlink=True)
for src,o in list(copies.items()):
    # Source identifiers were retained in the copied name before originals were removed.
    o.name=o['_exportName'];del o['_exportName']
portable.render.fps=30;portable.frame_start=0;portable.frame_end=120
for o in copies.values():
    if o.animation_data:
        for track in o.animation_data.nla_tracks:track.mute=False
portable.frame_set(0);portable.view_layers[0].update()
objects=list(portable.objects)
def counts():
    triangles=0
    for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    return {'triangles':triangles,'meshObjects':len(meshes),'materialPrimitives':sum(len(o.data.materials) for o in meshes)}
def glb(name):
    select(objects)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/f'{name}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
        export_yup=True,export_extras=True,export_tangents=True,export_animations=True,export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,export_cameras=False,export_lights=False)
manifest={'full':counts()}
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Portable.blend'))
glb('iron-nomad-full')
select(objects)
bpy.ops.export_scene.fbx(filepath=str(OUT/'exports/iron-nomad-full.fbx'),use_selection=True,
    object_types={'MESH','EMPTY'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',
    add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,
    path_mode='COPY',embed_textures=True,use_tspace=True,axis_forward='-Y',axis_up='Z')
print('Full portable model exported',manifest,flush=True)
for o in meshes:
    if len(o.data.polygons)<200:continue
    select([o]);dec=o.modifiers.new('Game silhouette-preserving reduction','DECIMATE');dec.ratio=.42;dec.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=dec.name)
manifest['game']=counts();glb('iron-nomad-game')

# Coarse primitives and stair treads are supplied in a separate invisible-collider asset.
collider_scene=bpy.data.scenes.new('Iron Nomad - collision proxies');bpy.context.window.scene=collider_scene
proxy_root=bpy.data.objects.new('IronNomad_Collision',None);collider_scene.collection.objects.link(proxy_root)
proxy_root['collisionOnly']=True
contract=json.loads((OUT/'source/manifest.json').read_text(encoding='utf-8'))
for i,desc in enumerate(contract['proxies']):
    bpy.ops.mesh.primitive_cube_add(size=1,location=desc['center']);o=bpy.context.object;o.name='UCX_'+desc['name']+'_'+str(i)
    o.scale=desc['size'];o.parent=proxy_root;o['collisionOnly']=True
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports/iron-nomad-colliders.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,export_animations=False)
manifest['colliders']=len(contract['proxies']);manifest['lightAnchors']=sum(1 for a in contract['anchors'] if a['role'] in ['light','area-light'])
(OUT/'source/export-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('IRON NOMAD EXPORT COMPLETE',manifest,flush=True)
