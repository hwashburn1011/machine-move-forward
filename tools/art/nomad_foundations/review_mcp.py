"""Append a separate review scene through Blender MCP; preserve the user's scene."""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path('C:/Users/hwash/Documents/MachineMoveForward')
out=root/'docs/art/nomad-foundations'
out.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.new('Nomad foundation asset review')
with bpy.data.libraries.load(str(root/'assets/nomad-foundations/source/NomadFoundations.blend'),link=False) as (src,dst):
    dst.objects=src.objects
for obj in dst.objects:
    if obj:scene.collection.objects.link(obj)
assets=[o for o in scene.objects if o.get('assetId')]
bpy.context.window.scene=scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.render.resolution_x=960
scene.render.resolution_y=960
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Nomad review neutral world')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.23,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
camera=bpy.data.objects.new('Nomad review camera',bpy.data.cameras.new('Nomad review lens'))
scene.collection.objects.link(camera);scene.camera=camera
camera.data.type='ORTHO'
for name,loc,power,size in [('Key',(3,4,5),650,4),('Fill',(-4,1,3),450,3),('Rim',(1,-4,4),750,3)]:
    lamp=bpy.data.objects.new('Nomad review '+name,bpy.data.lights.new(name,'AREA'))
    scene.collection.objects.link(lamp);lamp.location=loc;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(Vector((0,0,.6))-lamp.location).to_track_quat('-Z','Y').to_euler()
for asset in assets:
    for other in assets:
        for obj in [other,*other.children_recursive]:obj.hide_render=other!=asset
    pts=[obj.matrix_world@Vector(p) for obj in asset.children_recursive if obj.type=='MESH' for p in obj.bound_box]
    lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
    center=(lo+hi)/2;extent=max(hi-lo)
    camera.location=center+Vector((1.25,2.6,1.3))*extent
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=extent*1.55
    scene.render.filepath=str(out/(asset['assetId']+'.png'))
    bpy.ops.render.render(write_still=True)
print('Rendered '+str(len(assets))+' original foundation assets to '+str(out))
