"""Four reference-derived mechanical characters. Isolated Blender background use."""
exec(compile((__import__('pathlib').Path(__file__).parent/'common.py').read_text(encoding='utf-8'), 'mech_common', 'exec'))
from mathutils import Quaternion, Euler
kind=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'bastion'
NAMES={'bastion':'BASTION • 03 Heavy Gunner','revenant':'REVENANT • Blade Assassin','warden':'WARDEN • Precision Rifleman','sovereign':'SOVEREIGN • Command Unit'}
SCALE={'bastion':1.42,'revenant':1.05,'warden':1.0,'sovereign':1.23}[kind]
M['red']=plain('MECH_Red_Optics',(.98,.012,.004),.25,.19,8)
M['amber']=plain('MECH_Amber_Halo',(1,.42,.085),.1,.21,6)
M['gold']=surface('MECH_Burnished_Brass','metal',(.44,.335,.19),(.66,.55,.32),1024,419)
M['cloak']=surface('MECH_Oxblood_Cloak','cloth',(.17,.035,.026),(.34,.075,.044),1024,961)
M['darkcloth']=surface('MECH_Charred_Cloth','cloth',(.055,.053,.048),(.115,.103,.085),1024,971)
M['polished']=surface('MECH_Black_Enamel','armor',(.095,.112,.132),(.28,.295,.30),1024,903)
M['scratch']=plain('MECH_Exposed_Wear',(.43,.407,.347),.8,.49)
M['glassred']=plain('MECH_Red_Lens_Glass',(.25,.006,.002),.55,.12)
heavy=kind=='bastion';slim=kind in ['revenant','sovereign'];w=.59 if heavy else .33
hip=.245 if heavy else .145
def bone(name,head,tail,parent=None):BONES[name]=(Vector(head),Vector(tail),parent)
bone('root',(0,0,0),(0,0,.15));bone('pelvis',(0,0,.99),(0,0,1.12),'root')
bone('spine_01',(0,0,1.12),(0,0,1.39),'pelvis');bone('spine_02',(0,0,1.39),(0,0,1.65),'spine_01')
bone('neck',(0,0,1.65),(0,0,1.77),'spine_02');bone('head',(0,0,1.77),(0,0,2.05),'neck')
for s,side in [(-1,'r'),(1,'l')]:
    bone('clavicle_'+side,(0,0,1.61),(s*w,0,1.61),'spine_02')
    bone('upperarm_'+side,(s*w,0,1.61),(s*(w+.13),-.01,1.29),'clavicle_'+side)
    bone('lowerarm_'+side,(s*(w+.13),-.01,1.29),(s*(w+.22),-.06,1.035),'upperarm_'+side)
    bone('hand_'+side,(s*(w+.22),-.06,1.035),(s*(w+.24),-.075,.925),'lowerarm_'+side)
    bone('thigh_'+side,(s*hip,0,1.01),(s*(hip+.03),-.01,.57),'pelvis')
    bone('calf_'+side,(s*(hip+.03),-.01,.57),(s*(hip+.04),.015,.155),'thigh_'+side)
    bone('foot_'+side,(s*(hip+.04),.015,.155),(s*(hip+.04),-.20,.075),'calf_'+side)

def mesh(name,verts,faces,mat,bone=None,bevel=0,smooth=True):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);current_collection.objects.link(o);return finish(o,name,mat,bone,bevel,smooth)
def panel(name,at,width,height,mat,bone,normal=(0,-1,0),shape='chamfer',depth=.025,trim=False,bolts=True):
    outlines={
      'chamfer':[(-.38,-.5),(.38,-.5),(.5,-.32),(.5,.31),(.30,.5),(-.31,.5),(-.5,.30),(-.5,-.32)],
      'point':[(-.46,.42),(-.18,.5),(.35,.43),(.5,.15),(.22,-.4),(0,-.60),(-.32,-.31),(-.5,.02)],
      'chevron':[(-.5,.31),(-.38,.5),(0,.24),(.38,.5),(.5,.31),(.37,-.12),(0,-.52),(-.37,-.12)],
      'blade':[(-.22,.5),(.20,.46),(.46,.22),(.26,-.22),(.02,-.61),(-.22,-.30),(-.39,.25)]}
    outline=[(x*width,z*height) for x,z in outlines[shape]]
    n=Vector(normal).normalized();at=Vector(at);b=frame(normal)
    if trim:plate(name+' continuous rim',at-n*.012,[(x*1.065,z*1.045) for x,z in outline],depth+.005,M['gold'] if kind=='sovereign' else M['edge'],bone,normal,.008,.003)
    o=plate(name,at,outline,depth,mat,bone,normal,.016 if not heavy else .024,.004 if not heavy else .008)
    if bolts:
        for x,z in outline[::2]:screw(at+b@Vector((x*.82,z*.82,.020)),normal,bone,.009 if heavy else .0045)
    # Paint loss follows the panel perimeter; each chip is actual small geometry.
    for j in range(12 if heavy else 6):
        k=rng.randrange(len(outline));a=Vector(outline[k]);c=Vector(outline[(k+1)%len(outline)]);q=a.lerp(c,rng.uniform(.12,.9))*.94
        r=rng.uniform(.002,.006)*(1.4 if heavy else 1)
        pts=[at+b@Vector((q.x+dx,q.y+dz,.019)) for dx,dz in [(-r,-r*.24),(r,r*.1),(.4*r,r*.4)]]
        mesh('Perimeter coating chip',pts,[(0,1,2)],M['scratch'],bone,0,False)
    return o
def joint(name,at,axis,r,bone):
    p=Vector(at);n=Vector(axis).normalized()
    cyl(name+' actuator drum',p-n*r*.65,p+n*r*.65,r,M['black'],bone,vertices=32)
    for s in [-1,1]:
        cyl(name+' bearing cover',p+n*s*r*.6,p+n*s*r*.72,r*.89,M['steel'],bone,vertices=32)
        ring(name+' concentric seal',p+n*s*r*.74,n,r*.62,r*.045,M['edge'],bone,major_segments=32)
        cyl(name+' axle',p+n*s*r*.72,p+n*s*r*.8,r*.29,M['gold'] if kind=='sovereign' else M['edge'],bone,vertices=16)
    return p
def piston(name,a,b,r,bone):
    a,b=Vector(a),Vector(b);d=b-a
    cyl(name+' housing',a,a+d*.59,r,M['steel'],bone)
    cyl(name+' chrome rod',a+d*.51,b,r*.47,M['edge'],bone)
    for t in [.06,.50,.58]:ring(name+' gland',a+d*t,d,r*1.02,r*.11,M['gold'] if kind=='sovereign' else M['rubber'],bone,major_segments=24)
