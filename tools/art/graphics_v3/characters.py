"""Original v3 character construction. Run only in isolated Blender.

Retains the game's proven skeleton/locomotion and weapon-hand coordinate frame;
rebuilds the visible anatomy, tailoring and mechanical construction independently.
"""
import bpy
import math
import sys
import json
import importlib.util
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT/'assets/graphics-v3/staging'
SOURCE = ROOT/'assets/blender/graphics-v3'
MAPS = ROOT/'assets/graphics-v3/character-maps'
for p in (STAGE, SOURCE, MAPS): p.mkdir(parents=True, exist_ok=True)
spec=importlib.util.spec_from_file_location('v2_char',ROOT/'tools/art/graphics_v2/characters.py')
lib=importlib.util.module_from_spec(spec); spec.loader.exec_module(lib)
lib.MAPS=MAPS
vec=lib.vec
rounded=lib.rounded
sphere=lib.sphere
tube=lib.tube
mix=lib.interpolate


def maps(kind, size=512):
    rng=np.random.default_rng({'canvas':731,'metal':327,'leather':993}[kind])
    v,u=np.mgrid[:size,:size]/size
    grain=rng.random((size,size))-.5
    cloud=(np.sin(u*math.tau*2+.5*np.sin(v*math.tau*3))+np.cos(v*math.tau*3+.8*np.sin(u*math.tau)))*.25
    # Microstructure is subordinate to garment shape, not a high-contrast grid.
    weave=np.sin(u*math.tau*180)*np.sin(v*math.tau*180)
    if kind=='canvas':
        value=.91+.035*cloud+.012*grain
        rough=.85+.035*cloud+.018*grain
        slope=.010*weave+.008*grain
        metallic=0
    elif kind=='metal':
        value=.93+.025*cloud+.008*grain
        rough=.43+.10*cloud+.025*grain
        slope=.006*grain
        metallic=.82
    else:
        value=.89+.04*cloud+.018*grain
        rough=.71+.055*cloud+.025*grain
        slope=.009*grain
        metallic=0
    return (np.repeat(value[:,:,None],3,axis=2),
            lib.image(kind+'_micro_normal',np.stack([.5+slope,.5+np.roll(slope,3,0),np.ones_like(u)],axis=2)),
            lib.image(kind+'_surface',np.stack([np.ones_like(u),rough,np.ones_like(u)*metallic],axis=2)))


def material(name, hexcolor, tex=None, metallic=0, roughness=.75):
    m=bpy.data.materials.new(name); m.use_nodes=True
    m.diffuse_color=(*lib.rgb(hexcolor),1)
    nodes,links=m.node_tree.nodes,m.node_tree.links
    bs=nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=m.diffuse_color
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=roughness
    if tex:
        tint=np.array([int(hexcolor[n:n+2],16)/255 for n in (0,2,4)],dtype=np.float32)
        base=nodes.new('ShaderNodeTexImage');base.image=lib.image(name+'_Color',tex[0]*tint,True)
        links.new(base.outputs['Color'],bs.inputs['Base Color'])
        norm=nodes.new('ShaderNodeTexImage');norm.image=tex[1]
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.3
        links.new(norm.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
        orm=nodes.new('ShaderNodeTexImage');orm.image=tex[2]
        sep=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs[0],sep.inputs[0])
        if roughness>=.7 or metallic:
            links.new(sep.outputs['Green'],bs.inputs['Roughness'])
        if metallic:links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    return m


def profile(rings, steps=3):
    """Catmull-Rom sections; smooth silhouettes in elevation as well as around."""
    out=[]
    a=np.asarray(rings,dtype=float)
    for i in range(len(a)-1):
        p0,p1,p2,p3=a[max(0,i-1)],a[i],a[i+1],a[min(len(a)-1,i+2)]
        for k in range(steps):
            t=k/steps
            p=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
            p[1]=p1[1]+(p2[1]-p1[1])*t
            p[3:]=np.maximum(p[3:],.002)
            out.append(tuple(p))
    out.append(tuple(a[-1]));return out


