"""Run through the Blender MCP addon; only edits a newly owned review scene."""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
name='MMF_Cohesive_Characters_V3'
scene=bpy.data.scenes.get(name)
if scene is None:scene=bpy.data.scenes.new(name)
if scene.get('reviewReady'):
    print({'retained':scene.name,'originalFilepath':bpy.data.filepath})
else:
    for stem,x in [('player',-1.15),('raider',0),('scavenger',1.15)]:
        with bpy.data.libraries.load(str(root/'assets/blender/graphics-v3'/f'{stem}.blend'),link=False) as (source,target):
            target.objects=source.objects
        for obj in target.objects:
            if obj:scene.collection.objects.link(obj)
        for obj in target.objects:
            if obj and obj.parent is None:obj.location.x+=x
    # Active vertex colors export to glTF independently. Hook the same local
    # contact shading into the review's shader so the Blender view agrees.
    for obj in scene.objects:
        if obj.type!='MESH':continue
        for slot in obj.material_slots:
            mat=slot.material
            if not mat or not mat.use_nodes:continue
            mat=mat.copy();slot.material=mat
            nodes,links=mat.node_tree.nodes,mat.node_tree.links
            bs=nodes.get('Principled BSDF')
            if not bs:continue
            color=nodes.new('ShaderNodeVertexColor');color.layer_name='ConstructionOcclusion'
            mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
            if bs.inputs['Base Color'].is_linked:links.new(bs.inputs['Base Color'].links[0].from_socket,mult.inputs[1])
            else:mult.inputs[1].default_value=bs.inputs['Base Color'].default_value
            links.new(color.outputs['Color'],mult.inputs[2]);links.new(mult.outputs[0],bs.inputs['Base Color'])
    mesh=bpy.data.meshes.new(name+'_Floor')
    mesh.from_pydata([(-20,-20,-.015),(20,-20,-.015),(20,20,-.015),(-20,20,-.015)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(floor)
    mat=bpy.data.materials.new(name+'_Floor');mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.075,.092,.10,1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;mesh.materials.append(mat)
    world=bpy.data.worlds.new(name+'_World');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.21,.24,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4;scene.world=world
    for label,at,power,size in [('Key',(-3,-4,6),800,4),('Fill',(4,-2,3.5),440,4),('Rim',(0,3,5),1000,3)]:
        data=bpy.data.lights.new(name+label,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=at
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(name+'_Camera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=(3,-7.5,3.0);camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();data.lens=58
    scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/art/graphics-v3/blender-characters-')
    scene['reviewReady']=True
    bpy.data.libraries.write(str(root/'assets/blender/graphics-v3/character-lineup.blend'),{scene},fake_user=True)
    print({'stagedScene':scene.name,'objects':len(scene.objects),'originalFilepath':bpy.data.filepath,
           'originalSceneObjects':len(bpy.data.scenes['Scene'].objects)})
