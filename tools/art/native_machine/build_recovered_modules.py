"""Refined recovered modules. Separate Blender process; no gameplay changes.

Drive/battery and the folded crane fit legacy runtime boxes. Only the exact D3
mount uses the deployed telescopic jib and its per-instance collision boxes.
Named slender terminal fairleads remain non-solid at both live cable origins.
"""
import ast,bpy,bmesh,hashlib,json,math
from pathlib import Path
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-recovered-modules';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
source=ROOT/'assets/art200/machine/NomadLivingArchive.blend'
names=['N200_steel','N200_machined_alloy','N200_rubber','N200_age_ivory','N200_petrol','N200_olive','N200_ochre','N200_clay']
with bpy.data.libraries.load(str(source),link=False) as (available,target):target.materials=list(names)
steel,alloy,rubber,ivory,petrol,olive,ochre,clay=target.materials
colors={'petrol':petrol,'olive':olive,'ochre':ochre,'clay':clay}
recipe=ast.parse((ROOT/'tools/art/art200_machine/build.py').read_text())
for name in ['xyz','finish','box','tube','beam','ring','hose','label','plate','bolt','handle','vents','dial','handwheel','lathe']:
    function=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module(body=[function],type_ignores=[]),'<finished Nomad fabrication helpers>','exec'))
roots=[];report={};current=None

def start(id):
    global current
    current=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(current);roots.append(current)
    current['units']='metres';current['ground_y']=0.0;return current

def base():
    for x in [-.50,.50]:
        for z in [-.45,.45]:box('Rubber isolation pad',(x,.024,z),(.20,.048,.20),rubber,.009)
    box('Folded bolted foundation',(0,.075,0),(1.28,.10,1.20),steel,.018)
    for x in [-.55,.55]:
        for z in [-.48,.48]:bolt((x,.126,z),.019,True)

def plate_front(text,at,width):
    # Existing helper prints toward +Z. Rotate the complete label assembly to
    # the service side (-Z) without changing the physically seated spacing.
    before=set(current.children);plate(text,(-at[0],at[1],-at[2]),width)
    bpy.context.view_layer.update()
    for o in set(current.children)-before:
        o.matrix_world=Matrix.Rotation(math.pi,4,'Z')@o.matrix_world

def dial_front(at,radius):
    before=set(current.children);dial((-at[0],at[1],-at[2]),radius)
    bpy.context.view_layer.update()
    for o in set(current.children)-before:
        o.matrix_world=Matrix.Rotation(math.pi,4,'Z')@o.matrix_world

