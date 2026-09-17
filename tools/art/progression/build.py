"""Original earned Helm hardware and shelf exhibits. Game metres / Y up."""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
c.OUT=ROOT/'assets/progression';c.OUT.mkdir(parents=True,exist_ok=True)
(c.OUT/'exports').mkdir(exist_ok=True)
kit=c.empty('NomadProgress')
roots={name:c.empty(name,parent=kit) for name in [
    'HelmActuator','HelmGovernor','HelmMeridian','HelmBearingNeedle','HelmDialFace',
    'PreservationRecord','PreservationSeeds','PreservationCore']}

def ring(name,at,r,t,mat,parent,axis='z'):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=c.xyz(at),major_radius=r,minor_radius=t)
    obj=bpy.context.object
    if axis=='z':obj.rotation_euler.x=math.pi/2
    elif axis=='x':obj.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return c.finish(obj,name,mat,parent)

def text(name,body,at,size,parent,positive=False):
    obj=c.label(name,body,at,size,parent)
    if positive:obj.rotation_euler=(math.pi/2,0,0)
    return obj

def bolt(at,parent):
    x,y,z=at;c.tube('Captive hex fastener',(x,y,z-.008),(x,y,z+.008),.009,c.brass,parent,6)

# All three upgrades are contained by the existing solid Helm pedestal. Their
# silhouettes become progressively richer without taking additional walking space.
a=roots['HelmActuator']
c.box('Actuator removable carrier',(-.28,.52,.276),(.32,.59,.034),c.steel,a,.012)
for x in [-.39,-.17]:
    c.tube('Polished servo guide',(x,.29,.315),(x,.74,.315),.017,c.bare,a,20)
    for y in [.31,.72]:c.box('Guide clamp',(x,y,.306),(.061,.054,.061),c.ivory,a,.006)
c.tube('Hydraulic actuator barrel',(-.28,.32,.324),(-.28,.57,.324),.040,c.red,a,32)
c.tube('Chrome piston',(-.28,.56,.324),(-.28,.72,.324),.022,c.bare,a,24)
for y in [.34,.39,.53]:ring('Actuator collar',(-.28,y,.324),.042,.006,c.brass,a,'y')
c.box('Travel slider',(-.28,.69,.32),(.23,.038,.065),c.bare,a,.006)
for x in [-.42,-.14]:
    for y in [.26,.79]:bolt((x,y,.303),a)
text('Actuator rating','A1 / SERVO',(-.28,.82,.302),.030,a,True)

g=roots['HelmGovernor']
c.box('Governor plug-in chassis',(0,.925,.284),(.88,.165,.043),c.ivory,g,.015)
c.box('Governor instrument recess',(-.04,.929,.309),(.65,.118,.016),c.dark,g,.006)
for x in [-.39,.39]:bolt((x,.926,.32),g)
for i in range(8):
    x=-.30+i*.06
    c.box('Vector calibration scale',(x,.958,.322),(.024,.010,.005),c.bare,g,.001)
    c.box('Stabilized vector trace',(x,.923+math.sin(i*.65)*.015,.324),(.043,.006,.006),c.cyan,g,.001)
text('Governor serial','VECTOR / 28',(0,.855,.32),.024,g,True)
c.tube('Trim control',(.30,.925,.31),(.30,.925,.35),.031,c.brass,g,24)
for x in [-.41,.41]:
    c.cable('Shielded governor loom',[(x,.86,.28),(x,.81,.32),(x,.75,.32)],.008,c.dark,g)

m=roots['HelmMeridian']
c.box('Meridian authority cartridge',(.12,.27,.299),(.64,.112,.055),c.steel,m,.012)
for x in [-.16,.39]:bolt((x,.269,.332),m)
c.box('Encoded bearing insert',(.105,.269,.334),(.43,.061,.009),c.brass,m,.004)
text('Meridian cartridge legend','MERIDIAN / 45',(.105,.253,.341),.028,m,True)
for x in [-.085,.01,.105,.20,.295]:
    c.box('Authority contact',(x,.20,.30),(.041,.018,.042),c.bare,m,.003)

