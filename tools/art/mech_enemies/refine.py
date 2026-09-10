"""Render-led silhouette, armor fit, mask and surface refinement of all four sources."""
import bpy,ast,math,json,random,sys
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix,Euler,Quaternion
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies'
kind=sys.argv[sys.argv.index('--')+1];scene=bpy.context.scene;rig=bpy.data.objects[kind+'_Rig']
if scene.get('referenceRefinement') or scene.get('finalFitComplete'):raise RuntimeError('Source is already refined; rebuild before repeating')
# Reuse geometry helpers without executing either builder's scene-reset code.
for file in ['common.py','build.py']:
    tree=ast.parse((Path(__file__).parent/file).read_text(encoding='utf-8'))
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),file,'exec'))
PARTS=[o for o in scene.objects if o.type=='MESH' and o.parent==rig];WEAPON=[];BONES={};rng=random.Random(1037)
character=next(c for c in bpy.data.collections if 'Tailoring' in c.name);weapon_collection=next(c for c in bpy.data.collections if 'Belt-fed' in c.name);current_collection=character
keys={'armor':'Charcoal_ChippedArmor','tan':'FadedTan_Panels','cloth':'DustCamouflage','scarf':'Weathered_WovenScarf','leather':'Leather_Webbing','steel':'Worn_Gunmetal','edge':'ExposedBevelSteel','rubber':'Matte_Rubber','black':'DeepRecess','glass':'Smoked_Visor','ink':'Faded_Stencil','thread':'Exposed_ClothFibres','red':'Red_Optics','amber':'Amber_Halo','gold':'Burnished_Brass','cloak':'Oxblood_Cloak','darkcloth':'Charred_Cloth','polished':'Black_Enamel','scratch':'Exposed_Wear','brass':'Ammunition_Brass','copper':'Copper_Projectiles'}
M={key:bpy.data.materials.get('MECH_'+name) for key,name in keys.items()}
heavy=kind=='bastion';w=.59 if heavy else .33;hip=.245 if heavy else .145
data=rig.data;data.pose_position='REST';bpy.context.view_layer.update()

# Replace evenly distributed bright freckles with darker paint and sparse,
# irregular patches. These are portable PNGs; no Blender-only procedural nodes.
def refined_surface(old,base,seed):
    if old is None:return
    size=1024;a=noise(size,7,seed);b=noise(size,39,seed+1);c=noise(size,163,seed+2);f=noise(size,491,seed+3)
    patches=np.clip((.57*a+.30*b+.13*c-.665)*18,0,1)
    scratches=np.clip((c-.78)*10,0,.35)*(a>.60)
    wear=np.maximum(patches,scratches)
    color=np.asarray(base)[None,None,:]*(1-wear[:,:,None])+np.array([.34,.317,.27])[None,None,:]*wear[:,:,None]
    color*= (.91+.14*b+.03*f)[:,:,None]
    height=.014*b-.042*wear+.006*f;dx=(np.roll(height,-1,1)-np.roll(height,1,1))*2;dy=(np.roll(height,-1,0)-np.roll(height,1,0))*2
    norm=np.stack([-dx,-dy,np.ones_like(a)],axis=2);norm/=np.linalg.norm(norm,axis=2)[:,:,None]
    maps={'BaseColor':save_image(old.name+'_Refined_BaseColor',color,True),'Normal':save_image(old.name+'_Refined_Normal',norm*.5+.5),'ORM':save_image(old.name+'_Refined_ORM',np.stack([np.ones_like(a),.53+.20*b+.12*wear,.48-.20*wear],axis=2))}
    for node in old.node_tree.nodes:
        if node.type=='TEX_IMAGE':
            role='BaseColor' if 'BaseColor' in node.image.name else 'Normal' if 'Normal' in node.image.name else 'ORM';node.image=maps[role]
refined_surface(M['armor'],(.112,.119,.123),520)
refined_surface(M['tan'],(.236,.222,.190),642)
refined_surface(M['polished'],(.066,.078,.095),921)
bs=M['edge'].node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*srgb((.215,.225,.226)),1);bs.inputs['Roughness'].default_value=.51
bs=M['red'].node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Strength'].default_value=3

# Shoulder shells are suspended from the clavicle, allowing the arms to move
# underneath them. Skinning them fully to the upper arm flipped them upward.
for o in PARTS:
    if any(n in o.name.lower() for n in ['pauldron','shoulder feather','pauldron top','shoulder rear cover']) or (o.get('deformBone','').startswith('upperarm_') and (o.matrix_local @ o.data.vertices[0].co).z>1.51):
        side='r' if o['deformBone'].endswith('_r') else 'l'
        o.vertex_groups.clear();o.vertex_groups.new(name='clavicle_'+side).add(list(range(len(o.data.vertices))),1,'REPLACE');o['deformBone']='clavicle_'+side
