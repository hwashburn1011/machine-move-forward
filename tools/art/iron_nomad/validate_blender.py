"""Round-trip both portable formats, and sample four independent rigid legs."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/iron-nomad'
results=[]
for file in ['iron-nomad-full.glb','iron-nomad-game.glb','iron-nomad-full.fbx','iron-nomad-colliders.glb']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if file.endswith('.fbx'):bpy.ops.import_scene.fbx(filepath=str(OUT/'exports'/file))
    else:bpy.ops.import_scene.gltf(filepath=str(OUT/'exports'/file))
    scene=bpy.context.scene;scene.frame_set(0);scene.view_layers[0].update()
    meshes=[o for o in scene.objects if o.type=='MESH']
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    bounds={'min':[min(p[k] for p in points) for k in range(3)],'max':[max(p[k] for p in points) for k in range(3)]}
    result={'file':file,'meshes':len(meshes),'boundsBlenderZUp':bounds,'actions':len(bpy.data.actions),'assertions':{}}
    check=result['assertions'];check['finiteBounds']=all(math.isfinite(v) for arr in bounds.values() for v in arr)
    if 'colliders' in file:check['only46CollisionMeshes']=len(meshes)==46 and all(o.name.startswith('UCX_') for o in meshes)
    else:
        check['meterScale']=25<bounds['max'][2]<35 and 23<bounds['max'][0]-bounds['min'][0]<32
        check['fourHips']=len([o for o in scene.objects if o.name.startswith('Leg_') and o.name.endswith('_Hip')])==4
        feet=[bpy.data.objects.get('Leg_'+id+'_Foot') for id in ['FrontLeft','FrontRight','RearLeft','RearRight']]
        check['fourFeet']=all(feet)
        samples=[]
        # Exported glTF import plays its 4 seconds at Blender's default 24 FPS;
        # the FBX scene carries 30 FPS. Sample seconds, not assumed frame counts.
        start=min(a.frame_range[0] for a in bpy.data.actions);end=max(a.frame_range[1] for a in bpy.data.actions)
        result['importedFrameRange']=[start,end];result['fps']=scene.render.fps
        check['fourSecondDuration']=abs((end-start)/scene.render.fps-4)<.02
        for fraction in [0,.125,.25,.375,.5,.625,.75,.875,1]:
            frame=start+(end-start)*fraction
            scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));scene.view_layers[0].update()
            samples.append([list(f.matrix_world.translation) for f in feet])
        ranges=[[max(s[i][k] for s in samples)-min(s[i][k] for s in samples) for k in range(3)] for i in range(4)]
        check['allFourFeetAnimate']=all(max(r)>.5 for r in ranges)
        check['fourDistinctPhaseSamples']=len({tuple(round(s[i][2],3) for s in samples) for i in range(4)})==4
        check['loopCloses']=all((Vector(samples[0][i])-Vector(samples[-1][i])).length<.02 for i in range(4))
        check['feetAboveGround']=all(s[i][2]>=.98 for s in samples for i in range(4))
        result['feetMotionRanges']=ranges
    results.append(result);print('ROUNDTRIP',json.dumps(result),flush=True)
(OUT/'source/blender-validation.json').write_text(json.dumps(results,indent=2))
assert all(all(r['assertions'].values()) for r in results),'Roundtrip validation failed'
print('IRON NOMAD ROUNDTRIP PASSED',flush=True)