def loft(name, rings, mat, weight, segments=40, folds=0, crease_y=None, steps=3):
    rings=profile(rings,steps)
    verts=[];faces=[];uvs=[]
    y0,y1=rings[0][1],rings[-1][1]
    for j,(x,y,z,rx,rz) in enumerate(rings):
        for i in range(segments):
            angle=math.tau*i/segments
            f=0
            if folds and crease_y is not None:
                envelope=math.exp(-((y-crease_y)/.09)**2)
                f=folds*envelope*(math.sin((y-crease_y)*110+math.cos(angle*2)*1.7))
            # Flatten front/back slightly: clothing follows an oval rib cage.
            verts.append((x+(rx+f)*math.cos(angle),y,z+(rz+f*.7)*math.sin(angle)))
    for j in range(len(rings)-1):
        for i in range(segments):
            k=(i+1)%segments
            faces.append((j*segments+i,j*segments+k,(j+1)*segments+k,(j+1)*segments+i))
            va=(rings[j][1]-y0)/(y1-y0);vb=(rings[j+1][1]-y0)/(y1-y0)
            uvs.append(((i/segments,va),((i+1)/segments,va),((i+1)/segments,vb),(i/segments,vb)))
    faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))])
    for reverse in (True,False):
        indices=list(reversed(range(segments))) if reverse else range(segments)
        uvs.append(tuple((.5+.48*math.cos(math.tau*i/segments),.5+.48*math.sin(math.tau*i/segments)) for i in indices))
    return lib.mesh(name,verts,faces,mat,weight,uvs)


def strip(name,points,width,mat,weight,thickness=.004):
    """Flat woven straps rather than cylindrical ropes."""
    verts=[];faces=[];uvs=[]
    for p in points:
        for dx,dz in [(-width/2,-thickness/2),(width/2,-thickness/2),(width/2,thickness/2),(-width/2,thickness/2)]:
            verts.append((p[0]+dx,p[1],p[2]+dz))
    for j in range(len(points)-1):
        for i in range(4):
            faces.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
            uvs.append(((0,j/(len(points)-1)),(1,j/(len(points)-1)),(1,(j+1)/(len(points)-1)),(0,(j+1)/(len(points)-1))))
    return lib.mesh(name,verts,faces,mat,weight,uvs)


def cylinder(name,a,b,r,mat,weight,segments=24):
    delta=vec(b)-vec(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=delta.length,location=(vec(a)+vec(b))*.5)
    o=bpy.context.object;o.name=name
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    lib.apply_weights(o,weight)
    return o


