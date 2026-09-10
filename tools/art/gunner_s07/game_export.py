"""Make a playable derivative; the detailed reference source remains untouched."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/gunner-s07/game';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/gunner-s07/source/S07_Engine_Setup.blend'))
scene=bpy.context.scene;rig=bpy.data.objects['S07_Rig'];body=bpy.data.objects['S07_Character']
for o in list(scene.objects):
    if o not in [rig,body]:bpy.data.objects.remove(o,do_unlink=True)
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
rig.animation_data_clear();rig.data.pose_position='POSE'
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4);pb.rotation_mode='QUATERNION'
# Fold the reference's wide windblown tail behind the hip for corridor traversal.
cloth=set()
for p in body.data.polygons:
    if any(n in body.data.materials[p.material_index].name for n in ['WovenScarf','ClothFibres']):cloth.update(p.vertices)
for i in cloth:
    v=body.data.vertices[i];x,y,z=v.co
    if x>.36 and z<1.8:
        t=min(1,(x-.36)/1.1);v.co.x=.36+(x-.36)*.20;v.co.y+=t*.52
        v.co.z-=t*.08
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
dec=body.modifiers.new('Gameplay silhouette reduction','DECIMATE');dec.ratio=.30
bpy.ops.object.modifier_move_up(modifier=dec.name)
bpy.ops.object.modifier_apply(modifier=dec.name)
body.name='S07_Playable';rig['characterId']='s07';rig['forwardAxis']='+Z'
# Keep physical stature independent of the antenna/cape bounds.
rig['standingHeight']=2.08
scene.render.fps=30

def orient(name,head,tail):
    pb=rig.pose.bones[name];rest=rig.data.bones[name]
    q=(rest.tail_local-rest.head_local).rotation_difference(Vector(tail)-Vector(head))@rest.matrix_local.to_quaternion()
    pb.matrix=Matrix.Translation(Vector(head))@q.to_matrix().to_4x4();bpy.context.view_layer.update()
def limb(a,b,end,pole):
    S=rig.pose.bones[a].head.copy();W=Vector(end);l1=rig.data.bones[a].length;l2=rig.data.bones[b].length
    d=W-S;dist=max(.001,min(d.length,l1+l2-.004));direction=d.normalized();W=S+direction*dist
    along=(l1*l1-l2*l2+dist*dist)/(2*dist);height=math.sqrt(max(0,l1*l1-along*along))
    pole=Vector(pole)-S;v=(pole-direction*pole.dot(direction)).normalized();E=S+direction*along+v*height
    orient(a,S,E);orient(b,E,W);return W

def pose(t,mode,armed):
    for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
    moving=mode in ['walk','run','crouch_walk'];running=mode=='run';crouch=mode.startswith('crouch');jump=mode=='jump'
    swing=math.sin(t*math.tau);bob=(.028 if running else .014)*math.cos(t*math.tau*2) if moving else .004*math.sin(t*math.tau)
    down=.22 if crouch else .075 if jump else .035
    rig.pose.bones['pelvis'].matrix=Matrix.Translation((0,0,bob-down))@rig.data.bones['pelvis'].matrix_local
    bpy.context.view_layer.update()
    for side,s in [('r',-1),('l',1)]:
        phase=(t+(.5 if s==1 else 0))%1;stride=(.32 if running else .23 if moving else 0)
        y=math.cos(phase*math.tau)*stride
        lift=max(0,math.sin(phase*math.tau))*(.17 if running else .085) if moving else 0
        if jump:y=s*.10;lift=.13 if s==1 else .055
        W=limb('thigh_'+side,'calf_'+side,(s*.19,y,.15+lift),(s*.22,-.7,.5))
        orient('foot_'+side,W,W+Vector((0,-.19,-.055)))
        if armed:
            wrist=(-.225,-.34,1.295+bob-down) if s==-1 else (.015,-.61,1.30+bob-down)
            W=limb('upperarm_'+side,'lowerarm_'+side,wrist,(s*.68,-.12,1.23+bob-down))
            orient('hand_'+side,W,W+Vector((0,-.075,-.05)))
        else:
            W=limb('upperarm_'+side,'lowerarm_'+side,(s*.47,s*swing*(.17 if moving else .008),1.01+bob-down),(s*.63,-.25,1.27))
            orient('hand_'+side,W,W+Vector((s*.015,-.02,-.11)))
    for pb in rig.pose.bones:
        if pb.name.startswith('finger_'):
            pb.rotation_quaternion=Vector((1,0,0)).rotation_difference(Vector((1,0,0)))
            from mathutils import Quaternion
            pb.rotation_quaternion=Quaternion((1,0,0),math.radians(-42 if armed else -14))

for armed in [True,False]:
    for mode,frames in [('idle',72),('walk',30),('run',22),('crouch_idle',72),('crouch_walk',38),('jump',36)]:
        action=bpy.data.actions.new(('armed_' if armed else 'unarmed_')+mode);action.use_fake_user=True
        rig.animation_data_create();rig.animation_data.action=action
        for frame in range(frames+1):
            pose(frame/frames,mode,armed)
            for pb in rig.pose.bones:
                pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame)
        action['motion']='In-place authored skeletal motion, no root translation'
rig.animation_data.action=None;pose(0,'idle',True)
bpy.context.view_layer.update()
# A wrist-local socket with the weapon's +Z barrel and +Y sights frame.
socket=bpy.data.objects.new('WeaponSocket',None);scene.collection.objects.link(socket)
socket.parent=rig;socket.parent_type='BONE';socket.parent_bone='hand_r'
socket.matrix_world=Matrix.Translation(Vector((-.225,-.34,1.27-.035)))
bpy.context.view_layer.update()
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
scene.frame_start=0;scene.frame_end=72
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'S07_Playable.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'s07-player.glb'),export_format='GLB',use_selection=True,
    export_yup=True,export_extras=True,export_animations=True,export_animation_mode='ACTIONS',
    export_force_sampling=True,export_skins=True,export_cameras=False,export_lights=False,
    export_tangents=False)
body.data.calc_loop_triangles()
(OUT/'manifest.json').write_text(json.dumps({'triangles':len(body.data.loop_triangles),'bones':len(rig.data.bones),
    'clips':[a.name for a in bpy.data.actions],'source':'S07_Engine_Setup.blend','cape':'Folded closer behind the right hip'},indent=2),encoding='utf-8')
print('S07 GAME EXPORT COMPLETE',flush=True)
