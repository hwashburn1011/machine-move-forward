"""Fifty distinct desert artifacts: refined originals plus 36 new assemblies.

Original modelling, metres, Z up. Every part has real thickness, an atlas UV,
and a physical attachment. Shared helpers describe manufactured components;
the complete assemblies, silhouettes and service layouts are different.
Invoked by build.py, whose source collections retain every editable part.
"""
import math
import random
from mathutils import Vector

DETAILS = {
 'ruin-house':'Hollow roof and window bays refined with curved broken gutter, hinge fittings, exposed split bricks and smoother edge bevels.',
 'ruin-shop':'Ruined storefront with half-dropped shutter, guide channels, fascia, balcony balusters and exposed structural layers.',
 'ruin-apartment':'Four-storey collapsed apartments with narrow balcony balusters, connected service riser and pipe clamps.',
 'ruin-tower':'Eight-storey concrete skeleton with broken masonry, reinforced balconies, continuous riser and smoother slab/column edges.',
 'ruin-factory':'Open industrial hall with footed columns, anchor bolts, continuous steam return, valve and ventilation louvres.',
 'overpass':'Broken road sections with load-bearing pier footings, concrete parapet curbs and dangling reinforcement.',
 'wreck-car':'Hollow rusted car with smoother body edges, curved exhaust, full axles, leaf springs and bent mirror arms.',
 'wreck-bus':'Hollow bus with seats, detailed undercarriage, mirrors, exhaust and interior overhead grab rails.',
 'wreck-tanker':'Ruptured tanker shell with open bore, ribs, service valve, analog gauge and manway.',
 'billboard':'Torn continuous-UV advertising sheets with bolted anchor flanges, face fixings and supported floodlights.',
 'water-sign':'Weathered civil-reserve sign with real torn sheets, anchor flanges, bolts and mounting hardware.',
 'road-sign':'Damaged wayfinding panel with reinforced footing mounts, fasteners and smooth round support pipes.',
 'pylon':'Lattice power pylon with concrete foundations, steel anchoring plates, aligned splice plates and porcelain insulators.',
 'water-tower':'Elevated water tank with smooth dished roof, exterior ladder, properly attached stand-offs, footings and overflow pipe.',
}


def tube(name, points, radius=.035, tile=5, sides=12):
    """Smooth swept hose/pipe with rounded joins (centripetal Catmull sampling)."""
    controls = [Vector(p) for p in points]
    samples = []
    for i in range(len(controls)-1):
        p0, p1 = controls[max(0,i-1)], controls[i]
        p2, p3 = controls[i+1], controls[min(len(controls)-1,i+2)]
        for j in range(6):
            t=j/6
            samples.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    samples.append(controls[-1])
    verts=[]; faces=[]
    for i,p in enumerate(samples):
        tangent=(samples[min(i+1,len(samples)-1)]-samples[max(0,i-1)]).normalized()
        normal=tangent.cross(Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((0,1,0))).normalized()
        bitangent=tangent.cross(normal).normalized()
        for j in range(sides):
            a=j*math.tau/sides
            verts.append(p+radius*(normal*math.cos(a)+bitangent*math.sin(a)))
        if i:
            for j in range(sides):
                a=(i-1)*sides+j;b=(i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(range(len(verts)-sides,len(verts)))])
    return mesh(name,verts,faces,tile,True)


