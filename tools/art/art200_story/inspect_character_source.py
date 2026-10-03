import bpy
from pathlib import Path
R=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/art100/story-robots/CompleteCharacterAssemblies.blend'))
root=bpy.data.objects['Complete_ScavengerSurveyPack'];deps=bpy.context.evaluated_depsgraph_get()
for obj in root.children_recursive:
 if obj.type=='ARMATURE':
  print('RIG',obj.name,'ACTIVE',obj.animation_data.action.name if obj.animation_data and obj.animation_data.action else None)
  if obj.animation_data:print('NLA',[(t.name,[(s.name,s.action.name) for s in t.strips]) for t in obj.animation_data.nla_tracks])
 if obj.type!='MESH':continue
 evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh();used={i for p in mesh.polygons for i in p.vertices}
 for name,ids in [('all',range(len(mesh.vertices))),('used',used)]:
  pts=[evaluated.matrix_world@mesh.vertices[i].co for i in ids]
  print(obj.name,name,len(ids),'LO',tuple(min(p[k] for p in pts) for k in range(3)),'HI',tuple(max(p[k] for p in pts) for k in range(3)))
 evaluated.to_mesh_clear()
