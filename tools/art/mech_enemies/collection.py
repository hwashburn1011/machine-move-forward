"""A single rendered view of the four delivered models at their actual scales."""
import bpy,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies'
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
for kind,x,y in [('bastion',-3.45,.25),('revenant',-.8,-.28),('warden',1.35,.17),('sovereign',3.35,.22)]:
    before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'exports'/f'{kind}_showcase.glb'))
    objects=set(scene.objects)-before;root=bpy.data.objects.new(kind.upper(),None);scene.collection.objects.link(root)
    for o in objects:
        if o.parent not in objects:o.parent=root
    root.location=(x,y,0)
    for o in objects:
        if o.type=='MESH':o.visible_shadow=True
mat=bpy.data.materials.new('Collection backdrop');mat.diffuse_color=(.052,.065,.078,1);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=mat.diffuse_color;p.inputs['Roughness'].default_value=.84
bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.025));bpy.context.object.data.materials.append(mat)
world=bpy.data.worlds.new('Collection studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.035,.045,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
def area(name,at,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size*.5;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=at;o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler()
area('Long warm softbox',(-3,-6,7),3200,(1,.84,.65),8)
area('Cool frontal fill',(5,-4,4),1700,(.63,.76,1),6)
area('Amber shoulder rim',(1,4,6),3600,(1,.57,.31),7)
d=bpy.data.cameras.new('Collection camera');camera=bpy.data.objects.new('Collection camera',d);scene.collection.objects.link(camera);camera.location=(-3.2,-17.8,4.4);target=Vector((0,-.08,1.42));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=10.1;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=100;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.view_settings.view_transform='AgX';scene.render.resolution_x=2200;scene.render.resolution_y=1050;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/Mech_Collection.blend'))
scene.render.filepath=str(OUT/'preview/collection.png');bpy.ops.render.render(write_still=True)
print('COLLECTION RENDER COMPLETE',flush=True)