def tailoring(stem,M,torso):
    player=stem=='player'
    loft('Fitted field jacket',[(0,y,z,rx,rz) for y,z,rx,rz in [
        (1.035,-.002,.183,.124),(1.085,0,.193,.133),(1.17,-.009,.175,.135),
        (1.27,-.012,.207,.153),(1.37,-.009,.239,.158),(1.44,-.015,.245,.151),
        (1.49,-.023,.215,.13),(1.53,-.025,.154,.105),(1.56,-.019,.10,.085)]],M['jacket'],torso,44,.002,1.12)
    loft('Trouser seat',[(0,.935,-.008,.176,.118),(0,.975,-.012,.197,.133),(0,1.045,-.006,.192,.133),
        (0,1.072,0,.181,.12)],M['cloth'],'Hips',40)
    # A defined chin/cheek/forehead beneath the worn hood, protective lenses and mask.
    loft('Face and jaw',[(0,1.60,.02,.055,.06),(0,1.627,.033,.078,.075),(0,1.676,.026,.11,.104),
        (0,1.732,.01,.115,.116),(0,1.79,-.01,.104,.11),(0,1.82,-.02,.068,.077)],M['skin'],'Head',40)
    loft('Tailored hood' if player else 'Armored crown',[(0,1.684,-.033,.119,.117),
        (0,1.738,-.04,.135,.138),(0,1.80,-.034,.13,.136),(0,1.85,-.033,.105,.113),
        (0,1.877,-.035,.06,.077),(0,1.884,-.035,.006,.018)],M['cloth'] if player else M['armor'],'Head',44)
    for s in (-1,1):
        # Curved thin lenses, with an actual bridge and small metal clips.
        rounded('Goggle gasket',(s*.061,1.738,.128),(.117,.067,.028),M['rubber'],'Head',.023)
        rounded('Smoked optical lens',(s*.061,1.74,.144),(.092,.043,.014),M['glass'],'Head',.015)
        rounded('Goggle clip',(s*.115,1.739,.136),(.012,.028,.012),M['steel'],'Head',.004)
        strip('Goggle strap',[(s*.126,1.745,.075),(s*.14,1.745,-.02),(s*.109,1.743,-.142)],.022,M['web'],'Head')
        sphere('Ear protection',(s*.132,1.71,-.009),(.025,.046,.039),M['leather'],'Head',20,10)
        tube('Hood panel seam',[(s*.05,1.875,-.03),(s*.097,1.83,-.045),(s*.127,1.76,-.081),
            (s*.11,1.69,-.107)],.0018,M['web'],'Head',2)
    rounded('Nose bridge',(0,1.74,.145),(.025,.011,.012),M['steel'],'Head',.004)
    sphere('Half-face respirator',(0,1.653,.133),(.076,.047,.05),M['rubber'],'Head',28,14)
    cylinder('Respirator filter',(0,1.65,.17),(0,1.65,.196),.025,M['steel'],'Head',28)
    for i in range(-2,3):
        rounded('Filter slat',(i*.007,1.651,.199),(.003,.028,.004),M['rubber'],'Head',.001)
    loft('Wrapped neck gaiter',[(0,1.505,-.009,.107,.095),(0,1.542,0,.124,.109),
        (0,1.577,.003,.115,.098),(0,1.611,.011,.10,.084)],M['web'] if player else M['accent'],'Head',40,.003,1.55)
    for s in (-1,1):
        tube('Jacket side seam',[(s*.175,1.06,.024),(s*.169,1.17,.05),(s*.2,1.31,.041),(s*.227,1.43,.02)],.0018,M['web'],torso,2)
        strip('Load harness',[(s*.125,1.10,.14),(s*.144,1.3,.163),(s*.158,1.455,.121),
            (s*.151,1.517,-.04),(s*.139,1.43,-.16),(s*.13,1.14,-.157)],.029,M['web'],torso)
        rounded('Harness adjuster',(s*.139,1.267,.169),(.041,.048,.01),M['steel'],'Spine',.006)
        rounded('Adjuster inset',(s*.139,1.267,.176),(.024,.027,.005),M['web'],'Spine',.002)
    strip('Front placket',[(0,1.076,.133),(0,1.19,.131),(0,1.32,.153),(0,1.43,.137),(0,1.51,.09)],.023,M['jacket'],torso)
    tube('Zipper teeth',[(.004,1.088,.137),(.004,1.28,.151),(.004,1.44,.143)],.0017,M['steel'],torso,2)
    rounded('Chest utility pocket',(-.08,1.365,.153),(.116,.122,.033),M['jacket'],'Spine',.018)
    rounded('Pocket storm flap',(-.08,1.416,.174),(.119,.033,.01),M['cloth'] if player else M['web'],'Spine',.006)
    rounded('Field patch',(.088,1.39,.158),(.074,.044,.007),M['cloth'] if player else M['accent'],'Spine',.003)
    for i in range(3):rounded('Patch stitch',(.065+i*.022,1.39,.163),(.009,.002,.002),M['web'],'Spine',.0005)
    if not player:
        # Broad asymmetric protection reads before microdetail.
        rounded('Left scavenged pauldron',(-.285,1.437,.013),(.215,.157,.263),M['armor'],'UpperArm.L',.052)
        rounded('Raised shoulder ridge',(-.295,1.512,.014),(.176,.025,.229),M['accent'],'UpperArm.L',.01)
        rounded('Breastplate',(.065,1.344,.171),(.20,.225,.04),M['armor'],'Spine',.038)
        rounded('Plate inset',(.065,1.36,.193),(.133,.142,.009),M['darksteel'],'Spine',.017)
        for y in (1.245,1.425):
            for x in (-.009,.135):sphere('Armor rivet',(x,y,.197),(.006,.006,.004),M['steel'],'Spine',12,6)
        strip('Diagonal bandolier',[(-.14,1.105,.148),(-.09,1.2,.183),(.005,1.31,.224),(.15,1.445,.165)],.055,M['leather'],torso)
        for x,y,z in [(-.11,1.17,.172),(-.06,1.23,.192),(.025,1.33,.227)]:
            rounded('Bandolier pouch',(x,y,z),(.082,.06,.035),M['leather'],'Spine',.012)


