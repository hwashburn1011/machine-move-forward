import bpy,json
from pathlib import Path
R=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
out={}
for kind in ['warden','revenant','bastion','sovereign','raider','scavenger']:
 bpy.ops.wm.open_mainfile(filepath=str(R/'assets/native-character-refinement'/f'{kind}-components.blend'))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 out[kind]={'rigmatrix':[list(v) for v in rig.matrix_world],'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'matrix':[list(v) for v in b.matrix_local]} for b in rig.data.bones if any(n in b.name for n in ['spine','chest','head','neck','hips','pelvis'])}}
 print(kind,out[kind],flush=True)
(R/'assets/art100/story-robots/rig-source.json').write_text(json.dumps(out,indent=2))
