"""Final fit correction identified in the three-quarter comparison."""
import bpy,math,random,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07';scene=bpy.context.scene;rig=bpy.data.objects['S07_Rig'];rig.data.pose_position='REST';bpy.context.view_layer.update()
for o in list(bpy.data.objects):
    if o.type!='MESH':continue
    group=o.get('deformBone','')
    if group in ['upperarm_r','upperarm_l'] and o.name.startswith(('Shoulder pad suspension','S07 overlapping shoulder shell','Shoulder lower articulated lame','Branch insignia','Marking','Captive hex','Fastener drive')):
        sign=-1 if group.endswith('_r') else 1;o.location+=Vector((sign*.022,-.052,.014))
    if o.name.startswith('Elbow articulated under-layer'):
        o.data.materials[0]=bpy.data.materials['S07_DustCamouflage']
    if group=='pelvis' and o.name.startswith(('Torn hip tabard','Hip-cloth worn hem','Marking')):
        if o.name.startswith('Marking') and not any(t in o.name for t in ['SAME','DUST','DIFFERENT','WAR']):continue
        avg=sum((o.matrix_world@v.co).x for v in o.data.vertices)/max(1,len(o.data.vertices));bn='thigh_r' if avg<0 else 'thigh_l'
        o.vertex_groups.clear();o.vertex_groups.new(name=bn).add(list(range(len(o.data.vertices))),1,'REPLACE');o['deformBone']=bn
# Add the missing outer elbow shell around the cloth joint.
script=(ROOT/'tools/art/gunner_s07/build.py').read_text();M={'armor':bpy.data.materials['S07_Charcoal_ChippedArmor'],'edge':bpy.data.materials['S07_ExposedBevelSteel'],'black':bpy.data.materials['S07_DeepRecess']};character=bpy.data.collections['S07 • Tailoring, armor and equipment'];current_collection=character;PARTS=[];WEAPON=[]
exec(script[script.index('def deselect():'):script.index("print('Sculpting tailored")])
for sign,side in [(-1,'r'),(1,'l')]:
    p=Vector((sign*.568,-.018,1.305));normal=Vector((sign*.85,-.30,.1)).normalized()
    plate('Lateral elbow impact shell '+side,p,[(-.05,-.052),(.047,-.05),(.06,.015),(.025,.055),(-.035,.050),(-.06,.018)],.012,M['armor'],'lowerarm_'+side,normal,.012,.005)
    for z in (-.03,.03):screw(p+normal*.018+Vector((0,0,z)),normal,'lowerarm_'+side,.005)
for o in PARTS:
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world;mod=o.modifiers.new('S07 skeletal deformation','ARMATURE');mod.object=rig
rig.data.pose_position='POSE';scene.camera=bpy.data.objects['01 • Reference three-quarter'];bpy.context.view_layer.update()
# The final neutral source still retains all original separate parts.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/S07_Gunner.blend'))
scene.render.resolution_x=1080;scene.render.resolution_y=1440;scene.render.resolution_percentage=85;scene.cycles.samples=56;scene.render.filepath=str(OUT/'preview/iteration_04_fit.png');bpy.ops.render.render(write_still=True)
print('FINAL FIT COMPLETE',flush=True)