def human_limbs(stem,M):
    player=stem=='player'
    for suffix,s in [('L',-1),('R',1)]:
        thigh,shin,foot=('Thigh.'+suffix,'Shin.'+suffix,'Foot.'+suffix)
        upper,fore,hand=('UpperArm.'+suffix,'Forearm.'+suffix,'Hand.'+suffix)
        def lw(p,thigh=thigh,shin=shin,foot=foot):
            if p[1]>.935:return mix(thigh,'Hips',(p[1]-.935)/.11)
            if p[1]>.47:return mix(shin,thigh,(p[1]-.47)/.17)
            return mix(foot,shin,(p[1]-.21)/.07) if p[1]<.28 else {shin:1}
        aw=lambda p,upper=upper,fore=fore:mix(fore,upper,(p[1]-1.075)/.17)
        loft('Tailored trouser '+suffix,[(s*x,y,z,rx,rz) for x,y,z,rx,rz in [
            (.16,.245,-.001,.062,.072),(.16,.30,-.002,.064,.077),(.16,.38,-.014,.073,.085),
            (.16,.47,-.013,.069,.08),(.16,.56,.009,.073,.084),(.16,.64,.004,.081,.096),
            (.157,.75,-.014,.099,.119),(.144,.87,-.015,.111,.131),(.12,.94,-.005,.112,.123),
            (.108,.99,0,.108,.112)]],M['cloth'],lw,36,.005,.55)
        loft('Sleeve '+suffix,[(s*x,y,z,rx,rz) for x,y,z,rx,rz in [
            (.398,.98,.04,.052,.062),(.394,1.04,.024,.058,.074),(.384,1.115,.008,.067,.082),
            (.376,1.18,.003,.073,.085),(.36,1.25,-.01,.076,.09),(.337,1.335,-.012,.085,.104),
            (.303,1.415,-.022,.097,.11),(.282,1.47,-.025,.09,.094),(.265,1.49,-.026,.055,.069)]],M['jacket'],aw,36,.0045,1.16)
        loft('Sleeve cuff '+suffix,[(s*.399,.968,.047,.053,.063),(s*.397,.993,.041,.058,.066),
            (s*.396,1.012,.035,.057,.068)],M['web'],fore,28,steps=2)
        tube('Sleeve back seam '+suffix,[(s*.398,1.01,-.039),(s*.389,1.13,-.074),(s*.35,1.31,-.105),(s*.295,1.445,-.12)],.0018,M['web'],aw,2)
        rounded('Cargo pocket '+suffix,(s*.228,.81,.025),(.045,.151,.14),M['cloth'],thigh,.018)
        rounded('Cargo flap '+suffix,(s*.25,.872,.025),(.012,.039,.145),M['jacket'],thigh,.008)
        rounded('Formed knee protection '+suffix,(s*.16,.567,.10),(.12,.136,.035),M['armor'],shin,.028)
        rounded('Knee inset '+suffix,(s*.16,.565,.12),(.076,.084,.008),M['rubber'],shin,.014)
        tube('Trouser outseam '+suffix,[(s*.229,.3,-.008),(s*.236,.46,-.01),(s*.245,.64,0),(s*.25,.88,.01)],.0016,M['web'],lw,2)
        # Actual boot panels; lower toe and visible welt instead of bulbous shoes.
        loft('Work boot '+suffix,[(s*.16,.044,.055,.09,.145),(s*.16,.075,.06,.091,.15),
            (s*.16,.111,.063,.087,.145),(s*.16,.15,.03,.072,.104),(s*.16,.208,-.014,.064,.076),
            (s*.16,.267,-.016,.066,.077)],M['leather'],foot,36,steps=2)
        loft('Boot rubber welt '+suffix,[(s*.16,.012,.056,.089,.148),(s*.16,.029,.055,.099,.158),
            (s*.16,.046,.055,.098,.157),(s*.16,.055,.055,.093,.15)],M['rubber'],foot,36,steps=2)
        for y,z in ((.113,.165),(.139,.135),(.169,.097),(.197,.066),(.224,.059)):
            for dx in (-.034,.034):sphere('Lace eyelet',(s*.16+dx,y,z),(.005,.005,.004),M['steel'],foot,10,6)
            tube('Crossed lace',[(s*.16-.033,y,z),(s*.16+.028,y+.012,z-.002)],.0018,M['web'],foot,1)
        for z in (-.05,.015,.08,.145):
            for dx in (-.095,.095):rounded('Sole tread',(s*.16+dx,.028,z),(.008,.018,.031),M['rubber'],foot,.002)
        sphere('Fitted glove palm '+suffix,(s*.397,.921,.066),(.052,.064,.055),M['leather'],hand,24,12)
        for i,dx in enumerate((-.033,-.011,.011,.033)):
            rounded('Curled glove finger '+suffix,(s*.397+dx,.875,.083),(.021,.048,.045),M['leather'],hand,.01)
            rounded('Knuckle padding '+suffix,(s*.397+dx,.908,.111),(.019,.021,.013),M['rubber'],hand,.006)
        sphere('Glove thumb '+suffix,(s*.345,.919,.093),(.020,.037,.026),M['leather'],hand,20,10)


