"""Six complete native-equipped characters, preserving original armatures.

Input comes from tests/art200_export_characters.gd after the coordinated import.
The separate StoryRobots-editable.blend retains every authored attachment part.
"""
import bpy,json,struct
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
manifest=json.loads((O/'manifest.json').read_text());native=json.loads((O/'native-assemblies/export-report.json').read_text())
records=[]
for i,entry in enumerate(manifest['models'][19:]):
 kind=entry['runtime_target'].split(':')[1];path=O/'native-assemblies'/(kind+'.glb')
 raw=path.read_bytes();count=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+count])
 joints=sum(len(s['joints']) for s in gltf.get('skins',[]))
 if not joints:raise RuntimeError(kind+' native review export lost original skin joints')
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));objects=[o for o in bpy.data.objects if o not in before]
 rigs=[o for o in objects if o.type=='ARMATURE']
 if not rigs:raise RuntimeError(kind+' review source lost original armature')
 helpers={bone.custom_shape for rig in rigs for bone in rig.pose.bones if bone.custom_shape}
 for helper in helpers:helper.hide_render=True;helper['review_rig_helper']=True
 for obj in objects:
  if not obj.animation_data:continue
  idle=next((strip for track in obj.animation_data.nla_tracks for strip in track.strips if 'idle' in strip.name.lower()),None)
  if idle:
   obj.animation_data.action=idle.action
   if idle.action_slot:obj.animation_data.action_slot=idle.action_slot
 assembly=bpy.data.objects.new('Complete_'+entry['id'],None);bpy.context.collection.objects.link(assembly)
 for obj in objects:
  if obj.parent not in objects:
   matrix=obj.matrix_world.copy();obj.parent=assembly;obj.matrix_world=matrix
 # Keep original animation actions and rigs. The exported body and attachments
 # share the exact native rest frame, including the equipped drone replacement.
 bpy.context.scene.frame_set(8,subframe=.5);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 points=[]
 for obj in assembly.children_recursive:
  if obj.type!='MESH' or obj in helpers:continue
  evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
  points.extend(evaluated.matrix_world@v.co for v in mesh.vertices);evaluated.to_mesh_clear()
 lo=[min(v[k] for v in points) for k in range(3)];hi=[max(v[k] for v in points) for k in range(3)]
 triangles=0
 for obj in assembly.children_recursive:
  if obj.type=='MESH' and obj not in helpers:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
 assembly.location.x=i*2.4
 entry['complete_assembly_source']='assets/art100/story-robots/CompleteCharacterAssemblies.blend';entry['complete_assembly_root']=assembly.name
 entry['complete_assembly_triangles']=triangles;entry['complete_assembly_rig_bones']=sum(len(r.data.bones) for r in rigs)
 entry['complete_assembly_source_method']='Native runtime visual export, retains original Skeleton3D/skin and faction finish; authored editable attachment parts in StoryRobots-editable.blend'
 entry['complete_assembly_source_dimensions_m']=[round(hi[0]-lo[0],5),round(hi[2]-lo[2],5),round(hi[1]-lo[1],5)]
 record={'kind':kind,'root':assembly.name,'skin_joints':joints,'blender_bones':entry['complete_assembly_rig_bones'],'triangles':triangles,'native':native['characters'][kind]}
 records.append(record);print('COMPLETE_NATIVE_CHARACTER',record,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(O/'CompleteCharacterAssemblies.blend'),compress=True)
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(O/'native-assemblies/source-validation.json').write_text(json.dumps({'characters':records,'failures':[]},indent=2)+'\n')
