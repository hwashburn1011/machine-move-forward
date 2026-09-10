import bpy
path=r'C:\Users\hwash\Documents\MachineMoveForward\assets\gunner-s07\source\S07_Gunner.blend'
with bpy.data.libraries.load(path,link=False) as (available,loaded):
 loaded.meshes=[name for name in available.meshes if name.startswith('S07 draped cloth with distinct front and back')]
cloth=next(o for o in bpy.context.scene.objects if o.name.startswith('Wind-shaped shredded shoulder cloak'));cloth.data=loaded.meshes[0]
print('Review scene updated with final cloth mesh:',len(cloth.data.vertices),'vertices')
