"""Five original ruined places, Blender 5.1 CLI. Metres; helpers accept Godot Y-up.

No external art. Geometry, painted wear maps and contact sheet are reproducible.
Export contains five identity-transform root meshes and four shared materials.
Run: blender --background --python tools/art/wasteland_places/build.py
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-wasteland/places'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'textures').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system='METRIC'

def xyz(p): return Vector((p[0],-p[2],p[1]))

def mottling(grid,x,y):
    """Smooth random fields; no sine bands, diagonals or ruled scratch rows."""
    n=len(grid);px=x*n/256;py=y*n/256
    ix=int(px);iy=int(py);fx=px-ix;fy=py-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    a=grid[iy%n][ix%n]*(1-fx)+grid[iy%n][(ix+1)%n]*fx
    b=grid[(iy+1)%n][ix%n]*(1-fx)+grid[(iy+1)%n][(ix+1)%n]*fx
    return a*(1-fy)+b*fy

PALETTE=[('Scoured lime and dust',(.36,.29,.195),0),
         ('Oxidized charcoal steel',(.075,.091,.080),.25),
         ('Bleached petrol enamel',(.115,.235,.205),.15),
         ('Weathered red oxide',(.28,.105,.040),.12)]
mats=[]
for index,(name,base,metallic) in enumerate(PALETTE):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.93
    shader.inputs['Metallic'].default_value=metallic
    rng=random.Random(50925+index);pixels=[]
    fields=[[[rng.uniform(-1,1) for _ in range(n)] for _ in range(n)] for n in [5,13,37]]
    for y in range(256):
        for x in range(256):
            n=rng.random()
            broad=mottling(fields[0],x,y);medium=mottling(fields[1],x,y);fine=mottling(fields[2],x,y)
            v=.91+.075*broad+.038*medium+.021*fine+(n-.5)*.036
            rgb=[c*v for c in base]
            # Irregular oxidation clusters and sparse grit survive image export.
            if index and (n>.987 or (medium>.48 and n>.90)):
                rgb=[a*.65+b*.35 for a,b in zip(rgb,(.24,.135,.061))]
            if n<.014:rgb=[c*.82 for c in rgb]
            pixels.extend((*rgb,1))
    im=bpy.data.images.new(name+' original patina',256,256)
    im.pixels[:]=pixels;im.file_format='PNG';im.filepath_raw=str(OUT/'textures'/('surface-%d.png'%index));im.save();im.pack()
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
    mats.append(mat)

class Model:
    def __init__(self,name):
        self.name=name;self.v=[];self.f=[];self.mi=[]
    def mesh(self,verts,faces,mat=0):
        offset=len(self.v)
        self.v.extend(xyz(v) for v in verts)
        self.f.extend(tuple(i+offset for i in face) for face in faces)
        self.mi.extend([mat]*len(faces))
    def box(self,p,s,mat=0,angle=0):
        verts=[];c=math.cos(angle);sn=math.sin(angle)
        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]:
            x*=s[0]/2;y*=s[1]/2;z*=s[2]/2
            verts.append((p[0]+x*c-z*sn,p[1]+y,p[2]+x*sn+z*c))
        self.mesh(verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def tube(self,a,b,r,mat=1,n=8,r2=None):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u);verts=[]
        for p,rr in [(a,r),(b,r if r2 is None else r2)]:
            verts.extend(tuple(p+(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))*rr) for i in range(n))
        self.mesh(verts,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def panel(self,points,thickness=.1,mat=0):
        # A polygonal slab extruded vertically: torn roofs and jagged floor debris.
        verts=[(x,y-thickness/2,z) for x,y,z in points]+[(x,y+thickness/2,z) for x,y,z in points];n=len(points)
        self.mesh(verts,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def wall(self,profile,z,thickness=.18,mat=0):
        n=len(profile);verts=[(x,y,z-thickness/2) for x,y in profile]+[(x,y,z+thickness/2) for x,y in profile]
        self.mesh(verts,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def drift(self,at,rx,rz,h,seed):
        rng=random.Random(seed);verts=[(at[0],at[1]+h,at[2])];n=18
        for i in range(n):
            a=i*math.tau/n;r=.91+.09*rng.random();verts.append((at[0]+rx*r*math.cos(a),at[1]+.03,at[2]+rz*r*math.sin(a)))
        self.mesh(verts,[(0,i+1,(i+1)%n+1) for i in range(n)],0)
    def rubble(self,at,scale,seed):
        rng=random.Random(seed);n=6;verts=[]
        for y,rr in [(-.035,1),(.58,.8),(1,.25)]:
            for i in range(n):
                a=i*math.tau/n;var=.78+.25*rng.random()
                verts.append((at[0]+math.cos(a)*scale[0]*rr*var,at[1]+y*scale[1],at[2]+math.sin(a)*scale[2]*rr*var))
        faces=[tuple(reversed(range(n))),tuple(range(n*2,n*3))]
        for j in range(2):
            for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
        self.mesh(verts,faces,0 if seed%3 else 3)
    def scatter(self,rx,rz,count,seed):
        rng=random.Random(seed)
        for i in range(count):
            a=rng.random()*math.tau;rr=rng.uniform(.65,.95)
            self.rubble((math.cos(a)*rx*rr,.035,math.sin(a)*rz*rr),(rng.uniform(.15,.4),rng.uniform(.12,.38),rng.uniform(.18,.42)),i+seed)
    def finish(self):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.f);me.update()
        o=bpy.data.objects.new(self.name,me);scene.collection.objects.link(o)
        for mat in mats:me.materials.append(mat)
        uv=me.uv_layers.new(name='PatinaUV')
        for poly,mat in zip(me.polygons,self.mi):
            poly.material_index=mat
            axis=max(range(3),key=lambda i:abs(poly.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for li in poly.loop_indices:
                p=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(p[a]*.43,p[b]*.43)
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        mod=o.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
        return o

models=[]
# Roadside diner: low horizontal ribs, punched windows, exposed booths, torn roof
# and a tall, leaning arrow sign. Remaining roof is deliberately asymmetrical.
m=Model('wasteland-diner');m.drift((0,0,0),6.55,4.35,.32,21)
m.box((0,.36,0),(11.4,.45,5.7),0)
for z in [-2.62,2.62]:
    m.box((-.5,1.03,z),(10.3,1.05,.16),2)
    for y in [.70,.92,1.15,1.38]:m.box((-.5,y,z*1.015),(10.3,.05,.08),1)
    for x in [-5,-3.55,-2.10,-.65,.80,2.25,3.70,5]:m.box((x,2.10,z),(.11,1.25,.15),1)
    m.box((-.75,2.77,z),(9.9,.14,.19),3)
    for x in [-4.3,-1.4,1.5]:
        m.wall([(x-.65,1.61),(x+.64,1.61),(x+.50,2.05),(x+.21,1.95),(x-.18,2.22),(x-.65,2.13)],z,.018,2)
for x in [-5.18,5.18]:
    m.box((x,1.09,0),(.2,1.16,5.25),2)
    for z in [-1.9,1.5]:m.box((x,2.15,z),(.14,1.45,.12),1)
for x in [-4.65,-3.1,-1.55,0,1.55]:
    for z in [-1.65,1.7]:
        m.box((x,1.03,z),(1.2,.23,.7),3);m.box((x,1.34,z+.25),(1.2,.6,.16),3)
m.box((2.8,1.33,.45),(3.1,.16,1.1),0)
for x in [1.8,2.7,3.6]:
    m.tube((x,.57,-.65),(x,1.05,-.65),.08,1);m.tube((x,1.05,-.65),(x,1.17,-.65),.33,3,12)
for x in [-4.8,-3.2,-1.6,0,1.6,3.2,4.8]:
    points=[(x,2.81,-2.74),(x,3.1,-2.35),(x,3.36,-1.2),(x,3.46,0),(x,3.36,1.2),(x,3.1,2.35),(x,2.81,2.74)]
    for a,b in zip(points,points[1:]):m.tube(a,b,.055,1,6)
m.panel([(-5.45,3.37,-1.6),(2.8,3.37,-1.6),(3.8,3.37,-.7),(2.1,3.37,-.35),(2.65,3.37,.4),(1.6,3.37,.9),(-5.45,3.37,1.8)],.09,2)
m.panel([(-5.5,2.96,-2.9),(3.9,2.96,-2.9),(4.8,3.0,-3.45),(2.3,3.0,-3.4),(-5.5,3.0,-3.4)],.12,3)
for x in [-4.6,-3.4,-2.2,-1,.2,1.4,2.6]:m.box((x,3.05,-3.22),(.45,.035,.48),0)
m.tube((-4.9,.4,3.1),(-4.45,6.1,3.1),.14,1,10)
m.wall([(-5.9,5.12),(-5.7,6.13),(-3.5,6.13),(-3.15,5.72),(-2.65,5.63),(-3.55,5.15)],3.1,.18,3)
for x in [-5.25,-4.65,-4.05]:m.box((x,5.67,2.99),(.10,.44,.05),0)
m.box((3.8,3.51,1.6),(1.1,.45,.8),1)
m.tube((3.8,3.7,1.6),(3.8,4.4,1.6),.18,3)
m.scatter(6.6,4.3,15,31);models.append(m.finish())

# Greenhouse: vaulted skeleton, fractured remaining panels, empty growing beds.
m=Model('wasteland-greenhouse');m.drift((0,0,0),7.6,5.25,.24,52)
for z in [-3.95,3.95]:m.box((0,.39,z),(13.2,.65,.35),0)
for x in [-6.6,6.6]:m.box((x,.38,0),(.35,.62,8.1),0)
arch=lambda x,a:(x,2.4+3.5*math.sin(a),4.0*math.cos(a))
for x in [-6.4,-4.3,-2.15,0,2.15,4.3,6.4]:
    for z in [-4,4]:m.tube((x,.7,z),(x,2.4,z),.075,1,8)
    for i in range(8):
        if x>4 and i in [4,5]:continue
        m.tube(arch(x,i*math.pi/8),arch(x,(i+1)*math.pi/8),.065,1,8)
for i in [0,2,4,6,8]:
    for xa,xb in [(-6.4,-.15),(.15,4.3)]:m.tube(arch(xa,i*math.pi/8),arch(xb,i*math.pi/8),.05,3,6)
for j,(xa,xb) in enumerate([(-6.3,-4.4),(-4.2,-2.25),(-2.05,-.1),(.1,2.05),(2.25,4.2)]):
    for i in [0,1,6,7]:
        if (i+j)%3==0:continue
        a=i*math.pi/8;b=(i+1)*math.pi/8
        m.mesh([arch(xa,a),arch(xb,a),arch(xb-.24,b),arch(xa+.1,b)],[(0,1,2),(0,2,3)],2)
for x in [-4,0,4]:
    m.box((x,.47,0),(2.1,.25,5.8),1)
    for dx in [-1.02,1.02]:m.box((x+dx,.69,0),(.13,.35,5.8),3)
    for z in [-2.85,2.85]:m.box((x,.69,z),(2.1,.35,.12),3)
    m.drift((x,.54,0),.92,2.64,.16,int(x+85))
    for z in [-1.9,-.6,.7,2.0]:
        m.tube((x,.7,z),(x+.11,1.29,z+.09),.022,1,5)
        m.tube((x+.09,1.10,z+.08),(x-.28,1.32,z+.20),.015,1,5)
for y in [1,1.6,2.2]:m.tube((-6.42,y,-4),(-6.42,y,-1.3),.04,3,6)
m.wall([(-6.6,.68),(-6.6,2.0),(-5.6,1.6),(-4.9,1.75),(-3.9,.9),(-3.5,.68)],-4.02,.18,0)
m.tube((5.45,.2,-4.45),(5.45,2.0,-4.45),.68,2,16)
for y in [.45,1.66]:m.tube((5.45,y-.06,-4.45),(5.45,y+.06,-4.45),.72,1,16)
m.tube((5.5,2,-4.45),(4.4,2.45,-4.2),.09,3,8)
m.panel([(3.2,.16,3.6),(5.7,.11,4.4),(6.3,.33,3.8),(4.5,.85,2.9)],.035,2)
m.scatter(7.6,5.3,18,102);models.append(m.finish())

# Service station: cantilevered broken canopy, surviving kiosk and exposed pumps.
m=Model('wasteland-service-station');m.drift((0,0,0),7.2,5.4,.25,74)
m.box((0,.25,-1.5),(11.7,.35,6.1),0)
for x in [-3.7,2.8]:m.tube((x,.4,-1.2),(x,4.4,-1.2),.16,1,10)
for z in [-3.65,1.0]:
    m.tube((-5.95,4.35,z),(4.7,4.35,z),.10,1,8)
for x in [-5.9,-3.75,-1.6,.55,2.7,4.7]:m.tube((x,4.35,-3.65),(x,4.35,1.0),.08,1,8)
m.panel([(-6.1,4.45,-3.8),(3.8,4.45,-3.8),(4.35,4.45,-2.5),(3.1,4.45,-1.85),(4.65,4.45,-.2),(3.1,4.45,1.1),(-6.1,4.45,1.1)],.17,2)
m.box((-1.45,4.49,-3.91),(9.4,.52,.16),3)
for x in [-4.8,-3.6,-2.4,-1.2,0,1.2]:m.box((x,4.52,-4.01),(.65,.09,.03),0)
# One folded fallen canopy section makes the ruin read from above.
m.panel([(3.8,.33,.9),(6.5,.2,1.6),(6.0,.48,3.2),(4.3,2.3,2.0)],.13,2)
for x in [-3.7,-1.3,2.8]:
    m.box((x,.50,-1.3),(1.15,.25,1.35),0)
    m.box((x,1.0,-1.3),(.66,.95,.5),3)
    m.box((x,1.68,-1.3),(.90,.6,.62),2)
    m.box((x,1.7,-1.625),(.62,.25,.025),1)
    for z in [-1.85,-1.98]:m.tube((x-.48,1.75,-1.3),(x-.60,.85,z),.035,1,6)
    m.tube((x-.60,.85,-1.98),(x-.20,.50,-1.8),.035,1,6)
m.box((-2.8,.92,3.20),(5.1,1.6,2.6),0)
m.box((-4.9,2.23,3.2),(.16,1.35,2.6),0)
m.box((-2.8,2.23,4.46),(5.1,1.35,.15),0)
for x in [-4.25,-2.75,-1.25]:m.box((x,2.23,1.96),(.12,1.35,.17),1)
m.wall([(-5.35,2.9),(-.25,2.9),(-.25,3.05),(-1.25,3.05),(-1.65,3.42),(-3.4,3.32),(-4.1,3.52),(-5.35,3.12)],4.45,.18,0)
m.panel([(-5.25,2.98,2.0),(-1.3,2.98,2.0),(-2.0,2.98,3.0),(-.45,2.98,3.25),(-.7,2.98,4.5),(-5.25,2.98,4.5)],.16,3)
m.tube((5.7,.1,-2.4),(5.3,6.2,-2.4),.13,1,10)
m.wall([(4.3,4.75),(4.15,6.0),(5.92,6.15),(6.1,5.45),(5.7,5.40),(5.85,4.86)],-2.4,.17,2)
for y in [5.06,5.40,5.76]:m.box((5.05,y,-2.51),(1.03,.10,.025),0)
m.scatter(7.2,5.5,17,144);models.append(m.finish())

# Observatory: open fractured radome, exposed parabolic receiver, low annex.
m=Model('wasteland-observatory');m.drift((0,0,0),8.6,7.35,.35,225)
m.tube((0,.25,0),(0,3.65,0),4.7,0,24)
for y in [.52,3.34]:m.tube((0,y-.10,0),(0,y+.1,0),4.86,1,32)
for i in range(18):
    a=i*math.tau/18;x=4.72*math.cos(a);z=4.72*math.sin(a)
    m.box((x,2.1,z),(.38,1.35,.17),1,math.pi/2-a)
# Faceted shell; remove a broad near quadrant and several ragged upper facets.
N=20;R=5.06
dome=lambda j,i:(R*math.cos(j*math.pi/10)*math.cos(i*math.tau/N),3.64+R*math.sin(j*math.pi/10),R*math.cos(j*math.pi/10)*math.sin(i*math.tau/N))
for j in range(5):
    for i in range(N):
        if i in [11,12,13,14,15,16] or (j>=2 and i in [9,10,17]) or (j>=4 and i in [0,1,18,19]):continue
        a,b,c,d=dome(j,i),dome(j,i+1),dome(j+1,i+1),dome(j+1,i)
        m.mesh([a,b,c,d],[(0,1,2),(0,2,3)],0)
        if j<4:m.tube(a,d,.042,1,6)
        if j in [0,2,4]:m.tube(a,b,.035,1,6)
# Broken ring ends, one leaning member and the dish behind the missing shell.
m.tube((-2.9,4,-3.95),(-4.4,6.2,-2.1),.09,3,8)
m.tube((.2,3.4,0),(.2,5.0,0),.25,1,12)
axis=Vector((.15,.62,-.77)).normalized();u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u)
center=Vector((.2,5.05,-.5));verts=[];n=24
for j in range(4):
    r=2.8*j/3
    for i in range(n):
        a=i*math.tau/n;verts.append(tuple(center+(u*math.cos(a)+v*math.sin(a))*r+axis*(r*r*.12)))
for j in range(3):
    for i in range(n):m.mesh([verts[j*n+i],verts[j*n+(i+1)%n],verts[(j+1)*n+(i+1)%n],verts[(j+1)*n+i]],[(0,1,2),(0,2,3)],2)
for i in range(0,n,4):
    edge=Vector(verts[3*n+i]);m.tube(tuple(edge),tuple(center+axis*2),.045,1,6)
m.tube(tuple(center+axis*1.85),tuple(center+axis*2.2),.13,3,10)
m.box((5.1,1.2,1.0),(4.35,2.1,4.5),0)
m.panel([(3.4,2.32,-1.4),(7.4,2.32,-1.4),(7.4,2.32,2.7),(6.4,2.32,2.7),(5.5,2.32,1.5),(4.9,2.32,2.7),(3.4,2.32,2.7)],.18,3)
for x in [4.1,5.2,6.3]:m.box((x,1.55,-1.27),(.64,.53,.03),1)
for i in range(4):m.box((0,.12+i*.16,-5.32+i*.28),(2.15,.24+i*.32,.44),0)
m.panel([(-4.9,.21,-3.8),(-6.3,.12,-4.4),(-7.1,.33,-2.9),(-5.8,.64,-1.9)],.11,0)
m.scatter(8.6,7.3,24,225);models.append(m.finish())

# Passenger coach: rounded railway body with daylight through blown windows,
# bogies, partial roof and a twisted rear frame; no black-box window decals.
m=Model('wasteland-passenger-coach');m.drift((0,0,0),6.9,3.25,.40,331)
m.box((0,1.14,0),(12.1,.30,3.2),1)
for x in [-4.2,4.2]:
    m.box((x,.70,0),(1.85,.45,2.2),1)
    for xx in [x-.58,x+.58]:
        m.tube((xx,.58,-1.70),(xx,.58,1.70),.12,1,8)
        for z in [-1.5,1.5]:m.tube((xx,.58,z-.12),(xx,.58,z+.12),.49,1,14)
for z in [-1.62,1.62]:
    m.box((-.25,1.83,z),(11.6,1.04,.11),2)
    for y in [1.42,1.62,1.82,2.02]:m.box((-.25,y,z*1.01),(11.6,.045,.035),1)
    for x in [-5.8,-4.4,-3,-1.6,-.2,1.2,2.6,4.0,5.6]:
        m.box((x,2.84,z),(.13,1.10,.13),1)
    m.box((-1.1,3.42,z),(9.8,.14,.17),3)
for x in [-5.9,5.9]:
    m.box((x,1.92,0),(.12,1.1,3.1),2)
    for z in [-1.56,-.58,.58,1.56]:m.box((x,2.85,z),(.13,1.10,.13),1)
for x in [-5.6,-4.2,-2.8,-1.4,0,1.4,2.8,4.2,5.6]:
    pts=[(x,3.4,-1.7),(x,3.79,-1.4),(x,4.01,-.7),(x,4.05,0),(x,4.01,.7),(x,3.79,1.4),(x,3.4,1.7)]
    for a,b in zip(pts,pts[1:]):
        if x>3 and a[2]<0:continue
        m.tube(a,b,.049,1,6)
for xa,xb in [(-5.9,-4.3),(-4.2,-2.9),(-2.8,-1.5),(-1.4,-.1),(.0,1.3)]:
    for a,b,ya,yb in [(-1.65,-1.35,3.47,3.82),(-1.35,-.65,3.82,4.03),(-.65,.65,4.03,4.03),(.65,1.35,4.03,3.82),(1.35,1.65,3.82,3.47)]:
        m.mesh([(xa,ya,a),(xb,ya,a),(xb,yb,b),(xa,yb,b)],[(0,1,2),(0,2,3)],2)
for x in [-4.5,-3.2,-1.9,-.6,.7,2]:
    for z in [-.99,.99]:
        m.box((x,1.76,z),(.63,.24,.82),3);m.box((x+.30,2.12,z),(.14,.76,.82),3)
m.tube((3.9,1.2,-1.6),(5.65,3.55,-.7),.08,3,8)
m.panel([(4.4,.3,-2.2),(5.8,.2,-2.55),(6.0,.35,-1.7),(4.85,1.05,-1.3)],.08,2)
m.wall([(-5.35,2.29),(-4.53,2.29),(-4.53,2.68),(-4.71,2.49),(-4.90,2.72),(-5.35,2.94)],-1.635,.015,2)
m.scatter(6.8,3.2,13,388);models.append(m.finish())

# Canonical deliverables: no layout transformations, empty nodes or cameras.
bpy.ops.object.select_all(action='DESELECT')
for o in models:o.select_set(True)
export_path=ROOT/'godot/art/wasteland-places.glb'
bpy.ops.export_scene.gltf(filepath=str(export_path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'wasteland-places.blend'),compress=True)
report={'originalAuthored':True,'units':'metres','coordinateSystem':'Godot Y-up (Blender Z-up source)','materials':[x[0] for x in PALETTE],'assemblies':[]}
for o in models:
    o.data.calc_loop_triangles();dims=o.dimensions
    report['assemblies'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'dimensionsGodot':[round(dims.x,3),round(dims.z,3),round(dims.y,3)],'origin':[0,0,0],'materialSlots':len(o.data.materials)})
report['totalTriangles']=sum(a['triangles'] for a in report['assemblies'])
assert len(models)==5 and report['totalTriangles']<=25000
(OUT/'mesh-report.json').write_text(json.dumps(report,indent=2))
print('WASTELAND_PLACES_REPORT',json.dumps(report),flush=True)

# CPU-only studio contact sheet. The saved source/export above remain at origin.
locations=[(-19,0,-10),(0,0,-10),(19,0,-10),(-10,0,11),(12,0,11)]
for o,p in zip(models,locations):o.location=xyz(p)
models[3].rotation_euler.z=math.pi # Show the broken radome and receiver in review.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Wasteland places studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.36,.42,.49,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
ground=bpy.data.materials.new('Review only sand');ground.diffuse_color=(.26,.21,.15,1);ground.use_nodes=True
ground.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.26,.21,.15,1)
ground.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
bpy.ops.mesh.primitive_plane_add(size=180);bpy.context.object.location.z=-.07;bpy.context.object.data.materials.append(ground)
target=xyz((0,1.3,1));bpy.ops.object.camera_add(location=xyz((33,45,62)));camera=bpy.context.object
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=68;scene.camera=camera
bpy.ops.object.light_add(type='SUN',location=(0,0,35));sun=bpy.context.object;sun.rotation_euler=(.48,-.55,-.30);sun.data.energy=2.0;sun.data.angle=.10
bpy.ops.object.light_add(type='AREA',location=xyz((-28,30,20)));lamp=bpy.context.object;lamp.data.energy=2300;lamp.data.size=35;lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
# Small captions face the camera instead of masquerading as game geometry.
caption=bpy.data.materials.new('Review caption');caption.diffuse_color=(.04,.04,.03,1)
for o,p in zip(models,locations):
    bpy.ops.object.text_add(location=xyz((p[0],.45,p[2]+6.7)));t=bpy.context.object
    t.data.body=o.name.replace('wasteland-','').upper();t.data.size=.66;t.data.align_x='CENTER';t.data.extrude=0;t.data.materials.append(caption);t.rotation_euler=camera.rotation_euler
scene.render.resolution_x=1800;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.45
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'contact-sheet.png')
bpy.ops.render.render(write_still=True)
print('WASTELAND_PLACES_DONE',flush=True)