def backpack(stem,M):
    player=stem=='player'
    loft('Shaped travel pack',[(0,1.12,-.195,.119,.054),(0,1.16,-.217,.154,.084),
        (0,1.26,-.236,.16,.094),(0,1.40,-.218,.15,.082),(0,1.46,-.197,.13,.068),
        (0,1.477,-.18,.078,.039)],M['web'],'Spine',36,steps=3)
    rounded('Pack storm lid',(0,1.452,-.233),(.29,.057,.128),M['jacket'] if player else M['leather'],'Spine',.025)
    rounded('Back organizer pocket',(0,1.252,-.324),(.21,.17,.038),M['jacket'],'Spine',.025)
    tube('Pack pocket piping',[(-.096,1.19,-.343),(-.097,1.317,-.34),(0,1.335,-.342),(.097,1.317,-.34),(.096,1.19,-.343)],.0021,M['web'],'Spine',2)
    for x in (-.099,.099):
        strip('Pack compression webbing',[(x,1.143,-.274),(x,1.245,-.349),(x,1.36,-.307),(x,1.462,-.254)],.023,M['leather'],'Spine')
        rounded('Pack buckle',(x,1.34,-.321),(.033,.04,.012),M['steel'],'Spine',.004)
        rounded('Buckle slot',(x,1.34,-.329),(.016,.021,.003),M['web'],'Spine',.001)
    cylinder('Utility canister',(.179,1.16,-.205),(.179,1.37,-.205),.041,M['armor'],'Spine',28)
    cylinder('Canister lid',(.179,1.37,-.205),(.179,1.388,-.205),.039,M['steel'],'Spine',24)
    strip('Canister retaining strap',[(.179,1.2,-.251),(.179,1.24,-.253),(.179,1.29,-.252)],.031,M['web'],'Spine')
    if not player:
        cylinder('Salvaged battery',(-.191,1.14,-.224),(-.191,1.4,-.224),.05,M['accent'],'Spine',24)
        tube('Battery cable',[(-.19,1.4,-.226),(-.16,1.46,-.16),(-.07,1.43,-.162)],.007,M['rubber'],'Spine',3)


