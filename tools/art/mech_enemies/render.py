"""Render review views from a saved scene, with per-process GPU selection."""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies'
args=sys.argv[sys.argv.index('--')+1:];kind=args[0];scene=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.cycles.samples=80
for suffix,cam,w,h in [('reference','Reference three-quarter',1200,1600),('head','Head and torso detail',1200,1200),('back','Back equipment',1200,1600)]:
    if len(args)>1 and suffix not in args[1:]:continue
    scene.camera=bpy.data.objects[cam];scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100
    scene.render.filepath=str(OUT/'preview'/f'{kind}_{suffix}.png');bpy.ops.render.render(write_still=True)
print('MECH REVIEW RENDERS COMPLETE',kind,flush=True)
