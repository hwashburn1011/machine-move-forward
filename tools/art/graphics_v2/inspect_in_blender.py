"""Stage the completed original models through the live Blender MCP session.

Only MMF_Graphics_Review is edited. The user's original scene and filepath stay intact.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector

root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
scene=bpy.data.scenes.get('MMF_Graphics_Final')
if scene is None: scene=bpy.data.scenes.new('MMF_Graphics_Final')
if scene.get('mmfAssetReviewReady'):
    print('Review already staged; existing scene retained.')
else:
    for stem,at in [('player',(-1.65,0,0)),('salvaged-radio',(0,0,0)),('manual-turret',(1.7,0,0)),('salvage-chest',(0,-1.8,.55))]:
        with bpy.data.libraries.load(str(root/'assets/blender/graphics-v2'/f'{stem}.blend'),link=False) as (source,target):
            target.objects=source.objects
        imported=[o for o in target.objects if o]
        for obj in imported: scene.collection.objects.link(obj)
        for obj in imported:
            if obj.parent is None:
                obj.location+=Vector(at)
                if stem!='player':obj.rotation_euler.z+=math.pi
    floor_mesh=bpy.data.meshes.new('MMF_ReviewGround')
    floor_mesh.from_pydata([(-8,-8,-.025),(8,-8,-.025),(8,8,-.025),(-8,8,-.025)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new('MMF_ReviewGround',floor_mesh);scene.collection.objects.link(floor)
    mat=bpy.data.materials.new('MMF_ReviewGround');mat.diffuse_color=(.08,.10,.10,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=mat.diffuse_color;floor.data.materials.append(mat)
    for name,at,power,size in [('Key',(-3,-4,7),1000,5),('Fill',(4,-1,5),450,5),('Rim',(0,4,6),1300,3)]:
        data=bpy.data.lights.new('MMF_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=at
        obj.rotation_euler=(Vector((0,0,.8))-obj.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('MMF_ReviewCamera');camera=bpy.data.objects.new(camera_data.name,camera_data)
    scene.collection.objects.link(camera);camera.location=(5,-8,4.3);camera.rotation_euler=(Vector((0,-.2,.9))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=52;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/art/graphics-v2/blender-final-')
    scene['mmfAssetReviewReady']=True
    bpy.data.libraries.write(str(root/'assets/blender/graphics-v2/graphics-review-final.blend'),{scene},fake_user=True)
    print({'stagedScene':scene.name,'objects':len(scene.objects),'originalSceneObjects':len(bpy.data.scenes['Scene'].objects),'originalFilepath':bpy.data.filepath})