def robot(M):
    torso=lambda p:mix('Hips','Spine',(p[1]-1.07)/.17)
    loft('Cast thorax',[(0,1.08,-.01,.129,.10),(0,1.17,-.02,.159,.122),
        (0,1.32,-.024,.225,.139),(0,1.43,-.031,.242,.133),(0,1.495,-.034,.168,.101)],M['armor'],torso,40,steps=3)
    rounded('Chest service cover',(0,1.332,.119),(.309,.22,.038),M['darksteel'],'Spine',.045)
    rounded('Inset inspection cover',(0,1.335,.141),(.237,.145,.013),M['armor'],'Spine',.018)
    for x in (-.127,.127):
        for y in (1.26,1.411):cylinder('Captive panel bolt',(x,y,.147),(x,y,.154),.008,M['steel'],'Spine',12)
    for y in (1.30,1.325,1.35):rounded('Chest cooling slot',(0,y,.151),(.17,.009,.005),M['rubber'],'Spine',.002)
    cylinder('Waist actuator',(0,1.00,0),(0,1.16,0),.083,M['steel'],'Hips',28)
    for y in (1.022,1.055,1.087):cylinder('Waist bellows',(0,y,0),(0,y+.015,0),.094,M['rubber'],'Hips',28)
    rounded('Pelvic casting',(0,.957,0),(.321,.133,.207),M['darksteel'],'Hips',.035)
    cylinder('Neck ram',(0,1.482,-.014),(0,1.637,-.014),.047,M['steel'],'Head',28)
    loft('Sensor cast housing',[(0,1.616,-.013,.072,.074),(0,1.646,-.02,.13,.104),
        (0,1.735,-.034,.139,.129),(0,1.795,-.045,.119,.114),(0,1.824,-.05,.055,.067)],M['armor'],'Head',40)
    rounded('Recessed sensor brow',(0,1.738,.094),(.269,.095,.043),M['darksteel'],'Head',.026)
    cylinder('Scanner metal bezel',(0,1.744,.109),(0,1.744,.146),.043,M['steel'],'Head',32)
    cylinder('Recessed amber optic',(0,1.744,.145),(0,1.744,.15),.032,M['glass'],'Head',32)
    for x in (-.094,.094):rounded('Auxiliary sensor',(x,1.733,.123),(.029,.019,.007),M['accent'],'Head',.004)
    cylinder('Antenna base',(.103,1.778,-.075),(.112,1.817,-.083),.013,M['steel'],'Head',16)
    cylinder('Flexible antenna',(.112,1.817,-.083),(.14,1.864,-.094),.004,M['rubber'],'Head',12)
    for suffix,s in [('L',-1),('R',1)]:
        thigh,shin,foot='Thigh.'+suffix,'Shin.'+suffix,'Foot.'+suffix
        upper,fore,hand='UpperArm.'+suffix,'Forearm.'+suffix,'Hand.'+suffix
        # Separated rigid shells and true exposed joint spaces.
        for name,y,r,bone in [('Hip bearing',.945,.073,thigh),('Knee bearing',.56,.065,shin),('Ankle bearing',.24,.044,foot)]:
            cylinder(name,(s*.16-.07,y,0),(s*.16+.07,y,0),r,M['darksteel'],bone,28)
            cylinder(name+' cap',(s*.16+s*.07,y,0),(s*.16+s*.082,y,0),r*.64,M['steel'],bone,24)
        loft('Upper leg guard '+suffix,[(s*.16,.647,-.005,.061,.068),(s*.16,.696,-.01,.076,.083),
            (s*.155,.818,-.017,.086,.098),(s*.151,.883,-.015,.069,.08)],M['armor'],thigh,32,steps=2)
        cylinder('Thigh internal actuator',(s*.16,.60,0),(s*.15,.93,0),.039,M['steel'],thigh,24)
        loft('Shin shell '+suffix,[(s*.16,.285,-.01,.049,.055),(s*.16,.342,-.016,.066,.066),
            (s*.16,.449,-.01,.069,.075),(s*.16,.493,-.004,.055,.063)],M['armor'],shin,32,steps=2)
        cylinder('Lower leg piston',(s*.16,.26,0),(s*.16,.543,0),.026,M['steel'],shin,24)
        for y in (.344,.371,.398):rounded('Shin vent',(s*.16,y,.056),(.078,.011,.013),M['rubber'],shin,.003)
        tube('Protected knee hose',[(s*.223,.80,-.01),(s*.245,.65,-.065),(s*.224,.56,-.083),(s*.209,.37,-.053)],.010,M['rubber'],lambda p,t=thigh,k=shin:mix(k,t,(p[1]-.50)/.16),3)
        rounded('Mechanical heel '+suffix,(s*.16,.104,-.032),(.17,.155,.149),M['darksteel'],foot,.033)
        rounded('Segmented toe '+suffix,(s*.16,.063,.111),(.182,.10,.16),M['armor'],foot,.03)
        rounded('Ground pad '+suffix,(s*.16,.022,.048),(.188,.035,.285),M['rubber'],foot,.012)
        for z in (.072,.127):rounded('Toe articulation seam',(s*.16,.115,z),(.148,.006,.006),M['rubber'],foot,.002)
        cylinder('Shoulder trunnion',(s*.233,1.426,-.01),(s*.33,1.426,-.01),.077,M['steel'],upper,28)
        loft('Upper arm shell '+suffix,[(s*.374,1.219,0,.048,.055),(s*.36,1.27,0,.066,.071),
            (s*.321,1.38,-.01,.081,.085),(s*.305,1.43,-.012,.066,.075)],M['armor'],upper,32,steps=2)
        cylinder('Elbow hinge',(s*.377-.058,1.167,.01),(s*.377+.058,1.167,.01),.048,M['darksteel'],fore,24)
        loft('Forearm guard '+suffix,[(s*.399,1.01,.035,.045,.055),(s*.396,1.054,.029,.06,.07),
            (s*.388,1.113,.019,.061,.071),(s*.384,1.137,.013,.047,.055)],M['armor'],fore,28,steps=2)
        cylinder('Wrist coupling',(s*.399,.961,.049),(s*.398,1.036,.039),.032,M['steel'],fore,24)
        rounded('Manipulator palm '+suffix,(s*.4,.92,.068),(.092,.099,.08),M['darksteel'],hand,.019)
        for dx in (-.03,0,.03):
            rounded('Manipulator finger',(s*.4+dx,.874,.092),(.023,.055,.03),M['steel'],hand,.008)
            cylinder('Finger pin',(s*.4+dx-.012,.9,.108),(s*.4+dx+.012,.9,.108),.007,M['darksteel'],hand,12)
        rounded('Manipulator thumb',(s*.345,.921,.093),(.031,.07,.032),M['steel'],hand,.01)
    rounded('Back heat exchanger',(0,1.316,-.176),(.259,.28,.09),M['darksteel'],'Spine',.025)
    for x in (-.102,-.068,-.034,0,.034,.068,.102):rounded('Cooling fin',(x,1.325,-.23),(.008,.213,.025),M['steel'],'Spine',.002)
    for s in (-1,1):
        cylinder('Power cell',(s*.181,1.18,-.17),(s*.181,1.414,-.17),.039,M['accent'],'Spine',28)
        tube('Power connection',[(s*.181,1.42,-.17),(s*.15,1.472,-.128),(s*.07,1.475,-.109)],.009,M['rubber'],'Spine',3)