def cable(name,a,b,side,bone,r=.008):
    a,b=Vector(a),Vector(b);m=(a+b)*.5+Vector(side);tube(name,[a,m,b],r,M['rubber'],bone)
    for p in [a,b]:ring(name+' ferrule',p,b-a,r*1.2,r*.23,M['edge'],bone,major_segments=20)
def scarf(dark=False):
    mat=M['darkcloth'] if dark else M['scarf']
    for j in range(5):
        pts=[]
        for k in range(49):
            a=k*math.tau/48;pts.append((.255*math.cos(a),.185*math.sin(a),1.685-j*.027+.047*math.sin(a+.7)))
        tube('Layered neck cowl fold',pts,.024,mat,'spine_02')
    # The gathered throat is a shaped cloth panel, with recessed fold channels.
    cloth('Scarf diagonal apron',[(-.28,-.17,1.66),(.22,-.17,1.65),(.20,-.245,1.49),(-.05,-.26,1.43),(-.24,-.20,1.53)],mat,'spine_02',24)
def cloth(name,outline,mat,bone,steps=24):
    # Ruled cloth surface from two interpolated boundary chains, ragged free hem.
    # Outline for generic patch: use a fan subdivision with physical fold relief.
    center=sum((Vector(p) for p in outline),Vector())/len(outline);verts=[center];faces=[]
    n=len(outline);rings=10
    for j in range(1,rings+1):
        t=j/rings
        for i in range(steps):
            u=i*n/steps;k=int(u);p=Vector(outline[k%n]).lerp(Vector(outline[(k+1)%n]),u-k)
            q=center.lerp(p,t);q.y-=math.sin(i*math.tau/steps*5+t*4)*.012*math.sin(t*math.pi)
            if j==rings and q.z<center.z:q.z+=rng.uniform(-.019,.007)
            verts.append(q)
    for i in range(steps):faces.append((0,1+i,1+(i+1)%steps))
    for j in range(rings-1):
        for i in range(steps):a=1+j*steps+i;b=1+j*steps+(i+1)%steps;faces.append((a,b,b+steps,a+steps))
    o=mesh(name,verts,faces,mat,bone);deselect();o.select_set(True);bpy.context.view_layer.objects.active=o
    sol=o.modifiers.new('Woven cloth thickness','SOLIDIFY');sol.thickness=.003;bpy.ops.object.modifier_apply(modifier=sol.name)
    return o
def drape(name,top_width,bottom_width,z_top,z_bottom,y_top,y_bottom,mat,bone='spine_02',x=0,rows=44,cols=34):
    verts=[];faces=[]
    for j in range(rows+1):
        t=j/rows
        for i in range(cols+1):
            u=i/cols;w=top_width*(1-t)+bottom_width*t;xx=x+(u-.5)*w
            yy=y_top*(1-t)+y_bottom*t+(.018+.028*t)*math.sin(u*math.tau*6+.7*t)+.035*math.sin(t*3)
            zz=z_top*(1-t)+z_bottom*t
            if j>rows-3:zz+=t**18*(.045*math.sin(i*2.51)+rng.uniform(-.011,.012))
            verts.append((xx,yy,zz))
    for j in range(rows):
        for i in range(cols):
            if j>rows-4 and rng.random()<.10:continue
            a=j*(cols+1)+i;faces.append((a,a+1,a+cols+2,a+cols+1))
    o=mesh(name,verts,faces,mat,bone);deselect();o.select_set(True);bpy.context.view_layer.objects.active=o
    sol=o.modifiers.new('Cloth fabric edge thickness','SOLIDIFY');sol.thickness=.004;bpy.ops.object.modifier_apply(modifier=sol.name)
    for i in range(0,cols,2):
        p=Vector(verts[rows*(cols+1)+i]);tube('Ragged hem threads',[p,p+Vector((rng.uniform(-.012,.012),.005,-.025)),p+Vector((.005,.008,-.045))],.0014,M['thread'],bone)
    return o

def mechanical_body():
    torso=.37 if heavy else .235
    # Inner structure stays visible through deliberate armor gaps.
    loft('Load bearing thoracic housing',[(0,0,1.11),(0,.005,1.30),(0,0,1.5),(0,0,1.64)],[(torso*.74,.13),(torso,.17),(torso*1.10,.19),(torso*.75,.12)],M['black'],'spine_02',0,40,4)
    cyl('Spinal drive column',(0,.09,1.02),(0,.1,1.64),.061,M['steel'],'spine_01',vertices=32)
    for z in np.linspace(1.10,1.59,10):
        ring('Exposed vertebral ring',(0,.115,float(z)),(0,0,1),.074,.012,M['steel'],'spine_01',major_segments=28)
    for s in [-1,1]:
        piston('Oblique abdominal ram',(s*torso*.68,-.06,1.09),(s*torso*.9,-.08,1.46),.029,'spine_01')
        cable('Torso braided loom',(s*torso*.85,.08,1.54),(s*torso*.6,.1,1.05),(s*.065,.04,0),'spine_01',.014)
        for j in range(5):
            z=1.25+j*.065
            panel('Laminated rib '+str(s),(s*torso*.71,-.144,z),torso*.8,.085,M['armor'] if heavy else M['polished'],'spine_02',normal=(s*.26,-.96,.06),shape='chevron',depth=.015,bolts=False)
            tube('Recessed rib status slit',[(s*.13,-.16,z-.025),(s*torso*.94,-.132,z+.001)],.0035,M['red'],'spine_02',False)
    for j in range(4):
        panel('Ventral overlapping lamella',(0,-.158,1.12+j*.064),torso*1.32,.102,M['armor'] if heavy else M['polished'],'spine_01',shape='chevron',trim=not heavy,bolts=False)
    panel('Pelvic central shield',(0,-.157,1.01),torso*1.1,.21,M['armor'] if heavy else M['polished'],'pelvis',shape='point',trim=True)
    panel('Dorsal service shell',(0,.19,1.43),torso*1.7,.37,M['armor'],'spine_02',normal=(0,1,0),trim=True)
    for j in range(7):box('Back radiator louvre',(0,.221,1.31+j*.028),(torso*1.18,.025,.012),M['black'],'spine_02',.002)
    cyl('Neck servo',(0,0,1.61),(0,0,1.81),.065,M['steel'],'neck',vertices=32)
    for z in [1.68,1.72,1.76]:ring('Neck gimbal ring',(0,0,z),(0,0,1),.076,.009,M['edge'],'neck',major_segments=28)

