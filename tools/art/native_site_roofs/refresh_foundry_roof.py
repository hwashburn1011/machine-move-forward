"""Refresh only the new roof from the preserved editable Foundry master."""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/expansion_v1'));import build_assets as expansion
sys.path.insert(0,str(ROOT/'tools/art/native_site_roofs'));import roofkit
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/expansion-v1/relay-foundry.blend'))
roof=bpy.data.objects.get('FoundryRoof')
if roof:
    for obj in list(roof.children_recursive):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(roof,do_unlink=True)
root=bpy.data.objects['FoundryRoot'];roofkit.foundry(root)
expansion.export('relay-foundry',prepared_root=root)
