import bpy
from pathlib import Path
OUT=Path(__file__).resolve().parents[3]/'assets/fieldwork'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'fieldwork-kit.blend'))
for name in ['L12','CaretakerDock','RifleStabilizer','RifleBurstCam','ShotgunChoke','ShotgunScatterBrake']:
    root=bpy.data.objects[name]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root,*root.children_recursive]:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/(name+'.fbx')),use_selection=True,global_scale=1,apply_unit_scale=True,object_types={'MESH','EMPTY'},bake_anim=False,mesh_smooth_type='FACE',axis_forward='-Z',axis_up='Y')