def bake_contact_color(skin):
    """Portable local occlusion from actual construction, not a noise overlay.

    Short hemisphere rays capture straps, overlapping cloth, panel recesses and
    fasteners. Only local cavities darken; dynamic lighting remains runtime-owned.
    """
    mesh=skin.data
    mesh.update()
    bvh=BVHTree.FromPolygons([v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons])
    layer=mesh.color_attributes.new(name='ConstructionOcclusion',type='FLOAT_COLOR',domain='POINT')
    for vertex in mesh.vertices:
        normal=vertex.normal.normalized()
        if normal.length<.5:normal=Vector((0,0,1))
        tangent=normal.cross(Vector((0,0,1)) if abs(normal.z)<.8 else Vector((0,1,0))).normalized()
        bitangent=normal.cross(tangent)
        blocked=0.
        for i in range(8):
            angle=i*2.399963229728653
            r=math.sqrt((i+.5)/8)*.89
            direction=normal*math.sqrt(1-r*r)+tangent*(r*math.cos(angle))+bitangent*(r*math.sin(angle))
            hit=bvh.ray_cast(vertex.co+normal*.0025,direction,.08)
            if hit[0] is not None:blocked+=1-hit[3]/.08
        ao=1-.30*blocked/8
        layer.data[vertex.index].color=(ao,ao,ao,1)
    mesh.color_attributes.active_color=layer


