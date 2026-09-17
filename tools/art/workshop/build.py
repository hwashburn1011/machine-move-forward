"""Original Nomad drive core and flush leg-service hatch. Game metres, Y up."""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/art/glass_orchard'))
import common as c

c.OUT = ROOT / 'assets/workshop'
c.OUT.mkdir(parents=True, exist_ok=True)
(c.OUT / 'exports').mkdir(exist_ok=True)
kit = c.empty('NomadWorkshop')
engine = c.empty('NomadDriveCore', parent=kit)
hatch = c.empty('NomadLegServiceHatch', parent=kit)
engine['contract'] = 'Existing engine hitbox: x +/-1.4, y 0..1.8, z +/-1.3'
hatch['contract'] = 'Flush visual at existing leg repairAt; no new collision or gameplay'

def ring(name, at, radius, thickness, mat, parent, axis='z'):
    bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=6,
        location=c.xyz(at), major_radius=radius, minor_radius=thickness)
    o = bpy.context.object
    if axis == 'z': o.rotation_euler.x = math.pi / 2
    if axis == 'x': o.rotation_euler.y = math.pi / 2
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return c.finish(o, name, mat, parent)

def hose(name, points, radius, mat, parent):
    # Piecewise rounded routing keeps pipes compact instead of oversampling curves.
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.bevel_depth=radius;curve.bevel_resolution=1;curve.resolution_u=2
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*c.xyz(co),1)
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o)
    o.parent=parent;o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    for face in o.data.polygons:face.use_smooth=True
    return o

def bolt(at,parent,axis='z',r=.026):
    x,y,z=at
    end=(x,y,z-.016) if axis=='z' else (x,y+.016,z)
    return c.tube('Recessed hex service bolt',at,end,r,c.brass,parent,6)

# Full skid silhouette within the gameplay envelope. Mounts, ribs and enclosure
# visibly support the mass, rather than presenting a decorative floating motor.
c.box('Rolled charcoal skid',(0,.11,0),(2.70,.20,2.46),c.steel,engine,.044)
for x in [-1.12,1.12]:
    c.box('Longitudinal channel',(x,.245,0),(.21,.19,2.37),c.bare,engine,.022)
    for z in [-.92,.92]:
        c.box('Rubber vibration mount',(x,.04,z),(.30,.075,.31),c.dark,engine,.018)
        bolt((x,.35,z),engine,'y',.034)
c.box('Cast crankcase',(0,.61,.10),(1.47,.65,1.79),c.steel,engine,.075)
c.box('Oil sump',(0,.34,.10),(1.18,.22,1.55),c.red,engine,.035)
for x in [-.57,.57]:
    c.box('Serviceable cylinder bank',(x,1.06,.12),(.62,.51,1.58),c.ivory,engine,.065)
    c.box('Valve cover gasket',(x,1.31,.12),(.66,.054,1.61),c.dark,engine,.018)
    c.box('Ribbed rocker cover',(x,1.38,.12),(.64,.11,1.57),c.red,engine,.041)
    for z in [-.49,-.25,0,.25,.51,.73]:
        c.box('Valve cooling rib',(x,1.45,z),(.54,.032,.025),c.bare,engine,.007)
    for z in [-.58,.76]:bolt((x,1.47,z),engine,'y',.029)
    # Short separate inlet runners and shared plenum read as a working engine.
    for z in [-.45,-.07,.31,.69]:
        hose('Copper inlet runner',[(x*.8,1.19,z),(x*.5,1.57,z),(0,1.59,z)],.048,c.brass,engine)
c.tube('Air intake plenum',(0,1.60,-.48),(0,1.60,.77),.14,c.bare,engine,32)
c.tube('Filtered air canister',(0,1.55,.64),(0,1.55,1.11),.21,c.steel,engine,32)
for z in [.69,.96]:ring('Air-filter clamp',(0,1.55,z),.216,.020,c.brass,engine)

# Radiator cassette and front drive fan. Pivots are retained for runtime motion.
c.box('Radiator cassette',(0,.97,-1.035),(1.58,1.32,.22),c.dark,engine,.045)
for x in [-.73,.73]:
    c.box('Radiator side band',(x,.98,-1.16),(.09,1.27,.085),c.ivory,engine,.017)
for y in [.39,1.56]:c.box('Radiator end band',(0,y,-1.16),(1.54,.09,.085),c.ivory,engine,.017)
for x in [i*.095 for i in range(-7,8)]:
    c.box('Radiator cooling fin',(x,.96,-1.16),(.025,1.08,.042),c.bare,engine,.004)