def arms_and_legs():
    for s,side in [(-1,'r'),(1,'l')]:
        up='upperarm_'+side;low='lowerarm_'+side;hand='hand_'+side;th='thigh_'+side;calf='calf_'+side;foot='foot_'+side
        S,E,W=[BONES[n][0] for n in [up,low,hand]];H,K,A=[BONES[n][0] for n in [th,calf,foot]]
        r=.125 if heavy else .06
        joint('Shoulder '+side,S,(1,0,0),r*1.22,up)
        joint('Elbow '+side,E,(1,0,0),r*.86,low)
        joint('Wrist '+side,W,(0,0,1),r*.62,hand)
        joint('Hip '+side,H,(1,0,0),r*1.06,th)
        joint('Knee '+side,K,(1,0,0),r*1.03,calf)
        joint('Ankle '+side,A,(1,0,0),r*.80,foot)
        for name,a,b,bn,rad in [('Humerus',S,E,up,r*.61),('Radius',E,W,low,r*.54),('Femur',H,K,th,r*.82),('Tibia',K,A,calf,r*.62)]:
            cyl(name+' central strut',a,b,rad,M['black'],bn,vertices=24)
            d=Vector((s*r*.6,.036,0));piston(name+' extension actuator',a+d+(b-a)*.1,b+d-(b-a)*.10,rad*.47,bn)
            cable(name+' flexible hydraulic line',a+Vector((s*r*.7,.05,0)),b+Vector((s*r*.7,.05,0)),(s*r*.3,.04,0),bn,.009 if heavy else .005)
        mat=M['armor'] if heavy else M['polished'];normal=(s*.24,-.97,0)
        if heavy:
            panel('Massive primary pauldron '+side,S+Vector((s*.055,-.02,.03)),.46,.36,mat,up,normal=(s*.40,-.88,.20),trim=True)
            panel('Pauldron top slab '+side,S+Vector((s*.04,.025,.16)),.38,.30,mat,up,normal=(s*.20,0,.98),bolts=True)
            panel('Shoulder rear cover '+side,S+Vector((0,.15,.01)),.34,.32,M['tan'],up,normal=(s*.23,1,.15),trim=True)
            for j in range(2):panel('Upper arm overlapping plate '+side,S.lerp(E,.46+j*.27)+Vector((0,-.105,0)),.25,.18,mat,up,normal)
            panel('Forearm armored housing '+side,E.lerp(W,.5)+Vector((0,-.13,0)),.32,.30,M['tan'],low,normal,trim=True)
            for j in range(3):box('Forearm recessed radiator',(s*(w+.17)+.07,-.171,1.31-j*.048),(.06,.015,.016),M['black'],low,.002)
            panel('Broad thigh armor '+side,H.lerp(K,.48)+Vector((0,-.16,0)),.33,.34,mat,th,trim=True)
            panel('Thigh lateral shell '+side,H.lerp(K,.43)+Vector((s*.16,.005,0)),.22,.32,M['tan'],th,normal=(s,0,0),trim=True)
            panel('Knee wedge '+side,K+Vector((0,-.13,0)),.24,.21,mat,calf,trim=True)
            panel('Shin plated greave '+side,K.lerp(A,.53)+Vector((0,-.12,0)),.28,.39,mat,calf,trim=True)
            for j in range(3):panel('Foot overlapping toe '+side,(s*(hip+.04),-.05-j*.071,.13-j*.026),.25,.10,mat,foot,normal=(0,-.55,.84),bolts=False)
            box('Treaded armored foot '+side,(s*(hip+.04),-.074,.047),(.28,.38,.08),M['rubber'],foot,.016)
            for j in range(5):box('Heel and sole cleat '+side,(s*(hip+.04),-.21+j*.066,.032),(.285,.035,.045),M['steel'],foot,.004)
        else:
            panel('Swept pauldron '+side,S+Vector((s*.016,-.01,.045)),.29,.22,mat,up,normal=(s*.35,-.90,.27),shape='point',trim=kind=='sovereign')
            for j in range(2):panel('Floating shoulder feather '+side,S+Vector((s*(.045+j*.026),.015,.005-j*.08)),.25-j*.025,.19,mat,up,normal=(s*.70,-.65,.10),shape='blade',bolts=False)
            panel('Bicep tapered shell '+side,S.lerp(E,.56)+Vector((0,-.062,0)),.13,.27,mat,up,normal,shape='blade',bolts=False)
            panel('Long forearm cutting shell '+side,E.lerp(W,.55)+Vector((0,-.067,0)),.145,.31,mat,low,normal,shape='blade',trim=True)
            tube('Forearm inset red channel '+side,[E.lerp(W,t)+Vector((-.012,-.087,0)) for t in [.22,.46,.78]],.003,M['red'],low,False)
            panel('Lateral hip spear '+side,H+Vector((s*.075,-.02,-.11)),.19,.40,mat,th,normal=(s*.5,-.85,0),shape='blade',trim=kind=='sovereign')
            panel('Anterior thigh blade '+side,H.lerp(K,.53)+Vector((0,-.076,0)),.19,.37,mat,th,shape='blade',trim=True)
            panel('Knee pointed cup '+side,K+Vector((0,-.088,.016)),.17,.16,mat,calf,shape='point',trim=True)
            panel('Extended tibial blade '+side,K.lerp(A,.55)+Vector((0,-.064,0)),.135,.41,mat,calf,shape='blade',trim=True)
            tube('Leg power conduit '+side,[H.lerp(K,.25)+Vector((s*.08,-.027,0)),H.lerp(K,.66)+Vector((s*.07,-.025,0))],.004,M['red'],th,False)
            panel('Sabatons pointed toe '+side,(s*(hip+.04),-.11,.074),.17,.34,mat,foot,normal=(0,-.25,.97),shape='point',trim=True)
            box('Mechanical heel block '+side,(s*(hip+.04),.06,.05),(.12,.13,.09),M['steel'],foot,.008)
        # Individually segmented metal fingers. Rigid armor stays on each bone.
        palm=W+Vector((s*.009,-.005,-.062));size=.095 if heavy else .052
        box('Articulated palm '+side,palm,(size*1.6,size*.75,.103),mat,hand,.009)
        for f in range(4):
            p=palm+Vector(((f-1.5)*size*.37,-.007,-.049));parent=hand
            for j in range(3):
                end=p+Vector((0,-.008 if j>0 else 0,-.031 if heavy else -.025));name=f'finger_{f+1}_{j+1}_{side}'
                bone(name,p,end,parent);cyl('Finger phalanx '+side,p,end,size*.18,M['steel'],name,vertices=16)
                ring('Finger knuckle band '+side,p,(0,0,1),size*.19,.0025,M['edge'],name,major_segments=20)
                box('Finger armor scale '+side,(p+end)*.5+Vector((0,-size*.14,0)),(size*.33,.008,(end-p).length*.72),mat,name,.002)
                parent=name;p=end
        p=palm+Vector((-s*size*.75,0,.014));end=p+Vector((-s*.031,-.008,-.035));name='thumb_'+side;bone(name,p,end,hand)
        cyl('Opposed thumb '+side,p,end,size*.22,M['steel'],name,vertices=18)
        # Recessed red joint indicator distinguishes mechanisms from armor.
        cyl('Elbow status eye',E+Vector((s*r*.72,-.014,.015)),E+Vector((s*r*.85,-.014,.015)),r*.13,M['red'],low,vertices=20)