# Dial needle has a local pivot; root integration tilts it onto the existing dial.
face=roots['HelmDialFace']
c.tube('Replacement dial face',(0,-.003,0),(0,0,0),.147,c.dark,face,48)
for i in range(24):
    angle=i*math.tau/24;inner=.117 if i%3==0 else .127
    c.tube('Fixed heading graduation',(math.sin(angle)*inner,.003,-math.cos(angle)*inner),
        (math.sin(angle)*.139,.003,-math.cos(angle)*.139),.0025,c.ivory,face,6)
n=roots['HelmBearingNeedle']
c.tube('Live heading needle',(0,.012,0),(0,.012,-.117),.006,c.cyan,n,10)
c.tube('Bearing needle counterweight',(0,.012,0),(0,.012,.041),.010,c.brass,n,12)
c.tube('Needle spindle',(0,0,0),(0,.025,0),.020,c.brass,n,20)

# Selectable physical exhibits on the existing shelf. A sealed record reel, a
# seed drawer, and ANNIKA's protected memory core share a bolted archival cradle.
for name in ['PreservationRecord','PreservationSeeds','PreservationCore']:
    p=roots[name]
    c.box('Archive cradle',(0,.025,0),(.44,.05,.25),c.ivory,p,.015)
    c.box('Archive identification lip',(0,.055,-.117),(.40,.045,.018),c.brass,p,.004)
    for x in [-.185,.185]:bolt((x,.021,-.131),p)

p=roots['PreservationRecord']
c.box('Recovered testimony cartridge',(0,.168,.027),(.34,.214,.12),c.steel,p,.022)
c.box('Oxide cassette spine',(0,.164,-.039),(.307,.175,.020),c.red,p,.010)
for x in [-.087,.087]:
    c.tube('Record reel',(x,.175,-.051),(x,.175,-.067),.056,c.brass,p,32)
    c.tube('Reel hub',(x,.175,-.069),(x,.175,-.074),.019,c.dark,p,20)
    for i in range(5):
        angle=i*math.tau/5
        c.tube('Reel spoke',(x,.175,-.071),(x+math.cos(angle)*.043,.175+math.sin(angle)*.043,-.071),.005,c.bare,p,8)
c.box('Paper archive label',(0,.090,-.053),(.20,.034,.006),c.ivory,p,.003)
text('Record legend','WITNESS',(0,.042,-.129),.025,p)

p=roots['PreservationSeeds']
for i in range(3):
    x=(i-1)*.117
    c.tube('Sealed seed vial',(x,.071,.012),(x,.233,.012),.043,c.ivory,p,24)
    for y in [.077,.226]:ring('Vial seal',(x,y,.012),.044,.007,c.brass,p,'y')
    c.tube('Vial viewing port',(x,.155,-.026),(x,.155,-.035),.030,c.dark,p,24)
    for j in range(4):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.009,location=c.xyz((x+(j%2-.5)*.016,.141+(j//2)*.018,-.039)))
        obj=bpy.context.object;obj.scale=(.65,.65,1);c.finish(obj,'Preserved seed',c.brass,p)
text('Seed legend','VIABLE / ORCHARD',(0,.042,-.129),.020,p)

p=roots['PreservationCore']
c.box('Insulated memory socket',(0,.078,.01),(.26,.069,.18),c.dark,p,.010)
c.tube('ANNIKA memory cylinder',(0,.10,.014),(0,.242,.014),.071,c.steel,p,32)
for y in [.116,.155,.197,.238]:ring('Memory data ring',(0,y,.014),.073,.008,c.cyan,p,'y')
for x in [-.10,.10]:
    c.tube('Core protective rail',(x,.07,.014),(x,.255,.014),.011,c.brass,p,16)
c.box('Memory guard bridge',(0,.257,.014),(.24,.022,.052),c.bare,p,.007)
text('Core legend','ANNIKA / MEMORY',(0,.042,-.129),.020,p)

# Compact original palette: no new high resolution texture set for small props.
for material in bpy.data.materials:
    if material.name.startswith('Array_'):material.name=material.name.replace('Array_','Progress_',1)
for image in bpy.data.images:
    if max(image.size)>256:image.scale(256,256);image.pack()
c.export('nomad-progress',kit,preserve=tuple(roots.values()))
bpy.context.view_layer.update()
report={}
for name,obj in roots.items():
    pts=[o.matrix_world@Vector(v) for o in obj.children_recursive if o.type=='MESH' for v in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    report[name]={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]}
(c.OUT/'bounds.json').write_text(json.dumps(report,indent=2))
