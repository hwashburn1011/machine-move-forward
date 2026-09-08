"""Run through MCP once: preserve the live scene and create an owned art scene."""
import bpy
from pathlib import Path
from datetime import datetime
import json

directory = Path('C:/Users/hwash/Documents/MachineMoveForward/assets/blender/graphics-v2')
directory.mkdir(parents=True, exist_ok=True)
backup = directory / ('interactive-session-copy-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.blend')
original_scene = bpy.context.window.scene
original_path = bpy.data.filepath
bpy.ops.wm.save_as_mainfile(filepath=str(backup), copy=True)
scene = bpy.data.scenes.get('MMF_Graphics_Review') or bpy.data.scenes.new('MMF_Graphics_Review')
scene['mmfGraphicsOwned'] = True
scene['originalScene'] = original_scene.name
world = bpy.data.worlds.get('MMF_Graphics_World') or bpy.data.worlds.new('MMF_Graphics_World')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.17, .20, .24, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .5
scene.world = world
print(json.dumps({'backup': str(backup), 'originalScene': original_scene.name,
                  'livePathPreserved': bpy.data.filepath == original_path,
                  'reviewScene': scene.name, 'originalObjects': len(original_scene.objects)}))
