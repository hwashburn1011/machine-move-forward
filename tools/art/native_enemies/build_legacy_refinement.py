"""Refine the two existing legacy silhouettes on their unchanged Blender rigs.

Run in an isolated Blender process. The editable parts and portable maps remain
in separate source files; runtime scenes retain the original native animations.
"""
import ast, importlib.util, json, math, sys, types
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-legacy-enemies';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('legacy',ROOT/'tools/art/graphics_v3/characters.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
sys.path.insert(0,str(Path(__file__).resolve().parent));from repair_tangents import repair
def flat(name,color,metal=0,rough=.75):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
    return m
c=types.SimpleNamespace(flat=flat)
tree=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material'],type_ignores=[]),'<original worn surfaces>','exec'))
M={}

def textile(name,color,seed):
    m=wear_material(name,color,0,.9,seed);bs=m.node_tree.nodes.get('Principled BSDF')
    for node in m.node_tree.nodes:
        if node.type!='TEX_IMAGE':continue
        if node.image.name.endswith('_Base'):
            image=node.image;size=image.size[0];rng=np.random.default_rng(seed);yy,xx=np.mgrid[:size,:size]/size
            weave=np.sin(xx*math.tau*172)*np.sin(yy*math.tau*172)
            broad=np.sin(xx*math.tau*3+.3*np.sin(yy*math.tau*5))*.035+np.cos(yy*math.tau*2)*.025
            pixels=np.ones((size,size,4),dtype=np.float32)
            pixels[:,:,:3]=np.asarray(color)*(1+broad[:,:,None]+weave[:,:,None]*.025+(rng.random((size,size,1))-.5)*.08)
            image.pixels.foreach_set(pixels.ravel());image.pack()
        if node.image.name.endswith('_Normal'):
            image=node.image;size=image.size[0];yy,xx=np.mgrid[:size,:size]/size
            pixels=np.ones((size,size,4),dtype=np.float32);pixels[:,:,0]=.5+.045*np.sin(xx*math.tau*172);pixels[:,:,1]=.5+.045*np.sin(yy*math.tau*172)
            image.pixels.foreach_set(pixels.ravel());image.pack()
    return m

def materials():
    return dict(jacket=textile('Dust faded charcoal canvas',(.085,.105,.092),7701),
        cloth=textile('Dust worn sand fabric',(.22,.205,.156),7702),
        web=textile('Dust woven harness',(.047,.052,.043),7703),
        leather=wear_material('Dust scuffed leather',(.088,.069,.041),0,.88,7704),
        armor=wear_material('Dust chipped oxide coating',(.16,.068,.038),.15,.76,7705),
        accent=wear_material('Dust faded ochre coating',(.21,.165,.075),.12,.8,7706),
        steel=wear_material('Dust machined worn alloy',(.28,.30,.265),.87,.46,7707),
        darksteel=wear_material('Dust cast graphite',(.047,.057,.052),.72,.67,7708),
        rubber=flat('Dust rubber seals',(.018,.024,.021),0,.92),
        glass=flat('Dust sealed optical glass',(.008,.031,.029),.2,.19),
        skin=textile('Dust protective face cloth',(.115,.109,.076),7709),
        stencil=flat('Dust abraded stencil',(.54,.49,.35),0,.87),
        black=flat('Dust deep recess',(.004,.007,.006),0,.98),
        glow=flat('Dust amber optical core',(.33,.095,.008),.1,.25))

