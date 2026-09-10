"""Final cleanup and seamless review studio after the render-led refinement."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies';kind=sys.argv[sys.argv.index('--')+1]
scene=bpy.context.scene;rig=bpy.data.objects[kind+'_Rig'];data=rig.data
if scene.get('finalFitComplete'):raise RuntimeError('Final fit already applied; rebuild before repeating')
data.pose_position='REST';bpy.context.view_layer.update()
for o in list(scene.objects):
    if o.type!='MESH':continue
    if o.name.startswith('Perimeter coating chip') or (o.get('deformBone')=='head' and o.name.startswith(('Captive hex fastener','Fastener drive slot'))) or o.name.startswith('Central chest upper brow'):
        bpy.data.objects.remove(o,do_unlink=True);continue
    if o.name.startswith('Continuous swept armored mask'):
        for p in o.data.polygons:p.use_smooth=True
    if kind=='bastion' and o.name.startswith('Marking • 03') and o.name=='Marking • 03':bpy.data.objects.remove(o,do_unlink=True)
# Correct neck/head rest pivots after translating their rigid geometry.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
lower={'bastion':.115,'revenant':.055,'warden':.045,'sovereign':.025}[kind]
for point in ['head','tail']:setattr(data.edit_bones['head'],point,getattr(data.edit_bones['head'],point)-Vector((0,0,lower)))
data.edit_bones['neck'].tail.z-=lower
bpy.ops.object.mode_set(mode='OBJECT');data.pose_position='POSE';bpy.context.view_layer.update()
if kind=='revenant' and not scene.get('drapeAndGripRefined'):
    # This source received the initial refine pass before the draping update.
    o=next(o for o in scene.objects if o.name.startswith('Black torn rear scarf'))
    rows,cols=48,34;n=(rows+1)*(cols+1)
    for v in o.data.vertices:
        k=v.index%n;t=(k//(cols+1))/rows;u=(k%(cols+1))/cols
        old=(.018+.028*t)*math.sin(u*math.tau*6+.7*t)+.035*math.sin(t*3)
        new=.009*math.sin(u*math.tau*2.1+t*3)+.010*math.sin(u*19-t*7)*math.sin(t*math.pi)+.016*math.sin(t*4+u*2);v.co.y+=new-old
    for side,name in [('r','Weapon_blade'),('l','Weapon_blade_left')]:
        root=bpy.data.objects[name];pb=rig.pose.bones['hand_'+side];grip=pb.head+(pb.tail-pb.head).normalized()*.063
        root.location=rig.matrix_world@grip-root.rotation_euler.to_matrix()@Vector((0,.125*rig.scale.z,0))
# Continuous circular cyclorama: floor rolls into walls well outside every camera.
profile=[(0,-.018),(30,-.018)]+[(30+5*math.sin(a),5*(1-math.cos(a))-.018) for a in [i*math.pi/2/16 for i in range(1,17)]]+[(35,35)]
verts=[];faces=[];segments=128
for r,z in profile:
    for i in range(segments):a=i*math.tau/segments;verts.append((r*math.cos(a),r*math.sin(a),z))
for j in range(len(profile)-1):
    for i in range(segments):a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
me=bpy.data.meshes.new('Seamless studio backdrop');me.from_pydata(verts,[],faces);me.update()
o=bpy.data.objects.new('Seamless cyclorama',me);bpy.data.collections['Review Studio'].objects.link(o);me.materials.append(bpy.data.materials['Studio slate'])
for p in me.polygons:p.use_smooth=True
scene['finalFitComplete']=True
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/f'{kind}.blend'))
print('FINAL FIT COMPLETE',kind,flush=True)
