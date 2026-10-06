"""Cinematic-only performances on the existing Blender rigs; no mesh duplication.

Exports sampled bone poses, preserving all gameplay animations and damage timing.
Blender --background --factory-startup --python tools/art/opening_performance/build.py
"""
import ast
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'godot/assets/animation/opening'
OUT.mkdir(parents=True,exist_ok=True)
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))

def smooth(a,b,t):
    u=max(0,min(1,(t-a)/(b-a)))
    return u*u*(3-2*u)

def weapon(side,wrist,rotation):
    orient('hand_'+side,wrist,wrist+rotation@Vector((0,-.09,0)))
    name='equipment_0' if side=='r' else 'equipment_1'
    if name in rig.pose.bones:
        rig.pose.bones[name].matrix=Matrix.Translation(wrist+rotation@Vector((0,-.125,-.035)))@rotation.to_4x4()
    bpy.context.view_layer.update()

def lunge(t):
    pose(0,'idle')
    wind=smooth(.02,.43,t)
    thrust=smooth(.48,.85,t)
    recover=smooth(1.25,2.7,t)
    home=Vector((-.44,-.16,1.06))
    chamber=Vector((-.30,.02,1.35))
    extended=Vector((-.28,-.64,1.35))
    wrist=home.lerp(chamber,wind).lerp(extended,thrust).lerp(home,recover)
    wrist=limb('upperarm_r','lowerarm_r',wrist,(-.70,-.05,1.39))
    # Blade stays on a chest-height thrust line, never an overhead chop.
    rotation=Euler((.35*(1-wind)+.06*thrust,0,-.04*wind)).to_matrix()
    weapon('r',wrist,rotation)
    # The free blade stays outside the torso, its tip away from the contact.
    wrist=limb('upperarm_l','lowerarm_l',(.48,-.20,1.18),(.73,-.08,1.33))
    weapon('l',wrist,Euler((-.48,0,.54)).to_matrix())
    for name in ['spine_01','spine_02']:
        if name in rig.pose.bones:
            rig.pose.bones[name].rotation_quaternion @= Quaternion((1,0,0),-.04*wind+.09*thrust-.05*recover)
    # One leading step and a braced rear leg make the root advance a lunge.
    stride=thrust*(1-recover)
    for side,sign in [('r',-1),('l',1)]:
        foot=rig.pose.bones['foot_'+side].matrix.translation.copy()
        foot.y+=(-.40 if side=='r' else .24)*stride
        foot.z+=.09*math.sin(math.pi*thrust)*(1-recover) if side=='r' else 0
        ankle=limb('thigh_'+side,'calf_'+side,foot,(sign*.23,-.65,.64))
        orient('foot_'+side,ankle,ankle+Vector((0,-.20,-.04)))
    bpy.context.view_layer.update()

def root_path(u,end_x):
    pull=smooth(0,.30,u);over=smooth(.30,.66,u);land=max(0,min(1,(u-.66)/.16))**2
    x=24.73-.13*pull-(24.60-end_x)*smooth(.36,.70,u)
    z=18.85+.50*pull+1.24*over-1.068*land
    return x,z

def climb(u):
    pose(0,'idle')
    # Both hands load the coping; alternate knees clear it before the landing.
    root_x,root_z=root_path(u,23.4 if kind=='warden' else 23.8)
    scale=.93
    for side,sign in [('r',-1),('l',1)]:
        reach=Vector((sign*.29,-(root_x-24.35)/scale,(20.49-root_z)/scale))
        release=smooth(.29,.44,u)
        carry=Vector((sign*.44,-.22,1.18))
        wrist=limb('upperarm_'+side,'lowerarm_'+side,reach.lerp(carry,release),(sign*.64,.55,1.25))
        orient('hand_'+side,wrist,wrist+Vector((0,-.08,-.045)))
        lift=smooth(.12 if side=='r' else .20,.30 if side=='r' else .36,u)*(1-smooth(.65,.80,u))
        end=(sign*.18,.13-.48*smooth(.38,.55,u),.155+1.10*lift)
        ankle=limb('thigh_'+side,'calf_'+side,end,(sign*.25,-.85,.65))
        orient('foot_'+side,ankle,ankle+Vector((0,-.20,-.04)))
    # Weapons are stowed between the shoulder plates while both hands climb.
    for i,(_,name) in enumerate(weapons):
        rot=Euler((math.pi/2,0,(-1 if i==0 else 1)*.08)).to_matrix().to_4x4()
        rig.pose.bones[name].matrix=Matrix.Translation((-.19 if i==0 else .19,.27,1.52))@rot
    bpy.context.view_layer.update()
    # Ease into the exact existing run pose before the original chase starts.
    if u>.82:
        before={b.name:b.matrix.copy() for b in rig.pose.bones}
        pose(0,'run')
        after={b.name:b.matrix.copy() for b in rig.pose.bones}
        for b in rig.pose.bones:b.matrix=before[b.name].lerp(after[b.name],smooth(.82,1,u))
        bpy.context.view_layer.update()

manifest=[]
for kind in ['revenant','warden']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'assets/mech-enemies/gameplay/{kind}_combat.blend'))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    rig.animation_data_clear()
    weapons=[(None,b.name) for b in rig.data.bones if b.name.startswith('equipment_')]
    tree=ast.parse((ROOT/'tools/art/mech_enemies/game_export.py').read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['orient','limb','pose']],type_ignores=[]),'rig_helpers','exec'))
    for label,duration,callback in ([('lunge',2.8,lunge)] if kind=='revenant' else [])+ [('climb',3.6,lambda t:climb(t/3.6))]:
        frames=[]
        for frame in range(round(duration*30)+1):
            callback(frame/30)
            sample=[]
            for bone in rig.pose.bones:
                m=C@bone.matrix
                p,q,_=m.decompose()
                sample.append([round(v,7) for v in [*p,q.x,q.y,q.z,q.w]])
            frames.append(sample)
        data={'fps':30,'duration':duration,'bones':[b.name for b in rig.pose.bones],'frames':frames,'source':f'assets/mech-enemies/gameplay/{kind}_combat.blend'}
        path=OUT/f'{kind}-{label}.json';path.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
        manifest.append({'path':str(path.relative_to(ROOT)),'frames':len(frames),'bones':len(data['bones'])})
print('CINEMATIC_PERFORMANCES',json.dumps(manifest))
