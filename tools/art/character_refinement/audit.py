"""Inspect retained Blender components without changing the source files."""
import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sources={'s07':ROOT/'assets/gunner-s07/source/S07_Gunner.blend',
         **{k:ROOT/f'assets/mech-enemies/source/{k}.blend' for k in ['bastion','revenant','warden','sovereign']},
         **{k:ROOT/f'assets/native-legacy-enemies/{k}.blend' for k in ['raider','scavenger']}}
report={}
for kind,path in sources.items():
    bpy.ops.wm.open_mainfile(filepath=str(path))
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    rig=rigs[0]
    parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and (o.parent==rig or any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers))]
    report[kind]={'rig':rig.name,'matrix':list(sum((list(r) for r in rig.matrix_world),[])),
        'parts':[{'name':o.name,'vertices':len(o.data.vertices),'materials':[m.name for m in o.data.materials if m],
                  'groups':[g.name for g in o.vertex_groups], 'center':list(o.matrix_world.translation),
                  'size':list(o.dimensions),'modifiers':[m.type for m in o.modifiers]} for o in parts]}
    print('AUDIT',kind,len(parts),flush=True)
(ROOT/'test-results/character-source-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