def box(name,at,size,key,bone,bevel=.003):return v.rounded(name,at,size,M[key],bone,bevel)
def cyl(name,a,b,r,key,bone,n=24):return v.cylinder(name,a,b,r,M[key],bone,n)
def hose(name,points,r,key,bone):return v.tube(name,points,r,M[key],bone,2)
def ring(name,at,outer,inner,depth,key,bone,axis='z',n=32):
    x,y,z=at;verts=[];faces=[]
    for along,r in [(-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)]:
        for i in range(n):
            a=i*math.tau/n
            verts.append((x+r*math.cos(a),y+r*math.sin(a),z+along) if axis=='z' else (x+r*math.cos(a),y+along,z+r*math.sin(a)) if axis=='y' else (x+along,y+r*math.sin(a),z+r*math.cos(a)))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    obj=v.lib.mesh(name,verts,faces,M[key],bone)
    for i,f in enumerate(obj.data.polygons):f.use_smooth=(i//n)%2==0
    return obj
def bolt(at,bone,axis=(0,0,1),r=.004):
    a=Vector(at);d=Vector(axis)
    cyl('Captive washer',a,a+d*.0018,r*1.4,'darksteel',bone,16)
    cyl('Socket retaining head',a+d*.0018,a+d*.0048,r,'steel',bone,6)
    cyl('Recessed tool socket',a+d*.0049,a+d*.0051,r*.45,'black',bone,6)
def plate(name,corners,z,depth,key,bone,bevel=.006):
    verts=[(x,y,z+dz) for dz in [-depth/2,depth/2] for x,y in corners];n=len(corners)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=v.lib.mesh(name,verts,faces,M[key],bone)
    bpy.context.view_layer.objects.active=obj
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    mod=obj.modifiers.new('Rounded formed rim','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('Face weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    v.lib.apply_weights(obj,bone);return obj
def label(text,at,size,bone,normal=(0,0,1)):
    normal=Vector(normal);up=Vector((0,1,0));right=up.cross(normal);up=normal.cross(right)
    bpy.ops.object.text_add(location=v.vec(at));obj=bpy.context.object;obj.name='Worn stencil '+text
    obj.data.body=text;obj.data.size=size;obj.data.extrude=.00012;obj.data.align_x='CENTER';obj.data.materials.append(M['stencil'])
    obj.rotation_euler=Matrix((v.vec(right),v.vec(up),v.vec(normal))).transposed().to_euler()
    bpy.ops.object.convert(target='MESH');v.lib.apply_weights(obj,bone);return obj
def remove(prefixes):
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and any(obj.name.startswith(p) for p in prefixes):bpy.data.objects.remove(obj,do_unlink=True)

def raider():
    torso=lambda p:v.mix('Hips','Spine',(p[1]-1.06)/.18)
    v.tailoring('raider',M,torso);v.human_limbs('raider',M);v.backpack('raider',M)
    remove(['Half-face respirator','Respirator filter','Filter slat','Left scavenged pauldron','Raised shoulder ridge','Hood panel seam','Sole tread','Goggle strap'])
    # Follow the tapered welt instead of leaving studs at a constant width.
    for s,suffix in [(-1,'L'),(1,'R')]:
        for z in [-.05,.015,.08,.145]:
            reach=.096*math.sqrt(1-((abs(z-.055)+.0155)/.156)**2)-.003
            for sign in [-1,1]:box('Connected sole tread',(s*.16+sign*reach,.028,z),(.018,.018,.031),'rubber','Foot.'+suffix,.002)
    # A closed band has real vertical width around the crown. The old flat
    # strip helper made a horizontal blade through the ear protectors.
    vertices=[];faces=[];n=48
    for y,rx,rz in [(1.734,.137,.143),(1.755,.137,.143),(1.755,.131,.137),(1.734,.131,.137)]:
        for i in range(n):
            a=i*math.tau/n;vertices.append((rx*math.cos(a),y,-.04+rz*math.sin(a)))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    strap=v.lib.mesh('Fitted goggle band',vertices,faces,M['web'],'Head')
    for i,p in enumerate(strap.data.polygons):p.use_smooth=(i//n)%2==0
    v.loft('Woven waist belt',[(0,1.042,0,.199,.138),(0,1.073,0,.196,.136)],M['web'],'Hips',40,steps=1)
    box('Belt buckle frame',(0,1.058,.145),(.058,.035,.015),'steel','Hips',.004)
    box('Belt buckle opening',(0,1.058,.154),(.043,.02,.004),'black','Hips',.002)
    cyl('Buckle tongue',(0,1.044,.158),(0,1.071,.158),.002,'steel','Hips',12)
    v.loft('Contoured breathing mask',[(0,1.609,.122,.044,.023),(0,1.632,.15,.081,.037),(0,1.665,.149,.078,.043),(0,1.702,.118,.038,.022)],M['rubber'],'Head',36,steps=3)
    for s in [-1,1]:
        ring('Replaceable filter canister',(s*.066,1.648,.182),.030,.019,.028,'darksteel','Head')
        cyl('Filter depth',(s*.066,1.648,.19),(s*.066,1.648,.191),.019,'black','Head',32)
        ring('Filter crimped lip',(s*.066,1.648,.198),.031,.020,.007,'steel','Head')
        for i in range(-2,3):box('Dust filter louvers',(s*.066,1.648+i*.006,.195),(.034,.0025,.005),'steel','Head',.0008)
        for a in [0,2.094,4.189]:bolt((s*.066+math.cos(a)*.024,1.648+math.sin(a)*.024,.202),'Head',r=.002)
        hose('Mask seal seam',[(s*.04,1.69,.144),(s*.088,1.669,.141),(s*.084,1.628,.137),(s*.026,1.614,.146)],.002,'steel','Head')
        # The crown keeps its smooth manufactured shell; no floating seam wires.
    ring('Front exhale valve',(0,1.642,.19),.015,.009,.012,'armor','Head',n=28)
    cyl('Exhale depth',(0,1.642,.188),(0,1.642,.19),.009,'black','Head')
    plate('Scavenged shoulder outer plate',[(-.399,1.419),(-.383,1.485),(-.314,1.521),(-.218,1.492),(-.199,1.44),(-.223,1.372),(-.345,1.363)],.023,.24,'armor','UpperArm.L',.018)
    plate('Shoulder raised front cheek',[(-.373,1.41),(-.365,1.471),(-.27,1.497),(-.23,1.452),(-.248,1.388),(-.339,1.379)],.149,.008,'darksteel','UpperArm.L',.007)
    for x,y in [(-.348,1.454),(-.27,1.458),(-.331,1.397),(-.269,1.409)]:bolt((x,y,.153),'UpperArm.L')
    label('04',(-.306,1.416,.1535),.025,'UpperArm.L')
    plate('Overlapping chest scale',[(-.013,1.386),(.138,1.389),(.131,1.317),(.082,1.284),(-.004,1.311)],.205,.012,'armor','Spine',.005)
    for x in [-.006,.125]:
        for y in [1.334,1.375]:bolt((x,y,.214),'Spine',r=.003)
    label('D-04',(.07,1.351,.2115),.024,'Spine')
    label('FIELD / REPAIR',(.051,1.311,.2115),.008,'Spine')
    # Visible straps, stitched flaps, connector mounts and bounded service kit.
    for x,y,z in [(-.11,1.17,.192),(-.06,1.23,.212),(.025,1.33,.247)]:
        box('Pouch storm flap',(x,y+.02,z),(.073,.019,.006),'web','Spine',.003)
        bolt((x,y+.013,z+.004),'Spine',r=.0022)
    for s,suffix in [(-1,'L'),(1,'R')]:
        bone='Shin.'+suffix
        for x in [s*.16-.047,s*.16+.047]:
            for y in [.519,.612]:bolt((x,y,.119),bone,r=.003)
        for i in range(5):box('Kneepad grip rib',(s*.16,.535+i*.013,.126),(.065,.004,.004),'darksteel',bone,.001)
        for y in np.linspace(1.08,1.42,17):
            x=s*(.176+(float(y)-1.08)*.12);z=.048
            cyl('Side double stitching',(x-.003,float(y),z),(x+.003,float(y)+.002,z),.00065,'stencil',torso,6)
        for z in [-.284,-.327]:
            for y in [1.18,1.28,1.39]:box('Pack abrasion strip',(s*.095,y,z),(.021,.006,.004),'cloth','Spine',.001)
    for x in [-.191,.179]:
        r=.052 if x<0 else .043
        for y in [1.18,1.35]:ring('Canister retaining band',(x,y,-.224 if x<0 else -.205),r+.003,r-.002,.012,'steel','Spine',axis='y',n=24)
    label('SERVICE',(.0,1.28,-.347),.024,'Spine',(0,0,-1))
    label('04',(.0,1.24,-.347),.030,'Spine',(0,0,-1))

def scavenger():
    M['armor']=wear_material('Scavenger aged olive enamel',(.17,.185,.118),.1,.79,7710)
    v.robot(M)
    remove(['Chest service cover','Inset inspection cover','Captive panel bolt','Chest cooling slot','Recessed sensor brow','Scanner metal bezel','Recessed amber optic','Auxiliary sensor'])
    torso=lambda p:v.mix('Hips','Spine',(p[1]-1.07)/.17)
    plate('Sensor face casting',[(-.135,1.779),(-.087,1.791),(.099,1.785),(.135,1.755),(.112,1.692),(-.096,1.689),(-.138,1.717)],.111,.022,'darksteel','Head',.007)
    ring('Optical focus housing',(0,1.744,.136),.047,.034,.031,'steel','Head',n=40)
    ring('Optical inner black baffle',(0,1.744,.147),.035,.023,.018,'black','Head',n=36)
    cyl('Recessed optical lens',(0,1.744,.15),(0,1.744,.154),.026,'glass','Head',40)
    ring('Amber optic illuminator',(0,1.744,.156),.019,.015,.002,'glow','Head',n=32)
    cyl('Camera pupil',(0,1.744,.157),(0,1.744,.158),.009,'black','Head',28)
    for s in [-1,1]:
        box('Auxiliary camera enclosure',(s*.09,1.734,.13),(.032,.034,.014),'armor','Head',.003)
        ring('Auxiliary camera bezel',(s*.09,1.735,.141),.009,.005,.008,'steel','Head',n=20)
        cyl('Auxiliary optic',(s*.09,1.735,.143),(s*.09,1.735,.145),.005,'glow','Head',20)
        for y in [1.715,1.771]:bolt((s*.113,y,.126),'Head',r=.0028)
        for y in [1.661,1.682,1.703]:
            box('Head ventilation cheek',(s*.125,y,-.055),(.017,.011,.071),'darksteel','Head',.002)
        hose('Head service conduit',[(s*.031,1.496,-.044),(s*.063,1.535,-.052),(s*.062,1.6,-.062),(s*.078,1.637,-.084)],.007,'rubber',lambda p:v.mix('Spine','Head',(p[1]-1.49)/.12))
    for y in [1.505,1.528,1.551,1.574,1.597]:ring('Neck sealed bellows',(0,y,-.014),.052,.044,.011,'rubber','Head',axis='y',n=28)
    plate('Thorax access surround',[(-.166,1.423),(-.124,1.456),(.135,1.449),(.173,1.415),(.145,1.243),(.065,1.20),(-.131,1.249)],.115,.035,'darksteel','Spine',.009)
    for i in range(3):
        y=1.395-i*.056
        plate('Overlapping chest armor',[(-.133,y+.022),(.13,y+.022),(.122,y-.02),(.065,y-.033),(-.123,y-.023)],.144+i*.002,.017,'armor','Spine',.004)
        for x in [-.108,.11]:bolt((x,y,.157+i*.002),'Spine',r=.003)
    label('SC-11',(0,1.398,.153),.027,'Spine')
    label('UTILITY FRAME',(0,1.37,.153),.010,'Spine')
    for y in [1.24,1.258,1.276]:box('Protected thorax vent',(0,y,.145),(.096,.007,.022),'black','Spine',.001)
    for s in [-1,1]:
        hose('Thorax protected power cable',[(s*.168,1.414,-.12),(s*.188,1.25,-.149),(s*.136,1.14,-.122),(s*.11,.977,-.115)],.009,'rubber',torso)
        cyl('Hip bulkhead cable socket',(s*.11,.977,-.103),(s*.11,.977,-.12),.015,'steel','Hips',16)
        for y in [1.15,1.36]:
            box('Power conduit clip',(s*(.142 if y<1.2 else .185),y,-.147),(.039,.018,.02),'steel','Spine',.003)
        for suffix_bone,at,r in [('UpperArm',(s*.329,1.426,-.01),.078),('Forearm',(s*.435,1.167,.01),.050),('Thigh',(s*.244,.945,0),.052),('Shin',(s*.244,.56,0),.049)]:
            bone=suffix_bone+'.'+('L' if s<0 else 'R');x,y,z=at
            ring('Joint machined retainer',(x,y,z),r,r*.73,.012,'steel',bone,axis='x',n=28)
            cyl('Recessed joint cap',(x-s*.004,y,z),(x+s*.002,y,z),r*.68,'darksteel',bone,28)
            for a in [0,math.pi/2,math.pi,math.pi*1.5]:bolt((x+s*.008,y+r*.82*math.cos(a),z+r*.82*math.sin(a)),bone,axis=(s,0,0),r=.003)
        side='L' if s<0 else 'R'
        for bone,x,y,z,r in [('UpperArm',.231,1.426,-.01,.070),('Forearm',.316,1.167,.01,.041)]:
            name=bone+'.'+side;x*=s
            ring('Joint inner retainer',(x,y,z),r,r*.72,.009,'steel',name,axis='x',n=28)
            cyl('Inner joint machined recess',(x+s*.002,y,z),(x-s*.003,y,z),r*.66,'darksteel',name,28)
            for a in [0,math.pi/2,math.pi,math.pi*1.5]:bolt((x-s*.0045,y+r*.83*math.cos(a),z+r*.83*math.sin(a)),name,axis=(-s,0,0),r=.0027)
        for bone,y,x,width,z in [('Thigh',.78,.16,.12,.113),('Shin',.408,.16,.09,.090),('UpperArm',1.32,.35,.10,.110),('Forearm',1.072,.395,.085,.120)]:
            name=bone+'.'+side;x*=s
            plate('Raised limb service plate',[(x-width/2,y+.065),(x+width/2,y+.065),(x+width*.42,y-.06),(x-width*.42,y-.065)],z,.012,'armor',name,.005)
            for dx in [-width*.33,width*.33]:
                for dy in [-.044,.044]:
                    cyl('Armor plate supporting boss',(x+dx,y+dy,z-.065),(x+dx,y+dy,z-.004),.008,'darksteel',name,16)
                    bolt((x+dx,y+dy,z+.006),name,r=.0026)
        for y in [.31,.47]:ring('Shin piston gland',(s*.16,y,0),.034,.025,.018,'darksteel','Shin.'+side,axis='y',n=24)
        for z in [.08,.14]:
            for dx in [-.058,.058]:bolt((s*.16+dx,.119,z),'Foot.'+side,axis=(0,1,0),r=.003)
        for y in [1.195,1.395]:ring('Battery jacket band',(s*.181,y,-.17),.042,.037,.013,'steel','Spine',axis='y',n=24)
    for y in [1.045,1.085]:ring('Waist travel stop',(0,y,0),.099,.088,.007,'steel','Hips',axis='y',n=32)
    # Back lettering belongs on the radiator's supporting lower rail.
    box('Radiator identification rail',(0,1.19,-.245),(.19,.034,.012),'darksteel','Spine',.003)
    label('SC-11',(0,1.183,-.2515),.019,'Spine',(0,0,-1))

def finish_geometry(objects):
    for obj in objects:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        tiny=[f for f in bm.faces if f.calc_area()<1e-12]
        if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
        loose=[x for x in bm.verts if not x.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        # Stable metre-scale projection for fabricated pieces. Retain tailored
        # cloth/skin UVs so folds carry their original continuous weave.
        if not any(t in obj.name for t in ['jacket','trouser','Sleeve','boot','hood','gaiter','pack','Face and jaw']):
            for poly in obj.data.polygons:
                axis=max(range(3),key=lambda a:abs(poly.normal[a]));a,b=[i for i in range(3) if i!=axis]
                for loop in poly.loop_indices:
                    p=obj.data.vertices[obj.data.loops[loop].vertex_index].co;uv.data[loop].uv=(p[a]*3.2,p[b]*3.2)
        obj.data.calc_loop_triangles();obj.select_set(False)

def make(kind):
    global M
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/graphics-v3'/f'{kind}.blend'))
    bpy.context.preferences.filepaths.save_version=0
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');root=rig.parent
    rig.animation_data.action=None
    if rig.animation_data.nla_tracks:
        for track in rig.animation_data.nla_tracks:track.mute=True
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    for obj in list(bpy.context.scene.objects):
        if obj.type in ['MESH','LIGHT','CAMERA']:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update();M=materials()
    bs=M['glow'].node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.85,.16,.015,1);bs.inputs['Emission Strength'].default_value=.6
    raider() if kind=='raider' else scavenger()
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];finish_geometry(objects)
    triangles=sum(len(o.data.loop_triangles) for o in objects)
    for obj in objects:
        world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
        arm=obj.modifiers.new('Existing rig deformation','ARMATURE');arm.object=rig
    scene=bpy.context.scene;scene.name=kind.title()+' refinement';scene.world=bpy.data.worlds.new(kind+' studio');scene.world.color=(.2,.2,.2)
    target=v.vec((0,1,0));bpy.ops.object.camera_add(location=v.vec((2.8,1.9,5.0)));cam=bpy.context.object
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.35;scene.camera=cam
    for at,power,size in [((2,-3,4),420,4),((-3,-2,2.5),300,3),((1,3,4),550,3)]:
        bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1200;scene.render.resolution_y=1450;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/(kind+'.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')),compress=True)
    if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();skin=bpy.context.object;skin.name=kind+'_RefinedSkin'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    v.bake_contact_color(skin)
    arm=skin.modifiers.new('Existing rig deformation','ARMATURE');arm.object=rig
    old=list(skin.data.materials);mats=list(dict.fromkeys(old));indices=[mats.index(old[p.material_index]) for p in skin.data.polygons];skin.data.materials.clear()
    for mat in mats:skin.data.materials.append(mat)
    for poly,index in zip(skin.data.polygons,indices):poly.material_index=index
    root.select_set(True);rig.select_set(True)
    path=ROOT/'godot/art'/('legacy-'+kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_tangents=True,export_vertex_color='ACTIVE',export_cameras=False,export_lights=False)
    from root_legacy_skin import root_skin
    root_skin(path)
    result={'kind':kind,'editableParts':len(objects),'triangles':triangles,'materials':len(mats),'bytes':path.stat().st_size,'repairedTangents':repair(path),'bones':[b.name for b in rig.data.bones]}
    (OUT/(kind+'-manifest.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print('LEGACY_REFINED',result,flush=True)

if __name__=='__main__':
    kinds=['raider','scavenger']
    selected=next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--kind=')),None)
    if selected:
        if selected not in kinds:raise ValueError('Expected raider or scavenger')
        kinds=[selected]
    for kind in kinds:make(kind)
