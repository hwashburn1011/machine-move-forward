"""Execute via the existing Blender MCP bridge; preserve every open scene."""
import bpy
from pathlib import Path

root = Path('C:/Users/hwash/Documents/MachineMoveForward')
path = root / 'assets/quiet-array/QuietArrayReview.blend'
with bpy.data.libraries.load(str(path), link=False) as (source, target):
    target.scenes = source.scenes[:1]
scene = target.scenes[0]
scene.name = 'Quiet Array campaign review'
if bpy.context.window:
    bpy.context.window.scene = scene
    for area in bpy.context.window.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'
print({'scene': scene.name, 'objects': len(scene.objects), 'source': str(path)})
