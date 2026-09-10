import bpy
from pathlib import Path
root=Path('C:/Users/hwash/Documents/MachineMoveForward/assets/mech-enemies/source')
loaded=[]
for name in ['bastion','revenant','warden','sovereign','Mech_Collection']:
    title='Enemy Mechs - '+name.replace('_',' ')
    existing=bpy.data.scenes.get(title)
    if existing:
        loaded.append(existing);continue
    with bpy.data.libraries.load(str(root/(name+'.blend')),link=False) as (data_from,data_to):
        data_to.scenes=[data_from.scenes[0]]
    scene=data_to.scenes[0];scene.name=title;loaded.append(scene)
bpy.context.window.scene=loaded[-1]
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
print('Loaded five separate enemy review scenes; original scenes preserved')
