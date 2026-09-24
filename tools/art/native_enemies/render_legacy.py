"""Render saved editable Blender assemblies without rebuilding or saving them."""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parents[3] / 'assets/native-legacy-enemies'
preferences = bpy.context.preferences.addons['cycles'].preferences
preferences.compute_device_type = 'OPTIX'
preferences.get_devices()
for device in preferences.devices:
    device.use = device.type == 'OPTIX'
for kind in ('raider', 'scavenger'):
    bpy.ops.wm.open_mainfile(filepath=str(root / (kind + '.blend')))
    bpy.context.scene.cycles.device = 'GPU'
    bpy.context.scene.render.filepath = str(root / (kind + '.png'))
    bpy.ops.render.render(write_still=True)