# Text shares the corresponding floating shoulder plate's attachment.
for o in PARTS:
    if any(t in o.name for t in ['Marking • 03','Marking • DISTANCE','Assassin fork insignia']):
        old=o.get('deformBone','upperarm_l');side='r' if old.endswith('_r') else 'l';o.vertex_groups.clear();o.vertex_groups.new(name='clavicle_'+side).add(list(range(len(o.data.vertices))),1,'REPLACE');o['deformBone']='clavicle_'+side

count=len(PARTS)
if heavy:
    for s,side in [(-1,'r'),(1,'l')]:
        # Deep chamfered shells wrap the drum instead of appearing as flat signs.
        outline=[(-.17,-.16),(.16,-.16),(.22,-.10),(.21,.075),(.13,.16),(-.10,.18),(-.21,.10),(-.23,-.07)]
        plate('Deep armored shoulder casing '+side,(s*.61,-.145,1.625),outline,.23,M['armor'],'clavicle_'+side,normal=(s*.24,-.95,.18),bow=.009,bevel=.011)
        for j in range(3):
            panel('Inset pauldron side tile '+side,(s*.814,-.015,1.57+j*.064),.22,.087,M['tan'],'clavicle_'+side,normal=(s,0,.08),depth=.014,bolts=True)
        label('03' if s>0 else 'BASTION',(s*.625,-.196,1.649),.087 if s>0 else .039,M['ink'],'clavicle_'+side,normal=(s*.24,-.95,.18))
        # Secondary shin ribs and asymmetrical service fittings break large planes.
        for j in range(3):panel('Shin secondary overlapping strip '+side,(s*(hip+.04),-.145,.24+j*.078),.205,.072,M['armor'],'calf_'+side,bolts=False)
        panel('Outside leg piston guard '+side,(s*(hip+.16),.018,.39),.13,.28,M['armor'],'calf_'+side,normal=(s,.12,0),depth=.021,bolts=True)
        for j in range(4):box('Heavy top exhaust tile',(s*.31,.015,1.72+j*.04),(.085,.018,.014),M['black'],'spine_02',.002)
    panel('Central chest upper brow',(0,-.24,1.645),.55,.085,M['armor'],'spine_02',shape='chevron',depth=.02,bolts=False)
    for s in [-1,1]:panel('Chest service interface',(s*.26,-.208,1.41),.12,.115,M['tan'],'spine_02',trim=True)

if kind in ['bastion','revenant','sovereign']:
    remove=['Angled brow ridge','Red recessed eye aperture','Red optical emitter','Tapered cheek blade','Central facial keel','Cranial crown plate','Sweeping forehead crest','Y-shaped facial light trace','Armored mouth grille']
    for o in list(PARTS[:count]):
        if any(o.name.startswith(n) for n in remove):PARTS.remove(o);bpy.data.objects.remove(o,do_unlink=True)
    # Continuous swept mask: seven shaped sections give it a narrow chin,
    # defined brow and closed forehead instead of a sphere with small plates.
    rows=[(1.778,.023,.044,-.065),(1.82,.062,.066,-.055),(1.905,.119,.096,-.029),(1.983,.135,.114,-.002),(2.050,.113,.102,.010),(2.092,.063,.060,.018),(2.105,.016,.022,.018)]
    verts=[];faces=[];segments=32
    for z,rx,ry,cy in rows:
        for i in range(segments+1):
            a=-math.pi*.63+i*math.pi*1.26/segments;verts.append((rx*math.sin(a),cy-ry*math.cos(a),z))
    for j in range(len(rows)-1):
        for i in range(segments):a=j*(segments+1)+i;faces.append((a,a+1,a+segments+2,a+segments+1))
    shell=mesh('Continuous swept armored mask',verts,faces,M['armor'] if heavy else M['polished'],'head',.001,False)
    for s in [-1,1]:
        # Thin diagonal eye slit embedded in a black countersunk housing.
        eye=[(-.038,.004),(-.019,.011),(.038,-.008),(.024,-.015),(-.023,-.003)]
        if s>0:eye=[(-x,z) for x,z in eye]
        normal=(s*.23,-.97,0);at=(s*.058,-.120,1.939)
        plate('Recessed diagonal optic well',at,[(x*1.16,z*1.6) for x,z in eye],.004,M['black'],'head',normal,bow=.001,bevel=.0007)
        plate('Slim crimson eye',Vector(at)+Vector(normal)*.005,eye,.002,M['red'],'head',normal,bow=.001,bevel=.0005)
        panel('Long mask cheek facet',(s*.073,-.107,1.856),.070,.131,M['armor'] if heavy else M['polished'],'head',normal=(s*.38,-.91,0),shape='blade',depth=.006,bolts=False)
        tube('Helmet crown panel seam',[(s*.044,-.084,2.060),(s*.057,-.112,2.018),(s*.059,-.119,1.975)],.002,M['black'],'head',False)
        for j in range(3):box('Back cranial heat grille',(s*.044,.111,1.94+j*.025),(.050,.009,.009),M['steel'],'head',.002)
    panel('Sculpted central helmet keel',(0,-.123,1.966),.077,.255,M['armor'] if heavy else M['polished'],'head',shape='blade',depth=.006,bolts=False)
    if kind=='revenant':
        for s in [-1,1]:tube('Fine Y shaped mask trace',[(s*.076,-.126,1.944),(s*.028,-.139,1.916),(s*.012,-.137,1.875),(s*.009,-.124,1.806)],.0018,M['red'],'head',False)
    if heavy:
        for j in range(5):box('Small recessed jaw vent',(0,-.105,1.824+j*.012),(.042,.013,.005),M['black'],'head',.001)

