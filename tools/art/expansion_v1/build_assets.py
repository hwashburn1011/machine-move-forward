"""Original expansion models. Run only in an isolated Blender background process.

Game metres/Y-up are converted by the established graphics-v2 helper. Semantic
roots retain their pivots; gameplay owns collision, interaction and animation.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
STAGE=ROOT/'assets/expansion-v1/staging'
SOURCE=ROOT/'assets/blender/expansion-v1'
DOCS=ROOT/'docs/art/expansion-v1'
for path in (STAGE,SOURCE,DOCS):path.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/graphics_v2'))
import hardsurface as h

# New primitives can have a dirty rotation matrix until the dependency graph
# updates. Preserve the evaluated world matrix when attaching torus details to
# animated marker parents (the shared helper predates these nested pivots).
_finish=h.finish
def evaluated_finish(*args,**kwargs):
    bpy.context.view_layer.update()
    return _finish(*args,**kwargs)
h.finish=evaluated_finish

def palette(enemy=False):
    materials=h.setup_mats('ExpansionRaid_' if enemy else 'Expansion_',[
        ('Paint','82584a' if enemy else '65766d',.38,.64,False,0),
        ('Dark','263236',.55,.6,False,0),
        ('Steel','a8b1a8',.82,.36,False,0),
        ('Ochre','c49a52',.3,.62,False,0),
    ])
    for mat in materials.values():
        for node in mat.node_tree.nodes:
            if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.18
    return materials

def smooth_conduit(name,points,radius,material,parent):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.resolution_u=12;curve.bevel_depth=radius;curve.bevel_resolution=3
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,position in zip(spline.bezier_points,points):
        point.co=h.gv(position);point.handle_left_type=point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH');obj.select_set(False)
    return h.finish(obj,name,material,parent,0,True)
h.curve=smooth_conduit

def lamp_material():
    mat=bpy.data.materials.new('Expansion_StatusLamp');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.11,.64,.53,1)
    shader.inputs['Emission Color'].default_value=(.07,.63,.45,1)
    shader.inputs['Emission Strength'].default_value=.55
    shader.inputs['Roughness'].default_value=.28
    return mat

def marker(name,at=(0,0,0),parent=None):
    obj=h.empty(name,at,parent);obj['expansionVersion']=1;return obj

def prism(name,section,width,material,parent,bevel=.03):
    vertices=[h.gv((side*width*.5,y,z)) for side in (-1,1) for y,z in section]
    count=len(section)
    faces=[tuple(reversed(range(count))),tuple(range(count,count*2))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return h.finish(obj,name,material,parent,bevel)

def bolt_grid(parent,material,xs,zs,y,r=.018):
    for x in xs:
        for z in zs:h.screw('Captive fastener',(x,y,z),material,parent,r)

def rails(parent,material,x,z0,z1,y=1.05):
    h.cyl('Tubular guard',(x,y,z0),(x,y,z1),.035,material,parent,20)
    for z in (z0,z1):h.cyl('Guard stanchion',(x,.03,z),(x,y,z),.035,material,parent,20)

def helm():
    m=palette();root=marker('HelmRoot');root['authoredPalette']=True
    h.box('Bolted pedestal base',(0,.045,0),(1.16,.09,.72),m['Dark'],root,.025)
    prism('Folded control pedestal',[(.09,-.29),(1.30,-.29),(1.04,.35),(.84,.23),(.09,.23)],1.05,m['Paint'],root,.035)
    h.box('Pedestal foot seal',(0,.16,0),(.97,.045,.58),m['Dark'],root,.012)
    panel=h.box('Inclined instrument recess',(0,1.188,.035),(.96,.025,.58),m['Dark'],root,.012)
    panel.rotation_euler.x=.41
    for x in (-.52,.52):
        prism('Control panel rolled side',[(1.01,.35),(1.32,-.31),(1.35,-.31),(1.04,.35)],.035,m['Steel'],root,.008).location.x+=x
    # Gauge axis matches the inclined panel rather than facing straight forward.
    a=Vector((-.17,1.208,-.015));normal=Vector((0,.917,.399))
    h.cyl('Protected bearing dial',a,a+normal*.042,.176,m['Steel'],root,48,.004)
    h.cyl('Recessed dial face',a+normal*.043,a+normal*.046,.15,m['Dark'],root,48)
    for i in range(24):
        angle=i*math.tau/24
        x=a.x+math.cos(angle)*.128;v=math.sin(angle)*.128
        tick=h.box('Bearing graduation',(x,a.y+normal.y*.05-v*.399,a.z+normal.z*.05+v*.917),(.009,.005,.024 if i%3==0 else .012),m['Steel'],root,.001)
        tick.rotation_euler.x=.41;tick.rotation_euler.z=angle
    h.cyl('Bearing pointer',(-.17,1.262,.004),(-.08,1.231,.073),.008,m['Ochre'],root,12)
    for x in (.16,.34):
        h.cyl('Route selector bezel',(x,1.217,-.02),(x,1.245,-.008),.052,m['Steel'],root,32)
        h.cyl('Guarded selector',(x,1.246,-.008),(x,1.28,.007),.039,m['Dark'],root,28)
    power=marker('HelmPowerLamp',(.34,1.10,.27),root)
    h.box('Route status lens',(.34,1.10,.275),(.08,.028,.035),lamp_material(),power,.008)
    h.box('Gyro service recess',(.25,.64,.251),(.30,.48,.02),m['Dark'],root,.018)
    gyro=marker('GyroInstalled',(.25,.65,.29),root)
    h.cyl('Gyro cartridge',(.25,.44,.29),(.25,.85,.29),.065,m['Steel'],gyro,40,.005)
    for y in (.48,.58,.70,.80):h.torus('Gyro mounting ring',(.25,y,.29),.076,.012,m['Ochre'],gyro,'y',32,8)
    for x in (.13,.37):h.cyl('Cartridge protection',(x,.42,.29),(x,.88,.29),.016,m['Steel'],root,16)
    h.box('Service hinge',(-.42,.58,.254),(.025,.57,.026),m['Steel'],root,.005)
    for y in (.37,.51,.65,.79):h.box('Vent louvre',(-.18,y,.25),(.25,.025,.018),m['Dark'],root,.003)
    bolt_grid(root,m['Steel'],[-.46,.46],[-.26,.26],.101)
    marker('HelmInteract',(0,.85,.48),root)
    return root

def foundry():
    m=palette();root=marker('FoundryRoot');root['authoredPalette']=True
    # Structural shell follows the authored physics definition. The western
    # approach and the cross-aisle stay open; detail is kept on solid envelopes.
    h.box('Foundation tray',(0,-.14,0),(14,.28,10),m['Dark'],root,.06)
    for x in range(-6,7,2):
        for z in range(-4,5,2):
            h.box('Worn floor cassette',(x,-.015,z),(1.97,.035,1.97),m['Paint'],root,.009)
            for dx in (-.88,.88):
                h.screw('Flush floor anchor',(x+dx,.003,z+.87),m['Steel'],root,.018)
    for z in (-4.9,4.9):
        h.box('Retaining wall',(1.5,1.35,z),(11,2.7,.2),m['Paint'],root,.025)
        for y in (.18,1.30,2.65):h.box('Continuous rolled wall rail',(1.5,y,z),(11,.10,.23),m['Dark'],root,.012)
        for x in (-3.8,-1.8,.2,2.2,4.2,6.7):
            h.box('Pressed wall upright',(x,1.38,z),(.13,2.76,.25),m['Steel'],root,.014)
            for y in (.36,2.42):
                h.cyl('Wall rivet',(x,y,z-.14),(x,y,z+.14),.028,m['Dark'],root,12)
    h.box('East machine wall',(6.9,1.5,0),(.2,3,10),m['Paint'],root,.025)
    for z in (-3.5,3.5):
        h.box('Western wind shield',(-6.9,1.5,z),(.2,3,3),m['Paint'],root,.025)
        h.box('Entry edge binding',(-6.9,1.5,(-2 if z<0 else 2)),(.23,3,.12),m['Ochre'],root,.012)
    # Four tall supports are embedded in boundary walls; no invisible columns
    # intrude into the walking route. An open overhead truss frames the vista.
    for x in (-3.8,6.75):
        for z in (-4.86,4.86):
            h.box('Gantry column',(x,2.4,z),(.20,4.8,.24),m['Dark'],root,.025)
            h.box('Column reinforcing shoe',(x,.25,z),(.24,.5,.27),m['Steel'],root,.015)
    for z in (-4.84,4.84):
        for y in (4.35,4.78):h.box('Gantry chord',(1.48,y,z),(10.8,.10,.15),m['Dark'],root,.012)
        for x in range(-3,7,2):
            h.cyl('Gantry diagonal',(x-.8,4.4,z),(x+.8,4.73,z),.036,m['Steel'],root,16)
    for x in (-3.8,1.4,6.75):h.box('Overhead lifting rail',(x,4.7,0),(.16,.20,9.9),m['Dark'],root,.018)
    h.box('Crane carriage',(1.4,4.49,2),(.52,.22,.64),m['Ochre'],root,.045)
    h.cyl('Suspended workshop chain',(1.4,4.4,2),(1.4,2.6,2),.021,m['Steel'],root,16)
    h.torus('Lifting eye',(1.4,2.52,2),.1,.025,m['Steel'],root,'z',32,8)
    # Long lathe/table occupies machine-shop collider exactly.
    h.box('Machine shop plinth',(1,.16,2),(2.8,.32,2),m['Dark'],root,.045)
    h.box('Lathe enclosed bed',(1,.64,2),(2.65,.95,1.85),m['Paint'],root,.07)
    for x in (-.18,2.18):
        h.box('Lathe casting',(x,.91,2),(.38,.58,1.55),m['Steel'],root,.055)
    for z in (1.55,2.45):h.cyl('Lathe bed rail',(-.1,1.1,z),(2.1,1.1,z),.06,m['Steel'],root,32)
    h.cyl('Held spindle',(.1,1.08,2),(1.85,1.08,2),.10,m['Dark'],root,40)
    for x in (.22,1.76):h.torus('Spindle collar',(x,1.08,2),.16,.035,m['Ochre'],root,'x',40,8)
    for x in (.2,.6,1,1.4,1.8):h.box('Lathe side vent',(x,.58,.995),(.18,.28,.025),m['Dark'],root,.007)
    h.box('Blueprint document plate',(1,1.215,2),(.58,.026,.45),m['Ochre'],root,.006)
    for x in (.82,1,1.18):h.box('Etched blueprint line',(x,1.23,2),(.01,.002,.30),m['Steel'],root,.001)
    # Rear electronics recovery rack within alcove envelope.
    h.box('Control rack plinth',(3.5,.10,-2),(2.4,.2,1.6),m['Dark'],root,.035)
    h.box('Sealed electronics cabinet',(3.5,.42,-2),(2.30,.64,1.5),m['Paint'],root,.045)
    for x in (2.55,3.15,3.85,4.45):
        h.box('Cabinet access panel',(x,.44,-1.238),(.48,.43,.025),m['Steel'],root,.018)
        h.box('Recessed latch',(x+.14,.45,-1.215),(.03,.12,.028),m['Dark'],root,.006)
    h.box('Tracking servo receptacle',(3,.83,-1.5),(.55,.08,.5),m['Dark'],root,.015)
    servo=marker('TrackingServo',(3,1,-1.5),root)
    h.cyl('Recoverable precision servo',(3,.89,-1.5),(3,1.06,-1.5),.17,m['Steel'],servo,40,.012)
    h.torus('Servo keyed collar',(3,1.01,-1.5),.177,.02,m['Ochre'],servo,'y',40,8)
    h.box('Controller recovery pedestal',(-1,.45,1.5),(.9,.9,.8),m['Dark'],root,.04)
    h.box('Pedestal face',(-1,.47,1.093),(.72,.65,.025),m['Paint'],root,.022)
    control=marker('SalvageController',(-1,1,1.5),root)
    h.box('Recovered salvage control module',(-1,1,1.5),(.42,.17,.33),m['Ochre'],control,.025)
    for x in (-1.13,-1.04,-.95,-.86):h.box('Module heat fin',(x,1.10,1.5),(.028,.04,.26),m['Steel'],control,.005)
    h.box('Records station',(-2,.45,-2),(.8,.9,.6),m['Paint'],root,.035)
    h.box('Records pad',(-2,.955,-2),(.64,.08,.49),m['Dark'],root,.015)
    for z in (-2.13,-2.06,-1.99,-1.92):h.box('Log paper rules',(-2,1.002,z),(.40,.005,.012),m['Steel'],root,.001)
    marker('JournalLog',(-2,1,-2),root);marker('JournalBlueprint',(1,1.23,2),root)
    gangway=marker('Gangway',(-7.5,-.08,0),root)
    h.box('Bridge plate',(-7.5,-.08,0),(1,.16,2),m['Dark'],gangway,.018)
    for x in (-7.88,-7.68,-7.48,-7.28,-7.08):h.box('Bridge grip bar',(x,.012,0),(.025,.018,1.72),m['Steel'],gangway,.004)
    for z in (-.9,.9):h.box('Bridge yellow edge',(-7.5,.008,z),(.94,.015,.10),m['Ochre'],gangway,.004)
    marker('EntryAnchor',(-7,0,0),root);marker('ExitSightline',(-5.8,1.6,0),root)
    # Flat utility details sit against the solid eastern wall.
    for z in (-3.3,-2.9,-2.5):
        h.cyl('Wall conduit',(6.77,.25,z),(6.77,2.65,z),.045,m['Steel'],root,24)
    h.box('Foundry serial plate',(6.775,2.6,1.5),(.025,.42,2.2),m['Ochre'],root,.006)
    for z in (.65,.9,1.15,1.65,1.9,2.15):h.box('Raised identity rib',(6.754,2.6,z),(.025,.25,.07),m['Dark'],root,.004)
    return root

def loft_hull(parent,m):
    sections=[(-4.5,.65,.72,1.65),(-3.35,1.55,.45,2.15),(2.9,1.7,.45,2.35),(4.5,1.4,.60,2.1)]
    verts=[]
    for z,width,bottom,top in sections:
        for x,y in ((-.8*width,bottom),(.8*width,bottom),(width,top),(-width,top)):
            verts.append(h.gv((x,y,z)))
    faces=[(3,2,1,0),(12,13,14,15)]
    for s in range(3):
        for i in range(4):faces.append((s*4+i,s*4+(i+1)%4,(s+1)*4+(i+1)%4,(s+1)*4+i))
    mesh=bpy.data.meshes.new('Compound tapered hull');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Compound tapered hull',mesh);bpy.context.collection.objects.link(obj)
    h.finish(obj,obj.name,m['Paint'],parent,.10)

def gunboat():
    m=palette(True);root=marker('GunboatRoot');root['authoredPalette']=True
    loft_hull(root,m)
    # Closed hover sled undercarriage, armored upper capsule and exposed drive.
    for x in (-1.24,1.24):
        prism('Hover keel',[(.28,-3.4),(.30,3.85),(.72,4.15),(.87,-3.65)],.48,m['Dark'],root,.08).location.x+=x
        for z in (-2.8,-1.4,0,1.4,2.8):
            h.box('Segmented skirt shoe',(x,.61,z),(.56,.29,1.25),m['Steel'],root,.05)
    prism('Sealed raider superstructure',[(1.95,-2.55),(2.8,-1.9),(3.05,.8),(2.55,1.8),(2.05,2.1)],2.25,m['Dark'],root,.09)
    prism('Upper painted armor',[(2.65,-1.7),(2.88,-1.25),(3.11,.6),(2.88,1.1)],2.05,m['Paint'],root,.06)
    for x in (-1.1,1.1):
        for z in (-1.55,-.8,-.05,.7):
            h.box('Raised side armor cassette',(x,2.61,z),(.065,.46,.65),m['Paint'],root,.03)
        for z in (-1.82,1.24):h.cyl('Side grab rail',(x,2.47,z),(x,2.80,z),.026,m['Steel'],root,20)
    for x in (-1.54,1.54):
        h.cyl('Armored rubbing strake',(x,1.76,-3.05),(x,1.98,3.38),.09,m['Dark'],root,28)
        for z in (-2.7,-1.2,.3,1.8,3.1):
            h.box('Strake clamp',(x,1.86,z),(.14,.28,.11),m['Steel'],root,.015)
    for x in (-1.62,1.62):
        for z in (-2.05,-.90,.25,1.4,2.55):
            h.box('Replaceable hull armor',(x,1.43,z),(.07,.48,1.05),m['Paint'],root,.028)
            for dz in (-.41,.41):
                h.cyl('Armor captive bolt',(x-.045,1.48,z+dz),(x+.045,1.48,z+dz),.025,m['Steel'],root,12)
    h.box('Forward maintenance hatch',(0,2.135,-2.92),(.86,.035,.55),m['Dark'],root,.025)
    for z in (-3.1,-2.98,-2.86,-2.74):h.box('Hatch pressure rib',(0,2.161,z),(.65,.025,.03),m['Steel'],root,.008)
    yaw=marker('GunboatGunYaw',(0,3.2,-1.7),root)
    h.cyl('Traverse bearing',(0,2.67,-1.7),(0,3.27,-1.7),.48,m['Dark'],yaw,48,.02)
    h.torus('Turret bearing ring',(0,3.21,-1.7),.47,.045,m['Ochre'],yaw,'y',48,10)
    for x in (-.39,.39):h.box('Armored trunnion cheek',(x,3.50,-1.7),(.20,.62,.65),m['Paint'],yaw,.065)
    pitch=marker('GunboatGunPitch',(0,.4,0),yaw)
    h.box('Gun breech',(0,3.6,-1.65),(.50,.40,.80),m['Dark'],pitch,.075)
    h.cyl('Gun recoil sleeve',(0,3.6,-1.95),(0,3.6,-2.7),.16,m['Paint'],pitch,40,.012)
    h.cyl('Gun barrel',(0,3.6,-2.65),(0,3.6,-3.43),.085,m['Steel'],pitch,40,.008)
    h.cyl('Muzzle brake',(0,3.6,-3.28),(0,3.6,-3.5),.13,m['Dark'],pitch,40,.012)
    for z in (-3.31,-3.40):h.torus('Brake exhaust groove',(0,3.6,z),.131,.012,m['Steel'],pitch,'z',40,8)
    h.cyl('Dark muzzle bore',(0,3.6,-3.501),(0,3.6,-3.506),.068,m['Dark'],pitch,32)
    marker('GunboatMuzzle',(0,0,-1.8),pitch)
    marker('WeaponDamageAnchor',(0,3.4,-1.7),root)
    weapon_disabled=marker('WeaponDisabled',(0,3.4,-1.7),root)
    h.box('Disabled weapon fracture',(0,3.85,-1.7),(.28,.025,.31),m['Ochre'],weapon_disabled,.005)
    # Engine silhouette is distinct and lies inside the target volume.
    h.box('Rear drive cradle',(0,2.67,2.8),(1.7,.20,2),m['Dark'],root,.045)
    for x in (-.43,.43):
        h.cyl('Turbine jacket',(x,3.18,1.96),(x,3.18,3.61),.38,m['Paint'],root,48,.025)
        for z in (2.08,2.4,2.72,3.04,3.36):h.torus('Drive cooling rib',(x,3.18,z),.375,.034,m['Steel'],root,'z',40,8)
        h.cyl('Exhaust neck',(x,3.18,3.55),(x,3.18,3.78),.28,m['Dark'],root,40,.015)
        h.torus('Exhaust lip',(x,3.18,3.76),.275,.035,m['Steel'],root,'z',40,8)
        h.cyl('Deep exhaust baffle',(x,3.18,3.72),(x,3.18,3.735),.22,m['Dark'],root,40)
    h.box('Drive service spine',(0,3.45,2.8),(.25,.29,1.55),m['Ochre'],root,.035)
    marker('EngineDamageAnchor',(0,3.2,2.8),root);marker('EngineExhaust',(0,3.18,3.8),root)
    disabled=marker('EngineDisabled',(0,3.2,2.8),root)
    h.box('Burned drive panel',(0,3.625,2.8),(.23,.015,.67),m['Dark'],disabled,.005)
    for z in (-3.2,3.65):bolt_grid(root,m['Steel'],[-.95,.95],[z],2.14,.025)
    return root

def collector():
    m=palette();root=marker('CollectorRoot');root['authoredPalette']=True
    h.box('Collector foundation',(0,.06,0),(1.56,.12,1.56),m['Dark'],root,.04)
    h.box('Gearbox lower casting',(0,.30,-.05),(1.28,.42,1.18),m['Paint'],root,.065)
    h.box('Receiver lip',(0,.55,.56),(1.2,.10,.40),m['Steel'],root,.018)
    h.box('Receiver dark mouth',(0,.49,.47),(.96,.05,.40),m['Dark'],root,.015)
    for x in (-.61,.61):
        prism('Cast drum pedestal',[(.36,-.37),(1.08,-.27),(1.18,.09),(.36,.36)],.18,m['Paint'],root,.04).location.x+=x
        h.cyl('Axle bearing',(x-.09,.75,0),(x+.09,.75,0),.17,m['Steel'],root,36,.01)
    drum=marker('DrumPivot',(0,.75,0),root)
    h.cyl('Winch spindle',(-.66,.75,0),(.66,.75,0),.065,m['Steel'],drum,32)
    h.cyl('Winch rope core',(-.45,.75,0),(.45,.75,0),.23,m['Dark'],drum,40)
    for x in (-.46,.46):
        h.cyl('Drum flange',(x-.03,.75,0),(x+.03,.75,0),.34,m['Steel'],drum,48,.012)
        h.torus('Flange rolled rim',(x,.75,0),.325,.026,m['Ochre'],drum,'x',48,8)
    for i in range(23):h.torus('Wound steel cable',(-.418+i*.038,.75,0),.251,.018,m['Dark'],drum,'x',24,6)
    guide=marker('GuidePivot',(0,1.05,-.45),root)
    for x in (-.31,.31):h.cyl('Fairlead cheek',(x,.94,-.56),(x,1.14,-.56),.045,m['Steel'],guide,24)
    h.cyl('Fairlead upper roller',(-.32,1.12,-.56),(.32,1.12,-.56),.047,m['Steel'],guide,32)
    h.cyl('Fairlead lower roller',(-.32,.98,-.56),(.32,.98,-.56),.047,m['Steel'],guide,32)
    h.curve('Resting cable lead',[(0,1.00,-.08),(0,1.06,-.42),(0,1.03,-.77)],.017,m['Dark'],root)
    for x in (-.54,.54):h.curve('Drum protection bow',[(x,.5,-.48),(x,1.19,-.35),(x,1.19,.35),(x,.53,.5)],.028,m['Ochre'],root)
    module=marker('ControllerInstalled',(.47,.39,.46),root)
    h.box('Specialist control cassette',(.47,.39,.49),(.26,.26,.13),m['Ochre'],module,.025)
    for x in (.39,.47,.55):h.box('Cassette cooling fin',(x,.39,.57),(.022,.18,.03),m['Steel'],module,.006)
    lamp=marker('BufferLamp',(0,.72,.72),root)
    h.box('Buffer indicator hood',(0,.69,.67),(.23,.14,.09),m['Dark'],root,.015)
    h.box('Buffer status lens',(0,.72,.721),(.12,.04,.015),lamp_material(),lamp,.006)
    for x in (-.43,-.21,.01,.23):h.box('Motor side louvre',(x,.30,-.653),(.12,.15,.018),m['Dark'],root,.005)
    bolt_grid(root,m['Steel'],[-.66,.66],[-.66,.66],.124,.022)
    marker('HookExit',(0,1.03,-.77),root);marker('CollectorInteract',(0,.7,.86),root)
    return root

def auto_turret():
    m=palette();root=marker('AutoTurretRoot');root['authoredPalette']=True
    h.box('Automatic turret foundation',(0,.065,0),(1.34,.13,1.34),m['Dark'],root,.055)
    h.cyl('Tapered pedestal base',(0,.13,0),(0,.24,0),.49,m['Steel'],root,48,.016)
    prism('Faceted folded pedestal',[(.2,-.39),(.69,-.26),(.78,.20),(.21,.39)],.75,m['Paint'],root,.06)
    h.cyl('Traverse bearing fixed',(0,.61,0),(0,.79,0),.31,m['Dark'],root,48,.016)
    yaw=marker('TurretYaw',(0,.78,0),root)
    h.torus('Machined traverse ring',(0,.8,0),.30,.035,m['Steel'],yaw,'y',48,8)
    h.box('Azimuth saddle',(0,.88,0),(.76,.17,.48),m['Paint'],yaw,.04)
    for x in (-.30,.30):
        h.box('Elevation cheek',(x,1.06,.02),(.14,.37,.40),m['Paint'],yaw,.045)
        h.cyl('Elevation journal',(x-.08,1.15,0),(x+.08,1.15,0),.095,m['Steel'],yaw,32,.008)
    pitch=marker('TurretPitch',(0,.37,0),yaw)
    h.box('Compact receiver',(0,1.15,.03),(.39,.26,.55),m['Dark'],pitch,.045)
    h.box('Receiver armored cap',(0,1.30,.03),(.42,.06,.49),m['Paint'],pitch,.015)
    h.cyl('Short barrel sleeve',(0,1.17,-.22),(0,1.17,-.43),.077,m['Paint'],pitch,36,.008)
    h.cyl('Automatic gun barrel',(0,1.17,-.42),(0,1.17,-.64),.045,m['Steel'],pitch,36,.006)
    h.torus('Muzzle lip',(0,1.17,-.648),.047,.012,m['Dark'],pitch,'z',32,8)
    h.cyl('Muzzle bore',(0,1.17,-.658),(0,1.17,-.661),.029,m['Dark'],pitch,28)
    marker('Muzzle',(0,.02,-.67),pitch)
    tracker=marker('TrackerHead',(.30,.10,-.10),pitch)
    h.box('Tracking sensor casing',(.30,1.25,-.10),(.23,.22,.30),m['Ochre'],tracker,.035)
    h.cyl('Optical sensor bezel',(.30,1.25,-.24),(.30,1.25,-.28),.072,m['Steel'],tracker,32,.005)
    h.cyl('Optical sensor lens',(.30,1.25,-.278),(.30,1.25,-.284),.056,m['Dark'],tracker,32)
    servo=marker('ServoInstalled',(-.35,.26,.12),yaw)
    h.cyl('Recovered tracking servo',(-.46,1.04,.12),(-.32,1.04,.12),.113,m['Ochre'],servo,36,.009)
    for z in (-.16,-.06,.04,.14,.24):h.box('Receiver thermal slot',(-.205,1.15,z),(.017,.10,.045),m['Steel'],pitch,.003)
    lamp=marker('PowerLamp',(0,.44,.34),root)
    h.box('Power status lens',(0,.44,.345),(.12,.04,.025),lamp_material(),lamp,.006)
    h.curve('Armored control conduit',[(-.24,.35,.20),(-.28,.63,.22),(-.19,.78,.20)],.02,m['Dark'],root)
    bolt_grid(root,m['Steel'],[-.54,.54],[-.54,.54],.134,.022)
    return root

BUILDERS={'navigation-helm':helm,'relay-foundry':foundry,'raider-gunboat':gunboat,
          'automatic-collector':collector,'automatic-turret':auto_turret}
BUDGETS={'navigation-helm':15000,'relay-foundry':150000,'raider-gunboat':80000,'automatic-collector':22000,'automatic-turret':20000}

def export(stem):
    h.clear();root=BUILDERS[stem]()
    h.join_static()
    # Set metre-scaled planar UVs directly on the mesh loops. These industrial
    # tileable surfaces need consistent texel density, with no edit-mode unwrap
    # dependency (Blender 5.1 can crash freeing a bevelled custom editmesh).
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for polygon in obj.data.polygons:
            normal=obj.matrix_world.to_3x3()@polygon.normal
            axis=max(range(3),key=lambda i:abs(normal[i]))
            axes=[i for i in range(3) if i!=axis]
            for loop_index in polygon.loop_indices:
                vertex=obj.matrix_world@obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
                uv.data[loop_index].uv=(vertex[axes[0]],vertex[axes[1]])
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':continue
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        mod=obj.modifiers.new('Portable triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    bpy.context.view_layer.update()
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    triangles=sum(len(p.vertices)-2 for obj in meshes for p in obj.data.polygons)
    if triangles>BUDGETS[stem]:raise RuntimeError(f'{stem} triangle budget exceeded: {triangles}')
    points=[obj.matrix_world@Vector(corner) for obj in meshes for corner in obj.bound_box]
    game=[(point.x,point.z,-point.y) for point in points]
    report={'asset':stem,'triangles':triangles,'meshes':len(meshes),
        'bounds':{'min':[min(p[i] for p in game) for i in range(3)],'max':[max(p[i] for p in game) for i in range(3)]},
        'markers':{obj.name:[obj.matrix_world.translation.x,obj.matrix_world.translation.z,-obj.matrix_world.translation.y]
                   for obj in bpy.context.scene.objects if obj.type=='EMPTY'}}
    bpy.context.scene['sourceTool']='Blender 5.1 original expansion-v1 geometry'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{stem}.blend'))
    bpy.ops.export_scene.gltf(filepath=str(STAGE/f'{stem}.glb'),export_format='GLB',export_yup=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False,
        export_copyright='Original Machine Move Forward expansion art')
    report['bytes']=(STAGE/f'{stem}.glb').stat().st_size
    (STAGE/f'{stem}-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print('EXPANSION_ASSET',json.dumps(report))

if __name__=='__main__':
    names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(BUILDERS)
    for name in names:export(name)
