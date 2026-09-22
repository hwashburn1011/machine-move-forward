"""Nondestructive final inspection of the 50-model Blender source via MCP 9876."""
import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/desert-ruins/source/DesertRuins.blend'),link=False) as (available,loaded):
    loaded.scenes=[available.scenes[0]]
scene=loaded.scenes[0];scene.name='Nomad - fifty refined desert artifacts'
bpy.context.window.scene=scene
models=[o for o in scene.objects if o.get('archetype')]
assert len(models)==50
out=root/'test-results/refinement-50-blender-mcp';out.mkdir(parents=True,exist_ok=True)
camera=scene.camera;camera_saved=camera.matrix_world.copy();scale=camera.data.ortho_scale
scene.cycles.samples=16;scene.render.resolution_x=1100;scene.render.resolution_y=1100
for kind,direction in [('satellite-dish',(1.1,1.6,.7)),('water-tower',(1.1,-1.6,.8)),('wreck-ambulance',(-1.2,1.6,.8))]:
    obj=next(o for o in models if o.get('archetype')==kind)
    for other in models:other.hide_render=other!=obj
    bpy.context.view_layer.update()
    bounds=[obj.matrix_world@Vector(c) for c in obj.bound_box]
    lo=Vector(tuple(min(p[k] for p in bounds) for k in range(3)))
    hi=Vector(tuple(max(p[k] for p in bounds) for k in range(3)))
    center=(lo+hi)*.5;span=max(hi-lo)
    camera.location=center+Vector(direction)*span
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=span*1.5
    scene.render.filepath=str(out/(kind+'.png'))
    bpy.ops.render.render(write_still=True,scene=scene.name)
for obj in models:obj.hide_render=False
camera.matrix_world=camera_saved;camera.data.ortho_scale=scale
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
(out/'review.json').write_text(json.dumps({'models':sorted(o.get('archetype') for o in models),'count':len(models),'previousScenesPreserved':True,'reverseViews':['satellite-dish','water-tower','wreck-ambulance']},indent=2))
print('All 50 assemblies loaded; three additional reverse/attachment views rendered. Previous scenes preserved.')
