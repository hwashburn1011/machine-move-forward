"""Reference-scale mobile foundry, authored as four articulated mechanical legs.
Run with Blender --background --factory-startup --python this_file.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from kit import *

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
print('Authoring portable weathered materials',flush=True)
materials()
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
machine=group('IronNomad_FourLegWalker')
machine['assetId']='iron-nomad';machine['authoredPalette']=True
machine['description']='Reference-derived four-legged mobile industrial foundry'
machine['units']='meters';machine['forward']='-Y Blender / +Z glTF'
modules=[];legs=[];proxies=[]

def module(name,at=(0,0,0),parent=machine):
    g=group(name,at,parent);g['module']=True;modules.append(g);return g

def proxy(name,at,size):
    proxies.append({'name':name,'center':list(at),'size':list(size)})

print('Building three-level frame and walkways',flush=True)
frame=module('Chassis_StructuralFrame')
for z in [10.3,13.95,17.55]:
    for x in [-7.8,7.8]:
        box('Longitudinal box girder',(x,0,z),(.35,20.7,.44),M['dark'],frame,.035)
        for zz in [-.23,.23]:box('Girder flange',(x,0,z+zz),(.52,20.8,.075),M['steel'],frame,.012)
    for y in [-10,-6,-2,2,6,10]:
        box('Cross-deck I beam',(0,y,z),(16.2,.28,.4),M['dark'],frame,.02)
        box('Cross-beam lower flange',(0,y,z-.23),(16.4,.50,.085),M['steel'],frame,.01)
for x in [-7.8,7.8]:
    for y in [-9.8,-5.9,-2,2,5.9,9.8]:
        box('Three-deck steel column',(x,y,14),(.28,.32,7.8),M['dark'],frame,.025)
        for z in [10.5,14.0,17.6]:
            box('Bolted gusset',(x,y,z),(.50,.53,.55),M['steel'],frame,.025)
            for sy in [-1,1]:beam('Triangular deck brace',(x,y,z-1.6),(x,y+sy*1.6,z),.19,.21,M['dark'],frame)
        for z in [10.8,14.4]:
            for yy in [-.13,.13]:bolt('Structural rivet',(x+.17,y+yy,z),(1,0,0),M['brass'],frame,.055)
for y in [-9.8,9.8]:
    for x in [-5,-2,2,5]:beam('Front/rear diagonal girder',(x,y,9.4),(x+1.8,y,10.3),.2,.25,M['steel'],frame)

decks=module('Decks_and_PerimeterCatwalks')
for level,z in enumerate([10.6,14.2,17.8]):
    # Tile-sized plates give the source an editable walkable floor rather than a solid hull block.
    for x in [-6,-2,2,6]:
        for y in [-8,-4,0,4,8]:
            box('Deck %d steel floor panel'%level,(x,y,z-.12),(3.97,3.97,.24),M['dark'],decks,.018)
    proxy('Deck_%d'%level,(0,0,z-.12),(16,20,.24))
    for side in [-1,1]:
        x=side*8.65
        box('Perimeter walking ledge',(x,0,z-.10),(1.3,21,.18),M['steel'],decks,.02)
        if side==1:
            # Leave actual openings at the switchback stair landings.
            gaps=[(3.0,4.2)] if level in [0,2] else [(8.0,9.2)]
            cursor=-10.45
            for lo,hi in gaps:
                railing('Outer deck guardrail',(side*9.25,cursor,z),(side*9.25,lo,z),decks)
                cursor=hi
            railing('Outer deck guardrail',(side*9.25,cursor,z),(side*9.25,10.45,z),decks)
        else:railing('Outer deck guardrail',(side*9.25,-10.45,z),(side*9.25,10.45,z),decks)
        for y in np.arange(-10,10.1,.38):box('Open-grate transverse tread',(x,float(y),z+.012),(1.22,.045,.022),M['dark'],decks,.002)
        for y in [-8,-4,0,4,8]:
            beam('Catwalk corbel',(side*7.8,y,z-.75),(side*9.2,y,z-.13),.15,.17,M['dark'],decks)
    for y in [-10.5,10.5]:
        box('End balcony walking ledge',(0,y,z-.1),(18.5,1,.18),M['steel'],decks,.02)
        railing('End deck guardrail',(-9.25,y+(-.47 if y<0 else .47),z),(9.25,y+(-.47 if y<0 else .47),z),decks)
    for x in [-7,-3,1,5]:lamp('Deck edge amber marker',(x,-11.03,z-.08),decks,width=.70,height=.15)
    for y in [-7,-1,6]:lamp('Side deck edge task lamp',(9.34,y,z-.08),decks,normal=(1,0,0),width=.68,height=.15)

shell=module('Hull_WeatheredPanels')
# Lower story patchwork, with genuine openings toward workshops and stair landings.
for side in [-1,1]:
    for y in [-8.6,-5.7,-2.8,.1,3,5.9,8.7]:
        if side==1 and y in [-2.8,.1]:continue
        p=panel('Lower hull repair panel',(side*8.03,y,12.05),2.72,2.72,M['paint'] if y<6 else M['red'],shell,(side,0,0))
        if y in [-5.7,5.9]:vent('Lower ventilation grille',(side*8.10,y,12.2),1.48,.76,shell,(side,0,0))
    for y in [-8.4,-4.9,5.8,8.5]:
        panel('Upper side weather plate',(side*8.02,y,15.8),2.9,2.70,M['paint'],shell,(side,0,0))
    for y in [-7,7]:
        tube('Vertical side utility main',[(side*8.2,y,10.8),(side*8.22,y,14.5),(side*8.1,y+.2,18)],.09,M['brass'],shell)
for x in [-6.2,-3.1,0,3.1,6.2]:
    panel('Lower prow patch panel',(x,-10.04,12.05),2.98,2.74,M['paint'],shell)
for x in [-6,-2,2,6]:
    panel('Rear bulkhead',(x,10.05,12.06),3.85,2.76,M['paint'],shell,(0,1,0))
    if x!=2:panel('Rear upper bulkhead',(x,10.05,15.82),3.85,2.85,M['dark'],shell,(0,1,0))
for x in [-6,-1,4]:
    for z in [11,13.2]:
        tube('Prow patched conduit',[(x,-10.16,z),(x+.7,-10.18,z),(x+.85,-10.18,z+.3),(x+1.4,-10.16,z+.3)],.044,M['steel'],shell)
label('CAUTION  /  HIGH PRESSURE',(4.2,-10.1,12.2),.15,shell)
label('MK-IV',(-6.2,-10.1,12.4),.42,shell)

workshop=module('Open_Workshop_and_EngineBays')
# A deep, warmly illuminated service bay is visible behind the front walkways.
box('Workshop inner rear partition',(0,5,15.7),(15,.18,3),M['dark'],workshop,.025)
for x in [-5.8,-1.8,2.5,5.8]:
    box('Workshop overhead cable tray',(x,-2,17.12),(.3,13,.2),M['black'],workshop,.025)
    for y in [-7,-2,3]:
        lamp('Workshop suspended strip',(x,y,17.48),workshop,(0,0,-1),width=1.3,height=.12)
        anchor('Workshop warm fill',(x,y,16.9),workshop,role='area-light',watts=100)
for x in [-5.0,1.3,5.1]:
    for y in [-5.8,3.9]:
        box('Workshop bench top',(x,y,15.05),(2.6,.85,.12),M['steel'],workshop,.04)
        for dx in [-1.05,1.05]:box('Bench pedestal',(x+dx,y,14.6),(.18,.66,.86),M['dark'],workshop,.02)
        for dx in [-.75,0,.65]:box('Service tool case',(x+dx,y,15.29),(.45,.40,.34),M['red'] if dx==0 else M['dark'],workshop,.055)
for x in [-6,-3,0,3,6]:
    cylinder('Vertical pressure vessel',(x,4.15,14.25),(x,4.15,16.0),.38,M['steel'],workshop,n=36)
    sphere('Dished pressure tank crown',(x,4.15,16.02),(.38,.38,.21),M['steel'],workshop)
    tube('Tank pressure outlet',[(x,4.15,16.1),(x,4.15,16.6),(x+.4,4.2,16.7),(x+.4,4.7,16.7)],.065,M['brass'],workshop)
    ring('Pressure handwheel',(x,3.71,15.25),(0,-1,0),.18,.026,M['red'],workshop,n=32)
    cylinder('Instrument gauge',(x,3.72,15.66),(x,3.62,15.66),.11,M['ink'],workshop,n=32)
    box('Gauge needle',(x+.018,3.557,15.66),(.015,.012,.12),M['black'],workshop,.001,rotation=(0,.45,0))
for y in [-6,-3,0,3]:
    vent('Starboard workshop machine vent',(6.65,y,15.6),1.5,1.25,workshop,(1,0,0))
    box('Machine backing',(6.22,y,15.45),(.8,1.8,2.3),M['dark'],workshop,.13)
    lamp('Bay equipment status',(6.74,y,16.45),workshop,(1,0,0),'cyan',.38,.08)
    proxy('Workshop equipment',(6.2,y,15.4),(.9,1.8,2.4))

print('Sculpting front turbine and exposed pipework',flush=True)
fan=module('Front_Turbine_Housing',(-3.65,-10.3,15.9))
fan.rotation_euler=Vector((0,-1,0)).to_track_quat('Z','Y').to_euler()
cylinder('Turbine dark recess',(0,0,-.32),(0,0,-.10),1.82,M['black'],fan,n=96)
for z,r,minor in [(-.26,1.92,.18),(.04,1.89,.12),(.25,1.88,.10),(.31,1.71,.065)]:ring('Machined annular turbine casing',(0,0,z),(0,0,1),r,minor,M['steel'],fan,n=96)
rotor=group('Turbine_Rotor',(0,0,0),fan);rotor['articulation']='rotation around local Z'
for i in range(36):
    a=i*math.tau/36;verts=[]
    for r,twist,z in [(.45,-.16,.25),(1.1,-.10,.07),(1.72,0,.03)]:
        for da in [-.012,.095]:verts.append((r*math.cos(a+twist+da),r*math.sin(a+twist+da),z))
    blade=mesh('Swept turbine blade',verts,[(0,1,3,2),(2,3,5,4)],M['steel'],rotor)
    solid=blade.modifiers.new('Blade thickness','SOLIDIFY');solid.thickness=.035
for r,z in [(.45,.31),(.31,.39),(.16,.46)]:cylinder('Turbine concentric hub',(0,0,z-.12),(0,0,z),r,M['dark'] if r==.45 else M['brass'],rotor,n=48)
for i in range(24):
    a=i*math.tau/24;bolt('Intake casing bolt',(1.9*math.cos(a),1.9*math.sin(a),.34),(0,0,1),M['brass'],fan,.065)
for start,end in [(1.05,2.2),(.9,.94)]:
    tube('Cyan turbine status arc',[(1.99*math.cos(a),1.99*math.sin(a),.16) for a in np.linspace(start,end,28)],.027,M['cyan'],fan,False)
# Deep segmented intake drum, with stepped casing and longitudinal seams.
for i in range(24):
    a=i*math.tau/24;b=a+math.tau/24-.012
    vs=[(r*math.cos(t),r*math.sin(t),z) for z in [-.52,.56] for r in [1.94,2.10] for t in [a,b]]
    mesh('Curved turbine drum segment',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],M['steel'],fan,.006)
for z in [-.48,.51]:ring('Turbine drum rim band',(0,0,z),(0,0,1),2.105,.035,M['dark'],fan,n=96)
for child in rotor.children:child.location.z+=.33
for start,end in [(1.02,2.2)]:
    tube('Intake cyan running light',[(2.14*math.cos(a),2.14*math.sin(a),.58) for a in np.linspace(start,end,40)],.035,M['cyan'],fan,False)
box('Turbine support saddle',(0,-1.95,-.12),(2.5,.24,.9),M['dark'],fan,.05)
for x in [-7.2,2.2,6.7]:
    for y in [-9.6,9.7]:
        tube('Main steam transfer pipe',[(x,y,11.1),(x,y,14.2),(x+.3,y,14.9),(x+.3,y,17.6)],.13,M['brass'],workshop)
        for z in [12,13.2,15.4,17]:ring('Pipe coupling flange',(x,y,z),(0,0,1),.18,.037,M['steel'],workshop,n=24)

print('Building control house, navigation display and antenna rig',flush=True)
bridge=module('CommandHouse_and_Navigation',(-4.5,-5.6,17.8))
box('Command house lower structure',(0,0,1.1),(5.0,5.3,2.2),M['dark'],bridge,.12)
proxy('Command house',(-4.5,-5.6,18.9),(5.1,5.3,2.2))
for x in [-1.9,-.64,.64,1.9]:
    panel('Bridge window frame',(x,-2.68,2.45),1.18,1.26,M['steel'],bridge)
    box('Bridge smoked window',(x,-2.735,2.45),(1.04,.024,1.09),M['glass'],bridge,.025)
    cylinder('Window wiper',(x-.28,-2.77,1.98),(x+.19,-2.77,2.74),.012,M['black'],bridge,n=8)
for side in [-1,1]:
    for y in [-1.7,0,1.7]:
        panel('Command cabin side',(side*2.53,y,2.3),1.58,1.64,M['paint'],bridge,(side,0,0))
        box('Control cabin side window',(side*2.57,y,2.49),(.02,1.32,.98),M['glass'],bridge,.015)
box('Command cabin roof',(0,0,3.15),(5.8,6,.23),M['dark'],bridge,.045)
railing('Control roof guard',(-2.8,-2.9,3.3),(2.8,-2.9,3.3),bridge)
railing('Control roof guard',(-2.8,-2.9,3.3),(-2.8,2.9,3.3),bridge)
for x in [-2.2,0,2.2]:lamp('Bridge approach light',(x,-2.83,.62),bridge,width=.44,height=.20)
ladder('Bridge access ladder',(2.85,1.3,0),4.5,bridge)
display=group('Holographic_Navigation_Display',(-.4,-3.30,2.15),bridge)
display.rotation_euler=Vector((0,-1,0)).to_track_quat('Z','Y').to_euler()
box('Navigation terminal housing',(0,0,0),(3.35,4.18,.20),M['dark'],display,.08)
box('Blue navigation glass',(0,0,.12),(3.10,3.95,.035),M['glass'],display,.025)
for x in [-1.56,1.56]:box('Screen cyan bezel',(x,0,.153),(.022,3.91,.02),M['cyan'],display,.004)
for y in [-1.97,1.97]:box('Screen cyan bezel',(0,y,.153),(3.1,.022,.02),M['cyan'],display,.004)
for radius in [1.22,1.34,1.42]:
    tube('Navigation circular sweep',[(radius*math.cos(a),radius*math.sin(a)+.15,.158) for a in np.linspace(0,math.tau,100)],.008,M['cyan'],display,False)
for scale in [.25,.5,.75]:
    tube('Globe meridian',[(1.20*scale*math.cos(a),1.20*math.sin(a)+.15,.159) for a in np.linspace(0,math.tau,80)],.006,M['cyan'],display,False)
for y in [-.75,-.38,0,.38,.75]:
    reach=math.sqrt(1.2**2-y*y)
    tube('Globe latitude',[(-reach,y+.15,.16),(0,y+.15-.09,.16),(reach,y+.15,.16)],.006,M['cyan'],display)
for points in [[(-.12,.93),(.1,.76),(.28,.71),(.20,.49),(.34,.32),(.55,.18),(.48,-.09),(.28,-.55),(.10,-.68),(-.04,-.28),(-.21,.04),(-.16,.30),(-.44,.46),(-.25,.67)],
    [(-.62,.92),(-.89,.72),(-.96,.39),(-.67,.31),(-.64,.11),(-.47,.03),(-.40,-.15),(-.28,-.19)],
    [(-.36,-.2),(-.60,-.20),(-.73,-.33),(-.57,-.55),(-.61,-.72),(-.43,-.94),(-.29,-.54),(-.36,-.2)]]:
    tube('Cartographic coast outline',[(x,y+.15,.166) for x,y in points],.018,M['cyan'],display,False)
label('NAV // TERRAIN SCAN',(0,1.73,.175),.10,display,(0,0,1),M['cyan']).rotation_euler=(0,0,0)
label('VECTOR  048.7  /  SECTOR 04',(0,-1.53,.175),.075,display,(0,0,1),M['cyan']).rotation_euler=(0,0,0)
for j in range(7):
    y=-1.78+j*.04;box('Diagnostic data row',(-.6,y,.167),(rng.uniform(.2,.8),.006,.003),M['cyan'],display,0)

comms=module('Communications_Masts')
for k,(x,y,height) in enumerate([(-5.5,-4.3,8.8),(-1.8,-3,8.2),(-5.1,3.4,5.9)]):
    base=21 if k==0 else 18
    mast=group('Lattice mast %d'%k,(x,y,base),comms)
    w=.42 if k==0 else .30
    for xx,yy in [(-w,-w),(w,-w),(0,w)]:cylinder('Mast upright',(xx,yy,0),(xx*.25,yy*.25,height),.035,M['steel'],mast,n=12)
    for z in np.arange(.15,height-.5,.65):
        a=w*(1-z/height*.7);b=w*(1-(z+.65)/height*.7)
        for side in [-1,1]:beam('Mast diagonal lattice',(side*a,-a,float(z)),(-side*b,-b,float(z+.65)),.026,.026,M['brass'],mast,.002)
    cylinder('Whip antenna',(0,0,height-.1),(0,0,height+1.55),.018,M['steel'],mast,n=10)
    for z in [height*.45,height*.73,height]:
        cylinder('Antenna loading collar',(0,0,z-.10),(0,0,z+.10),.068,M['brass'],mast,n=16)
    if k==0:
        box('Upper radio lookout shelter',(0,0,2.0),(1.75,1.8,1.6),M['paint'],mast,.07)
        for xx in [-.48,.48]:box('Lookout window',(xx,-.923,2.15),(.60,.025,.68),M['glass'],mast,.018)
        box('Lookout service platform',(0,0,1.05),(2.5,2.65,.16),M['dark'],mast,.025)
        railing('Lookout balcony',(-1.2,-1.3,1.14),(1.2,-1.3,1.14),mast)
    lamp('Mast signal beacon',(0,-.18,height*.83),mast,color='cyan',width=.18,height=.12)
    for yy in [-2,2]:tube('Tensioned antenna stay',[(x,y,base+height*.8),(x+1.2,y+yy,base-.2)],.012,M['black'],comms,False)

print('Constructing twin furnace towers',flush=True)
stacks=module('Twin_Exhaust_Furnaces')
for index,(x,y,height) in enumerate([(3.8,3.0,7.8),(3.8,7.1,6.9)]):
    g=group('Furnace_%s'%('A' if index==0 else 'B'),(x,y,17.8),stacks)
    cylinder('Furnace lower skirt',(0,0,0),(0,0,1.25),1.50,M['dark'],g,r2=1.19,n=72)
    cylinder('Riveted stack shell',(0,0,1.05),(0,0,height-.3),1.12,M['paint'],g,n=80)
    for z in [.4,1.2,2.2,3.6,height-2.0,height-.15]:
        ring('Stack rolled steel collar',(0,0,z),(0,0,1),1.16,.095,M['steel'],g,n=72)
    # Upper square-grid cage, standing clear of the black heat exchanger.
    cylinder('Upper heat exchanger soot',(0,0,height-2.5),(0,0,height+.04),1.135,M['black'],g,n=72)
    for z in np.arange(height-2.4,height-.28,.17):
        ring('Heat exchanger grill ring',(0,0,float(z)),(0,0,1),1.23,.022,M['brass'],g,n=64)
    for i in range(28):
        a=i*math.tau/28;c,s=math.cos(a),math.sin(a)
        cylinder('Exhaust cage vertical',(1.24*c,1.24*s,height-2.50),(1.24*c,1.24*s,height+.23),.026,M['steel'],g,n=10)
        if i%4==0:
            cylinder('Stack longitudinal reinforcement',(1.16*c,1.16*s,1.0),(1.16*c,1.16*s,height-.12),.07,M['dark'],g,n=12)
            for z in [1.4,3.6,height-2.2]:bolt('Stack rivet',(1.21*c,1.21*s,z),(c,s,0),M['brass'],g,.055)
    for z in [height-.48,height-.61]:ring('Orange furnace heat slot',(0,0,z),(0,0,1),1.16,.038,M['amber'],g,n=72)
    ring('Exhaust crown lip',(0,0,height+.05),(0,0,1),1.22,.14,M['steel'],g,n=72)
    cylinder('Dark open exhaust throat',(0,0,height-.30),(0,0,height-.27),1.10,M['black'],g,n=72)
    for z in [height-1.8,height+.30]:ring('Service crown railing',(0,0,z),(0,0,1),1.42,.035,M['brass'],g,n=72)
    for i in range(12):
        a=i*math.tau/12;c,s=math.cos(a),math.sin(a)
        cylinder('Crown handrail post',(1.42*c,1.42*s,height-.3),(1.42*c,1.42*s,height+.3),.026,M['brass'],g,n=10)
    ladder('Furnace service ladder',(-1.39,0,.25),height+.25,g)
    tube('External steam return',[(1.08,-.30,height-.1),(1.55,-.30,height-.3),(1.6,-.3,2.6),(2,-.4,1.5),(2,-1.0,.3)],.10,M['brass'],g)
    for z in [1.7,2,2.3]:lamp('Furnace blue readout',(0,-1.18,z),g,color='cyan',width=.54,height=.045)
    anchor('Exhaust_%s'%('A' if index==0 else 'B'),(0,0,height+.10),g,role='exhaust',radius=1.03)
    proxy('Furnace_%d'%index,(x,y,17.8+height/2),(3,3,height))

print('Adding cloth canopy, banner and suspended crane load',flush=True)
fabric=module('Canvas_and_Rigging')
# Woven banner texture and worn, faded double chevrons. All pixels are original.
size=2048;y,x=np.mgrid[:size,:size]/size
base=np.zeros((size,size,3))+np.array((.20,.051,.024));n=noise(size,28,290)
chevron=np.zeros((size,size))
for h in [.58,.77]:
    line=h+.42*np.abs(x-.5)
    chevron=np.maximum(chevron,((y>line-.075)&(y<line)&(x>.13)&(x<.87)).astype(float))
fade=.88-.15*noise(size,113,792)
fade*=np.where(noise(size,247,943)>.70,.18,1)
base=base*(1-chevron[:,:,None]*fade[:,:,None])+np.array((.69,.63,.49))*chevron[:,:,None]*fade[:,:,None]
base*= (.7+.48*n)[:,:,None]
banner_mat=plain('Nomad_FadedChevron_Canvas',(.3,.085,.042),0,.97)
nodes=banner_mat.node_tree.nodes;links=banner_mat.node_tree.links
tex=nodes.new('ShaderNodeTexImage');tex.image=save_image('ChevronBanner_BaseColor',base,True)
links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
banner=group('Hanging_Chevron_Banner',(9.38,.1,17.55),fabric)
verts=[];faces=[];nx,ny=32,56
for j in range(ny+1):
    v=j/ny
    for i in range(nx+1):
        u=i/nx;edge=.13*math.sin(i*1.7)+.09*math.sin(i*4.1)
        verts.append((.10+.16*math.sin(u*math.tau*3+.5*v)+.20*v*v, (u-.5)*3.65, -v*(6.4+edge)))
for j in range(ny):
    for i in range(nx):
        if (j==ny-1 and i%7 in [0,1]) or (j>ny-4 and i in [0,nx-1]):continue
        k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
ob=mesh('Tailored hanging banner',verts,faces,banner_mat,banner)
for p in ob.data.polygons:
    p.use_smooth=True
    for li in p.loop_indices:
        idx=ob.data.loops[li].vertex_index;ob.data.uv_layers.active.data[li].uv=(idx%(nx+1)/nx,1-(idx//(nx+1))/ny)
solid=ob.modifiers.new('Heavy double-faced canvas','SOLIDIFY');solid.thickness=.012
for j in range(12):
    yy=(j/11-.5)*3.65
    ring('Banner steel eyelet',(.11,yy,-.09),(1,0,0),.047,.012,M['brass'],banner,n=16)
    tube('Banner lash rope',[(.14,yy,-.09),(-.18,yy,.05),(-.28,yy,.17)],.016,M['cloth'],banner)
for i in range(38):
    yy=rng.uniform(-1.7,1.7)
    tube('Frayed banner lower yarn',[(.3,yy,-6.38),(.31,yy+.03,-6.45-rng.random()*.18)],.004,M['cloth'],banner,False)

canopy_corners=[(-4,-.8,21.9),(2.2,-.6,22.6),(-4.5,4.6,21.0),(1.8,5.0,21.5)]
vs=[];fs=[];nu,nv=24,24
for j in range(nv+1):
    v=j/nv
    for i in range(nu+1):
        u=i/nu;a=Vector(canopy_corners[0]).lerp(Vector(canopy_corners[1]),u);b=Vector(canopy_corners[2]).lerp(Vector(canopy_corners[3]),u)
        p=a.lerp(b,v);p.z-=1.2*math.sin(u*math.pi)*math.sin(v*math.pi)+.17*math.sin(u*9)*math.sin(v*math.pi)
        vs.append(tuple(p))
for j in range(nv):
    for i in range(nu):k=j*(nu+1)+i;fs.append((k,k+1,k+nu+2,k+nu+1))
ob=mesh('Sagging weather canopy',vs,fs,M['cloth'],fabric)
for p in ob.data.polygons:p.use_smooth=True
sol=ob.modifiers.new('Canvas hem thickness','SOLIDIFY');sol.thickness=.025
for corner in canopy_corners:
    p=Vector(corner);cylinder('Awning mast',(p.x,p.y,17.8),(p.x,p.y,p.z+.8),.047,M['steel'],fabric,n=16)
    tube('Canopy tension line',[p,p+Vector((.45,.4,.75))],.016,M['cloth'],fabric,False)

crane=module('CargoCrane_Yaw',(6.9,6.0,18.0))
crane['articulation']='rotation around local Z';crane['yawLimitsDegrees']='-35,+35'
cylinder('Crane slew bearing',(0,0,0),(0,0,.42),.91,M['dark'],crane,n=64)
for i in range(24):
    a=i*math.tau/24;bolt('Slew bearing bolts',(.77*math.cos(a),.77*math.sin(a),.44),(0,0,1),M['brass'],crane,.045)
box('Crane pedestal',(0,0,1.05),(1.2,1.35,1.25),M['red'],crane,.12)
jib=group('Crane_Jib',(0,0,1.5),crane)
for yy in [-.38,.38]:
    for zz in [-.30,.30]:beam('Crane lattice chord',(0,yy,zz),(9.3,yy+1.2,3.0+zz),.11,.11,M['steel'],jib,.01)
for i in range(11):
    t=i/10;xx=t*9.3;yy=t*1.2;zz=t*3
    beam('Jib transverse rung',(xx,yy-.4,zz-.3),(xx,yy+.4,zz+.3),.065,.065,M['dark'],jib,.006)
    if i<10:
        for side in [-1,1]:beam('Jib triangulated web',(xx,yy+side*.38,zz-.30),(xx+.93,yy+.12+side*.38,zz+.6),.07,.07,M['brass'],jib,.008)
cylinder('Crane hydraulic ram',(-.3,0,.45),(3.5,.48,1.5),.18,M['dark'],crane,n=32)
cylinder('Crane polished piston',(3.5,.48,1.5),(5.3,.7,3.0),.085,M['chrome'],crane,n=28)
for yy in [-.2,.2]:ring('Crane cable sheave',(9.3,1.2+yy,3.0),(0,1,0),.22,.06,M['steel'],jib,n=32)
load=group('Hoist_Load',(9.3,1.2,-3.1),jib)
load['articulation']='vertical translation under jib tip'
for yy in [-.13,.13]:cylinder('Hoist suspension cable',(9.3,1.2+yy,3),(9.3,1.2+yy,-1.6),.018,M['black'],jib,n=10)
ring('Forged lifting hook',(0,0,1.35),(0,1,0),.18,.045,M['steel'],load,n=32)
box('Suspended shipping crate',(0,0,0),(1.65,1.65,1.70),M['wood'],load,.045)
for z in [-.78,.78]:
    for x in [-.73,.73]:box('Crate steel corner strap',(x,0,z),(.075,1.72,.095),M['steel'],load,.006)
for x in [-.78,.78]:
    for yy in [-.78,.78]:
        box('Crate corner reinforcement',(x,yy,0),(.10,.10,1.76),M['dark'],load,.008)
        cylinder('Four-point crate sling',(x,yy,.84),(0,0,1.5),.018,M['black'],load,n=10)
for xx in [-.55,-.18,.18,.55]:box('Crate planking groove',(xx,-.834,0),(.012,.005,1.55),M['black'],load,0)
label('LIFT  /  04',(0,-.85,.15),.15,load)

print('Adding external stairs, floodlight towers and service clutter',flush=True)
access=module('External_Stairs_Ladders')
for level,z in enumerate([10.6,14.2]):
    x=9.65;start=3.6 if level==0 else 8.6;run=5.0 if level==0 else -5.0;rise=3.6
    for i in range(18):
        yy=start+i*run/18;zz=z+i*rise/18
        box('External steel stair tread',(x,yy,zz),(1.25,.30,.08),M['steel'],access,.009)
        proxy('Stair_%d_%d'%(level,i),(x,yy,zz-.04),(1.25,.30,.08))
    for xx in [x-.57,x+.57]:
        beam('Stair inclined stringer',(xx,start,z-.1),(xx,start+run,z+rise-.1),.14,.16,M['dark'],access)
        for i in range(7):
            t=i/6;cylinder('Stair guardrail upright',(xx,start+t*run,z+t*rise),(xx,start+t*run,z+t*rise+1.0),.028,M['brass'],access,n=12)
        cylinder('Continuous stair handrail',(xx,start,z+1),(xx,start+run,z+rise+1),.033,M['brass'],access,n=14)
ladder('Prow interdeck ladder',(1.3,-11.2,10.7),7.8,access)
ladder('Rear escape ladder',(-6.8,11.2,10.7),7.8,access)
lights=module('Lamps_and_UtilityTowers')
for x,y,h in [(-8,-9,3.5),(8,8.5,4.2),(8,-8.8,2.8),(-8,8.8,3.0)]:
    g=group('Floodlight tower',(x,y,17.8),lights)
    for xx,yy in [(-.15,-.15),(.15,-.15),(-.15,.15),(.15,.15)]:beam('Floodlight lattice post',(xx,yy,0),(xx*.8,yy*.8,h),.035,.035,M['steel'],g,.004)
    for z in np.arange(.3,h,.55):
        beam('Floodlight tower cross brace',(-.15,-.15,float(z)),(.15,-.15,float(z+.45)),.028,.028,M['brass'],g,.002)
    box('Caged floodlight core',(0,0,h+.26),(.50,.5,.62),M['lamp'],g,.025)
    for side in [-1,1]:
        for yy in [-.3,0,.3]:box('Floodlight cage upright',(side*.3,yy,h+.28),(.04,.04,.85),M['dark'],g,.006)
    for z in [h-.12,h+.22,h+.65]:
        box('Flood cage frame',(0,-.31,z),(.68,.045,.045),M['dark'],g,.004)
        box('Flood cage frame',(0,.31,z),(.68,.045,.045),M['dark'],g,.004)
    anchor('Floodlight',(0,0,h+.28),g,color='warm',watts=100)
for side in [-1,1]:
    for y in [-7,4]:
        lamp('Cyan side status strip',(side*9.31,y,14.12),lights,(side,0,0),'cyan',2.45,.055)
        lamp('Cyan underbody marker',(side*6.8,y,10.08),lights,(side,0,-.3),'cyan',.80,.065)
for x in [-6.4,6.4]:lamp('Vertical prow cyan strip',(x,-10.22,15.2),lights,width=.08,height=1.2,color='cyan')

clutter=module('Cargo_Cables_and_ServiceAccessories')
for x,y,z in [(-6.2,5.8,18),(0,7.6,18),(6.5,-6.3,18),(-6.4,7.6,14.35),(-5,-5,10.8)]:
    box('Secured weatherproof cargo locker',(x,y,z+.52),(1.5,1.2,1.04),M['paint'],clutter,.07)
    for dx in [-.53,.53]:box('Cargo locker steel band',(x+dx,y,z+.52),(.08,1.24,1.10),M['dark'],clutter,.01)
    for dy in [-.64,.64]:
        cylinder('Locker carry handle',(x-.16,y+dy,z+.62),(x+.16,y+dy,z+.62),.025,M['steel'],clutter,n=12)
for y in [-8,-3,3,8]:
    for side in [-1,1]:
        tube('Undercarriage hanging hose',[(side*6.7,y,10.15),(side*7.3,y-.3,9.0),(side*7.1,y+.3,8.65),(side*6.2,y+.7,9.6)],.055,M['rubber'],clutter)
        tube('Side utilities cable bundle',[(side*8.1,y,13.65),(side*8.4,y+1,13.22),(side*8.3,y+2.1,13.5)],.032,M['black'],clutter)
for y in [-8,-4,0,4,8]:
    cylinder('Underfloor pressure accumulator',(-5.6,y,9.92),(5.6,y,9.92),.19,M['dark'],clutter,n=24)
for x,y in [(-7,6),(7,-5),(-4,8)]:
    cylinder('Service drum',(x,y,18),(x,y,19.05),.35,M['red'],clutter,n=40)
    for z in [18.1,18.55,19.0]:ring('Drum strengthening bead',(x,y,z),(0,0,1),.36,.023,M['steel'],clutter,n=32)
for a,b in [((-8,-9,21.5),(8,8.5,22)),((-5.5,-4.3,28.5),(8,8.5,22)),((-8,8.8,20.8),(8,-8.8,20.6))]:
    mid=(Vector(a)+Vector(b))*.5;mid.z-=.7;tube('Aerial power span',[a,tuple(mid),b],.016,M['black'],clutter)

print('Constructing exactly four articulated, plated leg assemblies',flush=True)
def direction_frame(a,b):
    z=(Vector(b)-Vector(a)).normalized();x=Vector((1,0,0));x=(x-z*x.dot(z)).normalized();y=z.cross(x)
    return Matrix(((x.x,y.x,z.x),(x.y,y.y,z.y),(x.z,y.z,z.z))).to_quaternion()

def leg_segment(name,length,parent,wide=1):
    box('Load-bearing leg spine',(0,0,length*.5),(1.15*wide,1.02,length-.3),M['dark'],parent,.15)
    for x in [-.54,.54]:
        beam('Leg longitudinal steel rail',(x*wide,-.44,.25),(x*wide,-.44,length-.25),.22,.26,M['steel'],parent,.035)
        cylinder('Exposed hydraulic barrel',(x*wide,-.82,.65),(x*wide,-.82,length*.63),.13,M['dark'],parent,n=28)
        cylinder('Polished hydraulic rod',(x*wide,-.82,length*.53),(x*wide,-.82,length-.12),.068,M['chrome'],parent,n=24)
    # Shaped six-sided armor leaves the joint bearings and pistons visible.
    for j,(lo,hi) in enumerate([(.30,length*.45),(length*.48,length-.22)]):
        pts=[(-.85*wide,lo+.15),(-.56*wide,lo),(.59*wide,lo),(.88*wide,lo+.21),(.74*wide,hi-.12),(.48*wide,hi),(-.65*wide,hi),(-.89*wide,hi-.35)]
        vs=[(x,y,z) for y in [.50,.75] for x,z in pts];n=len(pts)
        fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh('Chamfered leg armor panel',vs,fs,M['paint'] if j==0 else M['red'],parent,.035)
        for x,z in pts[::2]:bolt('Armor captive bolt',(x,.79,z+.04),(0,1,0),M['steel'],parent,.072)
        for k in range(5):
            xx=rng.uniform(-.62,.62)*wide;zz=rng.uniform(lo+.1,hi-.1)
            box('Sparse leg plate chip',(xx,.792,zz),(rng.uniform(.04,.13),.005,rng.uniform(.015,.05)),M['dark'],parent,0)
    for side in [-1,1]:
        for z in [.14,length-.10]:
            cylinder('Leg hinge bearing',(side*.55*wide,0,z),(side*.95*wide,0,z),.53,M['dark'],parent,n=56)
            cylinder('Concentric machined bearing',(side*.95*wide,0,z),(side*1.0*wide,0,z),.39,M['steel'],parent,n=48)
            ring('Bearing face seal',(side*1.02*wide,0,z),(side,0,0),.28,.035,M['brass'],parent,n=40)
            for i in range(10):
                a=i*math.tau/10;bolt('Joint retaining fastener',(side*1.04*wide,.33*math.cos(a),z+.33*math.sin(a)),(side,0,0),M['steel'],parent,.044)
    lamp('Leg joint cyan status',(0,.81,length*.3),parent,(0,1,0),'cyan',.10,.42)
    for x in [-.82,.82]:tube('Flexible leg service hose',[(x*wide,-.12,.05),(x*wide*1.12,-.45,length*.30),(x*wide,-.32,length*.65),(x*wide,0,length)],.039,M['rubber'],parent)

for index,(name,sx,sy) in enumerate([('FrontLeft',-1,-1),('FrontRight',1,-1),('RearLeft',-1,1),('RearRight',1,1)]):
    hip=Vector((sx*6.5,sy*6.0,9.6));knee=Vector((sx*8.7,sy*5.1,5.05));foot=Vector((sx*9.35,sy*8.0,1.0))
    hip_g=module('Leg_'+name+'_Hip',tuple(hip));hip_g['legId']=name
    for z,r in [(.0,.92),(.12,.76)]:
        cylinder('Massive hip bearing',(-.88,0,z),(.88,0,z),r,M['dark'],hip_g,n=64)
        for side in [-1,1]:ring('Hip face machined ring',(side*.93,0,z),(side,0,0),r*.74,.06,M['steel'],hip_g,n=48)
    upper=module('Leg_'+name+'_Upper',(0,0,0),hip_g);upper.rotation_mode='QUATERNION';upper.rotation_quaternion=direction_frame(hip,knee)
    lower=module('Leg_'+name+'_Lower',tuple(knee));lower.rotation_mode='QUATERNION';lower.rotation_quaternion=direction_frame(knee,foot)
    foot_g=module('Leg_'+name+'_Foot',tuple(foot))
    l1=(knee-hip).length;l2=(foot-knee).length
    leg_segment(name+'_Upper',l1,upper,1.40)
    leg_segment(name+'_Lower',l2,lower,1.12)
    # Toe pads, rear heel and ankle articulation are separate manufactured forms.
    box('Articulated ankle housing',(0,0,.08),(1.7,1.65,1.1),M['dark'],foot_g,.20)
    cylinder('Ankle transverse axle',(-1.07,0,.05),(1.07,0,.05),.37,M['steel'],foot_g,n=48)
    for side in [-1,1]:ring('Ankle drive seal',(side*1.08,0,.05),(1,0,0),.26,.04,M['brass'],foot_g,n=32)
    for xx in [-.80,0,.80]:
        toe=group('Load spreading toe',(xx,-.86,-.51),foot_g)
        box('Broad segmented toe pad',(0,-.45,0),(.76,2.15,.67),M['dark'],toe,.16)
        box('Toe abrasion plate',(0,-.65,.34),(.69,1.48,.11),M['paint'],toe,.055,rotation=(.09,0,0))
        for yy in [-1.21,-.67,-.11]:box('Steel toe traction lug',(0,yy,-.37),(.80,.20,.12),M['steel'],toe,.024)
        for yy in [-1.18,-.10]:bolt('Toe fastener',(0,yy,.41),(0,0,1),M['steel'],toe,.072)
    box('Broad heel pad',(0,.88,-.52),(2.25,1.0,.65),M['dark'],foot_g,.15)
    label('04',(0,.81,l1*.55),.15,upper,(0,1,0)).rotation_euler.rotate_axis('Z',math.pi)
    for child in foot_g.children:
        child.location.x*=1.16;child.location.y*=1.12;child.scale.x*=1.16;child.scale.y*=1.12
    anchor('FootContact_'+name,(0,-.65,-.98),foot_g,role='foot-contact')
    legs.append({'id':name,'hip':hip_g,'upper':upper,'lower':lower,'foot':foot_g,'H':hip,'K':knee,'F':foot,'l1':l1,'l2':l2,'phase':index*.25})

print('Refining dense machinery, antenna equipment, bearing covers and cable runs',flush=True)
details=module('Reference_Refinement_Details')
for sx in [-1,1]:
    for y in [-4.5,3.8]:
        x=sx*3.9
        box('Suspended undercarriage reduction gearbox',(x,y,9.18),(3.15,2.15,1.12),M['dark'],details,.18)
        cylinder('Belly-mounted drive motor',(x,y-1.0,9.3),(x,y+1.2,9.3),.48,M['steel'],details,n=48)
        for yy in np.arange(y-.8,y+1.0,.15):ring('Drive motor cooling fin',(x,float(yy),9.3),(0,1,0),.51,.026,M['dark'],details,n=40)
        for dx in [-1.5,1.5]:
            tube('Belly hydraulic return',[(x+dx,y-.8,10),(x+dx,y-.8,9.0),(x+dx*.85,y,8.65),(x+dx*.65,y+.8,9.3)],.095,M['brass'],details)
        for j in range(5):
            tube('Underbody bundled control loom',[(x-.7+j*.15,y,10.1),(x-.8+j*.15,y+.5,8.45),(x+.7,y+1,8.8)],.024,M['rubber'],details)
        for dx in [-.65,.65]:
            for dy in [-.72,.72]:
                for j in range(5):
                    ring('Heavy hanging service chain',(x+dx,y+dy,9.95-j*.12),(0,1,0) if j%2 else (1,0,0),.068,.019,M['steel'],details,n=16)
for x,y in [(-2.0,-1.4),(2.0,1.9)]:
    box('Workshop pump skid',(x,y,14.36),(2.6,1.55,.24),M['dark'],details,.045)
    cylinder('Workshop pump motor',(x-.9,y,14.9),(x+.55,y,14.9),.42,M['dark'],details,n=48)
    for xx in np.arange(x-.85,x+.5,.14):ring('Pump cooling rib',(float(xx),y,14.9),(1,0,0),.45,.025,M['steel'],details,n=36)
    cylinder('Volute pump endcase',(x+.6,y,14.9),(x+1.0,y,14.9),.51,M['red'],details,n=48)
    tube('Bent pump discharge',[(x+.95,y,15),(x+.95,y,15.75),(x+.55,y,16.0),(x+.55,y+1.2,16)],.12,M['brass'],details)
    for z in [15.6,15.76]:ring('Discharge flanged coupling',(x+.95,y,z),(0,0,1),.18,.035,M['steel'],details,n=32)
    ring('Pump isolation handwheel',(x+.9,y-.45,15.4),(0,-1,0),.23,.028,M['red'],details,n=32)
    for dx in [-.5,.4]:
        tube('Workshop loose service hose',[(x+dx,y-.65,14.3),(x+dx+.3,y-1.0,14.29),(x+dx+.6,y-1.3,14.28),(x+dx+.9,y-.4,14.29)],.04,M['black'],details)
for x,y,z in [(-6.7,-5.0,23.7),(-3.3,-5.7,24.6),(-1.8,-3,22.4)]:
    beam('Microwave reflector mounting bracket',(x,y+.26,z-.1),(-5.5 if x<-3 else -1.8,-4.3 if x<-3 else -3,z-.20),.055,.055,M['steel'],details,.008)
    g=group('Microwave aerial dish',(x,y,z),details);g.rotation_euler=(math.pi/2,.15,.2)
    vs=[(0,0,-.12)];fs=[];nr,nc=6,48
    for j in range(1,nr+1):
        r=.38*j/nr
        for i in range(nc):a=i*math.tau/nc;vs.append((r*math.cos(a),r*math.sin(a),-.12+.20*(r/.38)**2))
    for i in range(nc):fs.append((0,1+i,1+(i+1)%nc))
    for j in range(nr-1):
        for i in range(nc):a=1+j*nc+i;b=1+j*nc+(i+1)%nc;fs.append((a,b,b+nc,a+nc))
    o=mesh('Concave microwave reflector',vs,fs,M['paint'],g)
    for p in o.data.polygons:p.use_smooth=True
    cylinder('Dish feed horn',(0,0,0),(0,0,.45),.035,M['steel'],g,n=16)
    for a in [0,math.tau/3,math.tau*2/3]:cylinder('Dish feed support',(.34*math.cos(a),.34*math.sin(a),.04),(0,0,.35),.012,M['dark'],g,n=10)
for x,y in [(-6.5,-4.9),(-4.5,-5.5)]:
    tube('Command tower segmented riser',[(x,y,18),(x,y,22.2),(x+.3,y,22.8),(x+.3,y,25.4)],.08,M['steel'],details)
    for z in np.arange(18.5,25,.65):ring('Antenna cable clamp',(x,y,float(z)),(0,0,1),.105,.021,M['brass'],details,n=20)
for z in [22.8,24.0]:
    beam('Lookout tower cross brace',(-6.4,-5.1,z),(-4.6,-3.5,z+1.1),.10,.11,M['dark'],details)
for x in [-6.1,-4.9]:
    for y in [-4.9,-3.7]:
        beam('Lookout shelter support post',(x,y,21),(x,y,22.10),.085,.085,M['dark'],details,.012)
    beam('Lookout shelter bracing',(x,-4.9,21),(x,-3.7,22.1),.06,.06,M['steel'],details,.008)
for x,y in [(-7.2,-8.6),(6.0,-8.3),(-7.4,7.8)]:
    for z in [15.0,15.3,15.6]:
        panel('Small utility cabinet',(x,y,z),.72,.26,M['dark'],details)
        for dx in [-.2,0,.2]:cylinder('Cabinet control switch',(x+dx,y-.07,z),(x+dx,y-.1,z),.025,M['signal'] if dx==0 else M['steel'],details,n=12)
for y in [-8.8,-5,-1,3.3,7.8]:
    for side in [-1,1]:
        for j in range(3):
            tube('Bundled exposed side wiring',[(side*8.22,y,17.35-j*.06),(side*8.33,y+1.0,16.95-j*.06),(side*8.35,y+2,17.1-j*.06)],.015,M['black'],details)
for l in legs:
    for seg,length,w in [(l['upper'],l['l1'],1.40),(l['lower'],l['l2'],1.12)]:
        for z in [.14,length-.10]:
            for s in [-1,1]:
                cylinder('Raised hexagonal bearing dust cap',(s*1.04*w,0,z),(s*1.11*w,0,z),.19,M['dark'],seg,n=6)
        for s in [-1,1]:
            tube('High pressure knee hose',[(s*.5*w,-.82,length-.3),(s*.75*w,-.9,length+.25),(s*.8*w,-.4,length+.48)],.055,M['rubber'],seg)
        # Layered cheek armor, recessed inspection covers, stiffeners and seam
        # hardware break up the large plate faces without hiding the actuators.
        for s in [-1,1]:
            for lo,hi in [(.60,length*.43),(length*.53,length-.58)]:
                points=[(s*.66*w,.55,lo),(s*.96*w,.13,lo+.22),(s*.89*w,-.36,lo+.32),
                        (s*.82*w,-.41,hi-.16),(s*.72*w,.40,hi),(s*.65*w,.59,hi-.13)]
                vs=points+[(x+s*.11,y,z) for x,y,z in points]
                mesh('Layered leg flank armor',vs,[tuple(reversed(range(6))),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)],M['steel'],seg,.025)
                for z in [lo+.36,hi-.20]:bolt('Cheek plate clamp',(s*.97*w,.11,z),(s,0,0),M['brass'],seg,.060)
        for center in [length*.29,length*.69]:
            box('Recessed leg inspection frame',(.13*w,.805,center),(.92*w,.08,.70),M['dark'],seg,.035)
            box('Inset leg service hatch',(.13*w,.859,center),(.76*w,.052,.54),M['steel'],seg,.03)
            for dx in [-.26,.50]:
                for dz in [-.21,.21]:bolt('Service hatch captive screw',(dx*w,.89,center+dz),(0,1,0),M['brass'],seg,.037)
            beam('Armor diagonal welded stiffener',(-.62*w,.81,center-.36),(.60*w,.81,center+.43),.055,.045,M['dark'],seg,.008)
            box('Forged armor lifting lug',(-.62*w,.84,center+.28),(.12,.16,.19),M['steel'],seg,.03)
        for j in range(6):
            z=length*.42+j*.105
            box('Recessed actuator cooling slot',(0,-.536,z),(.80*w,.025,.045),M['black'],seg,.006)

# Uneven, layered repairs and routed services are most visible at player height.
for x,z,w,h in [(-5.7,11.2,.72,.40),(-2.6,12.3,1.15,.75),(.7,11.35,1.4,.45),(3.2,12.65,.84,.54),(5.9,11.1,1.15,.6)]:
    g=panel('Riveted overlapping hull repair',(x,-10.10,z),w,h,M['steel'] if x<0 else M['red'],details)
    g.rotation_euler.rotate_axis('Z',rng.uniform(-.06,.06))
for x in [-7.0,-3.8,2.0,5.2]:
    box('Lower hull vertical edge reinforcement',(x,-10.115,12),(.09,.08,2.25),M['dark'],details,.012)
    for z in [11.1,11.7,12.3,12.9]:bolt('Hull reinforcement rivet',(x,-10.17,z),(0,-1,0),M['steel'],details,.042)
for x in [1.8,4.9]:
    box('Front bay suspended distribution board',(x,-8.9,16.2),(1.12,.28,1.05),M['dark'],details,.05)
    for z in [15.85,16.20,16.55]:
        for dx in [-.33,0,.33]:cylinder('Distribution panel relay',(x+dx,-9.06,z),(x+dx,-9.12,z),.045,M['signal'] if dx==0 else M['steel'],details,n=16)
    for dx in [-.35,.35]:tube('Distribution armored conduit',[(x+dx,-9,15.8),(x+dx,-9.1,15.2),(x+.5,-9,14.4)],.035,M['black'],details)
for y in [-7.3,-2.4,4.2]:
    for j in range(3):tube('Front bay overhead copper manifold',[(-6,-8.8+y*.04,17.1-j*.16),(-1,-8.8+y*.04,17.1-j*.16),(2,-8.4,17.1-j*.16),(4,-8.4,16.6-j*.16)],.042,M['brass'],details)
for y,z in [(-4.7,12.5),(6.3,15.4)]:
    panel('Starboard service access hatch',(8.10,y,z),1.65,1.10,M['dark'],details,(1,0,0))
    for dy in [-.57,.57]:
        cylinder('Service hatch hinge pin',(8.19,y+dy,z-.30),(8.19,y+dy,z+.30),.055,M['steel'],details,n=20)
    tube('Hatch grab handle',[(8.19,y-.20,z),(8.32,y-.20,z),(8.32,y+.20,z),(8.19,y+.20,z)],.025,M['brass'],details)

print('Authoring a slow articulated walking preview',flush=True)
scene.render.fps=30
for leg in legs:
    for frame in range(121):
        t=(frame/120+leg['phase'])%1
        target=leg['F'].copy();target.y+=math.cos(t*math.tau)*.85;target.z+=max(0,math.sin(t*math.tau))*.7
        h=leg['H'];delta=target-h;dist=min(delta.length,leg['l1']+leg['l2']-.01);d=delta.normalized()
        along=(leg['l1']**2-leg['l2']**2+dist**2)/(2*dist)
        bend=leg['K']-h;bend=(bend-d*bend.dot(d)).normalized()
        k=h+d*along+bend*math.sqrt(max(0,leg['l1']**2-along**2))
        leg['upper'].rotation_quaternion=direction_frame(h,k)
        leg['lower'].location=k;leg['lower'].rotation_quaternion=direction_frame(k,target)
        leg['foot'].location=target
        for o in [leg['upper'],leg['lower'],leg['foot']]:
            o.keyframe_insert('location',frame=frame);o.keyframe_insert('rotation_quaternion',frame=frame)
    for o in [leg['upper'],leg['lower'],leg['foot']]:
        o.animation_data.action.name=o.name+'_Walk';o.animation_data.action.use_fake_user=True
        track=o.animation_data.nla_tracks.new();track.name='Walker_Walk'
        track.strips.new('Walker_Walk',0,o.animation_data.action);o.animation_data.action=None
    # Reference pose is the deliberately designed weight-bearing stance, separate from the animation.
    for track in leg['upper'].animation_data.nla_tracks:track.mute=True
    for track in leg['lower'].animation_data.nla_tracks:track.mute=True
    for track in leg['foot'].animation_data.nla_tracks:track.mute=True
    leg['upper'].rotation_quaternion=direction_frame(leg['H'],leg['K'])
    leg['lower'].location=leg['K'];leg['lower'].rotation_quaternion=direction_frame(leg['K'],leg['F'])
    leg['foot'].location=leg['F']
scene.frame_start=0;scene.frame_end=120

# Every export mesh stays separate/editable in this master. Curves and text are
# converted only in the exporter; lighting, smoke and ground live outside the asset root.
machine['legCount']=4;machine['deckLevels']='10.6,14.2,17.8'
machine['gameplayNote']='Reference scale; collider proxies and access anchors are supplied separately.'
for i,z in enumerate([10.6,14.2,17.8]):anchor('DeckAccess_%d'%i,(8.6,0,z),machine,role='deck-access')
anchor('PlayerSpawn',(0,-5,17.85),machine,role='player-spawn')
anchor('EngineService',(6.8,0,14.2),machine,role='interaction')

print('Saving editable model and assembly contract',flush=True)
bpy.context.preferences.filepaths.save_version=0
scene['assetMaster']='IronNomad';scene['sourceReference']='reference/walker.png'
scene['modelReady']=True
manifest={'name':'Iron Nomad — mobile foundry','legCount':4,'parts':len(PARTS),'modules':[o.name for o in modules],
          'anchors':[{'name':o.name,'role':o.get('anchorRole')} for o in ANCHORS],
          'legRig':[{'id':l['id'],'hip':list(l['H']),'knee':list(l['K']),'foot':list(l['F']),'upperLength':l['l1'],'lowerLength':l['l2']} for l in legs],
          'proxies':proxies,'referenceScale':True,'motion':'Rigid articulated node animation; no skinned armature required.'}
(OUT/'source/manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Master.blend'))
print('IRON NOMAD MASTER COMPLETE',len(PARTS),'parts',flush=True)