# Fill abdomen-side discontinuities with inset armor, leaving actuator clearance.
if kind in ['revenant','sovereign']:
    for s in [-1,1]:
        for j in range(3):
            panel('Oblique rib secondary lamination',(s*.202,-.048,1.26+j*.086),.105,.13,M['polished'],'spine_02',normal=(s*.76,-.60,0),shape='blade',depth=.012,bolts=False)

if kind=='warden':
    skull=next(o for o in PARTS if o.name.startswith('Rifleman armored skull'))
    skull.data.materials[0]=M['tan']
    plate('Rifleman recessed full face shield',(0,-.127,1.933),[(-.100,.084),(.100,.084),(.106,.008),(.068,-.085),(.018,-.136),(-.048,-.119),(-.09,-.049)],.009,M['black'],'head',bow=.008,bevel=.002)
    for s in [-1,1]:
        panel('Rifleman lower mask cheek',(s*.049,-.143,1.871),.061,.114,M['steel'],'head',shape='blade',depth=.005,bolts=False)
        panel('Helmet wrapped temple cover',(s*.118,.002,1.993),.12,.185,M['tan'],'head',normal=(s*.83,-.45,.20),depth=.026,bolts=True)
        for j in range(3):box('Rifleman respirator channel',(s*.022,-.151,1.879+j*.015),(.019,.005,.007),M['black'],'head',.001)
        tube('Helmet retaining strap',[(s*.138,.01,1.958),(s*.10,-.065,1.847),(s*.037,-.12,1.828)],.011,M['leather'],'head')
        # Soft cowl covers the exposed neck tower in the illustration.
        pts=[(.137*math.cos(a),.105*math.sin(a),1.74+s*.014+.012*math.sin(a*2)) for a in np.linspace(0,math.tau,45)]
        tube('Close fitting rifleman neck wrap',pts,.025,M['scarf'],'spine_02')
    for j in range(3):panel('Segmented helmet roof',(0,.013+j*.029,2.079),.23,.075,M['tan'],'head',normal=(0,.20,1),depth=.009,bolts=False)

