import bpy
from pathlib import Path
source=Path('C:/Users/hwash/Documents/MachineMoveForward/assets/desert-ruins/source/DesertRuins.blend')
title='Desert ruins - original scenery library'
scene=bpy.data.scenes.get(title)
if scene is None:
    with bpy.data.libraries.load(str(source),link=False) as (available,loaded):loaded.scenes=[available.scenes[0]]
    scene=loaded.scenes[0];scene.name=title
bpy.context.window.scene=scene
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
print('Original ruin library staged; other scenes preserved.',len(scene.objects))
