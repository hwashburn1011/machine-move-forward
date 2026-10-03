"""Narrow editable-source mate of fix_workshop_stencil.py."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
path=ROOT/'assets/native-survivor/native-rooftop-workshop.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
object=bpy.data.objects['Workshop motto'];object.rotation_euler.z=0
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
print('WORKSHOP_STENCIL_SOURCE_FACES_INTERIOR')