def make(stem):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender'/f'{stem}.blend'))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');root=rig.parent
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()
    canvas,metal,leather=maps('canvas'),maps('metal'),maps('leather')
    player=stem=='player'; bot=stem=='scavenger'
    M={
        'jacket':material('V3_FieldCanvas','355c59' if player else '454542',canvas),
        'cloth':material('V3_SandCanvas','ab9e82' if player else '535249',canvas),
        'web':material('V3_WovenWebbing','303b39',canvas),
        'leather':material('V3_WornLeather','554936',leather),
        'armor':material('V3_CoatedSteel','6b7666' if bot else ('52695f' if player else '805244'),metal,0,.54),
        'accent':material('V3_OchreCoating','b39860' if bot else '975541',metal,0,.57),
        'steel':material('V3_MachinedSteel','87918a',metal,.82,.43),
        'darksteel':material('V3_CastGraphite','343d3b',metal,.65,.48),
        'rubber':material('V3_RubberSeals','202624',leather),
        'glass':material('V3_SmokedOptic','7b5728' if bot else '233c3d',None,.2,.2),
        'skin':material('V3_Skin','a7896a',None,0,.64),
    }
    if bot:robot(M)
    else:
        torso=lambda p:mix('Hips','Spine',(p[1]-1.06)/.18)
        tailoring(stem,M,torso);human_limbs(stem,M);backpack(stem,M)
        loft('Utility belt',[(0,1.042,0,.199,.138),(0,1.073,0,.196,.136)],M['web'],'Hips',40,steps=1)
        rounded('Belt buckle',(0,1.058,.146),(.058,.035,.016),M['steel'],'Hips',.005)
    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    skin=bpy.context.object;skin.name=stem+'_CraftedSkin'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bake_contact_color(skin)
    skin.parent=rig
    arm=skin.modifiers.new('Authored joint deformation','ARMATURE');arm.object=rig
    root['graphicsVersion']=3;root['authoredPalette']=True
    root['construction']='Tailored desert equipment' if not bot else 'Articulated maintenance automaton'
    # Preserve the original independent hand frame while grounding the new soles.
    for action in list(bpy.data.actions):
        if action.name not in ('Idle','Walking','Running'):continue
        rig.animation_data.action=action
        for frame in range(0,int(action.frame_range[1])+1,2):
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            evaluated=skin.evaluated_get(bpy.context.evaluated_depsgraph_get())
            low=min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices)
            rig.pose.bones['Root'].location.y+=.018-low
            rig.pose.bones['Root'].keyframe_insert('location',frame=frame)
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(stem+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(STAGE/(stem+'.glb')),export_format='GLB',export_yup=True,
        export_extras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
        export_vertex_color='ACTIVE',
        export_skins=True,export_cameras=False,export_lights=False,
        export_copyright='Original Machine Move Forward v3 art authored in Blender')
    report={'asset':stem,'triangles':sum(len(p.vertices)-2 for p in skin.data.polygons),
            'bytes':(STAGE/(stem+'.glb')).stat().st_size,'materials':len(skin.data.materials)}
    (STAGE/(stem+'-manifest.json')).write_text(json.dumps(report,indent=2)+'\n')
    print('V3_CHARACTER',json.dumps(report))


if __name__=='__main__':
    names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['player','raider','scavenger']
    for name in names:make(name)
