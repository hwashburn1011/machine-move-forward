"""Run through the existing local Blender MCP bridge after building the gallery."""
import bpy,json
from pathlib import Path
root=Path(r'C:\Users\hwash\Documents\MachineMoveForward')
backup=root/'assets/art100/MCP-session-before-Art100.blend'
if not backup.exists():bpy.ops.wm.save_as_mainfile(filepath=str(backup),copy=True)
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/art100/Art100Review.blend'))
bpy.context.scene.camera=bpy.data.objects['Camera / ALL 100 / physical scale']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.clip_end=1000
            area.spaces.active.region_3d.view_perspective='CAMERA'
print(json.dumps({'file':bpy.data.filepath,'whole_assemblies':bpy.context.scene['ART100_whole_assembly_count'],'preserved_session':str(backup)}))
