"""Inspect the retained S-07 source in a separate Blender scene via local MCP."""
import bpy, json
from pathlib import Path
root = Path(r'C:/Users/hwash/Documents/MachineMoveForward')
scene = bpy.data.scenes.get('S07 - native motion review')
if scene is None:
    scene = bpy.data.scenes.new('S07 - native motion review')
    with bpy.data.libraries.load(str(root/'assets/animation-polish/source/s07_polish.blend'), link=False) as (source, target):
        target.objects = source.objects
    for obj in target.objects:
        if obj is not None: scene.collection.objects.link(obj)
bpy.context.window.scene = scene
rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
print(json.dumps({'rig': rig.name, 'scale':list(rig.scale),
                  'bones': {b.name: {'head':list(b.head_local), 'tail':list(b.tail_local), 'length':b.length} for b in rig.data.bones if b.name in ['root','pelvis','thigh_r','calf_r','foot_r']},
                  'actions':[a.name for a in bpy.data.actions if a.name.startswith('armed_')]}))
