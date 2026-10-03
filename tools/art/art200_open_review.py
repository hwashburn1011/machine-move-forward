"""Open the audited gallery through the user's active Blender MCP endpoint."""
import bpy,json,datetime
from pathlib import Path
root=Path(r'C:\Users\hwash\Documents\MachineMoveForward')
backup=root/('assets/art200/MCP-session-before-Art200-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(backup),copy=True)
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/art200/Art200Review.blend'))
bpy.context.scene.camera=bpy.data.objects['Camera / art200-signs']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.clip_end=1000
            area.spaces.active.region_3d.view_perspective='CAMERA'
print(json.dumps({'file':bpy.data.filepath,'whole_assemblies':bpy.context.scene['ART200_whole_assembly_count'],'preserved_session':str(backup),'camera':bpy.context.scene.camera.name}))