def face(style):
    # Curved cranium under independently shaped brow, cheeks, nasal keel and jaw.
    hc=(0,0,1.91);rad=.148 if style=='heavy' else .131
    sphere('Segmented cranial housing',hc,(rad,.113,.177),M['black'],'head',40,24)
    for s in [-1,1]:
        normal=(s*.17,-.98,.02)
        panel('Cranial crown plate',(s*.059,.005,2.026),.13,.18,M['armor'] if heavy else M['polished'],'head',normal=(s*.23,-.34,.91),shape='point',bolts=False)
        panel('Temporal layered shell',(s*.10,-.019,1.943),.11,.22,M['armor'] if heavy else M['polished'],'head',normal=(s*.83,-.50,0),shape='blade',trim=style=='regal')
        panel('Angled brow ridge',(s*.067,-.103,1.972),.13,.084,M['armor'] if heavy else M['polished'],'head',normal=normal,shape='chevron',trim=False,bolts=False)
        # Pointed almond optic sits in a true recess, not a face-sized red bar.
        outline=[(-.047,.009),(-.022,.018),(.042,-.002),(.026,-.012),(-.018,-.012)]
        if s==1:outline=[(-x,z) for x,z in outline]
        plate('Red recessed eye aperture',(s*.064,-.126,1.927),[(x*1.17,z*1.42) for x,z in outline],.010,M['black'],'head',bow=0,bevel=.001)
        plate('Red optical emitter',(s*.064,-.137,1.927),outline,.003,M['red'],'head',bow=.001,bevel=.001)
        panel('Tapered cheek blade',(s*.065,-.093,1.86),.095,.15,M['armor'] if heavy else M['polished'],'head',normal=(s*.23,-.97,0),shape='blade',bolts=style=='heavy')
        joint('Temple micro actuator',(s*.139,.003,1.928),(1,0,0),.036,'head')
        piston('Jaw actuator',(s*.104,-.043,1.82),(s*.12,-.005,1.935),.014,'head')
    panel('Central facial keel',(0,-.122,1.895),.073,.239,M['armor'] if heavy else M['polished'],'head',shape='blade',trim=style=='regal',bolts=False)
    if style=='assassin':
        for s in [-1,1]:tube('Y-shaped facial light trace',[(s*.095,-.13,1.96),(s*.043,-.15,1.912),(s*.015,-.147,1.87),(s*.013,-.125,1.805)],.0032,M['red'],'head',False)
        panel('Sweeping forehead crest',(0,-.066,2.024),.19,.20,M['polished'],'head',normal=(0,-.76,.65),shape='point',bolts=False)
    elif style=='heavy':
        for j in range(4):box('Armored mouth grille',(0,-.121,1.846-j*.012),(.046-j*.004,.017,.005),M['steel'],'head',.001)
        for s in [-1,1]:cyl('Cranial stub antenna',(s*.118,.065,2.02),(s*.134,.077,2.13),.004,M['steel'],'head',r2=.002,vertices=16)
    else:
        # Seven tapered horns grow out of brass-socketed crown plates.
        for s in [-1,1]:
            for j in range(3):
                a=Vector((s*(.065+j*.038),.035-j*.023,2.026-j*.018));end=a+Vector((s*(.015+j*.015),.012,.20-j*.031))
                cyl('Crown horn root',a,a+(end-a)*.40,.017-j*.002,M['gold'],'head',r2=.012,vertices=20)
                cyl('Crown dark tapered spire',a+(end-a)*.30,end,.012,M['polished'],'head',r2=.001,vertices=20)
                ring('Crown socket band',a,end-a,.019-j*.002,.004,M['gold'],'head',major_segments=24)
        cyl('Central sovereign crown spear',(0,.012,2.058),(0,.023,2.295),.014,M['gold'],'head',r2=.001,vertices=24)

