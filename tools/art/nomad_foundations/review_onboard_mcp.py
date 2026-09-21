"""Review retained onboard prop families in a separate Blender MCP scene."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
out=root/'docs/art/nomad-foundations'
assets={
 'workshop':'assets/workshop/nomad-workshop.blend',
 'galley':'assets/galley/galley-kit.blend',
 'furnishings':'assets/home-life/home-furnishings.blend',
 'fieldwork':'assets/fieldwork/fieldwork-kit.blend',
 'helm':'assets/blender/expansion-v1/navigation-helm.blend',
 'garden':'assets/glass-orchard/seed-garden.blend',
 'stations':'assets/blender/graphics-v2/station-kit.blend',
 'collector':'assets/blender/expansion-v1/automatic-collector.blend',
 'turret':'assets/blender/graphics-v2/manual-turret.blend',
 'auto-turret':'assets/blender/expansion-v1/automatic-turret.blend',
 'construction':'assets/blender/graphics-v2/machine-kit.blend',
 'hook':'assets/blender/graphics-v2/forged-hook.blend',
}
for name,path in assets.items():
 if globals().get('MMF_REVIEW_FAMILIES') and name not in MMF_REVIEW_FAMILIES:continue
 scene=bpy.data.scenes.new('Onboard review '+name)
 with bpy.data.libraries.load(str(root/path),link=False) as (src,dst):
  dst.objects=src.objects
 for obj in dst.objects:
  if obj and obj.type not in ['LIGHT','CAMERA']:
   scene.collection.objects.link(obj)
 bpy.context.window.scene=scene
 scene.view_layers[0].update()
 roots=[o for o in scene.objects if o.parent is None and o.type=='EMPTY']
 parts=[]
 for top in roots:
  nested=[o for o in top.children if o.type=='EMPTY' and any(c.type=='MESH' for c in o.children_recursive)]
  parts.extend(nested or [top])
 for index,part in enumerate(parts):
  meshpoints=[obj.matrix_world@Vector(v) for obj in part.children_recursive if obj.type=='MESH' for v in obj.bound_box]
  if not meshpoints:continue
  low=Vector([min(p[i] for p in meshpoints) for i in range(3)])
  high=Vector([max(p[i] for p in meshpoints) for i in range(3)])
  center=(low+high)*.5
  part.location += Vector(((index%3)*4-center.x,(index//3)*4-center.y,-low.z))
 scene.view_layers[0].update()
 pts=[obj.matrix_world@Vector(p) for obj in scene.objects if obj.type=='MESH' for p in obj.bound_box]
 lo=Vector([min(p[i] for p in pts) for i in range(3)])
 hi=Vector([max(p[i] for p in pts) for i in range(3)])
 center=(lo+hi)/2;extent=max(hi-lo)
 scene.render.engine='CYCLES';scene.cycles.samples=16
 scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('Review neutral '+name);scene.world.use_nodes=True
 scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.23,1)
 scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
 camera=bpy.data.objects.new('Review camera '+name,bpy.data.cameras.new('Lens'))
 scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=extent*1.32
 camera.location=center+Vector((1.3,-2.5,1.6))*extent
 camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
 for side,power in [((1,-2,3),650),((-2,0,2),420)]:
  lamp=bpy.data.objects.new('Review softbox',bpy.data.lights.new('softbox','AREA'))
  scene.collection.objects.link(lamp);lamp.location=center+Vector(side)*extent
  lamp.data.energy=power*extent*extent;lamp.data.size=extent*2
  lamp.rotation_euler=(center-lamp.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/(name+'-review.png'));bpy.ops.render.render(write_still=True)
 print('Reviewed '+name,flush=True)
