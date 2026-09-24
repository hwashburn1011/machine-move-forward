"""Append both editable assemblies to the connected Blender review session."""
import bpy
from pathlib import Path

root = Path(r'C:\Users\hwash\Documents\MachineMoveForward\assets\native-legacy-enemies')
for kind in ('raider', 'scavenger'):
    with bpy.data.libraries.load(str(root / (kind + '.blend')), link=False) as (source, destination):
        destination.scenes = [source.scenes[0]]
    scene = destination.scenes[0]
    scene.name = 'Nomad - refined ' + kind
    bpy.context.window.scene = scene
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'
    print('LEGACY_MCP', scene.name, len([o for o in scene.objects if o.type == 'MESH']))