def gun(type):
    global current_collection
    current_collection=weapon_collection;before=len(WEAPON)
    if type=='rotary':
        box('Rotary receiver monobloc',(0,.045,0),(.29,.45,.25),M['armor'],bevel=.025)
        for s in [-1,1]:
            panel('Cannon side receiver shield',(s*.147,.015,0),.37,.24,M['tan'],None,normal=(s,0,0),trim=True)
            for j in range(4):box('Receiver cooling slit',(s*.156,-.06+j*.050,.065),(.009,.031,.012),M['black'],bevel=.002)
        cyl('Barrel cluster bearing',(0,-.185,0),(0,-.37,0),.151,M['steel'],vertices=48)
        for i in range(6):
            a=i*math.tau/6;x=.091*math.cos(a);z=.091*math.sin(a)
            cyl('Six rotating rifled barrel', (x,-.28,z),(x,-1.18,z),.034,M['steel'],vertices=28)
            for yy in [-.38,-.57,-.84,-1.07]:ring('Barrel reinforcing collar',(x,yy,z),(0,1,0),.035,.007,M['edge'],major_segments=28)
            # Hollow-looking muzzle: black recess behind an open metallic annulus.
            cyl('Recessed barrel bore',(x,-1.185,z),(x,-1.189,z),.025,M['black'],vertices=28)
            ring('Individual muzzle lip',(x,-1.19,z),(0,1,0),.029,.005,M['edge'],major_segments=28)
        for yy in [-.47,-1.08]:
            ring('Six barrel cage hoop',(0,yy,0),(0,1,0),.135,.025,M['armor'],major_segments=48)
            for i in range(8):
                a=i*math.tau/8;screw((.15*math.cos(a),yy-.025,.15*math.sin(a)),(0,-1,0),r=.006)
        tube('Cannon carry handle',[(-.12,.14,.12),(-.12,.14,.23),(.12,.14,.23),(.12,.14,.12)],.022,M['steel'])
        box('Reinforced pistol grip',(0,.25,-.17),(.075,.082,.20),M['rubber'],bevel=.012)
        for j in range(5):box('Grip raised checkering',(0,.296,-.10-j*.034),(.076,.006,.007),M['edge'],bevel=.001)
        box('Ammunition box',( .235,.105,-.012),(.20,.28,.29),M['tan'],bevel=.014)
        for j in range(14):
            t=j/13;p=Vector((.21+.12*math.sin(t*math.pi),.05,-.10-.43*t));cyl('Linked brass cartridge',p,p+Vector((0,-.092,0)),.012,M['brass'],vertices=16);cyl('Cartridge projectile',p+Vector((0,-.092,0)),p+Vector((0,-.126,0)),.012,M['copper'],r2=.001,vertices=16)
        label('03 / SUPPRESSION',(0,-.014,.135),.026,M['ink'],normal=(0,0,1),up=(0,1,0))
        muzzle=(0,-1.195,0);grips=[(0,.25,-.125),(.105,-.18,-.14)]
    elif type=='rifle':
        box('Precision rifle receiver',(0,0,0),(.09,.44,.115),M['armor'],bevel=.009)
        box('Receiver action top',(0,-.01,.057),(.071,.33,.035),M['steel'],bevel=.007)
        box('Floating long handguard',(0,-.34,.008),(.085,.35,.091),M['polished'],bevel=.008)
        for s in [-1,1]:
            for j in range(8):box('Handguard vent',(s*.045,-.195-j*.037,.013),(.006,.022,.036),M['black'],bevel=.004)
            for yy in [-.10,.075,.17]:screw((s*.051,yy,.015),(s,0,0),r=.005)
        cyl('Long precision barrel',(0,-.49,.01),(0,-1.18,.01),.016,M['steel'],vertices=32)
        for yy,r in [(-.50,.026),(-.63,.021),(-1.12,.021)]:cyl('Barrel machined collar',(0,yy,.01),(0,yy-.035,.01),r,M['edge'],vertices=28)
        box('Slotted muzzle brake',(0,-1.22,.01),(.047,.092,.045),M['steel'],bevel=.005)
        for s in [-1,1]:
            for j in range(3):box('Brake pressure port',(s*.024,-1.19-j*.022,.012),(.003,.012,.021),M['black'],bevel=.001)
        cyl('Rifle recessed bore',(0,-1.267,.01),(0,-1.270,.01),.012,M['black'],vertices=24)
        box('Adjustable butt stock',(0,.30,.005),(.073,.25,.118),M['armor'],bevel=.014)
        box('Rubber recoil pad',(0,.438,.005),(.082,.018,.135),M['rubber'],bevel=.006)
        cyl('Stock guide',(0,.15,.028),(0,.30,.028),.015,M['steel'],vertices=24)
        box('Pistol grip',(0,.091,-.098),(.048,.075,.127),M['rubber'],bevel=.008,rotation=(.20,0,0))
        box('Detachable box magazine',(0,-.085,-.126),(.061,.126,.154),M['tan'],bevel=.008,rotation=(-.12,0,0))
        for s in [-1,1]:
            for j in range(3):box('Magazine stamping groove',(s*.033,-.119+j*.033,-.128),(.004,.012,.11),M['black'],bevel=.002)
        for yy in [-.10,.10]:
            box('Optic riser',(0,yy,.099),(.055,.044,.05),M['steel'],bevel=.004)
            ring('Scope mounting ring',(0,yy,.147),(0,1,0),.038,.007,M['armor'],major_segments=32)
        cyl('Precision optical tube',(0,.16,.147),(0,-.22,.147),.030,M['steel'],vertices=36)
        cyl('Scope objective bell',(0,-.22,.147),(0,-.30,.147),.032,M['armor'],r2=.052,vertices=36)
        cyl('Coated objective lens',(0,-.303,.147),(0,-.305,.147),.045,M['glass'],vertices=36)
        ring('Objective trim',(0,-.306,.147),(0,1,0),.047,.004,M['edge'],major_segments=36)
        cyl('Scope elevation turret',(0,-.022,.153),(0,-.022,.207),.022,M['armor'],vertices=24)
        cyl('Scope windage turret',(0,-.022,.154),(.048,-.022,.154),.022,M['armor'],vertices=24)
        for j in range(18):box('Picatinny rail tooth',(0,-.45+j*.038,.073),(.051,.014,.011),M['steel'],bevel=.002)
        cable('Weapon sling',(-.05,.36,.01),(-.05,-.39,.01),(-.065,.0,-.20),None,.009)
        label('WARDEN / 17',(.051,.01,.01),.014,M['ink'],normal=(1,0,0))
        muzzle=(0,-1.27,.01);grips=[(0,.091,-.09),(0,-.29,-.04)]
    else:
        # Full tang, diamond cross-section blade, grind line and guard.
        verts=[(-.028,0,0),(.028,0,0),(-.024,-.72,0),(.024,-.72,0),(0,-.94,0),(0,0,.009),(0,-.72,.006),(0,0,-.009),(0,-.72,-.006)]
        faces=[(0,2,6,5),(5,6,3,1),(2,4,6),(6,4,3),(0,7,8,2),(7,1,3,8),(2,8,4),(8,3,4),(0,5,1,7)]
        mesh('Honed diamond section sword',verts,faces,M['edge'],bevel=.0008,smooth=False)
        tube('Blackened central fuller',[(0,-.025,.0098),(0,-.69,.007)],.0023,M['black'],bezier=False)
        box('Sword cross guard',(0,.016,0),(.16,.028,.028),M['armor'],bevel=.007)
        cyl('Sword grip tang',(0,.029,0),(0,.21,0),.017,M['rubber'],vertices=24)
        for yy in np.linspace(.04,.20,10):ring('Spiral grip wrap',(0,float(yy),0),(0,1,0),.018,.003,M['steel'],major_segments=24)
        cyl('Sword pommel',(0,.207,0),(0,.232,0),.023,M['armor'],vertices=20)
        for yy in [-.12,-.21,-.37]:tube('Blade red etched detail',[(-.006,yy,.010),(-.006,yy-.033,.010)],.0012,M['red'],bezier=False)
        muzzle=(0,-.94,0);grips=[(0,.125,0),(0,.125,0)]
    root=bpy.data.objects.new('Weapon_'+type,None);weapon_collection.objects.link(root)
    parts=WEAPON[before:]
    for o in parts:o.parent=root
    for name,p in [('Muzzle',muzzle),('Grip.R',grips[0]),('Grip.L',grips[1])]:
        o=bpy.data.objects.new(name,None);weapon_collection.objects.link(o);o.parent=root;o.location=p
    current_collection=character;return root,parts

