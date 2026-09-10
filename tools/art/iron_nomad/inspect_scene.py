import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='C:/Users/hwash/Documents/MachineMoveForward/assets/iron-nomad/source/IronNomad_Master.blend')
for o in bpy.context.scene.objects:
    if o.type=='FONT' and ('NAV' in o.data.body or 'VECTOR' in o.data.body or o.data.body=='04'):
        print('TEXT_AXIS',o.name,'parent',o.parent.name,'up',list(o.matrix_world.to_quaternion()@Vector((0,1,0))),'rot',list(o.rotation_euler))
