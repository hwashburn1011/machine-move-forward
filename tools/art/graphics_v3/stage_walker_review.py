"""Assemble the source walker in an owned MCP scene using real runtime transforms."""
import bpy
import json
from pathlib import Path
from mathutils import Matrix, Vector

root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
name='MMF_Cohesive_Walker_V3_Assembled'
scene=bpy.data.scenes.get(name)
if scene is None:scene=bpy.data.scenes.new(name)
if scene.get('reviewReady'):
    print({'retained':scene.name,'originalFilepath':bpy.data.filepath})
else:
    assembly=json.loads((root/'docs/art/graphics-v3/walker-assembled.json').read_text())
    basis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    def game_matrix(values):
        matrix=Matrix(tuple(tuple(values[c*4+r] for c in range(4)) for r in range(4)))
        return basis @ matrix @ basis.inverted()
    with bpy.data.libraries.load(str(root/'assets/blender/graphics-v3/machine-walker.blend'),link=False) as (source,target):
        source_names=tuple(source.objects)
        target.objects=list(source_names)
    for obj in target.objects:
        if obj:scene.collection.objects.link(obj)
    # Source mesh children already hold their local authored transform. Pose
    # only the semantic empty roots; assigning world matrices to their children
    # as well would apply the segment pose twice before Blender updates parents.
    for source_name,obj in zip(source_names,target.objects):
        if obj and obj.type=='EMPTY' and source_name in assembly['roots']:
            obj.matrix_world=game_matrix(assembly['roots'][source_name])
    for part in assembly['fallback']:
        positions=part['positions'];indices=part['indices'] or list(range(len(positions)//3))
        vertices=[(positions[i],-positions[i+2],positions[i+1]) for i in range(0,len(positions),3)]
        faces=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
        mesh=bpy.data.meshes.new(name+'_'+part['name']);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj)
        obj.matrix_world=game_matrix(part['matrix'])
        for index,color in enumerate(part['colors']):
            if min(color)>.8:color=[.16,.19,.16] # procedural map omitted from studio proxy
            mat=bpy.data.materials.new(mesh.name+str(index));mat.use_nodes=True
            shader=mat.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(*color,1)
            shader.inputs['Roughness'].default_value=.64;shader.inputs['Metallic'].default_value=.45;mesh.materials.append(mat)
        for group in part['groups']:
            for index in range(group['start']//3,min(len(mesh.polygons),(group['start']+group['count'])//3)):
                mesh.polygons[index].material_index=group['materialIndex']
    floor_mesh=bpy.data.meshes.new(name+'_Floor')
    floor_mesh.from_pydata([(-100,-100,-.25),(100,-100,-.25),(100,100,-.25),(-100,100,-.25)],[],[(0,1,2,3)])
    floor=bpy.data.objects.new(floor_mesh.name,floor_mesh);scene.collection.objects.link(floor)
    mat=bpy.data.materials.new(name+'_Floor');mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.11,.12,.115,1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;floor_mesh.materials.append(mat)
    world=bpy.data.worlds.new(name+'_World');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.23,.27,.30,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5;scene.world=world
    for label,at,power,size in [('Key',(-12,6,20),10000,10),('Fill',(12,12,14),7000,12),('Rim',(0,-15,18),9000,10)]:
        data=bpy.data.lights.new(name+label,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=at
        obj.rotation_euler=(Vector((0,0,2.5))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new(name+'_Camera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    camera.location=(23,30,20);camera.rotation_euler=(Vector((0,0,2.3))-camera.location).to_track_quat('-Z','Y').to_euler();data.lens=48
    scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/art/graphics-v3/blender-walker-')
    scene['reviewReady']=True
    bpy.data.libraries.write(str(root/'assets/blender/graphics-v3/walker-review.blend'),{scene},fake_user=True)
    print({'scene':scene.name,'objects':len(scene.objects),'originalFilepath':bpy.data.filepath})
