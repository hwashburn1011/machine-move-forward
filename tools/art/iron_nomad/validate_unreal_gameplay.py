"""Import the corrected FBX as a static review asset; no game engine migration."""
import json, traceback
from pathlib import Path
import unreal

ROOT = Path(__file__).resolve().parents[3]
report = {'engine': unreal.SystemLibrary.get_engine_version(), 'scope': 'static FBX geometry import; runtime animation remains in Three.js'}
try:
    options = unreal.FbxImportUI()
    options.import_mesh = True
    options.import_materials = False
    options.import_textures = False
    options.import_animations = False
    options.automated_import_should_detect_type = False
    options.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    data = options.static_mesh_import_data
    data.combine_meshes = True
    data.convert_scene = True
    data.convert_scene_unit = False
    data.normal_import_method = unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS_AND_TANGENTS
    task = unreal.AssetImportTask()
    task.filename = str(ROOT / 'assets/iron-nomad/gameplay/exports/iron-nomad-full.fbx')
    task.destination_path = '/Game/NomadContinuity'
    task.destination_name = 'IronNomad_CorrectedWorkshop'
    task.automated = True
    task.replace_existing = True
    task.save = True
    task.options = options
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    meshes = []
    for path in task.imported_object_paths:
        asset = unreal.load_asset(path)
        if not isinstance(asset, unreal.StaticMesh): continue
        bounds = asset.get_bounds()
        size = [bounds.box_extent.x*2, bounds.box_extent.y*2, bounds.box_extent.z*2]
        assert 2000 < max(size) < 6000, ('Expected whole machine measured in centimetres', size)
        meshes.append({'asset': path, 'dimensions_cm': size})
    assert len(meshes) == 1, meshes
    report.update(status='success', meshes=meshes)
except Exception:
    report.update(status='failed', error=traceback.format_exc())
    unreal.log_error(report['error'])
(ROOT / 'assets/iron-nomad/gameplay/source/continuity-unreal-validation.json').write_text(json.dumps(report, indent=2))
unreal.log('NOMAD_CONTINUITY_IMPORT ' + json.dumps(report))
