"""Refresh only the full FBX from the existing portable derivative."""
import bpy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/iron-nomad/gameplay'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'source/IronNomad_Portable.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(
    filepath=str(OUT / 'exports/iron-nomad-full.fbx'), use_selection=True,
    object_types={'MESH', 'EMPTY'}, apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS',
    add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=False,
    bake_anim_use_nla_strips=False, path_mode='COPY', embed_textures=True,
    use_tspace=True, mesh_smooth_type='FACE', axis_forward='-Y', axis_up='Z',
)
print('Refreshed playable FBX with face smoothing groups', flush=True)
