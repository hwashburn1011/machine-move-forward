import bpy
from mathutils import Vector
scene=bpy.data.scenes['MMF_Cohesive_Walker_V3_Assembled']
for obj in scene.objects:
    if 'front-left' not in obj.name:continue
    print(obj.name,obj.type,'parent',obj.parent.name if obj.parent else None,'world',tuple(obj.matrix_world.translation),'local',tuple(obj.location))
    if obj.type=='MESH':print('bound',(obj.matrix_world@Vector(obj.bound_box[0]))[:],(obj.matrix_world@Vector(obj.bound_box[6]))[:])