ring('Cast fan shroud',(0,.96,-1.23),.47,.038,c.steel,engine)
rotor=c.empty('DriveRotor',(0,.96,-1.248),engine)
c.tube('Fan hub',(0,0,-.01),(0,0,.03),.105,c.brass,rotor,24)
for i in range(8):
    angle=i*math.tau/8
    verts=[]
    # Swept, thickness-bearing blades rather than flat intersecting boxes.
    for depth in [-.008,.008]:
        for radius,delta in [(.10,-.17),(.41,-.12),(.43,.15),(.19,.40)]:
            verts.append(c.xyz((radius*math.cos(angle+delta),radius*math.sin(angle+delta),depth)))
    mesh=bpy.data.meshes.new('Swept fan blade');mesh.from_pydata(verts,[],[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]);mesh.update()
    obj=bpy.data.objects.new('Swept fan blade',mesh);bpy.context.collection.objects.link(obj)
    c.finish(obj,'Swept fan blade',c.bare,rotor,.006)

# Low side pods establish the original solid envelope while exposing the engine.
for side in [-1,1]:
    x=side*1.11
    c.box('Folded enamel service pod',(x,.72,.12),(.40,.80,2.12),c.ivory,engine,.050)
    c.box('Pod top wear strip',(x,1.135,.12),(.43,.058,2.17),c.bare,engine,.015)
    for z in [-.62,-.32,-.02,.28,.58,.88]:
        c.box('Service pod top vent',(x,1.17,z),(.26,.015,.10),c.dark,engine,.007)
    for z in [-.83,.99]:bolt((x,1.18,z),engine,'y',.027)
    hose('Hydraulic return',[(x,.91,.88),(side*.91,1.20,.91),(side*.79,1.44,.95),(side*.48,1.45,.95)],.032,c.brass,engine)
    hose('Braided fuel return',[(side*.80,.67,-.40),(x,.72,-.42),(x,.87,-.72)],.024,c.dark,engine)

# Front service face is the existing interaction side (negative Z).
c.box('Engine service instruments',(1.04,.81,-1.02),(.53,.62,.11),c.steel,engine,.028)
c.tube('Pressure gauge body',(1.04,.97,-1.095),(1.04,.97,-1.17),.119,c.brass,engine,32)
c.tube('Pressure dial',(1.04,.97,-1.174),(1.04,.97,-1.18),.098,c.ivory,engine,32)
for i in range(7):
    t=.35+i*.41;x=1.04+math.cos(t)*.078;y=.97+math.sin(t)*.078
    c.tube('Gauge graduation',(x,y,-1.19),(x-.012*math.cos(t),y-.012*math.sin(t),-1.19),.004,c.dark,engine,6)
c.tube('Gauge needle',(1.04,.97,-1.192),(1.075,1.027,-1.192),.006,c.red,engine,8)
status=c.flat('Workshop_Status',(.025,.50,.28),rough=.45)
status.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.025,.50,.28,1)
status.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=1.8
c.box('Drive status strip',(1.04,.73,-1.085),(.36,.045,.012),status,engine,.008)
c.label('Drive name plate','NOMAD / DRIVE 01',(.0,.29,-1.254),.075,engine)
c.label('Engine service label','SERVICE',(1.04,.59,-1.083),.055,engine)
c.label('Exposed voltage label','KEEP CLEAR',(-1.075,.57,-1.024),.039,engine)
for x in [-1.19,1.19]:
    for y in [.51,.97]:bolt((x,y,-1.025),engine)

# A flush, visible maintenance location for the four existing leg-repair anchors.
# No foot-height prop or new collider is introduced into the catwalk.
c.box('Inset service hatch',(0,.016,0),(.73,.032,.84),c.steel,hatch,.015)
c.box('Worn hatch lid',(0,.035,0),(.64,.024,.73),c.ivory,hatch,.012)
for x in [-.31,.31]:
    for z in [-.36,.36]:bolt((x,.051,z),hatch,'y',.016)
c.box('Recessed lifting grip',(0,.050,.22),(.22,.016,.055),c.dark,hatch,.008)
for x in [-.28,.28]:c.box('Hatch warning marker',(x,.051,0),(.035,.007,.50),c.red,hatch,.005)
c.box('Leg condition strip',(0,.052,-.25),(.26,.008,.025),status,hatch,.004)
label=c.label('Leg service stencil','LEG SERVICE',(0,0,0),.055,hatch)
label.rotation_euler=(0,0,math.pi);label.location=c.xyz((0,.055,-.06))

c.export('nomad-workshop',kit,preserve=(engine,rotor,hatch))
bpy.context.view_layer.update()
report={}
for obj in [engine,hatch]:
    points=[o.matrix_world@Vector(corner) for o in obj.children_recursive if o.type=='MESH' for corner in o.bound_box]
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    report[obj.name]={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'triangles':sum(len(o.data.polygons) for o in obj.children_recursive if o.type=='MESH'),'meshes':sum(o.type=='MESH' for o in obj.children_recursive)}
(c.OUT/'bounds.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('WORKSHOP_BOUNDS',json.dumps(report),flush=True)