def mark(name,at,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent or current;o.location=xyz(at);return o

# D1: motor, damped shaft and acoustic gearbox on a grounded service skid.
r=start('quiet-drive');base()
for x in [-.37,-.03]:box('Motor cradle',(x,.23,-.08),(.15,.25,.68),steel,.022)
tube('Laminated drive motor',(-.20,.56,-.43),(-.20,.56,.14),.265,olive,48)
for z in [-.39,-.32,-.25,-.18,-.11,-.04,.03,.10]:
    tube('Cast motor cooling rib',(-.20,.56,z),(-.20,.56,z+.016),.283,steel,40)
tube('Bolted motor front flange',(-.20,.56,-.468),(-.20,.56,-.431),.284,alloy,40)
for i in range(8):
    a=i*math.tau/8;bolt((-.20+.232*math.cos(a),.56+.232*math.sin(a),-.477),.012)
# Real shaft under a corrugated elastomer bellows; end collars meet its ribs.
tube('Continuous output shaft',(-.20,.56,.10),(-.20,.56,.49),.059,alloy,24)
for z in [.16,.22,.28,.34]:
    tube('Damped bellows fold',(-.20,.56,z),(-.20,.56,z+.045),.13,rubber,32)
for z in [.14,.37]:tube('Bellows restraint collar',(-.20,.56,z),(-.20,.56,z+.018),.137,alloy,32)
box('Output bearing pedestal',(-.20,.345,.46),(.33,.44,.17),steel,.023)
tube('Output bearing seat',(-.20,.56,.405),(-.20,.56,.54),.123,olive,32)
box('Acoustic gearbox case',(.365,.60,-.015),(.40,.91,.89),olive,.055)
for z in [-.29,.29]:box('Gearbox mounting foot',(.365,.14,z),(.34,.065,.16),steel,.009)
tube('Right angle output coupler',(-.20,.56,.46),(.365,.56,.46),.060,alloy,24)
box('Gearbox front service panel',(.365,.60,-.473),(.35,.79,.025),steel,.018)
for y in [.30,.37,.44,.51]:box('Gearbox cooling louvre',(.365,y,-.49),(.265,.024,.019),rubber,.006)
for x in [.235,.495]:
    for y in [.245,.94]:
        tube('Panel captive screw',(x,y,-.487),(x,y,-.501),.014,alloy,12)
dial_front((.365,.815,-.484),.080)
plate_front('QUIET / DRIVE',(.0,1.15,-.049),.63)
box('Nameplate support bridge',(0,1.15,0),(.74,.17,.09),steel,.013)
for x in [-.29,.29]:box('Bridge support',(x,.955,0),(.04,.35,.06),steel,.008)
hose('Gearbox control harness',[(.51,.26,.33),(.52,.18,.40),(.34,.15,.47),(.08,.15,.47)],.020,rubber)
tube('Harness floor gland',(.08,.125,.47),(.08,.20,.47),.042,alloy,20)
mark('DriveShaft',(-.20,.56,.54))

# D2: insulated three-cell cabinet with grounded feet, compression rails,
# guarded bus conductors and a separate service breaker panel.
r=start('battery-bank');base()
for x in [-.39,0,.39]:
    box('Cell insulating boot',(x,.21,0),(.355,.19,.88),rubber,.026)
    box('Sealed power-cell shell',(x,.68,0),(.35,.91,.85),petrol,.034)
    box('Removable insulated top',(x,1.15,0),(.36,.07,.87),steel,.018)
    for y in [.38,.98]:box('Cell compression band',(x,y,0),(.363,.045,.89),steel,.007)
    for z in [-.24,.24]:
        tube('Ceramic terminal shoulder',(x,1.183,z),(x,1.213,z),.043,ivory,24)
        tube('Terminal stud',(x,1.206,z),(x,1.237,z),.025,alloy,16)
    box('Terminal guard hood',(x,1.246,0),(.29,.055,.65),petrol,.013)
for z in [-.24,.24]:
    tube('Insulated bus conductor',(-.39,1.226,z),(.39,1.226,z),.017,rubber,16)
    for x in [-.39,0,.39]:tube('Terminal contact cap',(x,1.222,z),(x,1.24,z),.041,alloy,20)
box('Breaker and meter backplate',(0,.74,-.468),(1.02,.35,.063),steel,.021)
for x in [-.45,.45]:
    for y in [.62,.86]:tube('Breaker panel mounting spacer',(x,y,-.414),(x,y,-.47),.023,alloy,20)
for x in [-.35,.35]:
    box('Breaker insulated bezel',(x,.75,-.505),(.19,.23,.035),rubber,.012)
    box('Breaker toggle',(x,.75,-.537),(.04,.105,.025),ivory,.005)
box('Charge window gasket',(0,.76,-.514),(.36,.19,.025),rubber,.009)
box('Printed charge scale',(0,.76,-.529),(.315,.14,.008),ivory,.006)
for i in range(7):box('Charge graduation',(-.12+i*.04,.79,-.535),(.006,.042,.002),steel,.0004)
beam('Resting charge needle',(-.08,.727,-.538),(.02,.797,-.538),.006,clay)
plate_front('RESERVE / 120',(0,.30,-.493),.85)
box('Legend lower support',(0,.30,-.463),(.91,.155,.055),steel,.012)
for x in [-.49,.49]:
    tube('Power gland ferrule',(x,.23,-.48),(x,.23,-.56),.043,alloy,24)
    hose('Insulated power tail',[(x,.23,-.55),(x,.15,-.59),(x*.75,.13,-.57)],.022,rubber)
mark('PowerService',(0,.75,-.55))

# D3: compact articulated boom, real axles/ram and reeved winch. Its stowed
# grapple and all solid equipment stay inside the legacy collision envelope.
r=start('salvage-crane');base()
tube('Slew turntable',(0,.126,0),(0,.255,0),.35,alloy,48)
for i in range(10):
    a=i*math.tau/10;bolt((.302*math.cos(a),.257,.302*math.sin(a)),.012,True)
box('Hydraulic reservoir counterweight',(0,.62,.35),(1.07,.61,.48),ochre,.045)
box('Counterweight upper cap',(0,.937,.35),(1.09,.055,.50),steel,.017)
for x in [-.44,.44]:box('Tank retaining strap',(x,.62,.35),(.043,.64,.50),steel,.008)
box('Central load column',(0,.86,.20),(.31,1.20,.22),steel,.025)
box('Column heel bracket',(0,.2475,.20),(.34,.06,.25),steel,.008)
box('Upper mast sleeve',(0,1.45,.20),(.29,.48,.22),ochre,.020)
for x in [-.31,.31]:box('Winch bearing cheek',(x,.4775,-.29),(.07,.725,.40),steel,.018)
tube('Winch drum axle',(-.355,.63,-.29),(.355,.63,-.29),.059,alloy,24)
tube('Winch cable core',(-.255,.63,-.29),(.255,.63,-.29),.14,steel,32)
for x in [-.26,.26]:tube('Winch flange',(x-.014,.63,-.29),(x+.014,.63,-.29),.175,ochre,32)
for i in range(12):
    x=-.235+i*.042;tube('Reeled cable winding',(x-.012,.63,-.29),(x+.012,.63,-.29),.153,rubber,24)
beam('Primary articulated box boom',(0,1.49,.20),(0,1.88,-.10),.165,ochre)
beam('Short folding jib',(0,1.88,-.10),(0,1.90,-.45),.13,ochre)
for y,z in [(1.49,.20),(1.88,-.10),(1.90,-.45)]:
    tube('Full-width load pivot',(-.165,y,z),(.165,y,z),.067,alloy,28)
    for x in [-.169,.169]:tube('Pivot retainer',(x-.007,y,z),(x+.007,y,z),.044,steel,16)
tube('Lift hydraulic cylinder',(0,1.04,.015),(0,1.48,-.12),.054,steel,28)
tube('Chrome lift piston',(0,1.40,-.095),(0,1.78,-.21),.028,alloy,24)
tube('Piston gland',(0,1.45,-.11),(0,1.50,-.125),.060,ochre,28)
for y,z in [(1.04,.015),(1.78,-.21)]:tube('Ram pinned clevis',(-.095,y,z),(.095,y,z),.040,alloy,20)
box('Ram upper welded lug',(0,1.83,-.21),(.105,.08,.085),steel,.009)
hose('Hydraulic pressure hose',[(.11,.32,.27),(.125,.65,.17),(.12,1.01,.02),(.065,1.09,.01)],.012,rubber)
box('Operator panel stand',(.47,.6175,.03),(.11,1.005,.12),steel,.012)
box('Folded operator console',(.47,1.095,.01),(.29,.32,.25),ochre,.023)
plate('HOIST / 04',(.47,1.13,.141),.245)
for x in [.42,.52]:
    tube('Control lever socket',(x,1.255,.0),(x,1.269,.0),.023,rubber,16)
    box('Control paddle',(x,1.280,.0),(.036,.025,.055),alloy,.005)
for x in [-.14,.14]:
    beam('Stowed grapple arm',(x,.53,-.39),(x*1.6,.29,-.50),.047,steel)
    beam('Stowed grapple inward toe',(x*1.6,.29,-.50),(x*.40,.235,-.50),.038,alloy)
tube('Grapple hinge shaft',(-.19,.52,-.39),(.19,.52,-.39),.035,alloy,20)
box('Grapple stow cradle',(0,.18,-.50),(.48,.12,.13),steel,.012)
hose('Reeved main cable',[(0,.785,-.29),(0,1.05,-.15),(0,1.48,.09),(0,1.90,-.45)],.014,rubber)
# Explicit guide-only exception: a slender supported fairlead reaches the
# existing gameplay endpoint. Never attach a solid shape to these guide meshes.
before=set(r.children)
tube('Guide riser',(0,1.93,-.46),(0,2.25,-.65),.020,steel,20)
tube('Guide terminal axle',(-.046,2.25,-.65),(.046,2.25,-.65),.029,alloy,20)
hose('Guide cable',[(0,1.92,-.45),(0,2.12,-.55),(0,2.25,-.65)],.014,rubber)
guide=mark('FoldedGuide',(0,0,0))
for o in set(r.children)-before-{guide}:o.parent=guide
mark('FoldedCableTip',(0,2.25,-.65),guide)
mark('BoomPivot',(0,1.49,.20));mark('JibPivot',(0,1.88,-.10));mark('GrappleStow',(0,.52,-.39))

before=set(r.children)
beam('Deployed jib pinned rise',(0,1.90,-.45),(0,2.17,-.80),.17,ochre)
beam('Outer telescopic boom sleeve',(0,2.17,-.80),(0,2.22,-1.96),.17,ochre)
beam('Telescopic inner box boom',(0,2.215,-1.86),(0,2.25,-3.105),.13,steel)
for z,y in [(-.84,2.172),(-1.89,2.218)]:
    box('Sleeve reinforcement collar',(0,y,z),(.21,.21,.07),steel,.009)
    tube('Telescopic locking cross pin',(-.12,y,z),(.12,y,z),.022,alloy,20)
for z,y in [(-1.05,2.185),(-1.25,2.194),(-1.45,2.202),(-1.65,2.211)]:
    tube('Sleeve side rivet',(-.082,y,z),(-.101,y,z),.013,alloy,12)
    tube('Sleeve side rivet',(.082,y,z),(.101,y,z),.013,alloy,12)
hose('Extended reeved cable',[(0,1.92,-.45),(0,2.257,-.82),(0,2.303,-1.92),(0,2.321,-3.10)],.012,rubber)
extended=mark('ExtendedJib',(0,0,0))
for o in set(r.children)-before-{extended}:o.parent=extended
before=set(r.children)
tube('Terminal guide link',(0,2.25,-3.105),(0,2.31,-3.25),.019,steel,20)
tube('Terminal sheave axle',(-.046,2.31,-3.25),(.046,2.31,-3.25),.021,alloy,20)
ring('Terminal grooved sheave',(0,2.31,-3.25),.047,.010,alloy,'x')
hose('Terminal fairlead cable',[(0,2.321,-3.10),(0,2.362,-3.24),(0,2.30,-3.30),(0,2.25,-3.25)],.012,rubber)
terminal=mark('ExtendedGuide',(0,0,0),extended)
for o in set(r.children)-before:o.parent=terminal
mark('CableTip',(0,2.25,-3.25),terminal)

# Both controls and legends face the agreed +Z service approaches.
bpy.context.view_layer.update()
for r in roots[:2]:
    for o in list(r.children):o.matrix_world=Matrix.Rotation(math.pi,4,'Z')@o.matrix_world
bpy.context.view_layer.update()

def in_box(p,lo,hi):return all(lo[i]-1e-5<=p[i]<=hi[i]+1e-5 for i in range(3))

for r in roots:
    for o in r.children_recursive:
        if o.type!='MESH':continue
        bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
        mod=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-12],context='FACES_ONLY');bm.to_mesh(o.data);bm.free();o.data.update()
    bpy.context.view_layer.update()
    outside=[];degenerate=0;points=[]
    for o in r.children_recursive:
        if o.type!='MESH':continue
        for v in o.data.vertices:
            p=o.matrix_world@v.co;x,y,z=p.x,p.z,-p.y;points.append((x,y,z))
            valid=(abs(x)<=.68+1e-5 and -.00001<=y<=1.30001 and abs(z)<=.65001)
            if r.name=='salvage-crane':valid|=(abs(x)<=.20001 and 1.29999<=y<=2.00001 and abs(z)<=.55001)
            if o.parent.name=='FoldedGuide':valid=in_box((x,y,z),(-.06,1.89,-.686),(.06,2.285,-.425))
            if o.parent.name=='ExtendedJib':valid=in_box((x,y,z),(-.18,1.82,-.90),(.18,2.28,-.38)) or in_box((x,y,z),(-.18,2.075,-3.15),(.18,2.36,-.72))
            if o.parent.name=='ExtendedGuide':valid=in_box((x,y,z),(-.06,2.20,-3.325),(.06,2.38,-3.08))
            if not valid:outside.append((o.name,tuple(round(v,5) for v in (x,y,z))))
        for f in o.data.polygons:
            if f.area<1e-12:degenerate+=1
    assert not outside,(r.name,'outside legacy envelope',outside[:12],len(outside))
    assert degenerate==0,(r.name,degenerate)
    report[r.name]={'parts':sum(o.type=='MESH' for o in r.children_recursive),'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)],'outsideEnvelopeVertices':0,'degenerateTriangles':0,'guideException':r.name=='salvage-crane'}
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadRecoveredModules.blend'),compress=True)
# Separate guide batch ownership is retained for automated containment tests.
for r in roots:
    parents=[r]+[o for o in r.children_recursive if o.type=='EMPTY' and o.name in ['FoldedGuide','ExtendedJib','ExtendedGuide']]
    for parent in parents:
        for mat in target.materials:
            objects=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
            if not objects:continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            bpy.context.object.name=parent.name+'_'+mat.name
    # Joining and native import apply float32 transforms. Remove microscopic
    # (<0.01 square millimetre) slivers at coincident shallow bevel limits.
    for o in r.children_recursive:
        if o.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-8],context='FACES_ONLY')
        bm.to_mesh(o.data);bm.free();o.data.update()
    report[r.name]['triangles']=sum(len(o.data.polygons) for o in r.children_recursive if o.type=='MESH')
    report[r.name]['materialBatches']=sum(o.type=='MESH' for o in r.children_recursive)
    assert report[r.name]['triangles']<55000,report[r.name]
bpy.ops.object.select_all(action='SELECT')
path=ART/'nomad-recovered-modules.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_tangents=False)
manifest={'models':report,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'guideExceptions':[{'model':'salvage-crane','root':'FoldedGuide','min':[-.06,1.89,-.686],'max':[.06,2.285,-.425],'tip':[0,2.25,-.65],'collision':False},{'model':'salvage-crane','root':'ExtendedGuide','min':[-.06,2.20,-3.325],'max':[.06,2.38,-3.08],'tip':[0,2.25,-3.25],'collision':False}],'deployedSolidBounds':[{'min':[-.18,1.82,-.90],'max':[.18,2.28,-.38]},{'min':[-.18,2.075,-3.15],'max':[.18,2.36,-.72]}],'compatibility':'Original boxes and old cable tip remain for off-bay saved cranes. Only the exact D3 mount deploys the outboard jib and its per-instance collision boxes. Costs and root pivots are untouched.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(ART/'nomad-recovered-modules.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('RECOVERED_MODULES_COMPLETE',json.dumps(report),flush=True)
