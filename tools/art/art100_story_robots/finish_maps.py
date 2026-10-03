"""Repack saved pixel edits; Blender pack() alone retains stale packed bytes."""
import bpy,sys
import numpy as np
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';T=O/'textures';T.mkdir(exist_ok=True)
colors={'phosphated steel':(.083,.11,.105),'maintenance enamel':(.36,.39,.30),'recovery ochre':(.40,.235,.075),'oxide ceramic':(.27,.06,.025)}
for file in ['StoryRobots-editable.blend','StoryRobots-runtime.blend']:
 bpy.ops.wm.open_mainfile(filepath=str(O/file));bpy.context.preferences.filepaths.save_version=0
 for name,base in colors.items():
  mat=bpy.data.materials.get('A100 '+name)
  image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.name.endswith('_Base'))
  pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
  pixels[:,:3]=pixels[:,:3]*.16+np.array(base)[None,:]*.84
  image.pixels.foreach_set(pixels.ravel());image.filepath_raw=str(T/(name.replace(' ','-')+'-base.png'));image.file_format='PNG';image.save()
  if image.packed_file:image.unpack(method='REMOVE')
  image.reload();image.pack()
  image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.name.endswith('_ORM'))
  pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,1]=.58+(pixels[:,1]-.5)*.12
  metallic=.72 if name=='phosphated steel' else .28 if name=='oxide ceramic' else .30
  pixels[:,2]=metallic+(pixels[:,2]-metallic)*.15
  image.pixels.foreach_set(pixels.ravel());image.filepath_raw=str(T/(name.replace(' ','-')+'-orm.png'));image.file_format='PNG';image.save()
  if image.packed_file:image.unpack(method='REMOVE')
  image.reload();image.pack()
 bpy.ops.wm.save_as_mainfile(filepath=str(O/file),compress=True)
 if file.endswith('runtime.blend'):
  bpy.ops.export_scene.gltf(filepath=str(R/'godot/art/art100-story-robots.glb'),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(R/'tools/art/native_enemies'))
from repair_tangents import repair
print('REPAIRED',repair(R/'godot/art/art100-story-robots.glb'),flush=True)
