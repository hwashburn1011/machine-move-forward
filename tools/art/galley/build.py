"""Original compact industrial galley, in metres. Geometry only; gameplay unchanged."""
import sys, math, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
import bpy
c.OUT=ROOT/'assets/galley'
c.OUT.mkdir(exist_ok=True)
(c.OUT/'exports').mkdir(exist_ok=True)
root=c.empty('NomadGalley')
stove=c.empty('GalleyStove',parent=root)
condenser=c.empty('GalleyCondenser',parent=root)
planter=c.empty('GalleyPlanter',parent=root)
for obj,piece in [(stove,'stove'),(condenser,'condenser'),(planter,'planter')]:
    obj['pieceId']=piece
    obj['colliderContract']='Unchanged runtime BuildPieceGeometry'

def ring(name,at,r,minor,mat,parent,axis='y'):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=c.xyz(at),major_radius=r,minor_radius=minor)
    o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    if axis=='x':o.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return c.finish(o,name,mat,parent)

def bolts(parent,xs,ys,z):
    for x in xs:
        for y in ys:c.tube('Recessed hex fastener',(x,y,z),(x,y,z-.012),.013,c.brass,parent,6)

# Counter-height cooker: recessed oven, rolled enamel worktop, compact flue.
c.box('Pressed enamel oven body',(0,.57,0),(1.44,.94,1.06),c.ivory,stove,.055)
c.box('Black service plinth',(0,.085,0),(1.48,.13,1.08),c.steel,stove,.024)
for x in [-.61,.61]:
    for z in [-.43,.43]:c.box('Rubber isolated foot',(x,.035,z),(.15,.07,.14),c.dark,stove,.018)
c.box('Rolled stainless counter',(0,1.047,0),(1.55,.07,1.18),c.bare,stove,.026)
c.box('Oven door recess',(-.12,.59,-.539),(1.08,.63,.025),c.dark,stove,.036)
c.box('Oven door enamel',(-.12,.59,-.562),(.98,.53,.025),c.red,stove,.032)
c.box('Oven inspection glass',(-.12,.62,-.578),(.63,.28,.008),c.dark,stove,.022)
for i in range(4):c.box('Warm fire slot',(-.36+i*.16,.56,-.584),(.07,.028,.004),c.amber,stove,.003)
for x in [-.49,.25]:c.tube('Handle standoff',(x,.80,-.57),(x,.80,-.611),.022,c.bare,stove)
c.tube('Cool touch oven handle',(-.49,.80,-.611),(.25,.80,-.611),.022,c.bare,stove,24)
for x in [-.46,-.12,.22]:
    c.tube('Machined control knob',(x,.95,-.54),(x,.95,-.592),.044,c.steel,stove,24)
    c.box('Knob indicator',(x,.971,-.597),(.01,.020,.006),c.ivory,stove,.002)
for x in [-.35,.34]:
    c.tube('Burner well',(x,1.083,-.06),(x,1.091,-.06),.24,c.dark,stove,32)
    for r in [.075,.13,.19]:ring('Cast iron burner ring',(x,1.103,-.06),r,.014,c.steel,stove)
    for dx,dz in [(1,0),(0,1)]:c.tube('Pot support',(x-dx*.24,1.122,-.06-dz*.24),(x+dx*.24,1.122,-.06+dz*.24),.018,c.bare,stove)
c.box('Splash guard',(0,1.16,.52),(1.49,.19,.065),c.ivory,stove,.02)
c.tube('Compact insulated exhaust',(.55,1.02,.42),(.55,1.46,.42),.066,c.steel,stove,24)
ring('Exhaust clamp',(.55,1.32,.42),.072,.013,c.brass,stove)
c.tube('Rain cap',(.55,1.46,.42),(.55,1.49,.42),.096,c.bare,stove,24)
for i in range(5):c.box('Oven intake louver',(.59,.28+i*.11,-.541),(.17,.028,.020),c.dark,stove,.004)
bolts(stove,[-.63,.40],[.34,.85],-.551)
c.label('Cooker maker plate','NOMAD / COOK 04',(-.12,.30,-.58),.052,stove)

# Closed-loop water condenser. Narrow upright vessel, real coil and service face.
c.box('Drainable base',(0,.065,0),(1.20,.13,1.19),c.steel,condenser,.035)
c.box('Condenser enamel cabinet',(0,.61,.12),(1.12,1.0,.80),c.ivory,condenser,.045)
c.tube('Stainless vapor chamber',(0,.33,.10),(0,1.77,.10),.36,c.bare,condenser,40)
for y in [.43,1.1,1.65]:ring('Vessel rolled seam',(0,y,.10),.371,.022,c.steel,condenser)
c.tube('Pressure vessel dome',(0,1.74,.10),(0,1.81,.10),.28,c.ivory,condenser,32)
c.tube('Relief valve',(0,1.79,.10),(0,1.87,.10),.035,c.brass,condenser,16)
for x in [-.5,.5]:
    c.tube('Protected coil upright',(x,.10,.43),(x,1.72,.43),.035,c.steel,condenser,16)
    c.cable('Side return pipe',[(x,.27,.23),(x,1.43,.23),(x*.52,1.65,.20)],.028,c.brass,condenser)
