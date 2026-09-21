"""Append this iteration's source and inspect it through the running Blender MCP."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
source=root/'assets/desert-ruins/source/DesertRuins.blend'
with bpy.data.libraries.load(str(source),link=False) as (available,loaded):
    loaded.scenes=[available.scenes[0]]
scene=loaded.scenes[0];scene.name='Desert refinement 2026-09-17'
bpy.context.window.scene=scene
out=root/'test-results/desert-refinement/blender';out.mkdir(parents=True,exist_ok=True)
scene.cycles.samples=24
scene.render.resolution_x=1400;scene.render.resolution_y=1000
camera=scene.camera
for kind,scale in [('wreck-bus',14),('ruin-house',17),('ruin-apartment',24),('billboard',17)]:
    obj=next(o for o in scene.objects if o.get('archetype')==kind)
    target=obj.location+Vector((0,0,obj.dimensions.z*.32))
    camera.data.ortho_scale=scale
    camera.location=target+Vector((scale*.8,-scale*1.2,scale*.62))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(kind+'.png'))
    bpy.ops.render.render(write_still=True,scene=scene.name)
    print('REFINEMENT_INSPECTED',kind)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
print('Prior scenes preserved; refined source appended and rendered.')
