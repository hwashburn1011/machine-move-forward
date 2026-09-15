"""Validate Blender exports and create a native Unreal review map."""
import unreal, json, traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/home-life'
tools=unreal.AssetToolsHelpers.get_asset_tools()
report={'engine':unreal.SystemLibrary.get_engine_version(),'assets':[]}
try:
    for file in [OUT/'exports'/(name+'.fbx') for name in ['HomeChair','HomeRug','HomeShelf','HomeTable']]:
        options=unreal.FbxImportUI();options.import_mesh=True;options.import_materials=True
        options.import_textures=True;options.import_animations=False;options.automated_import_should_detect_type=False
        options.mesh_type_to_import=unreal.FBXImportType.FBXIT_STATIC_MESH
        data=options.static_mesh_import_data;data.combine_meshes=True;data.convert_scene=True;data.convert_scene_unit=False
        data.normal_import_method=unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS
        task=unreal.AssetImportTask();task.filename=str(file);task.destination_path='/Game/NomadHome'
        task.destination_name=file.stem.replace('-','_');task.automated=True;task.replace_existing=True;task.save=True;task.options=options
        tools.import_asset_tasks([task])
        for path in task.imported_object_paths:
            asset=unreal.load_asset(path)
            if not isinstance(asset,unreal.StaticMesh):continue
            bound=asset.get_bounds();size=[bound.box_extent.x*2,bound.box_extent.y*2,bound.box_extent.z*2]
            assert 50 < max(size) < 300, ('Expected metre-authored geometry in centimetres',size)
            report['assets'].append({'name':file.stem,'path':path,'size_cm':size,'materials':len(asset.get_editor_property('static_materials'))})
    assert len(report['assets'])==4, report
    editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    editor.new_level('/Game/NomadHome/Review')
    actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for i,entry in enumerate(report['assets']):
        actor=actors.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(i*180,0,0))
        actor.static_mesh_component.set_static_mesh(unreal.load_asset(entry['path']))
        actor.set_actor_label(entry['name'])
    actors.spawn_actor_from_class(unreal.DirectionalLight,unreal.Vector(0,0,3000),unreal.Rotator(-40,-30,0))
    actors.spawn_actor_from_class(unreal.SkyLight,unreal.Vector(0,0,3000))
    editor.save_current_level()
    report['status']='success'
except Exception:
    report.update(status='failed',error=traceback.format_exc())
    unreal.log_error(report['error'])
(OUT/'unreal-validation.json').write_text(json.dumps(report,indent=2))
unreal.log('HOME_IMPORT '+json.dumps(report))
