"""MCP-only, additive review scenes; never resets or saves the user's scene."""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
original_path=bpy.data.filepath
original_objects=len(bpy.data.scenes['Scene'].objects)
reviews=[]
for label,assets,camera_at,aim,scale in [
    ('Devices',[('navigation-helm',-2),('automatic-collector',0),('automatic-turret',2)],(4,8,4),(0,0,.8),1),
    ('Gunboat',[('raider-gunboat',0)],(-10,14,9),(0,0,2),3),
    ('Foundry',[('relay-foundry',0)],(-18,18,15),(0,0,1.5),5),
]:
    name='MMF_Expansion_V1_'+label
    scene=bpy.data.scenes.get(name)
    if scene is not None:
        reviews.append(scene);continue
    scene=bpy.data.scenes.new(name);reviews.append(scene)
    for stem,x in assets:
        with bpy.data.libraries.load(str(root/'assets/blender/expansion-v1'/f'{stem}.blend'),link=False) as (source,target):
            target.objects=source.objects
        for obj in target.objects:
            if obj:scene.collection.objects.link(obj)
        for obj in target.objects:
            if obj and obj.parent is None:obj.location.x+=x
            if obj and obj.name.startswith(('WeaponDisabled','EngineDisabled')):obj.hide_render=True
    world=bpy.data.worlds.new(name+'_World');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.3,.33,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;scene.world=world
    for n,at,energy,size in [('Key',(-4,-4,7),950,4),('Fill',(5,3,5),700,5),('Rim',(-3,5,6),850,3)]:
        data=bpy.data.lights.new(name+n,'AREA');data.energy=energy*scale*scale;data.size=size*scale
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
        obj.location=Vector(at)*scale;obj.rotation_euler=(Vector(aim)-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(name+'_Camera');cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam)
    cam.location=camera_at;cam.rotation_euler=(Vector(aim)-cam.location).to_track_quat('-Z','Y').to_euler();data.lens=48
    scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/art/expansion-v1'/f'blender-{label.lower()}.png')
    scene['purpose']='Original expansion-v1 asset review, added through Blender MCP'
bpy.data.libraries.write(str(root/'assets/blender/expansion-v1/expansion-review.blend'),set(reviews),fake_user=True)
assert bpy.data.filepath==original_path
assert len(bpy.data.scenes['Scene'].objects)==original_objects
print({'scenes':[{'name':s.name,'objects':len(s.objects)} for s in reviews],
       'userFilepathPreserved':bpy.data.filepath,'originalSceneObjects':original_objects})
