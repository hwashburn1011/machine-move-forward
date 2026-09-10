import bpy,json
path=r'C:\Users\hwash\Documents\MachineMoveForward\assets\gunner-s07\source\S07_Gunner.blend'
original=bpy.context.scene.name
with bpy.data.libraries.load(path,link=False) as (available,loaded):
    loaded.scenes=[available.scenes[0]]
review=loaded.scenes[0];review.name='S07 • Reference Gunner Review';bpy.context.window.scene=review
for obj in bpy.context.selected_objects:obj.select_set(False)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.overlay.show_overlays=False;area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'original_scene_preserved':original,'review_scene':review.name,'objects':len(review.objects),'camera':review.camera.name}))