# Replace the regular curtain-like folds with broad, irregular draping. Both
# sides of the solidified cloth receive the same displacement.
for o in PARTS:
    name=o.name
    if not any(n in name for n in ['coat front','coat side','rear coat skirt','imperial front tabard','Commander outer cape','Commander burgundy lining','Black torn rear scarf']):continue
    if 'coat front' in name:rows,cols=44,24
    elif 'coat side' in name:rows,cols=44,20
    elif 'rear coat' in name:rows,cols=48,34
    elif 'tabard' in name:rows,cols=48,24
    elif 'Commander' in name:rows,cols=62,58
    else:rows,cols=48,34
    n=(rows+1)*(cols+1)
    for v in o.data.vertices:
        k=v.index%n;t=(k//(cols+1))/rows;u=(k%(cols+1))/cols
        old=(.018+.028*t)*math.sin(u*math.tau*6+.7*t)+.035*math.sin(t*3)
        new=.009*math.sin(u*math.tau*2.1+t*3)+.010*math.sin(u*19-t*7)*math.sin(t*math.pi)+.016*math.sin(t*4+u*2)
        v.co.y+=new-old

# New geometry is authored in rig-local rest coordinates, just like the source.
for o in PARTS:
    if o.parent is None:
        o.parent=rig;mod=o.modifiers.new('Explicit rigid mechanical skinning','ARMATURE');mod.object=rig
# Lower the heads into the collars; preserve the scale of all facial details.
lower=.115 if heavy else .055 if kind=='revenant' else .025 if kind=='sovereign' else .045
for o in PARTS:
    if o.get('deformBone')=='head':o.location.z-=lower
    if any(n in o.name for n in ['Neck servo','Neck gimbal']):
        # Compress these individual neck components toward the gorget.
        o.location.z=1.65+(o.location.z-1.65)*.40
        for v in o.data.vertices:v.co.z*=.40

if kind=='sovereign':
    data.pose_position='POSE';bpy.context.view_layer.update()
    pb=rig.pose.bones['hand_l'];p=pb.head.copy();axis=(pb.tail-p).normalized()
    rest=data.bones['hand_l'];normal=pb.matrix.to_3x3()@rest.matrix_local.to_3x3().inverted()@Vector((0,-1,0))
    desired=Vector((0,0,1));desired=(desired-axis*desired.dot(axis)).normalized();normal=(normal-axis*normal.dot(axis)).normalized()
    angle=math.atan2(axis.dot(normal.cross(desired)),normal.dot(desired))
    pb.matrix=Matrix.Translation(p)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-p)@pb.matrix
    for finger in rig.pose.bones:
        if finger.name.startswith('finger_') and finger.name.endswith('_l'):
            n=int(finger.name.split('_')[1]);segment=int(finger.name.split('_')[2]);finger.rotation_quaternion=Quaternion((1,0,0),-.55 if segment==1 else -.9)@Quaternion((0,0,1),(n-2.5)*.11 if segment==1 else 0)
            finger.keyframe_insert('rotation_quaternion',frame=1)
    pb.keyframe_insert('rotation_quaternion',frame=1)

if kind=='revenant':
    data.pose_position='POSE';bpy.context.view_layer.update()
    for side,name in [('r','Weapon_blade'),('l','Weapon_blade_left')]:
        root=bpy.data.objects[name];pb=rig.pose.bones['hand_'+side]
        grip=pb.head+(pb.tail-pb.head).normalized()*.063
        root.location=rig.matrix_world@grip-root.rotation_euler.to_matrix()@Vector((0,.125*rig.scale.z,0))

if heavy:
    data.pose_position='POSE';rig.animation_data_clear()
    for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
    rig.pose.bones['pelvis'].matrix=Matrix.Translation((0,0,-.055))@data.bones['pelvis'].matrix_local;bpy.context.view_layer.update()
    for side,s,yy in [('r',-1,-.08),('l',1,.07)]:
        W=ik('thigh_'+side,'calf_'+side,(s*.325,yy,.155),(s*.35,-.55,.50));orient('foot_'+side,W,W+Vector((s*.015,-.21,-.08)))
    root=bpy.data.objects['Weapon_rotary'];root.location.z-=.055*rig.scale.z
    # Work in rig-local units for arm constraints.
    local_root=rig.matrix_world.inverted()@root.matrix_world
    for side,local,pole in [('r',(0,.22,-.10),(-.9,-.22,1.18)),('l',(.08,-.20,-.10),(.86,-.2,1.24))]:
        W=ik('upperarm_'+side,'lowerarm_'+side,local_root@Vector(local),pole);orient('hand_'+side,W,W+Vector((0,-.02,-.11)))
    for pb in rig.pose.bones:
        if pb.name.startswith('finger_'):pb.rotation_quaternion=Quaternion((1,0,0),-.64)
        pb.keyframe_insert('location',frame=1);pb.keyframe_insert('rotation_quaternion',frame=1)
    rig.animation_data.action.name='Reference_Pose'

data.pose_position='POSE';bpy.context.view_layer.update()
# A large floor removes the conspicuous horizon line from the studio.
for o in scene.objects:
    if o.type=='MESH' and any(m and m.name=='Studio slate' for m in o.data.materials):o.scale=(100,100,100)
scene.cycles.samples=96
# Slightly lower camera emphasizes their scale and matches the supplied view.
cam=bpy.data.objects['Reference three-quarter'];cam.location.z=2.15*rig.scale.z
target=Vector((0,-.04,1.04*rig.scale.z));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam
scene['referenceRefinement']=True;scene['drapeAndGripRefined']=True
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/f'{kind}.blend'))
print('MECH REFINEMENT COMPLETE',kind,flush=True)