# Coils are a single helical curve rather than disconnected decorative rings.
points=[]
for i in range(241):
    t=i/240;angle=t*math.pi*16
    points.append((.414*math.cos(angle),.88+.76*t,.10+.414*math.sin(angle)))
curve=bpy.data.curves.new('Continuous copper cooling coil','CURVE')
curve.dimensions='3D';curve.bevel_depth=.018;curve.bevel_resolution=1;curve.resolution_u=1
spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
for p,co in zip(spline.points,points):p.co=(*c.xyz(co),1)
coil=bpy.data.objects.new('Continuous copper cooling coil',curve)
bpy.context.collection.objects.link(coil);coil.data.materials.append(c.brass);coil.parent=condenser
bpy.ops.object.select_all(action='DESELECT');coil.select_set(True);bpy.context.view_layer.objects.active=coil
bpy.ops.object.convert(target='MESH');coil.select_set(False)
c.box('Water service face',(0,.58,-.317),(.99,.64,.06),c.steel,condenser,.034)
c.tube('Analog gauge bezel',(-.27,.72,-.36),(-.27,.72,-.402),.114,c.brass,condenser,32)
c.tube('Analog gauge face',(-.27,.72,-.403),(-.27,.72,-.407),.097,c.ivory,condenser,32)
c.tube('Gauge needle',(-.27,.72,-.410),(-.31,.77,-.410),.006,c.red,condenser,8)
for i in range(9):
    a=i*math.pi/6-.78
    c.tube('Gauge graduation',(-.27+.075*math.cos(a),.72+.075*math.sin(a),-.411),(-.27+.089*math.cos(a),.72+.089*math.sin(a),-.411),.0025,c.dark,condenser,6)
c.box('Sight glass recess',(.17,.72,-.355),(.13,.31,.025),c.dark,condenser,.014)
c.box('Water level',(.17,.685,-.373),(.07,.19,.009),c.cyan,condenser,.008)
for y in [.62,.70,.78]:c.box('Sight glass graduation',(.17,y,-.383),(.086,.008,.005),c.ivory,condenser,.001)
c.cable('Tap spout',[(.33,.49,-.37),(.33,.49,-.51),(.33,.435,-.54)],.029,c.brass,condenser)
ring('Tap handwheel',(.33,.535,-.40),.054,.011,c.red,condenser)
c.box('Collection drip tray',(.20,.29,-.445),(.55,.055,.33),c.bare,condenser,.016)
for i in range(7):c.box('Drip tray slat',(-.015+i*.068,.322,-.445),(.023,.009,.275),c.dark,condenser,.002)
bolts(condenser,[-.43,.43],[.35,.84],-.352)
c.label('Water safety plate','CONDENSE / FILTER',(0,.94,-.335),.051,condenser)
c.label('Water outlet label','POTABLE',(-.23,.47,-.37),.043,condenser)

# Reclaimed crop tray: formed sheet metal, living leaves and visible irrigation.
c.box('Reclaimed planter tub',(0,.29,0),(1.61,.53,1.26),c.ivory,planter,.052)
c.box('Planter lower reinforcing band',(0,.105,0),(1.64,.12,1.29),c.steel,planter,.021)
c.box('Recessed soil bed',(0,.55,0),(1.43,.026,1.10),c.soil,planter,.012)
for x in [-.782,.782]:c.tube('Rolled tray rim',(x,.586,-.59),(x,.586,.59),.030,c.bare,planter)
for z in [-.60,.60]:c.tube('Rolled tray rim',(-.78,.586,z),(.78,.586,z),.030,c.bare,planter)
for x in [-.57,.57]:
    c.tube('Irrigation manifold',(x,.584,-.48),(x,.584,.48),.019,c.brass,planter,12)
    for z in [-.27,.27]:c.tube('Drip elbow',(x,.584,z),(x*.73,.584,z),.012,c.brass,planter,10)
for i,x in enumerate([-.44,0,.44]):
    for j,z in enumerate([-.28,.28]):c.plant((x,.555,z),.65,planter,seed=i*1.1+j*.7)
c.cable('Protected irrigation hose',[(-.57,.58,.48),(0,.58,.51),(.57,.58,.48)],.021,c.dark,planter)
for x in [-.66,.66]:c.box('Carry handle',(x,.37,-.645),(.18,.08,.025),c.steel,planter,.018)
c.label('Crop plate','GREENS / BED 03',(0,.33,-.636),.065,planter)
bolts(planter,[-.67,.67],[.19,.47],-.635)

# Compact detail budget, no scene lamps or extra producer authority.
c.export('galley-kit',root,preserve=(stove,condenser,planter))
bpy.context.view_layer.update()
from mathutils import Vector
report={}
for obj in [stove,condenser,planter]:
    points=[o.matrix_world@Vector(corner) for o in obj.children_recursive if o.type=='MESH' for corner in o.bound_box]
    low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
    report[obj.name]={'min':[low[0],low[2],-high[1]],'max':[high[0],high[2],-low[1]],'triangles':sum(len(o.data.polygons) for o in obj.children_recursive if o.type=='MESH'),'meshes':sum(o.type=='MESH' for o in obj.children_recursive)}
(c.OUT/'bounds.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('GALLEY_BOUNDS',json.dumps(report),flush=True)