def make_heavy():
    mechanical_body();arms_and_legs();face('heavy')
    panel('Heavy central chest vault',(0,-.22,1.49),.58,.34,M['tan'],'spine_02',trim=True)
    panel('Recessed chest inspection panel',(0,-.257,1.51),.31,.18,M['armor'],'spine_02',depth=.009,trim=True)
    for s in [-1,1]:
        panel('Heavy lateral pectoral block',(s*.335,-.16,1.46),.20,.29,M['armor'],'spine_02',normal=(s*.35,-.93,0),trim=True)
        box('Shoulder rear power tower',(s*.31,.15,1.76),(.19,.22,.23),M['tan'],'spine_02',.015,rotation=(0,s*.15,0))
        for j in range(3):box('Power tower exhaust',(s*.31,.269,1.70+j*.047),(.126,.016,.020),M['black'],'spine_02',.004)
        panel('Ablative hip skirt',(s*.285,-.11,.97),.29,.30,M['tan'],'thigh_'+('r' if s<0 else 'l'),shape='chamfer',trim=True)
        cable('Shoulder fluid supply',(s*.36,.14,1.64),(s*.57,.045,1.44),(s*.09,.12,.10),'spine_02',.023)
    label('03',(.635,-.148,1.68),.10,M['ink'],'upperarm_l',normal=(.40,-.88,.20))
    label('IRON\nOBEDIENCE\nLASTS',(.755,-.174,1.19),.034,M['ink'],'lowerarm_l',normal=(.24,-.97,0),font='plain')
    label('MANKIND WAS A PHASE',(0,-.271,1.46),.015,M['ink'],'spine_02',font='plain')
    return [gun('rotary')]

def make_assassin():
    mechanical_body();arms_and_legs();face('assassin');scarf(True)
    panel('Assassin split upper breastplate',(0,-.204,1.48),.37,.235,M['polished'],'spine_02',shape='chevron',trim=True)
    panel('Assassin chest spear',(0,-.184,1.335),.18,.21,M['polished'],'spine_02',shape='blade',bolts=False)
    label('SILENCE\nERASES',(.008,-.233,1.51),.022,M['ink'],'spine_02',font='plain')
    # Original geometric unit insignia, independent of installed glyph coverage.
    for s in [-1,1]:tube('Assassin fork insignia',[(.33+s*.025,-.092,1.68),(.33,-.105,1.652),(.33+s*.016,-.098,1.626)],.004,M['ink'],'upperarm_l',False)
    drape('Black torn rear scarf tails',.39,.51,1.58,.54,.18,.29,M['darkcloth'],rows=48)
    drape('Assassin split waist rag',.27,.30,1.03,.49,-.12,-.20,M['darkcloth'],'pelvis',x=.10,rows=30,cols=20)
    for s in [-1,1]:
        tube('Neck exposed red fiber',[(s*.06,.006,1.76),(s*.115,.045,1.69)],.004,M['red'],'neck')
        for j in range(3):panel('Back lumbar scale',(s*.086,.173,1.2+j*.094),.15,.14,M['polished'],'spine_01',normal=(s*.2,1,0),shape='chevron',bolts=False)
    a=gun('blade');b=gun('blade');b[0].name='Weapon_blade_left';return [a,b]

def make_warden():
    # A textile-covered mechanical frame, distinct from the blue-visored player.
    mechanical_body()
    for s,side in [(-1,'r'),(1,'l')]:
        for name,a,b,ra,rb,bn in [('Upper sleeve',BONES['upperarm_'+side][0],BONES['lowerarm_'+side][0],.105,.088,'upperarm_'+side),('Fore sleeve',BONES['lowerarm_'+side][0],BONES['hand_'+side][0],.088,.071,'lowerarm_'+side),('Trouser thigh',BONES['thigh_'+side][0],BONES['calf_'+side][0],.123,.088,'thigh_'+side),('Boot gaiter',BONES['calf_'+side][0],BONES['foot_'+side][0],.087,.068,'calf_'+side)]:
            loft(name+' camouflage '+side,[a,a.lerp(b,.25),a.lerp(b,.55),a.lerp(b,.79),b],[(ra,ra),(ra*1.11,ra),(ra*.97,ra*.95),(rb*1.08,rb),(rb,rb)],M['cloth'],bn,.011,36,5)
    arms_and_legs()
    # Camo surface overlays reduce the exposed metal of the sharpshooter kit.
    for o in PARTS:
        if any(t in o.name for t in ['pauldron','bicep','Bicep','Long forearm','Anterior thigh','tibial','Pelvic','Swept']):
            for i,m in enumerate(o.data.materials):
                if m==M['polished']:o.data.materials[i]=M['tan']
    sphere('Rifleman armored skull',(0,0,1.92),(.145,.12,.171),M['black'],'head',40,24)
    for s in [-1,1]:
        panel('Rifleman helmet cheek armor',(s*.112,-.018,1.94),.12,.23,M['tan'],'head',normal=(s*.65,-.65,.09),shape='point',trim=True)
        panel('Weathered helmet brow',(s*.06,-.071,2.041),.14,.092,M['tan'],'head',normal=(s*.14,-.55,.82),trim=True)
        joint('Rifleman ear assembly',(s*.147,.022,1.942),(1,0,0),.040,'head')
        for j in range(3):panel('Black facial jaw segment',(s*.047,-.107,1.86+j*.036),.063,.052,M['steel'],'head',shape='chevron',bolts=False)
    panel('Broken crown helmet top',(0,.001,2.066),.23,.22,M['tan'],'head',normal=(0,0,1),trim=True)
    panel('Rifleman nasal bridge',(0,-.13,1.915),.061,.15,M['steel'],'head',shape='blade',bolts=False)
    cyl('Amber targeting eye socket',(-.055,-.109,1.966),(-.055,-.150,1.966),.029,M['black'],'head',vertices=32)
    ring('Machined monocular surround',(-.055,-.152,1.966),(0,1,0),.026,.004,M['steel'],'head',major_segments=32)
    sphere('Single amber targeting optic',(-.055,-.153,1.966),(.017,.006,.017),M['amber'],'head',24,16)
    box('Dark secondary eye slit',(.049,-.132,1.964),(.057,.013,.014),M['black'],'head',.003)
    scarf(False)
    for s,side in [(-1,'r'),(1,'l')]:
        drape('Camouflage long coat front '+side,.22,.28,1.06,.31,-.13,-.19,M['cloth'],'thigh_'+side,x=s*.17,cols=24)
        drape('Camouflage long coat side '+side,.15,.24,1.13,.36,.045,.14,M['cloth'],'thigh_'+side,x=s*.255,cols=20)
        for x,z in [(s*.16,1.2),(s*.23,1.02),(s*.085,1.22)]:
            box('Rifleman tactical pouch',(x,-.191,z),(.094,.085,.143),M['tan'],'spine_01',.012)
            panel('Pouch flap',(x,-.238,z+.044),.099,.055,M['cloth'],'spine_01',depth=.004,bolts=False)
            box('Pouch closure strap',(x,-.247,z+.004),(.022,.010,.059),M['leather'],'spine_01',.003)
            screw((x,-.256,z+.003),(0,-1,0),'spine_01',.004)
        tube('Rifleman harness strap',[(s*.20,.12,1.6),(s*.23,0,1.66),(s*.20,-.20,1.50),(s*.26,-.17,1.10)],.016,M['leather'],'spine_02')
        for z in [1.52,1.34]:box('Harness rectangular buckle',(s*.224,-.213,z),(.045,.020,.052),M['steel'],'spine_02',.005)
    drape('Rifleman rear coat skirt',.35,.47,1.12,.35,.15,.235,M['cloth'],'pelvis',rows=48)
    box('Rifleman field pack',(0,.205,1.4),(.31,.18,.38),M['cloth'],'spine_02',.029)
    for s in [-1,1]:tube('Pack compression webbing',[(s*.1,.298,1.24),(s*.1,.325,1.45),(s*.1,.279,1.58)],.014,M['leather'],'spine_02')
    label('DISTANCE\nJUDGES\nFAIRLY',(-.345,-.089,1.665),.021,M['ink'],'upperarm_r',normal=(-.35,-.90,.27),font='plain')
    label('17',(.105,-.071,2.058),.023,M['ink'],'head',normal=(.14,-.55,.82))
    return [gun('rifle')]

