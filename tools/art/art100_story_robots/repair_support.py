"""Visual QA repairs: reader footplate, gyro axle and organic seedlings."""
import bpy,ast,sys,math,json,bmesh
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots'
recipe=ast.parse((Path(__file__).parent/'build.py').read_text(encoding='utf-8-sig'))
functions=[n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name in ['xyz','finish','box','tube','leaf_blade']]
exec(compile(ast.Module(body=functions,type_ignores=[]),'<authoring functions>','exec'))
for filename in ['StoryRobots-editable.blend','StoryRobots-runtime.blend']:
 bpy.ops.wm.open_mainfile(filepath=str(O/filename));bpy.context.preferences.filepaths.save_version=0
 steel=bpy.data.materials['A100 phosphated steel'];metal=bpy.data.materials['A100 brushed alloy'];leaf=bpy.data.materials['A100 propagation leaves']
 box('Continuous pedestal load plate',(0,.09,0),(.75,.06,.48),steel,bpy.data.objects['MemoryReader'],.014)
 tube('Continuous gimbal axle',(-.31,.83,0),(.31,.83,0),.034,metal,bpy.data.objects['NavGyroCradle'])
 plants=bpy.data.objects['LivingSprouts']
 for obj in list(plants.children_recursive):bpy.data.objects.remove(obj,do_unlink=True)
 for i in range(6):
  x=-1+i*.4;tube('Seedling stem',(x,1.08,0),(x,1.29,0),.007,leaf,plants,10)
  for j in range(3):leaf_blade((x,1.15+j*.045,0),(1 if j%2 else -1,0,.28 if j%2 else -.28),.16,.042,plants)
 for o in [o for o in bpy.data.objects if o.type=='MESH' and not o.data.uv_layers]:
  mesh=o.data;uv=mesh.uv_layers.new().data
  for p in mesh.polygons:
   axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in p.loop_indices:
    v=mesh.vertices[mesh.loops[li].vertex_index].co;uv[li].uv=(v[axes[0]]*2,v[axes[1]]*2)
 if filename.endswith('runtime.blend'):
  for parent in [bpy.data.objects['MemoryReader'],bpy.data.objects['NavGyroCradle'],plants]:
   for mat in list(bpy.data.materials):
    parts=[o for o in parent.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(parts)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_'+mat.name
  for o in [o for o in bpy.data.objects if o.type=='MESH']:
   bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Portable tangent topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.ops.export_scene.gltf(filepath=str(R/'godot/art/art100-story-robots.glb'),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
 bpy.ops.wm.save_as_mainfile(filepath=str(O/filename),compress=True)
manifest=json.loads((O/'manifest.json').read_text())
for entry in manifest['models']:
 r=bpy.data.objects[entry['id']];objs=[o for o in r.children_recursive if o.type=='MESH']
 for o in objs:o.data.calc_loop_triangles()
 entry['triangles']=sum(len(o.data.loop_triangles) for o in objs);entry['runtime_meshes']=len(objs)
 points=[o.matrix_world@Vector(v) for o in objs for v in o.bound_box]
 low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
 entry['bounds_min']=[round(low.x,5),round(low.z,5),round(-high.y,5)];entry['bounds_max']=[round(high.x,5),round(high.z,5),round(-low.y,5)]
 entry['dimensions_m']=[round(high.x-low.x,5),round(high.z-low.z,5),round(high.y-low.y,5)]
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
sys.path.insert(0,str(R/'tools/art/native_enemies'));from repair_tangents import repair
print('SUPPORT_REPAIR',repair(R/'godot/art/art100-story-robots.glb'),flush=True)
