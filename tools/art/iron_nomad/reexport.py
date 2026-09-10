"""Re-export from the compact portable Blender assembly without joining the master again."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/iron-nomad'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/IronNomad_Portable.blend'))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    tri=o.modifiers.new('Portable explicit triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Portable.blend'))
def counts():
    for o in meshes:o.data.calc_loop_triangles()
    return {'triangles':sum(len(o.data.loop_triangles) for o in meshes),'meshObjects':len(meshes),'materialPrimitives':sum(len(o.data.materials) for o in meshes)}
manifest={'full':counts()}
def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/f'{name}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
        export_yup=True,export_extras=True,export_tangents=True,export_animations=True,export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,export_cameras=False,export_lights=False)
export('iron-nomad-full')
bpy.ops.export_scene.fbx(filepath=str(OUT/'exports/iron-nomad-full.fbx'),use_selection=True,
    object_types={'MESH','EMPTY'},apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',
    add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=False,bake_anim_use_nla_strips=False,
    path_mode='COPY',embed_textures=True,use_tspace=True,axis_forward='-Y',axis_up='Z')
for o in scene.objects:
    if o.type!='MESH' or len(o.data.polygons)<200:continue
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    dec=o.modifiers.new('Game silhouette-preserving reduction','DECIMATE');dec.ratio=.42;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
manifest['game']=counts()
export('iron-nomad-game')
collider_scene=bpy.data.scenes.new('Iron Nomad collision proxies');bpy.context.window.scene=collider_scene
root=bpy.data.objects.new('IronNomad_Collision',None);collider_scene.collection.objects.link(root);root['collisionOnly']=True
contract=json.loads((OUT/'source/manifest.json').read_text(encoding='utf-8'))
for i,desc in enumerate(contract['proxies']):
    bpy.ops.mesh.primitive_cube_add(size=1,location=desc['center']);o=bpy.context.object;o.name='UCX_'+desc['name']+'_'+str(i)
    o.scale=desc['size'];o.parent=root;o['collisionOnly']=True;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports/iron-nomad-colliders.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=True,export_animations=False)
manifest['colliders']=len(contract['proxies']);manifest['lightAnchors']=sum(1 for a in contract['anchors'] if a['role'] in ['light','area-light'])
(OUT/'source/export-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('PORTABLE REEXPORT COMPLETE',flush=True)
