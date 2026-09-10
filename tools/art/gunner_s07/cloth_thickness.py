"""Restore the torn cloth's physical thickness after clearance projection."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07';rig=bpy.data.objects['S07_Rig'];rig.data.pose_position='REST'
o=bpy.data.objects['Wind-shaped shredded shoulder cloak'];old=o.data;n=85*48;verts=[v.co.copy() for v in old.vertices[:n]];polys=[p for p in old.polygons if all(i<n for i in p.vertices)];faces=[tuple(p.vertices) for p in polys];uv=[tuple(old.uv_layers.active.data[li].uv) for p in polys for li in p.loop_indices]
me=bpy.data.meshes.new('S07 draped cloth with distinct front and back');me.from_pydata(verts,[],faces);me.update();me.materials.append(bpy.data.materials['S07_Weathered_WovenScarf']);layer=me.uv_layers.new(name='UVMap')
for target,value in zip(layer.data,uv):target.uv=value
for p in me.polygons:p.use_smooth=True
o.data=me;o.vertex_groups.clear();o.vertex_groups.new(name='spine_02').add(list(range(n)),1,'REPLACE')
for obj in bpy.context.selected_objects:obj.select_set(False)
o.select_set(True);bpy.context.view_layer.objects.active=o
for mod in list(o.modifiers):o.modifiers.remove(mod)
sol=o.modifiers.new('Separated woven faces','SOLIDIFY');sol.thickness=.0018;sol.offset=0;bpy.ops.object.modifier_apply(modifier=sol.name)
mod=o.modifiers.new('S07 skeletal deformation','ARMATURE');mod.object=rig;rig.data.pose_position='POSE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/S07_Gunner.blend'))
