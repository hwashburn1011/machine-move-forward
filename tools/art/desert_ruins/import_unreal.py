"""Build an Unreal 5.8 asset library from the original Blender FBX and PBR masters."""
import unreal, json, traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/desert-ruins';DEST='/Game/DesertRuins'
tools=unreal.AssetToolsHelpers.get_asset_tools();edit=unreal.MaterialEditingLibrary
report={'engine':unreal.SystemLibrary.get_engine_version(),'imports':[]}
def task(file,name,options=None,folder=DEST):
    t=unreal.AssetImportTask();t.filename=str(file);t.destination_path=folder;t.destination_name=name;t.automated=True;t.replace_existing=True;t.replace_existing_settings=True;t.save=True
    if options:t.options=options
    tools.import_asset_tasks([t]);return [unreal.load_asset(p) for p in t.imported_object_paths]
try:
    textures={}
    for file in sorted((OUT/'textures').iterdir()):
        if file.suffix.lower() not in ['.jpg','.png']:continue
        for tex in task(file,file.stem,folder=DEST+'/Textures'):
            if not isinstance(tex,unreal.Texture2D):continue
            if file.stem.endswith('_Normal'):
                tex.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_NORMALMAP);tex.set_editor_property('srgb',False);tex.set_editor_property('flip_green_channel',True)
            elif file.stem.endswith('_ORM'):
                tex.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_MASKS);tex.set_editor_property('srgb',False)
            textures[file.stem]=tex
    assert len(textures)==3,'All three PBR maps must import'
    mat=tools.create_asset('M_DesertAtlas',DEST+'/Materials',unreal.Material,unreal.MaterialFactoryNew()) or unreal.load_asset(DEST+'/Materials/M_DesertAtlas')
    edit.delete_all_material_expressions(mat)
    for suffix,kind,y in [('BaseColor',unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,-200),('Normal',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,50),('ORM',unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,300)]:
        n=edit.create_material_expression(mat,unreal.MaterialExpressionTextureSample,-450,y);n.texture=textures['DesertAtlas_'+suffix];n.sampler_type=kind
        if suffix=='BaseColor':edit.connect_material_property(n,'RGB',unreal.MaterialProperty.MP_BASE_COLOR)
        elif suffix=='Normal':edit.connect_material_property(n,'RGB',unreal.MaterialProperty.MP_NORMAL)
        else:
            for channel,prop in [('R',unreal.MaterialProperty.MP_AMBIENT_OCCLUSION),('G',unreal.MaterialProperty.MP_ROUGHNESS),('B',unreal.MaterialProperty.MP_METALLIC)]:edit.connect_material_property(n,channel,prop)
    mat.set_editor_property('two_sided',True);edit.recompile_material(mat)
    sizes={r['name']:r['size_m'] for r in json.loads((OUT/'source/model-report.json').read_text())}
    for file in sorted((OUT/'exports').glob('*.fbx')):
        options=unreal.FbxImportUI();options.import_mesh=True;options.import_as_skeletal=False;options.import_materials=False;options.import_textures=False;options.import_animations=False;options.automated_import_should_detect_type=False;options.mesh_type_to_import=unreal.FBXImportType.FBXIT_STATIC_MESH
        data=options.static_mesh_import_data;data.combine_meshes=True;data.normal_import_method=unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS;data.import_uniform_scale=1.0;data.convert_scene=True;data.convert_scene_unit=False
        for mesh in task(file,file.stem.replace('-','_'),options,DEST+'/Meshes'):
            if not isinstance(mesh,unreal.StaticMesh):continue
            for i in range(len(mesh.get_editor_property('static_materials'))):mesh.set_material(i,mat)
            b=mesh.get_bounds();size=[b.box_extent.x*2,b.box_extent.y*2,b.box_extent.z*2]
            assert abs(size[2]/100-sizes[file.stem][2])<.1,('metre scale mismatch',file.stem,size)
            report['imports'].append({'name':file.stem,'path':mesh.get_path_name(),'size_cm':size,'material_assigned':bool(mesh.get_material(0))})
    assert len(report['imports'])==14,report
    # A native review map, arranged in metres converted to Unreal centimetres.
    editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    editor.new_level(DEST+'/DesertLibraryReview')
    actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for i,entry in enumerate(report['imports']):
        mesh=unreal.load_asset(entry['path'])
        actor=actors.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector((i%4)*3100,(i//4)*3000,0))
        actor.static_mesh_component.set_static_mesh(mesh);actor.set_actor_label(entry['name'])
    sun=actors.spawn_actor_from_class(unreal.DirectionalLight,unreal.Vector(0,0,1000),unreal.Rotator(-40,-30,0))
    sun.light_component.set_editor_property('intensity',4.0)
    actors.spawn_actor_from_class(unreal.SkyLight,unreal.Vector(0,0,1000))
    editor.save_current_level()
    unreal.EditorAssetLibrary.save_directory(DEST,only_if_is_dirty=False,recursive=True)
    report.update(status='success',textures=len(textures),materials=1,review_level=DEST+'/DesertLibraryReview')
except Exception:
    report.update(status='failed',error=traceback.format_exc());unreal.log_error(report['error'])
(OUT/'source/unreal-validation.json').write_text(json.dumps(report,indent=2))
unreal.log('DESERT_NATIVE_IMPORT '+json.dumps(report))
