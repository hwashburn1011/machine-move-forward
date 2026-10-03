import bpy,json
from pathlib import Path
from mathutils import Matrix
R=Path(__file__).resolve().parents[3]
for source in ['assets/art100/story-robots/art200-before/bastion-components.blend','assets/art100/Art100Review.blend']:
 bpy.ops.wm.open_mainfile(filepath=str(R/source))
 print('SOURCE',source,flush=True)
 for o in bpy.data.objects:
  if (o.type=='ARMATURE' and ('bastion' in o.name.lower() or 'components' in source)) or (o.type=='MESH' and ('Cranial stub antenna' in o.name or 'RefinedSkin' in o.name)):
   print('OBJECT',o.name,o.type,'parent',o.parent.name if o.parent else None,'matrix',list(map(list,o.matrix_world)),'inverse',list(map(list,o.matrix_parent_inverse)),'dims',list(o.dimensions),'verts',len(o.data.vertices) if o.type=='MESH' else 0,flush=True)
   if o.type=='ARMATURE':print('BONES',[(b.name,list(b.head_local),list(b.tail_local)) for b in o.data.bones][:8],flush=True)
   elif 'Cranial' in o.name:print('GROUPS',[(g.name,g.index) for g in o.vertex_groups],flush=True)
 if 'Review' in source:
  for o in bpy.data.objects:
   if 'Bastion' in o.name or 'bastion' in o.name:print('BASTION',o.name,o.type,[c.name for c in o.children],flush=True)