def lathe(name, at, profile, tile=7, n=40, axis='Z'):
    """Turned curved shells, with explicit lip / dish / bead profile."""
    verts=[];faces=[]
    for z,r in profile:
        for j in range(n):
            a=j*math.tau/n; p=(r*math.cos(a),r*math.sin(a),z)
            if axis=='Y':p=(p[0],p[2],p[1])
            if axis=='X':p=(p[2],p[0],p[1])
            verts.append(tuple(p[k]+at[k] for k in range(3)))
    for i in range(len(profile)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    if axis=='Y':faces=[tuple(reversed(face)) for face in faces]
    return mesh(name,verts,faces,tile,True)


def bolts(at, w, h, plane='XY', count=4, radius=.034):
    for i in range(count):
        u=(-1 if i%2==0 else 1)*w/2;v=(-1 if (i//2)%2==0 else 1)*h/2
        a=Vector(at); b=Vector(at)
        axes={'XY':(0,1,2),'XZ':(0,2,1),'YZ':(1,2,0)}[plane]
        a[axes[0]]+=u;a[axes[1]]+=v;b=a.copy();b[axes[2]]+=.025
        rod('hexagonal anchor / washer',a,b,radius,5,6)


def plinth(w,d,z=.14):
    box('cast concrete / mounting bed',(0,0,z/2),(w,d,z),0,.06)
    for x in [-w*.4,w*.4]:
        for y in [-d*.4,d*.4]:
            box('bolted steel foot plate',(x,y,z+.025),(.27,.27,.05),5,.015)
            bolts((x,y,z+.053),.17,.17,radius=.021)


def skid(w,d):
    for x in [-w/2,w/2]:box('load bearing skid',(x,0,.14),(.16,d,.28),5,.03)
    for y in [-d*.4,0,d*.4]:box('skid crossmember',(0,y,.24),(w,.12,.14),2,.025)


def vent(at,w,h,plane='XZ',rows=7):
    size=(w,.035,h) if plane=='XZ' else (.035,w,h)
    box('recessed dark vent cavity',at,size,4,.016)
    for j in range(rows):
        p=list(at);p[2]+=(j/(rows-1)-.5)*h*.84
        if plane=='XZ':p[1]-=.025;size=(w*.9,.065,.026)
        else:p[0]+=.025;size=(.065,w*.9,.026)
        box('rolled vent louvre',p,size,5,.008)


def gauge(at,r=.105):
    x,y,z=at
    rod('gauge steel bezel',(x,y+.02,z),(x,y-.055,z),r,5,32)
    rod('dust clouded dial',(x,y-.056,z),(x,y-.063,z),r*.82,1,32)
    rod('gauge needle',(x,y-.067,z),(x+r*.47,y-.067,z+r*.4),.008,4,6)


def valve(at,r=.16,axis='Y'):
    x,y,z=at
    rotation=(math.pi/2,0,0) if axis=='Y' else (0,0,0)
    ring('cast valve hand wheel',at,r,.025,2,rotation)
    for i in range(3):
        a=i*math.tau/3
        end=(x+r*math.cos(a),y,z+r*math.sin(a)) if axis=='Y' else (x+r*math.cos(a),y+r*math.sin(a),z)
        rod('valve spoke',at,end,.015,5,10)
    rod('valve shaft',at,(x,y+.23,z) if axis=='Y' else (x,y,z-.23),.03,5,16)


def ladder(x,y,bottom,top,width=.5):
    for dx in [-width/2,width/2]:rod('ladder stiles',(x+dx,y,bottom),(x+dx,y,top),.03,5,12)
    n=max(2,round((top-bottom)/.32))
    for i in range(n):rod('ladder non slip rung',(x-width/2,y,bottom+i*.32),(x+width/2,y,bottom+i*.32),.023,5,12)


def rim_wheel(x,y,z,r=.48,width=.25):
    lathe('rounded deflated tyre',(x,y,z),[(-width/2, r*.57),(-width*.65,r*.75),(-width*.45,r*.96),(0,r),(width*.45,r*.96),(width*.65,r*.75),(width/2,r*.57)],4,40,'X')
    rod('wheel hub',(x-width*.5,y,z),(x+width*.5,y,z),r*.43,5,32)
    ring('pressed rim outer bead',(x+width*.53,y,z),r*.54,.026,2,(0,math.pi/2,0))
    for i in range(6):
        a=i*math.tau/6
        rod('wheel lug',(x+width*.55,y+math.cos(a)*r*.27,z+math.sin(a)*r*.27),(x+width*.62,y+math.cos(a)*r*.27,z+math.sin(a)*r*.27),.028,5,6)
    for i in range(24):
        a=i*math.tau/24
        box('worn tyre tread',(x,y+math.cos(a)*r,z+math.sin(a)*r),(width*.7,.028,.065),4,.009,(a,0,0))


def chassis(w,d,axles=(-1.5,1.5),r=.48):
    for x in [-w*.33,w*.33]:box('rusted chassis channel',(x,0,.55),(.15,d,.2),5,.03)
    for y in axles:
        rod('axle',(-w*.54,y,r),(w*.54,y,r),.07,5,20)
        for x in [-w*.52,w*.52]:
            rim_wheel(x,y,r,r)
            for k in range(3):box('leaf spring stack',(x*.68,y,.42-k*.022),(.085,.8-k*.1,.021),2,.004)
    box('ribbed vehicle floor',(0,0,.7),(w*.9,d,.13),5,.035)


def cab(w=1.9,front=-2,back=.4,height=2):
    # Hollow cab: bent posts, an open windscreen, door frames and detailed interior.
    for x in [-w/2,w/2]:
        tube('cab bent windscreen pillar',[(x,front,.93),(x,front,1.2),(x*.92,front+.35,height-.1),(x*.91,back,height)],.055,3)
        rod('rear cab pillar',(x,back,.9),(x*.91,back,height),.055,3,16)
        box('door lower sheet',(x,(front+back)/2,1.03),(.075,back-front,.52),3,.08)
        box('door pressed seam',(x*1.04,(front+back)/2,1.21),(.035,back-front-.12,.045),5,.012)
        tube('door handle',[(x*1.04,back-.35,1.32),(x*1.11,back-.35,1.32),(x*1.11,back-.17,1.32),(x*1.04,back-.17,1.32)],.017)
        box('seat squab',(x*.48,back-.47,.94),(.65,.62,.22),4,.09)
        box('torn upholstered seat back',(x*.48,back-.19,1.26),(.65,.19,.72),4,.08,(.08,0,0))
    bowed_panel('dented cab crown',(0,(front+back)/2+.18,height),w,back-front-.25,.09,3)
    box('dashboard',(0,front+.39,1.21),(w*.86,.28,.2),4,.04)
    for x in [-.24,-.05,.13]:gauge((x,front+.55,1.31),.06)
    rod('steering column',(-.42,front+.43,1.22),(-.42,front+.8,1.42),.025,5,16)
    ring('steering wheel',(-.42,front+.8,1.42),.19,.025,4,(.65,0,0))
    box('front bumper',(0,front-.35,.73),(w*1.05,.15,.19),5,.04)
    for x in [-w*.35,w*.35]:
        rod('recessed headlamp',(x,front-.25,1.08),(x,front-.35,1.08),.16,5,28)
        rod('frosted lamp lens',(x,front-.36,1.08),(x,front-.37,1.08),.13,1,28)


def pickup():
    chassis(2,5,(-1.6,1.6));cab(front=-2.05,back=.2)
    bowed_panel('buckled engine hood',(0,-1.75,1.22),1.88,1.13,.16,3)
    for x in [-1,1]:box('cargo bed side',(x,1.38,1.14),(.12,2.22,.73),3,.065)
    box('dropped tailgate',(0,2.73,.51),(2,.86,.09),3,.05,(.19,0,0))
    for i in range(9):box('cargo floor pressed rib',(-.85+i*.21,1.35,.79),(.04,2.1,.04),5,.008)
    rim_wheel(0,1.9,.99,.44)
    tube('hanging exhaust',[(.62,-.8,.39),(.62,1.8,.32),(.76,2.65,.27)],.05,2)


def ambulance():
    chassis(2.22,5.6,(-1.9,1.85));cab(2.15,-2.4,-.65,2.3)
    for x in [-1.08,1.08]:
        box('medical van side panel',(x,1.05,1.7),(.10,3.35,1.98),7,.06)
        box('medical side identity horizontal',(x*1.055,.7,1.85),(.03,.76,.2),2,.025)
        box('medical side identity vertical',(x*1.055,.7,1.85),(.03,.22,.78),2,.025)
        box('rear opening frame',(x,2.73,1.66),(.1,.14,1.91),5,.025)
    bowed_panel('van rounded roof',(0,1.03,2.72),2.2,3.45,.14,7)
    box('rear lintel',(0,2.73,2.62),(2.1,.15,.13),5,.02)
    door=box('open ambulance rear door',(1.43,2.95,1.66),(1,.12,1.9),7,.06,rot=(0,0,.55))
    box('stretcher frame',(0,1.25,.94),(.8,2.1,.13),5,.035)
    box('abandoned stretcher mattress',(0,1.25,1.07),(.75,2,.18),4,.08)
    for x in [-.33,.33]:rod('stretcher leg',(x,.5,.74),(x,.5,1),.035,5)
    box('emergency beacon rail',(0,-1.13,2.65),(1.3,.28,.12),5,.05)
    for x in [-.45,.45]:lathe('clouded emergency beacon',(x,-1.13,2.71),[(0,.14),(.15,.14),(.21,.11),(.23,0)],2,32)


def forklift():
    chassis(1.75,2.7,(-.95,.95),.37)
    box('cast counterweight',(0,1,.95),(1.65,.7,.79),14,.16)
    box('driver power unit',(0,.3,.88),(1.4,.85,.35),8,.06)
    for x in [-.72,.72]:
        for y in [-.67,.75]:rod('overhead cage pillar',(x,y,.7),(x,y,2.6),.052,5,16)
        box('mast outer channel',(x*.8,-1.45,1.62),(.13,.19,2.98),5,.025)
        box('fork heel',(x*.64,-1.67,.54),(.15,.17,.72),5,.025)
        box('tapered fork tine',(x*.64,-2.42,.24),(.16,1.67,.09),5,.018)
    for y in [-.65,-.3,.05,.4,.75]:box('overhead guard',(0,y,2.62),(1.55,.07,.075),5,.018)
    for x in [-.72,.72]:box('overhead guard side rail',(x,.04,2.62),(.075,1.57,.075),5,.018)
    box('lift carriage',(0,-1.54,.72),(1.45,.16,.41),2,.035)
    rod('lift ram',(0,-1.38,.45),(0,-1.38,2.7),.07,5,24)
    tube('hydraulic return hose',[(.12,-1.38,2.6),(.3,-1.39,2.92),(.4,-1.4,1),(.6,-.5,.65)],.024,4)
    box('driver seat',(0,.2,1.23),(.6,.62,.16),4,.075)
    box('seat back',(0,.48,1.53),(.6,.15,.57),4,.065)
    ring('forklift steering wheel',(0,-.54,1.6),.19,.023,4,(.6,0,0))
    rod('steering post',(0,-.55,.8),(0,-.55,1.6),.035,5,12)
    for x in [.43,.55]:rod('control lever',(x,-.12,1),(x,-.2,1.44),.02,5)


def rover():
    chassis(2.2,3.2,(-1.22,0,1.22),.43)
    box('survey chassis pod',(0,0,1.13),(1.9,2.8,.73),8,.15)
    for x in [-.85,.85]:vent((x,-.9,1.12),.7,.38,'YZ')
    rod('instrument mast',(0,0,1.48),(0,0,3.05),.085,5,24)
    box('survey optical head',(0,-.02,2.99),(.87,.49,.34),7,.10)
    for x in [-.27,.27]:rod('camera lens bezel',(x,-.23,2.99),(x,-.38,2.99),.105,5,32)
    lathe('roof lidar',(0,.82,1.48),[(0,.29),(.08,.29),(.12,.25),(.29,.25),(.32,.2)],5)
    for x in [-1.05,1.05]:
        box('dusty folded solar wing',(x,0,1.68),(.65,1.85,.045),8,.025,(0,x*.2,0))
        for y in [-.8,-.4,0,.4,.8]:rod('solar panel grid',(x-.27,y,1.7),(x+.27,y,1.7),.009,5,6)
    tube('rover arm',[(.45,-1.2,.8),(.9,-1.8,.85),(1.1,-2.1,.43)],.09,5)
    for x in [.98,1.2]:rod('sampling gripper',(1.1,-2.1,.43),(x,-2.22,.14),.027,5)


def bogie():
    for x in [-.72,.72]:box('cast bogie sideframe',(x,0,.62),(.24,2.8,.42),5,.075)
    for y in [-.92,.92]:
        rod('rail axle',(-1.1,y,.43),(1.1,y,.43),.08,5,24)
        for x in [-.95,.95]:
            lathe('flanged rail wheel',(x,y,.43),[(-.10,.36),(-.09,.47),(-.045,.48),(-.02,.40),(.13,.38),(.14,.19)],5,40,'X')
            for j in range(5):ring('suspension spring',(x*.8,y,.69+j*.045),.12,.021,2,(0,0,0))
    box('central bolster',(0,0,.86),(1.85,.4,.3),5,.06)
    lathe('wagon swivel bearing',(0,0,1.02),[(0,.38),(.08,.38),(.11,.3)],2)
    for x in [-.42,.42]:rod('brake connecting rod',(x,-1.2,.48),(x,1.2,.48),.028,5,12)


def container_wagon():
    # Two actual bogies support a distinct half-open freight container.
    for y in [-2.8,2.8]:
        start=len(parts);bogie()
        for o in parts[start:]:o.location.y+=y
    box('wagon main bed',(0,0,1.23),(2.55,8.2,.3),5,.045)
    for x in [-1.16,1.16]:
        for y in [-3.75,3.75]:box('container corner casting',(x,y,2.51),(.19,.2,2.28),5,.04)
        box('corrugated container sheet',(x,0,2.52),(.065,7.5,2.17),3,.03)
        for j in range(24):box('container wall corrugation',(x*1.03,-3.6+j*.30,2.52),(.07,.09,2.05),3,.024)
    box('container roof',(0,0,3.64),(2.46,7.66,.10),3,.025)
    box('closed rear container wall',(0,3.75,2.52),(2.28,.10,2.1),3,.03)
    for x,angle in [(-1.7,-.73),(1.6,.6)]:
        box('open freight door',(x,-4,2.53),(1.2,.09,2.17),3,.03,(0,0,angle))
        rod('door locking bar',(x,-4.09,1.5),(x,-4.09,3.5),.025,5,12)
    for y in [-4.4,4.4]:box('wagon knuckle coupler',(0,y,.96),(.3,.6,.2),5,.045)


def tank_body(at=(0,0,1),r=.75,length=2.8,tile=7,support_z=.28):
    x,y,z=at
    lathe('dished welded tank',(x,y,z),[(-length/2,0),(-length/2+.035,r*.35),(-length/2+.15,r*.75),(-length/2+.3,r*.96),(-length/2+.45,r),(length/2-.45,r),(length/2-.3,r*.96),(length/2-.15,r*.75),(length/2-.035,r*.35),(length/2,0)],tile,48,'Y')
    for yy in [-length*.27,length*.27]:
        ring('tank rolled retaining strap',(x,y+yy,z),r+.012,.03,5)
        top=z-r*.345
        for xx in [-r*.55,r*.55]:box('tank saddle support',(x+xx,y+yy,(support_z+top)/2),(.2,.3,top-support_z),5,.03)
    lathe('tank service cap',(x,y,z+r-.02),[(0,.18),(.13,.18),(.16,.22),(.2,.22)],5,32)


def fuel_trailer():
    chassis(1.8,3.3,(-.2,),.42);tank_body((0,0,1.37),.81,3.1,7,.76)
    for x in [-.7,.7]:rod('trailer drawbar',(x,-1.5,.53),(0,-2.65,.46),.075,5,16)
    ring('towing eye',(0,-2.8,.46),.15,.048,5,(0,0,0))
    rod('landing jack',(0,-2.25,.48),(0,-2.25,.05),.045,5,20)
    box('landing foot',(0,-2.25,.04),(.32,.3,.07),5,.02)
    valve((0,-1.55,1.32));tube('dispensing hose',[(.45,-1.2,1),(.78,-1.5,.55),(.7,-.4,.4),(.85,.3,.9)],.044,4)
    gauge((-.3,-1.42,1.53),.11)


def culvert():
    # Open bore and concrete wall thickness remain visible at either end.
    lathe('cast culvert with open bore',(0,0,1.3),[(-2.5,1.3),(-2.5,1.03),(2.5,1.03),(2.5,1.3),(-2.5,1.3)],0,56,'Y')
    for y in [-2.48,0,2.48]:ring('culvert expansion ring',(0,y,1.3),1.3,.042,0)
    for x in [-1.8,1.8]:box('culvert wing retaining wall',(x,-2.1,.58),(.34,2.3,1.16),0,.05,(0,0,x*.15))
    for x in [-.9,-.6,-.3,0,.3,.6,.9]:rod('collapsed inlet grate',(x,-2.64,.25),(x,-2.64,2.1),.023,2,10)
    rubble(2.6,4,7)


def transformer():
    plinth(2.9,2.6);box('transformer oil enclosure',(0,0,1.05),(1.75,1.4,1.72),8,.14)
    for x in [-1,1]:
        for j in range(9):box('radiator cooling fin',(x,-.61+j*.15,1.02),(.44,.055,1.34),5,.022)
    for x in [-.55,0,.55]:
        rod('ceramic bushing core',(x,0,1.9),(x,0,2.57),.07,1,24)
        for z in [2.02,2.12,2.22,2.32,2.42]:ring('porcelain shed',(x,0,z),.14,.037,1,(0,0,0))
        rod('terminal stud',(x,0,2.51),(x,0,2.68),.035,5,16)
    tank_body((0,.65,2.1),.25,1.6,8,1.9)
    gauge((-.4,-.74,1.35),.13);valve((.45,-.78,.51),.13)
    tube('ground braid',[(.7,-.72,.4),(.91,-.82,.3),(1,-.97,.16)],.02,2)


def fuel_pump():
    plinth(1.32,1);box('petrol pedestal',(0,0,.7),(.85,.66,1.12),7,.11)
    box('pump meter housing',(0,0,1.68),(1.07,.74,.92),3,.15)
    box('inset mechanical meter',(0,-.386,1.85),(.75,.025,.27),4,.015)
    for i in range(5):box('faded counter digits',(-.26+i*.13,-.406,1.86),(.052,.012,.11),1,.008)
    gauge((0,-.394,1.46),.16)
    tube('hanging fuel hose',[(.51,.03,1.83),(.9,.02,1.65),(1.05,-.08,.34),(.73,-.32,.26),(.63,-.35,1.31)],.045,4,16)
    box('fuel nozzle grip',(.61,-.35,1.35),(.095,.13,.27),5,.028,(0,.23,0))
    tube('nozzle metal spout',[(.64,-.35,1.49),(.67,-.34,1.6),(.51,-.32,1.68)],.025,5)


def cabinet(telecom=False):
    plinth(1.7,1.15);box('cabinet rolled steel shell',(0,0,1.25),(1.44,.89,2.15),8 if telecom else 7,.095)
    for x in [-.355,.355]:
        box('recessed service door',(x,-.46,1.29),(.69,.044,1.97),7,.036)
        bolts((x,-.49,1.29),.59,1.8,'XZ',radius=.023)
        tube('flush pull handle',[(x+.20,-.5,1.12),(x+.2,-.57,1.16),(x+.2,-.57,1.4),(x+.2,-.5,1.44)],.016)
        vent((x,-.5,.65),.48,.34,rows=7)
        for z in [.51,1.25,2]:rod('door hinge',(x-.31,-.48,z-.07),(x-.31,-.48,z+.07),.03,5,16)
    if telecom:
        for x in [-.45,.45]:
            rod('telecom aerial mount',(x,.15,2.32),(x,.15,2.65),.043,5)
            rod('radio whip',(x,.15,2.6),(x+.09,.15,4.1),.014,5)
        box('external radio receiver',(.8,0,1.85),(.18,.49,.49),8,.05)
        tube('antenna feeder',[(.8,0,1.7),(.87,.3,1.7),(.86,.37,2.45),(.45,.15,2.57)],.018,4)
    else:
        gauge((-.35,-.51,1.81),.1)
        for x in [.21,.36,.51]:rod('ceramic disconnect handle',(x,-.5,1.79),(x,-.58,1.79),.035,2,16)
    for x in [-.42,.42]:tube('buried service conduit',[(x,.44,.7),(x,.6,.41),(x,.6,.02)],.055,5)


def fan(at,r=.5,axis='Z'):
    x,y,z=at
    rot=(0,0,0) if axis=='Z' else (math.pi/2,0,0)
    ring('fan cowl',at,r,.05,5,rot)
    for i in range(7):
        a=i*math.tau/7
        verts=[(.12,-.05,0),(r*.84,-.14,.025),(r*.9,.09,.04),(.16,.13,.0)]
        verts=[(x+u*math.cos(a)-v*math.sin(a),y+u*math.sin(a)+v*math.cos(a),z+w) for u,v,w in verts]
        o=mesh('curved impeller blade',verts,[(0,1,2,3)],5,True)
        mod=o.modifiers.new('Blade gauge','SOLIDIFY');mod.thickness=.016
        if axis=='Y':
            # Rotate around the fan centre, rather than the scene origin.
            for v in o.data.vertices:
                p=v.co-Vector(at);v.co=Vector((x+p.x,y-p.z,z+p.y))
    for k in range(1,4):ring('fan safety grille',at,r*k/4,.012,5,rot)
    if axis=='Z':rod('impeller motor hub',(x,y,z-.1),(x,y,z+.08),.13,5,24)
    else:rod('impeller motor hub',(x,y+.1,z),(x,y-.08,z),.13,5,24)


def condenser():
    skid(2.6,1.4);box('condenser cabinet',(0,0,.86),(2.6,1.35,1.08),7,.06)
    for x in [-.68,.68]:fan((x,0,1.43),.51)
    for j in range(14):box('heat exchanger fin',(-1.2+j*.185,-.705,.87),(.028,.07,.9),5,.005)
    tube('refrigerant suction line',[(1.3,.3,.7),(1.54,.3,.65),(1.56,.1,.25)],.047,2)
    tube('refrigerant liquid line',[(1.3,.4,1),(1.67,.4,.9),(1.68,.1,.25)],.023,2)


def dish_geometry(at,r=1.2):
    x,y,z=at
    # Concave paraboloid with rolled rim and a supported focal receiver.
    lathe('parabolic reflector',(x,y,z),[(.0,.02),(.04,r*.25),(.12,r*.5),(.26,r*.75),(.48,r),(.51,r),(.28,r*.75),(.14,r*.5),(.065,r*.25),(.025,.02)],7,56,'Y')
    ring('rolled dish lip',(x,y+.49,z),r,.027,5)
    for dx,dz in [(-r*.8,-r*.5),(r*.8,-r*.5),(0,r)]:rod('feed support',(x+dx,y+.47,z+dz),(x,y+1.2,z),.024,5,12)
    rod('focal horn receiver',(x,y+1.07,z),(x,y+1.34,z),.065,5,24)


def satellite():
    plinth(1.7,1.7);rod('dish pedestal',(0,0,.16),(0,0,1.65),.16,5,32)
    dish_geometry((0,0,2.2),1.35)
    for x in [-.23,.23]:box('elevation yoke',(x,0,1.92),(.07,.6,.9),5,.03)
    tube('coaxial cable',[(.2,.0,2.3),(.32,-.24,1.74),(.2,-.15,.3),(.5,-.4,.16)],.024,4)


def light_tower():
    chassis(1.4,1.9,(-.05,),.33)
    box('mobile lighting generator',(0,0,.97),(1.15,1.48,.64),14,.1);vent((0,-.76,.97),.8,.39)
    for x in [-1.35,1.35]:
        rod('outrigger',(x*.3,0,.45),(x,0,.23),.045,5,16)
        rod('jack screw',(x,0,.3),(x,0,.035),.034,5,16)
        box('outrigger foot',(x,0,.03),(.28,.28,.06),5,.02)
    for z,r in [(1.1,.085),(2.8,.065),(4.5,.046)]:rod('telescopic lighting mast',(0,.3,z),(0,.3,z+1.8),r,5,24)
    rod('lamp crossbar',(-1,.3,6.1),(1,.3,6.1),.04,5)
    for x in [-.73,-.24,.24,.73]:
        box('floodlight rounded housing',(x,.28,6.27),(.39,.22,.3),5,.065)
        box('dust opaque floodlight lens',(x,.155,6.27),(.33,.02,.23),1,.04)
    tube('mast electrical cable',[(.08,.3,1.3),(.1,.3,2.7),(.1,.3,4.2),(.07,.3,6.1)],.019,4)


def generator():
    skid(1.9,3);box('diesel generator enclosure',(0,0,1.17),(1.82,2.66,1.73),8,.12)
    for x in [-.7,0,.7]:box('access door seam',(x,-1.34,1.18),(.023,.018,1.45),5,.005)
    vent((0,-1.36,.87),1.47,.52,rows=9)
    for x in [-.45,-.12,.2]:gauge((x,-1.39,1.57),.095)
    box('control panel',(0,-1.36,1.57),(1.38,.035,.38),5,.02)
    for x in [-.45,-.12,.2]:gauge((x,-1.40,1.57),.095)
    tube('exhaust elbow',[(.58,.85,1.6),(.58,.85,2.25),(.57,.59,2.35)],.077,2,20)
    lathe('exhaust muffler',(.58,.85,1.86),[(0,.13),(.35,.13),(.4,.09)],5,32)
    bolts((0,0,2.045),1.46,2.27)


def compressor():
    skid(1.5,2.9);tank_body((0,0,.91),.58,2.7,3)
    box('compressor top bracket',(0,.25,1.5),(1.07,1.2,.1),5,.025)
    rod('electric compressor motor',(-.46,.5,1.76),(.45,.5,1.76),.23,5,32)
    for x in [-.3,.3]:
        rod('finned cylinder',(x,-.1,1.57),(x,-.1,1.98),.14,5,24)
        for z in [1.65,1.72,1.79,1.86]:ring('cylinder cooling ring',(x,-.1,z),.155,.02,5,(0,0,0))
    tube('compressor copper line',[(-.3,-.1,2),(-.3,-.43,2.1),(.4,-.54,1.6),(.45,-.5,1.05)],.024,2)
    gauge((0,-.71,1.29),.11);valve((.25,-.8,1.04),.1)
    tube('coiled outlet hose',[(.3,-.85,1),(.75,-.7,.3),(.76,.6,.26),(-.6,.8,.26),(-.76,-.6,.26),(.4,-.9,.27)],.035,4)


def hydrant():
    plinth(.8,.8,.12)
    lathe('cast hydrant barrel',(0,0,.12),[(0,.25),(.09,.26),(.14,.19),(.66,.19),(.72,.25),(.8,.25),(.92,.21),(1.05,.1),(1.08,0)],2,48)
    for x in [-1,1]:
        rod('hydrant hose outlet',(0,0,.72),(x*.35,0,.72),.12,2,32)
        rod('hexagonal hose cap',(x*.31,0,.72),(x*.4,0,.72),.135,5,6)
        tube('retaining cap chain',[(x*.38,0,.72),(x*.31,-.12,.43),(x*.16,-.15,.52)],.015,5,8)
    rod('hydrant operating nut',(0,0,1.17),(0,0,1.24),.067,5,6)
    bolts((0,0,.22),.35,.35)


def bulk_tank():
    plinth(3.6,6.6,.22);tank_body((0,0,1.92),1.46,6.2,7,.22)
    ladder(-1.31,-1.6,.25,3.25)
    tube('delivery riser',[(-1.31,-1.72,.35),(-1.8,-1.72,.4),(-1.8,-1.72,1.6),(-1.4,-1.72,1.92)],.105,5,24)
    valve((-1.8,-1.89,.88),.22);gauge((.35,-3.02,1.98),.15)
    for x in [-.66,.66]:rod('top maintenance rail',(x,-1.8,3.43),(x,1.8,3.43),.03,5)
    for y in [-1.8,1.8]:
        for x in [-.66,.66]:rod('rail stanchion',(x,y,3.21),(x,y,3.43),.025,5)


def pallet():
    for y in [-.58,0,.58]:box('pallet runner',(0,y,.12),(1.64,.14,.23),9,.03)
    for i in range(7):box('pallet upper plank',(-.72+i*.24,0,.27),(.21,1.45,.075),9,.02)
    for x in [-.43,.38]:
        box('shipping case',(x,0,.69),(.76,1.05,.76),8,.065)
        for y in [-.46,.46]:box('steel packing band',(x,y,.69),(.80,.034,.8),5,.015)
        for y in [-.535,.535]:box('lifting pocket',(x,y,.69),(.29,.04,.08),4,.012)
    box('broken top crate',(.07,.08,1.25),(1,.9,.36),9,.035,(0,0,.16))
    for x in [-.7,.7]:bolts((x,0,.315),.07,1.13,radius=.012)


def spool():
    for z in [.12,1.23]:
        rod('wood cable reel flange',(0,0,z-.08),(0,0,z+.08),.88,9,48)
        ring('steel reel rim',(0,0,z),.88,.035,5,(0,0,0))
        bolts((0,0,z+.086),.84,.84,radius=.042)
    rod('reel core',(0,0,.2),(0,0,1.15),.35,9,40)
    for j in range(19):ring('wound armored cable',(0,0,.27+j*.046),.62,.033,4,(0,0,0))
    tube('unspooled cable tail',[(.62,0,.32),(.85,-.3,.09),(1.5,-.4,.045),(1.86,.17,.045),(1.58,.52,.045)],.033,4)
    rod('reel axle hole shadow',(0,0,1.31),(0,0,1.32),.095,4,32)


def barrier():
    profile=[(-.43,0),(.43,0),(.43,.19),(.19,.62),(.16,.96),(-.16,.96),(-.19,.62),(-.43,.19)]
    verts=[(x,y,z) for y in [-1.55,1.55] for x,z in profile];n=len(profile)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh('chipped jersey barrier',verts,faces,0)
    for y in [-.85,.85]:
        ring('concrete lifting eye',(0,y,.98),.075,.018,5)
        box('barrier reflective badge',(.23,y,.57),(.04,.26,.18),14,.012,rot=(0,.48,0))
    for y in [-1.59,1.59]:rod('barrier coupler pin',(0,y,.22),(0,y,.7),.026,2,12)


def gantry():
    for x in [-4,4]:
        box('gantry concrete footing',(x,0,.16),(1,1.3,.32),0,.055)
        for y in [-.3,.3]:rod('gantry upright',(x,y,.32),(x,y,6),.08,5,20)
        for z in [1,2,3,4,5]:rod('upright diagonal',(x,-.3,z),(x,.3,z+1),.033,5)
        bolts((x,0,.33),.52,.75)
    for y in [-.3,.3]:
        for z in [5.35,6.05]:rod('gantry truss chord',(-4,y,z),(4,y,z),.075,5,20)
        for i in range(8):rod('gantry truss web',(-4+i,y,5.35),(-3+i,y,6.05),.035,5)
    for x in [-2,1.5]:
        box('damaged wayfinding panel',(x,-.4,5.8),(2.8,.055,1.53),15,.025)
        for z in [5.23,6.3]:rod('panel mounting tube',(x-1.4,-.3,z),(x+1.4,-.3,z),.029,5)
    ladder(3.7,.35,.35,5.4,.38)


def bus_shelter():
    plinth(4.7,2,.15)
    for x in [-2.05,2.05]:
        for y in [-.65,.65]:rod('shelter frame',(x,y,.15),(x,y,2.8),.045,5,16)
    bowed_panel('curved transit shelter roof',(0,0,2.78),4.6,1.9,.20,8)
    for x in [-1.65,-.8,0,.8,1.65]:rod('back frame',(x,.67,.5),(x,.67,2.65),.025,5)
    for z in [.42,2.66]:rod('shelter rear rail',(-2,.67,z),(2,.67,z),.035,5)
    for x in [-1.4,1.4]:box('bench pedestal',(x,.16,.41),(.15,.4,.52),5,.025)
    for y in [-.08,.08,.24,.4]:box('bench worn slat',(0,y,.68),(3.55,.13,.06),9,.025)
    box('faded transit map',(-1.46,.64,1.75),(.99,.025,1.1),15,.025)
    for i in range(4):
        mesh('jagged safety glass shard',[(.1+i*.4,.65,.42),(.5+i*.4,.65,.42),(.44+i*.4,.65,.89)],[(0,1,2)],8)


def crane():
    plinth(3.5,3.5,.28)
    lathe('crane slewing ring',(0,0,.28),[(0,1.1),(.14,1.1),(.2,.92),(.39,.92)],5,56)
    for i in range(12):
        a=i*math.tau/12;rod('slew bearing anchor',(math.cos(a),math.sin(a),.43),(math.cos(a),math.sin(a),.49),.045,5,6)
    box('crane tower base',(0,0,1.39),(1.2,1.2,1.45),14,.08)
    for x in [-.42,.42]:
        rod('boom lower chord',(x,0,1.9),(x,-3.7,4.3),.08,5,20)
        rod('boom upper chord',(x,0,2.65),(x,-3.7,4.57),.08,5,20)
        for j in range(6):rod('boom lattice',(x,-j*.6,1.9+j*.4),(x,-(j+1)*.6,2.65+(j+1)*.32),.035,5)
    rod('hoist cable',(0,-3.7,4.35),(0,-3.7,1.22),.021,5)
    tube('forged crane hook',[(0,-3.7,1.3),(0,-3.7,1.05),(.18,-3.7,.87),(.33,-3.7,1.01),(.27,-3.7,1.14)],.055,5,16)
    box('crane counterweight',(0,.9,2.21),(1.4,1.0,.63),0,.07)
    rod('hydraulic lift piston',(0,-.4,1.6),(0,-2,3.46),.07,5,24)


def motorcycle():
    for y in [-.9,.94]:rim_wheel(0,y,.4,.4,.17)
    for x in [-.13,.13]:
        tube('motorcycle frame',[(x,-.6,.57),(x,0,.4),(x,.6,.69),(x,.06,1.06),(x,-.6,.57)],.027,5)
        rod('front fork',(x,-.9,.4),(x,-.63,1.18),.032,5,20)
    box('engine crankcase',(0,0,.58),(.43,.48,.36),5,.09)
    for z in [.72,.77,.82,.87]:box('engine cooling fins',(0,-.13,z),(.36,.3,.026),5,.008)
    lathe('tear drop fuel tank',(0,-.12,.96),[(-.3,.04),(-.23,.15),(-.1,.24),(.13,.21),(.25,.1),(.27,.02)],3,32,'Y')
    box('split leather seat',(0,.41,1.04),(.37,.64,.1),4,.065)
    tube('bent handlebar',[(-.42,-.6,1.22),(-.2,-.59,1.28),(.2,-.59,1.28),(.42,-.64,1.2)],.023,5)
    rod('round headlamp',(0,-.7,1.12),(0,-.87,1.12),.12,5,32)
    rod('frosted headlight',(0,-.88,1.12),(0,-.9,1.12),.10,1,32)
    tube('motorcycle exhaust',[(.16,-.1,.63),(.3,-.13,.35),(.31,.95,.4)],.045,2)
    rod('kick stand',(.1,.27,.43),(.42,.38,.03),.028,5,12)


def turbine():
    plinth(1.4,1.4)
    lathe('roof ventilator mounting curb',(0,0,.14),[(0,.58),(.16,.58),(.2,.46),(.63,.46)],7,40)
    # Individual curved vanes form a hollow wind turbine rather than a sphere.
    for i in range(24):
        a=i*math.tau/24; verts=[]
        for z,r,twist in [(.66,.45,0),(.85,.68,.13),(1.2,.73,.3),(1.49,.46,.52),(1.56,.16,.64)]:
            for da in [-.045,.065]:verts.append((r*math.cos(a+twist+da),r*math.sin(a+twist+da),z))
        o=mesh('rolled turbine vane',verts,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],7,True)
        mod=o.modifiers.new('Vane sheet thickness','SOLIDIFY');mod.thickness=.012
    lathe('turbine hub cap',(0,0,1.54),[(0,.19),(.065,.18),(.10,.07),(.11,0)],5,32)


def pump_skid():
    skid(1.8,2.8)
    rod('electric motor',(0,.15,.68),(0,1.11,.68),.33,5,40)
    for j in range(12):
        a=j*math.tau/12
        rod('motor cooling fin',(.32*math.cos(a),.18,.68+.32*math.sin(a)),(.32*math.cos(a),1.05,.68+.32*math.sin(a)),.027,5,10)
    lathe('centrifugal pump volute',(0,-.55,.68),[(-.2,.22),(-.16,.39),(.14,.39),(.2,.22)],8,40,'Y')
    tube('suction discharge pipe',[(0,-.8,.68),(0,-1.3,.68),(.7,-1.4,.68),(.85,-1.4,1.37)],.13,5,24)
    for y in [-.9,-1.13]:ring('bolted pipe flange',(0,y,.68),.20,.027,5)
    valve((.86,-1.62,1.2),.19);gauge((-.27,-.77,.96),.11)
    for x in [-.3,.3]:box('pump motor mount',(x,.37,.39),(.16,1.63,.17),5,.025)


def magnet():
    plinth(2.1,2.1,.12)
    lathe('scrapyard lifting electromagnet',(0,0,.12),[(0,.91),(.08,.98),(.29,.98),(.34,.89),(.60,.78),(.71,.55),(.73,0)],5,56)
    for i in range(12):
        a=i*math.tau/12
        box('magnet cooling ribs',(.82*math.cos(a),.82*math.sin(a),.45),(.3,.055,.37),2,.023,(0,0,a))
    for i in range(3):
        a=i*math.tau/3;x=.53*math.cos(a);y=.53*math.sin(a)
        ring('lifting lug',(x,y,.83),.10,.032,5)
        rod('slack lifting chain',(x,y,.84),(0,0,1.46),.025,5,10)
    ring('master lifting shackle',(0,0,1.5),.13,.036,5)
    tube('heavy magnet supply cable',[(.7,0,.62),(1.1,.2,.4),(1.25,.75,.055),(.6,1.35,.055)],.041,4)


def radar():
    plinth(2.8,2.8,.22)
    for x in [-.9,.9]:
        for y in [-.9,.9]:rod('radar tripod tower',(x,y,.22),(x*.36,y*.36,5),.075,5,20)
    for z in [1,2.1,3.2,4.3]:
        a=.9*(1-z*.125);b=.9*(1-(z+1)*.125)
        for side in [-1,1]:rod('radar cross brace',(-a,side*a,z),(b,side*b,z+1),.03,5)
    rod('radar azimuth bearing',(0,0,4.8),(0,0,5.5),.26,5,32)
    box('radar reflector backing',(0,0,5.92),(3.4,.18,1.0),8,.06)
    for i in range(16):rod('slotted waveguide element',(-1.58+i*.21,-.16,5.53),(-1.58+i*.21,-.16,6.32),.018,5,10)
    for x in [-1.65,1.65]:box('radar end cap',(x,0,5.92),(.1,.35,1.1),7,.03)
    ladder(.0,.6,.24,4.7)
    box('radar service enclosure',(.65,.5,.71),(.74,.56,.95),7,.05)


def fallen_antenna():
    for x in [-.3,.3]:
        rod('collapsed lattice mast',(x,-3,.32),(x,3,.7),.057,5,16)
        rod('mast upper chord',(0,-3,.91),(0,3,1.29),.05,5,16)
        for i in range(10):rod('mast diagonal',(x,-3+i*.6,.32+i*.038),(0,-2.4+i*.6,.948+i*.038),.023,5)
    for y,length in [(-2.1,2.4),(-.8,2.8),(.5,2.1),(1.8,1.6)]:
        rod('yagi cross element',(-length/2,y,.85),(length/2,y,.85),.027,5,16)
        rod('yagi bent reflector',(-length*.48,y,.85),(-length*.63,y+.3,.23),.026,5)
    box('torn mast mounting flange',(0,-3.1,.6),(.9,.11,1),5,.02)
    bolts((0,-3.17,.6),.7,.8,'XZ')
    tube('severed coax',[(0,2.8,.78),(.5,3.3,.11),(1.3,2.7,.05),(1.6,1.9,.05)],.025,4)


def bunker():
    plinth(4.4,3.1,.3)
    for x in [-1.7,1.7]:box('bunker concrete jamb',(x,0,1.71),(.65,2.4,2.85),0,.09)
    box('bunker armored lintel',(0,0,3.03),(4.05,2.4,.57),0,.08)
    box('sealed vault door',(0,.35,1.62),(2.7,.20,2.6),8,.065)
    for x in [-1.15,1.15]:
        for z in [.7,1.6,2.5]:rod('heavy door hinge',(x,.16,z-.14),(x,.16,z+.14),.095,5,24)
    for z in [.65,1.25,2.0,2.6]:box('door stiffening rib',(0,.21,z),(2.5,.18,.1),5,.025)
    valve((.5,.07,1.62),.3)
    for i in range(3):box('bunker entrance step',(0,-1.55+i*.35,.06+i*.1),(3,.42,.12+i*.2),0,.035)
    box('warning placard',(-1.7,-1.23,1.96),(.4,.025,.7),14,.01)
    tube('bunker ventilation snout',[(1.6,.8,2.9),(1.6,.8,3.6),(1.6,.43,3.75)],.12,5,24)


def silo():
    plinth(4.5,4.5,.2)
    lathe('grain silo shell',(0,0,.2),[(0,1.95),(.13,2),(5.8,2),(6,1.92),(7.1,.22),(7.17,.15)],7,64)
    for z in [i*.19+.4 for i in range(29)]:ring('rolled silo corrugation',(0,0,z),2,.023,5,(0,0,0))
    ladder(0,-2.06,.2,6.1,.52)
    for z in [2.3,3.3,4.3,5.3]:
        ring('ladder safety cage',(0,-2.52,z),.45,.019,5,(0,0,0))
    box('grain hopper outlet',(1.78,0,.55),(.55,.58,.49),5,.04)
    tube('grain auger',[(1.88,0,.68),(2.7,0,.75),(3.6,0,1.8)],.13,5,24)
    rod('roof breather',(0,0,7.3),(0,0,7.65),.14,5,32)


def drain():
    for x in [-.9,.9]:box('drain side curb',(x,0,.22),(.26,2.5,.44),0,.05)
    for y in [-1.12,1.12]:box('drain cross curb',(0,y,.22),(1.8,.26,.44),0,.05)
    box('drain dark well floor',(0,0,.035),(1.65,2.23,.07),4,.01)
    for y in [-.98,.98]:box('grate frame',(0,y,.36),(1.7,.10,.10),5,.02)
    for x in [-.78,.78]:box('grate frame',(x,0,.36),(.10,2.02,.10),5,.02)
    for i in range(12):
        if i in [7,8]:continue
        box('separate drain grate slat',(0,-.9+i*.165,.37),(1.5,.038,.12),5,.012)
    tube('bent drain bar',[(.75,.31,.37),(.3,.31,.37),(-.16,.36,.62),(-.52,.3,.55)],.022,5)
    rubble(1.5,2.3,5)


def streetlamp():
    plinth(.85,.85,.22)
    lathe('tapered lamp standard',(0,0,.22),[(0,.19),(.2,.19),(.3,.10),(4.7,.075),(4.8,.07)],5,32)
    tube('sweeping swan neck',[(0,0,4.9),(0,0,5.7),(0,-.48,6.1),(0,-1.36,6.06)],.067,5,20)
    box('road light luminaire',(0,-1.45,6.02),(.37,.91,.19),7,.085)
    box('dusty lamp diffuser',(0,-1.5,5.919),(.28,.7,.027),1,.035)
    box('service hatch',(0,-.104,.79),(.13,.022,.34),8,.027)
    bolts((0,0,.24),.48,.48,radius=.031)


def crossing():
    plinth(1.25,1.25,.22)
    rod('crossing pole',(0,0,.22),(0,0,3.9),.086,5,32)
    for angle in [-.66,.66]:box('rail crossing crossbuck',(0,-.09,3.47),(1.9,.06,.23),1,.025,(0,angle,0))
    rod('signal horizontal bracket',(-.65,0,2.56),(.65,0,2.56),.055,5,20)
    for x in [-.58,.58]:
        rod('signal black back plate',(x,.05,2.56),(x,-.07,2.56),.27,4,40)
        rod('red signal lens',(x,-.08,2.56),(x,-.12,2.56),.17,2,40)
        lathe('signal weather hood',(x,-.17,2.56),[(-.15,.21),(.12,.21),(.12,.185),(-.15,.185)],5,36,'Y')
    box('barrier motor cabinet',(.15,.1,.86),(.65,.65,1.18),8,.085)
    box('broken crossing gate',(1.53,.15,1.06),(2.8,.15,.14),1,.025,(0,-.07,0))
    for x in [.4,1.1,1.8,2.5]:box('gate reflector band',(x,.064,1.06),(.29,.025,.145),2,.012)
    box('railway electrical box',(-.62,.38,.62),(.44,.45,.78),7,.05)


def refine_original(name):
    """Visible model-specific second pass on all fourteen existing artifacts."""
    if name.startswith('ruin-'):
        if name=='ruin-house':
            tube('hanging curved gutter',[(-4,-3.13,3.54),(-2.8,-3.15,3.54),(-2.4,-3.5,3.03)],.075,5)
            for x in [-3.2,-1.8]:
                for z in [1.2,2.4]:box('exposed window hinge',(x,-3.21,z),(.06,.04,.18),5,.009)
            for j in range(9):box('exposed split bricks',(2.8+(j%3)*.18,2.83,1.3+(j//3)*.09),(.16,.14,.075),6,.014)
        elif name=='ruin-factory':
            for x in [-6,-2,2,6]:
                box('industrial column foot',(x,-5.5,.10),(.52,.56,.20),5,.025);bolts((x,-5.5,.21),.39,.43)
            tube('factory steam return',[(-7,2,5.3),(-7.6,2,5),(-7.6,2,.5),(-6.5,1.1,.4)],.17,2,24)
            valve((-7.6,1.77,1.3),.3)
            for y in [-1.8,0,1.8]:vent((-7.98,y,4.8),1.2,.65,'YZ')
        else:
            floors,w,d={'ruin-shop':(2,9,7),'ruin-apartment':(4,12,10),'ruin-tower':(8,13,11)}[name]
            for f in range(1,floors):
                z=f*3.3
                for j in range(7):rod('balcony narrow baluster',(-w*.4+j*w*.4/6,-d*.66,z+.1),(-w*.4+j*w*.4/6-.05,-d*.66,z+.9),.018,5,10)
            if name=='ruin-shop':
                for j in range(10):box('half dropped shop shutter',(-1.6,-3.32,2.65-j*.072),(1.8,.058,.063),7,.014)
                for x in [-2.58,-.63]:box('shutter guide channel',(x,-3.35,1.72),(.09,.11,2.5),5,.018)
                box('store front fascia',(-.6,-3.4,3.33),(5.7,.16,.34),8,.036)
            else:
                tube('building service riser',[(-w*.44,d*.44,.1),(-w*.44,d*.44,floors*3.3-1),(-w*.37,d*.42,floors*3.3-.6)],.09,2,20)
                for z in range(1,floors*3):ring('riser bracket',(-w*.44,d*.44,z),.105,.018,5,(0,0,0))
    elif name=='overpass':
        for x in [-8,8]:
            box('bridge footing',(x,0,.2),(3.2,4.4,.4),0,.08)
            for yy in [-2.68,2.68]:
                box('road parapet curb',(x-2,yy,8.93),(7,.34,.5),0,.045)
                for j in range(7):rod('broken bridge reinforcement',(x+1.3,yy-.12+j*.04,8.44),(x+2.7,yy-.08+j*.03,8.20),.022,2,8)
    elif name in ['wreck-car','wreck-bus','wreck-tanker']:
        bus=name=='wreck-bus';length=9.5 if bus else 4.5
        tube('corroded exhaust run',[(.6,-1.4,.38),(.6,length*.35,.3),(.85,length*.52,.28)],.05,2,16)
        for y in [-length*.29,length*.29]:
            rod('exposed vehicle axle',(-1,y,.49),(1,y,.49),.065,5,20)
            for x in [-.72,.72]:
                for k in range(3):box('vehicle leaf spring',(x,y,.38-k*.023),(.07,.84-k*.1,.022),5,.005)
        for x in [-.8,.8]:
            tube('remaining side mirror arm',[(x,-1.1,1.5),(x*1.4,-1.1,1.62),(x*1.46,-.93,1.62)],.025,5)
            box('cracked mirror backing',(x*1.46,-.9,1.66),(.22,.07,.29),5,.05)
        if name=='wreck-tanker':
            valve((3.1,-4.08,1.2),.24);gauge((3.45,-3.85,1.5),.15)
            lathe('tanker manway',(3.1,-1.3,2.76),[(0,.34),(.14,.34),(.19,.40),(.22,.40)],5,40)
        if bus:
            for x in [-.83,.83]:
                for y in [-2.4,0,2.4]:tube('bus overhead passenger grab rail',[(x,y,1.4),(x,y,2.9),(x,-3,2.9)],.025,5)
    elif name in ['billboard','water-sign','road-sign']:
        w,h,z={'billboard':(9,4,6),'water-sign':(7,3.6,4.5),'road-sign':(3.5,2.2,2.8)}[name]
        for x in [-w*.33,w*.33]:
            box('sign bolted base flange',(x,0,.425),(.52,.52,.045),5,.015);bolts((x,0,.451),.4,.4)
            for zz in [z+.1,z+h-.1]:bolts((x,-.18,zz),.24,.14,'XZ',radius=.022)
        if name=='billboard':
            for x in [-3,0,3]:
                tube('billboard light bracket',[(x,.12,6),(x,-.6,5.65),(x,-.65,5.9)],.032,5)
                box('dead advertising floodlight',(x,-.65,5.95),(.35,.23,.22),5,.05)
    elif name=='pylon':
        for x in [-1.9,1.9]:
            for y in [-1.9,1.9]:
                box('pylon concrete anchorage',(x,y,.13),(.87,.87,.26),0,.06)
                box('pylon anchor steel',(x,y,.28),(.56,.56,.055),5,.02);bolts((x,y,.31),.4,.4)
        for z in [3,6,9,12]:
            a=1.9*(1-z*.75/18)
            for side in [-1,1]:box('pylon bolted splice',(side*a,-a-.05,z),(.18,.09,.27),5,.015)
    elif name=='water-tower':
        lathe('tank dished roof',(0,0,13.5),[(0,2.8),(.13,2.77),(.44,2.4),(.68,1.8),(.83,.9),(.87,0)],7,64)
        ladder(-.25,-3.04,.2,14.1)
        for z in [9.5,11,12.7]:
            for x in [-.5,0]:rod('tank ladder stand off',(x,-3.04,z),(x,-2.72,z),.03,5,12)
        for z in [1,4,7]:rod('ladder cross support',(-2+z*.056,-2+z*.056,z),(-.25,-3.04,z),.045,5,12)
        for x in [-2,2]:
            for y in [-2,2]:box('water tower footing',(x,y,.16),(.7,.7,.32),0,.05)
        valve((1.8,-.24,.82),.22)
        tube('tank overflow pipe',[(2.65,0,12.7),(3.13,0,12.6),(3.15,0,1.2),(3.6,0,.9)],.1,2,24)


CATALOG = [
 ('wreck-pickup',pickup,'Open cargo bed, dropped tailgate, curved cab, seats, dashboard, lugs, leaf springs and exhaust.'),
 ('wreck-ambulance',ambulance,'Hollow medical van, open rear doors, stretcher, raised medical emblems and rounded emergency beacons.'),
 ('wreck-forklift',forklift,'Counterweight, guarded operator station, twin-channel lifting mast, hydraulic ram, hoses and grounded forks.'),
 ('survey-rover',rover,'Six wheel survey platform, paired optics, lidar, solar wings, sampling arm and suspension.'),
 ('rail-bogie',bogie,'Flanged steel wheels, leaf/cast frame, coil springs, brake rods and wagon swivel.'),
 ('container-wagon',container_wagon,'Two bogies, corrugated open freight container, locking bars, cast corners and knuckle couplers.'),
 ('fuel-trailer',fuel_trailer,'Dished strapped tank, tow eye, jack, metering gauge, dispensing hose and chassis.'),
 ('culvert',culvert,'Thick open concrete bore, expansion collars, wing walls, broken inlet grate and rubble.'),
 ('transformer',transformer,'Oil housing, radiator fins, porcelain bushings, conservator, valves and earth braid.'),
 ('fuel-pump',fuel_pump,'Rounded enamel pump, mechanical counter, analog gauge, hanging hose and metal nozzle.'),
 ('utility-cabinet',lambda:cabinet(False),'Double service doors, hinges, recessed handles, switchgear, vent louvres and buried conduits.'),
 ('telecom-cabinet',lambda:cabinet(True),'Vented telecom doors, radio receiver, roof aerials, coax and service footings.'),
 ('condenser',condenser,'Twin curved fan impellers, protective grilles, exchanger fins, skid and refrigerant lines.'),
 ('satellite-dish',satellite,'Concave rolled paraboloid, focal receiver, three support struts, yoke and coax.'),
 ('light-tower',light_tower,'Towed generator, telescopic mast, four floodlights, stabilizer jacks and cable.'),
 ('diesel-generator',generator,'Bevelled enclosure, service panels, gauges, cooling louvres, muffler and bolted skid.'),
 ('air-compressor',compressor,'Dished receiver tank, motor, finned twin cylinders, copper lines, regulator and hose.'),
 ('fire-hydrant',hydrant,'Smooth cast barrel, domed crown, hex caps, retaining chains and anchor flange.'),
 ('bulk-fuel-tank',bulk_tank,'Large dished vessel, straps, saddles, ladder, delivery riser, gauge and rail.'),
 ('cargo-pallet',pallet,'Runner-supported wood pallet, individual boards, banded cases, lifting pockets and top crate.'),
 ('cable-spool',spool,'Wood flanges, steel rims, nineteen cable turns, fasteners and loose grounded tail.'),
 ('road-barrier',barrier,'Concrete Jersey profile, lifting eyes, reflectors and exposed coupling pins.'),
 ('signal-gantry',gantry,'Footed lattice gantry, twin direction panels, mounting tubes and maintenance ladder.'),
 ('bus-shelter',bus_shelter,'Curved roof, tubular frame, slatted bench, faded route map and jagged retained glazing.'),
 ('crane-pedestal',crane,'Bolted slew bearing, lattice boom, ram, counterweight, hanging cable and forged hook.'),
 ('wreck-motorcycle',motorcycle,'Tubular frame, smooth tank, finned engine, forks, headlight, bent bars, exhaust and kickstand.'),
 ('ventilation-turbine',turbine,'Twenty-four rolled curved vanes, hollow ventilator, hub cap and roof curb.'),
 ('pump-skid',pump_skid,'Finned motor, centrifugal volute, elbowed suction pipe, flanges, valve and gauge.'),
 ('scrapyard-magnet',magnet,'Profiled steel electromagnet, radial cooling ribs, lifting lugs, chain sling and power lead.'),
 ('radar-tower',radar,'Braced lattice mast, azimuth bearing, slotted waveguide array, access ladder and control box.'),
 ('fallen-antenna',fallen_antenna,'Collapsed lattice mast, bent Yagi elements, torn mounting flange and trailing coax.'),
 ('bunker-entrance',bunker,'Thick concrete portal, stiffened vault door, hinges, locking wheel, steps and vent.'),
 ('grain-silo',silo,'Smooth conical cap, rolled shell corrugations, safety ladder, grain auger and roof breather.'),
 ('storm-drain',drain,'Concrete kerb, open metal grate with missing and bent bars, recessed well and broken rubble.'),
 ('street-lamp',streetlamp,'Tapered standard, curved swan neck, rounded luminaire, diffuser, service hatch and anchors.'),
 ('rail-crossing',crossing,'Crossbuck, hooded dual signal lamps, broken striped gate, actuator and junction box.'),
]


def install(api):
    # Bind only the geometry API. The part list is fetched afresh per model,
    # since build.py deliberately starts a new editable collection each time.
    for key in ['box','rod','ring','mesh','bowed_panel','rubble']:
        globals()[key]=api[key]
    class Parts:
        def __len__(self):return len(api['parts'])
        def __getitem__(self,key):return api['parts'][key]
    globals()['parts']=Parts()
    DETAILS.update({name:description for name,_,description in CATALOG})
    return [(name,builder) for name,builder,_ in CATALOG]