def make_sovereign():
    mechanical_body();arms_and_legs();face('regal')
    for j in range(3):
        panel('Sovereign breastplate chevron',(0,-.187-j*.012,1.42+j*.092),.38+j*.024,.19,M['polished'],'spine_02',shape='chevron',trim=True,bolts=False)
    for s in [-1,1]:
        panel('Raised gorget wing',(s*.17,-.033,1.722),.15,.205,M['polished'],'spine_02',normal=(s*.55,-.75,.2),shape='point',trim=True)
        cyl('Crimson shoulder jewel bezel',(s*.367,-.082,1.708),(s*.367,-.111,1.708),.023,M['gold'],'upperarm_'+('r' if s<0 else 'l'),vertices=28)
        sphere('Crimson pauldron jewel',(s*.367,-.115,1.708),(.015,.009,.015),M['red'],'upperarm_'+('r' if s<0 else 'l'),24,16)
        panel('Imperial hip guard',(s*.19,-.057,1.051),.28,.36,M['polished'],'pelvis',normal=(s*.45,-.84,0),shape='blade',trim=True)
    panel('Central brass belt chevron',(0,-.16,1.085),.43,.16,M['gold'],'pelvis',shape='chevron',bolts=False)
    panel('Belt inset enamel',(0,-.183,1.103),.24,.085,M['polished'],'pelvis',shape='chevron',bolts=False)
    for s in [-1,1]:
        drape('Long imperial front tabard '+str(s),.18,.22,1.02,.13,-.17,-.205,M['darkcloth'],'pelvis',x=s*.117,rows=48,cols=24)
        tube('Tabard fine brass edging',[(s*.22,-.21,1.0),(s*.23,-.225,.59),(s*.232,-.218,.17)],.0035,M['gold'],'pelvis')
    label('ORDER\nBEYOND\nHUMANITY',(.11,-.237,.43),.028,M['ink'],'pelvis',font='plain')
    for s in [-1,1]:tube('Order crest blade',[(.11+s*.044,-.239,.65),(.11,-.239,.72),(.11+s*.026,-.239,.80)],.003,M['gold'],'pelvis',False)
    ring('Order crest aureole',(.11,-.238,.717),(0,-1,0),.041,.0025,M['gold'],'pelvis',major_segments=40)
    # Burgundy lining and dark outside: two coherent, thick cloth layers.
    drape('Commander outer cape',.59,1.18,1.73,.12,.235,.61,M['darkcloth'],rows=62,cols=58)
    drape('Commander burgundy lining',.585,1.165,1.725,.125,.228,.602,M['cloak'],rows=62,cols=58)
    for s in [-1,1]:tube('Cape clasp chain',[(s*.21,-.039,1.73),(s*.17,-.142,1.70),(0,-.194,1.68)],.007,M['gold'],'spine_02')
    # Segmented halo is supported behind the skull, with real breaks at quarters.
    cyl('Halo rear mounting stalk',(0,.14,1.93),(0,.16,2.035),.020,M['steel'],'head',vertices=24)
    for quadrant in range(4):
        a0=quadrant*math.pi/2+.075;a1=(quadrant+1)*math.pi/2-.075
        pts=[(.262*math.cos(a),.165,2.065+.262*math.sin(a)) for a in np.linspace(a0,a1,33)]
        tube('Halo segmented brass housing',pts,.009,M['gold'],'head');tube('Halo warm luminous filament',[(x,y-.008,z) for x,y,z in pts],.004,M['amber'],'head')
        a=quadrant*math.pi/2;tube('Halo radial tick',[(r*math.cos(a),.155,2.065+r*math.sin(a)) for r in [.229,.297]],.0035,M['amber'],'head',False)
    # The drone remains independently movable and exportable.
    global current_collection
    current_collection=weapon_collection;before=len(WEAPON)
    sphere('Drone inner mechanical sphere',(0,0,0),(.095,.095,.095),M['black'],segments=40,rings=24)
    for s in [-1,1]:
        for j in range(4):
            a=j*math.pi/2;normal=(s*.64,math.sin(a)*.57,math.cos(a)*.57)
            p=Vector(normal)*.091;panel('Drone separated armored petal',p,.076,.092,M['polished'],None,normal=normal,shape='point',trim=False,depth=.008,bolts=True)
    ring('Drone equatorial chassis',(0,0,0),(0,1,0),.094,.008,M['steel'],major_segments=48)
    cyl('Drone front optical barrel',(0,-.07,0),(0,-.111,0),.044,M['steel'],vertices=40)
    ring('Drone crimson focusing ring',(0,-.113,0),(0,1,0),.034,.006,M['red'],major_segments=40)
    sphere('Drone central glowing eye',(0,-.119,0),(.023,.009,.023),M['red'],segments=32,rings=20)
    for j in range(3):
        a=j*math.tau/3;cyl('Drone attitude spike',(.05*math.cos(a),.0,.05*math.sin(a)),(.123*math.cos(a),.005,.123*math.sin(a)),.010,M['steel'],r2=.002,vertices=20)
    root=bpy.data.objects.new('Sovereign_Drone',None);weapon_collection.objects.link(root)
    parts=WEAPON[before:]
    for o in parts:o.parent=root
    current_collection=character;return [(root,parts)]

