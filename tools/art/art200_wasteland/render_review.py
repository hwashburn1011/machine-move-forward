"""Render existing frozen sources; never modify source/GLB during import QA."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3]
cohort=next(a.split('=')[1] for a in sys.argv if a.startswith('--collection='))
out=root/f'assets/{cohort}/wasteland';manifest=json.loads((out/'manifest.json').read_text())
source=out/('art100-wasteland.blend' if cohort=='art100' else 'Art200Wasteland.blend')
bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene
models=[bpy.data.objects[e['id']] for e in manifest['models']]
for ob in models:ob.location=(0,0,0);ob.hide_render=True
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=True
s.render.resolution_x=768;s.render.resolution_y=576;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG'
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.65
s.world=bpy.data.worlds.new('Phase 2 muted daylight');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.58,.65,.71,1)
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
mat=bpy.data.materials.new('Review floor only');mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.246,.223,.178,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.94
bpy.ops.mesh.primitive_plane_add(size=150,location=(0,0,-.015));bpy.context.object.data.materials.append(mat)
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.30,-.45,-.38);sun.data.energy=2.2;sun.data.angle=.12
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';s.camera=cam
for i,(ob,en) in enumerate(zip(models,manifest['models'])):
    selected=next((a.split('=')[1] for a in sys.argv if a.startswith('--indices=')),None)
    if selected and i+1 not in [int(x) for x in selected.split(',')]:continue
    ob.hide_render=False;lo=en['bounds_godot']['min'];hi=en['bounds_godot']['max'];w,h,d=en['dimensions_m']
    target=Vector(((lo[0]+hi[0])/2,-(lo[2]+hi[2])/2,h*.43))
    direction=Vector((1,-1.65,1.05))
    if ob.name=='wasteland-observatory':direction=Vector((-1,1.5,1.05))
    cam.location=target+direction.normalized()*max(w,h,d)*3
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=max(w*1.12,d*1.2,h*1.9)*1.22
    s.render.filepath=str(out/'renders'/f'{i+1:02}-{ob.name}.png');bpy.ops.render.render(write_still=True);ob.hide_render=True
print('PHASE2_RENDER_COMPLETE',cohort,len(models),flush=True)
