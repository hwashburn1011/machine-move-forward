"""Round-trip actual delivered FBX and GLB files through Blender importers."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies';report=[]
for file in [f'{name}_{kind}.{ext}' for name in ['bastion','revenant','warden','sovereign'] for kind in ['rigged','equipment'] for ext in ['glb','fbx']]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if file.endswith('.fbx'):bpy.ops.import_scene.fbx(filepath=str(OUT/'exports'/file))
    else:bpy.ops.import_scene.gltf(filepath=str(OUT/'exports'/file))
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];shapes={pb.custom_shape for r in rigs for pb in r.pose.bones if pb.custom_shape};meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o not in shapes];print('Imported mesh inventory',[(o.name,o.hide_render,o in shapes) for o in bpy.context.scene.objects if o.type=='MESH'],flush=True);points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    entry={'file':file,'meshes':len(meshes),'bones':sum(len(r.data.bones) for r in rigs),'bounds_m':bounds,'finite':all(math.isfinite(c) for p in points for c in p)}
    assert entry['finite'] and meshes
    if 'rigged' in file:
        assert entry['bones']==46,entry
        assert 1.8<bounds[2][1]-bounds[2][0]<3.4,entry
        unweighted=sum(not v.groups or abs(sum(g.weight for g in v.groups)-1)>.002 for o in meshes for v in o.data.vertices);entry['unweighted_or_bad_weight_sum']=unweighted;assert unweighted==0,entry
        rig=rigs[0];pb=rig.pose.bones.get('upperarm_r');assert pb
        before=[p.copy() for p in points];pb.rotation_mode='XYZ';pb.rotation_euler.x+=.35;bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();after=[]
        for o in meshes:
            ev=o.evaluated_get(dg);after.extend(ev.matrix_world@v.co for v in ev.data.vertices)
        entry['pose_moves_vertices']=sum((a-b).length>.001 for a,b in zip(after,before));entry['posed_finite']=all(math.isfinite(c) for p in after for c in p);assert entry['pose_moves_vertices']>500 and entry['posed_finite']
    report.append(entry)
(OUT/'source/roundtrip_validation.json').write_text(json.dumps(report,indent=2));print('ROUNDTRIP PASS',json.dumps(report),flush=True)