print('BUILDING',kind,flush=True)
gear={'bastion':make_heavy,'revenant':make_assassin,'warden':make_warden,'sovereign':make_sovereign}[kind]()
print('RIGGING',len(PARTS),'body parts',len(WEAPON),'equipment parts',flush=True)
data=bpy.data.armatures.new(kind+'_skeleton');rig=bpy.data.objects.new(kind+'_Rig',data);scene.collection.objects.link(rig)
deselect();rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in BONES.items():
    b=data.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;data.display_type='STICK'
for o in PARTS:
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world
    mod=o.modifiers.new('Explicit rigid mechanical skinning','ARMATURE');mod.object=rig
rig['description']=NAMES[kind];rig['reference']='../reference/badmechs.png';rig['units']='meters'
for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
def orient(name,head,tail):
    rest=rig.data.bones[name];q=(rest.tail_local-rest.head_local).rotation_difference(Vector(tail)-Vector(head))@rest.matrix_local.to_quaternion()
    rig.pose.bones[name].matrix=Matrix.Translation(Vector(head))@q.to_matrix().to_4x4();bpy.context.view_layer.update()
def ik(a,b,end,pole):
    S=rig.pose.bones[a].head.copy();W=Vector(end);l1=rig.data.bones[a].length;l2=rig.data.bones[b].length;d=W-S;dist=min(d.length,l1+l2-.004);v=d.normalized();W=S+v*dist
    x=(l1*l1-l2*l2+dist*dist)/(2*dist);h=math.sqrt(max(0,l1*l1-x*x));p=Vector(pole)-S;p=(p-v*p.dot(v)).normalized();E=S+v*x+p*h
    orient(a,S,E);orient(b,E,W);return W

# Named equipment transforms are separate, usable objects, not baked into the hands.
if kind in ['bastion','warden']:
    root=gear[0][0];root.location=(0,-.33,1.31) if heavy else (-.02,-.29,1.39);root.rotation_euler=Euler((.25,0,.28 if heavy else .40));bpy.context.view_layer.update()
    for side,local,pole in [('r',(0,.22,-.10) if heavy else (0,.091,-.060),(-.9 if heavy else -.64,-.22,1.18)),('l',(.08,-.20,-.10) if heavy else (0,-.28,-.015),(.86 if heavy else .64,-.2,1.24))]:
        W=ik('upperarm_'+side,'lowerarm_'+side,root.matrix_world@Vector(local),pole);orient('hand_'+side,W,W+Vector((0,-.02,-.11)))
elif kind=='revenant':
    rig.pose.bones['pelvis'].matrix=Matrix.Translation((0,0,-.21))@data.bones['pelvis'].matrix_local;bpy.context.view_layer.update()
    for side,s,y in [('r',-1,-.17),('l',1,.10)]:
        W=ik('thigh_'+side,'calf_'+side,(s*.40,y,.155),(s*.50,-.6,.5));orient('foot_'+side,W,W+Vector((s*.09,-.20,-.08)))
        hand=ik('upperarm_'+side,'lowerarm_'+side,(s*.60,-.12,.82 if s<0 else .66),(s*.64,-.04,1.15));orient('hand_'+side,hand,hand+Vector((s*.03,-.02,-.11)))
        root=gear[0 if s<0 else 1][0];root.rotation_euler=(.09,-.12,s*1.15 if s<0 else -.12);bpy.context.view_layer.update();root.location=hand-root.rotation_euler.to_matrix()@Vector((0,.125,0))
else:
    W=ik('upperarm_l','lowerarm_l',(.58,-.22,1.35),(.65,.02,1.23));orient('hand_l',W,W+Vector((.11,-.035,.05)))
    gear[0][0].location=(.69,-.21,1.66)
for pb in rig.pose.bones:
    if pb.name.startswith('finger_'):pb.rotation_quaternion=Quaternion((1,0,0),-.48 if kind!='sovereign' else -.25)
    pb.keyframe_insert('location',frame=1);pb.keyframe_insert('rotation_quaternion',frame=1)
rig.animation_data.action.name='Reference_Pose';rig.animation_data.action.use_fake_user=True
rig.scale=(SCALE,)*3
for root,parts in gear:root.location*=SCALE;root.scale=(SCALE,)*3
bpy.context.view_layer.update()

# Render studio belongs to the source, and is excluded from asset exports.
studio=bpy.data.collections.new('Review Studio');scene.collection.children.link(studio)
def studio_obj(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    studio.objects.link(o)
def camera(name,at,target,lens=62):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=at;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_start=.02;return o
def light(name,at,color,power,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=at;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
H=2.2*SCALE
hero=camera('Reference three-quarter',(-3.4*SCALE,-5.7*SCALE,2.65*SCALE),(0,-.04,H*.49),65)
front=camera('Neutral front',(0,-6.6*SCALE,1.6*SCALE),(0,0,H*.49),66)
back=camera('Back equipment',(3.1*SCALE,5.7*SCALE,2.6*SCALE),(0,0,H*.48),65)
detail=camera('Head and torso detail',(-1.0*SCALE,-2.4*SCALE,2.13*SCALE),(0,-.05,1.85*SCALE),78)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));floor=bpy.context.object;studio_obj(floor);floor.data.materials.append(plain('Studio slate',(.165,.183,.197),.05,.84))
light('Soft warm key',(-3*SCALE,-4*SCALE,5*SCALE),(1,.84,.65),1000*SCALE*SCALE,3.5*SCALE,(0,0,H*.55))
light('Cool fill',(3*SCALE,-2*SCALE,3*SCALE),(.65,.77,1),800*SCALE*SCALE,3*SCALE,(0,0,H*.6))
light('Amber rim',(1*SCALE,3*SCALE,4*SCALE),(1,.62,.35),1400*SCALE*SCALE,2.7*SCALE,(0,0,H*.65))
world=bpy.data.worlds.new('Neutral overcast studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.23,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=72;scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.resolution_x=1200;scene.render.resolution_y=1600;scene.render.resolution_percentage=100;scene.camera=hero
scene['reference']='Original user image ../reference/badmechs.png; hidden surfaces inferred';scene['archetype']=NAMES[kind]
ref=bpy.data.images.load(str(OUT/'reference'/'badmechs.png'),check_existing=True);ref.pack()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
deselect();rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/f'{kind}.blend'))
scene.render.filepath=str(OUT/'preview'/f'{kind}_reference.png')
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
print('MECH SOURCE AND FIRST RENDER COMPLETE',kind,flush=True)
