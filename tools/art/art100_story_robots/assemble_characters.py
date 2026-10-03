"""Editable complete-character review source; reuse exact existing body/rig.

The runtime keeps the smaller attachment kit and existing scenes. This source
assembles six bodies + tailored equipment for artist inspection, not shipping.
"""
import bpy,json
from pathlib import Path
from mathutils import Matrix
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
manifest=json.loads((O/'manifest.json').read_text())
for entry in manifest['models'][19:]:
 kind=entry['runtime_target'].split(':')[1]
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(R/'godot/art'/('refined-'+kind+'.glb')))
 objects=[o for o in bpy.data.objects if o not in before]
 rig=next(o for o in objects if o.type=='ARMATURE')
 assembly=bpy.data.objects.new('Complete_'+entry['id'],None);bpy.context.collection.objects.link(assembly)
 for o in objects:
  if o.parent not in objects:
   matrix=o.matrix_world.copy();o.parent=assembly;o.matrix_world=matrix
 # Append the named editable components, keeping original meaningful names.
 with bpy.data.libraries.load(str(O/'StoryRobots-editable.blend'),link=False) as (source,target):
  target.objects=[entry['id']]
 kit=target.objects[0];bpy.context.collection.objects.link(kit)
 # Blender library dependency closure imports the root but not arbitrary
 # descendants; append the whole collection temporarily then select hierarchy.
 if not kit.children:
  bpy.data.objects.remove(kit,do_unlink=True)
  before=set(bpy.data.objects)
  with bpy.data.libraries.load(str(O/'StoryRobots-editable.blend'),link=False) as (source,target):target.objects=list(source.objects)
  imported=[o for o in bpy.data.objects if o not in before]
  kit=next(o for o in imported if o.name==entry['id'])
  keep={kit,*kit.children_recursive}
  for o in imported:
   if o in keep:bpy.context.collection.objects.link(o)
   else:bpy.data.objects.remove(o,do_unlink=True)
 bone=entry['attachment_bone'];world=kit.matrix_world.copy();kit.parent=rig;kit.parent_type='BONE';kit.parent_bone=bone
 bpy.context.view_layer.update();kit.matrix_world=world
 for mesh in [o for o in objects if o.type=='MESH']:
  for m in mesh.data.materials:
   if not m or not m.use_nodes:continue
   for n in m.node_tree.nodes:
    if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value*=.8
 assembly.location.x=(len([o for o in bpy.data.objects if o.name.startswith('Complete_')])-1)*2.4
 entry['complete_assembly_source']='assets/art100/story-robots/CompleteCharacterAssemblies.blend'
 entry['complete_assembly_root']=assembly.name
 entry['dimensions_scope']='attachment root; complete native assembled dimensions and grounding audited in native-validation.json'
 entry['authored_attachment_triangles']=entry['triangles']
 total=0
 for mesh in [o for o in assembly.children_recursive if o.type=='MESH']:
  mesh.data.calc_loop_triangles();total+=len(mesh.data.loop_triangles)
 entry['complete_assembly_triangles']=total
 print('COMPLETE_ASSEMBLY',kind,total,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(O/'CompleteCharacterAssemblies.blend'),compress=True)
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
