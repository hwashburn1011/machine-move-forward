"""Native pose QA: expose rear radiator fins and keep uplink outside cloak."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots'
for filename in ['CompleteCharacterAssemblies.blend','StoryRobots-editable.blend']:
 bpy.ops.wm.open_mainfile(filepath=str(O/filename));bpy.context.preferences.filepaths.save_version=0
 for name in ['WardenRangefinder','BastionSiegeRadiator','SovereignComms']:
  root=bpy.data.objects[name]
  for obj in [o for o in root.children_recursive if o.type=='MESH']:
   if name!='SovereignComms':
    if obj.name.startswith('Separated cooling fin'):obj.location.y+=.108
   elif obj.name.startswith('Conformal spinal saddle'):
    # Work in the kit's original metre coordinate frame, independent of the
    # authoring gallery's root placement or retained original bone parent.
    transform=root.matrix_world.inverted()@obj.matrix_world
    for v in obj.data.vertices:
     point=transform@v.co;point.y=.135+(point.y-.135)*3.5;v.co=transform.inverted()@point
   else:
    transform=root.matrix_world.inverted()@obj.matrix_world
    if min((transform@Vector(v)).y for v in obj.bound_box)>0:obj.location.y+=.13
 bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(O/filename),compress=True)
# Rebuild optimized kit from the repaired editable source, retaining authored
# pivots and original PBR map identities. No source geometry is regenerated.
manifest=json.loads((O/'manifest.json').read_text())
roots=[bpy.data.objects[e['id']] for e in manifest['models']]
for root in roots+[bpy.data.objects['LivingSprouts']]:
 for mat in list(bpy.data.materials):
  pieces=[o for o in root.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
  if len(pieces)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in pieces:o.select_set(True)
  bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();bpy.context.object.name=root.name+'_'+mat.name
for obj in [o for o in bpy.data.objects if o.type=='MESH']:
 bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Portable tangent topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.update()
for entry,root in zip(manifest['models'],roots):
 objs=[o for o in root.children_recursive if o.type=='MESH']
 points=[o.matrix_world@Vector(v) for o in objs for v in o.bound_box]
 low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
 entry['bounds_min']=[round(low.x,5),round(low.z,5),round(-high.y,5)];entry['bounds_max']=[round(high.x,5),round(high.z,5),round(-low.y,5)]
 entry['dimensions_m']=[round(high.x-low.x,5),round(high.z-low.z,5),round(high.y-low.y,5)]
 for o in objs:o.data.calc_loop_triangles()
 entry['triangles']=sum(len(o.data.loop_triangles) for o in objs);entry['runtime_meshes']=len(objs)
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(O/'StoryRobots-runtime.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(R/'godot/art/art100-story-robots.glb'),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(R/'tools/art/native_enemies'));from repair_tangents import repair
print('ROBOT_REFIT_COMPLETE',repair(R/'godot/art/art100-story-robots.glb'),flush=True)
