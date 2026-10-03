"""Original ruined industry kit. Blender 5.1 --background --python this_file.

Authored in metres, Blender Z up; glTF export converts to Godot Y up.
Five joined root meshes, four shared materials, baked vertex weathering.
No external models, images, fonts or textures are required.
"""
import bpy, math, random, json, struct
from pathlib import Path
from mathutils import Vector, Matrix, noise

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-wasteland/industry'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
R=random.Random(251026)

def material(name,metallic,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Metallic'].default_value=metallic
    bs.inputs['Roughness'].default_value=roughness
    vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Weathering'
    m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
    return m

M=[material('Wasteland / oxidized steel',.36,.86),
   material('Wasteland / scoured paint',.15,.91),
   material('Wasteland / fractured concrete',0,.96),
   material('Wasteland / dead photovoltaic cells',.12,.69)]
STEEL=(.065,.071,.068);RUST=(.26,.10,.043);PAINT=(.37,.255,.10)
CONCRETE=(.38,.335,.26);DARK=(.025,.030,.030);PANEL=(.043,.09,.12)

class Model:
    def __init__(self,name):
        self.name=name;self.v=[];self.f=[];self.mi=[];self.colors=[];self.sm=[]
    def add(self,verts,faces,mat=0,color=STEEL,smooth=False):
        off=len(self.v)
        for p in verts:
            p=Vector(p);self.v.append(p)
            grain=noise.noise_vector(p*2.7+Vector((4.3,12.7,2.1))).x
            broad=noise.noise_vector(p*.61+Vector((1.1,3.4,2.7))).y
            factor=.86+.19*grain+.10*broad
            if mat==2:
                # Long mineral/runoff stains on the shell, baked rather than
                # a runtime procedural shader or a repeated texture stamp.
                runoff=max(0,noise.noise_vector(Vector((p.x*1.6,p.y*1.6,.7))).x+.10)
                factor*=1.0-runoff*.44
            rust=max(0,noise.noise_vector(p*.87+Vector((8,3,1))).z-.06)*.92 if mat==1 else 0
            dust=max(0,.18-p.z*.035)
            tint=[max(.008,(c*(1-rust)+r*rust)*factor)*(1-dust)+d*dust for c,r,d in zip(color,RUST,(.36,.285,.19))]
            self.colors.append((*tint,1))
        self.f.extend(tuple(off+i for i in face) for face in faces)
        self.mi.extend([mat]*len(faces));self.sm.extend([smooth]*len(faces))
    def box(self,at,size,mat=0,color=STEEL,rotation=None):
        x,y,z=[v*.5 for v in size]
        verts=[Vector(p) for p in [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]]
        if rotation:
            rot=rotation if isinstance(rotation,Matrix) else Matrix.Rotation(rotation[2],3,'Z')@Matrix.Rotation(rotation[1],3,'Y')@Matrix.Rotation(rotation[0],3,'X')
            verts=[rot@v for v in verts]
        self.add([v+Vector(at) for v in verts],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,color)
    def rod(self,a,b,r,mat=0,color=STEEL,sides=10,r2=None):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u);verts=[]
        for center,radius in [(a,r),(b,r if r2 is None else r2)]:
            for i in range(sides):
                ang=i*math.tau/sides;verts.append(center+radius*(math.cos(ang)*u+math.sin(ang)*v))
        faces=[tuple(reversed(range(sides))),tuple(range(sides,sides*2))]
        faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
        self.add(verts,faces,mat,color,True)
    def beam(self,a,b,width,depth,mat=1,color=PAINT):
        a,b=Vector(a),Vector(b);axis=b-a
        self.box((a+b)*.5,(width,depth,axis.length),mat,color,axis.to_track_quat('Z','Y').to_matrix())
    def slab(self,at,size,mat=2,color=CONCRETE,angle=0):
        x,y,z=size;outline=[(-.5,-.44),(.1,-.5),(.48,-.24),(.37,.07),(.5,.35),(.22,.5),(-.29,.41),(-.5,.15)]
        rot=Matrix.Rotation(angle,3,'Z');verts=[]
        for h in [-z*.5,z*.5]:
            verts.extend(rot@Vector((a*x,b*y,h))+Vector(at) for a,b in outline)
        n=len(outline)
        self.add(verts,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,color)
    def shell(self,centers,radii,thickness=.12,mat=1,color=PAINT,sides=24,jagged=0):
        centers=[Vector(c) for c in centers];axis=(centers[-1]-centers[0]).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u);verts=[]
        for inset in [0,thickness]:
            for k,(c,r) in enumerate(zip(centers,radii)):
                for j in range(sides):
                    angle=j*math.tau/sides;tear=axis*(R.uniform(-jagged,jagged) if k==len(centers)-1 else 0)
                    verts.append(c+(u*math.cos(angle)+v*math.sin(angle))*(r-inset)+tear)
        faces=[];rings=len(centers);layer=rings*sides
        for k in range(rings-1):
            for j in range(sides):
                a=k*sides+j;b=k*sides+(j+1)%sides
                faces.extend([(a,b,b+sides,a+sides),(a+layer+sides,b+layer+sides,b+layer,a+layer)])
        for k in [0,rings-1]:
            for j in range(sides):
                a=k*sides+j;b=k*sides+(j+1)%sides;faces.append((a,a+layer,b+layer,b))
        self.add(verts,faces,mat,color)
    def rubble(self,count,radius):
        for i in range(count):
            angle=R.random()*math.tau;r=R.uniform(radius*.58,radius)
            self.slab((math.cos(angle)*r,math.sin(angle)*r,.10+R.random()*.10),(R.uniform(.5,1.7),R.uniform(.4,1.1),R.uniform(.13,.35)),angle=R.random()*math.tau)
    def finish(self):
        mesh=bpy.data.meshes.new(self.name+' / editable geometry');mesh.from_pydata(self.v,[],self.f);mesh.update()
        for mat in M:mesh.materials.append(mat)
        colors=mesh.color_attributes.new(name='Weathering',type='FLOAT_COLOR',domain='POINT')
        for i,col in enumerate(self.colors):colors.data[i].color=col
        for i,p in enumerate(mesh.polygons):p.material_index=self.mi[i];p.use_smooth=self.sm[i]
        obj=bpy.data.objects.new(self.name,mesh);scene.collection.objects.link(obj)
        mesh.calc_loop_triangles()
        lo=[min(v[i] for v in self.v) for i in range(3)];hi=[max(v[i] for v in self.v) for i in range(3)]
        # Blender (x,y,z) exports to Godot (x,z,-y).
        stats={'id':self.name,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
               'boundsGodot':{'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'size':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]},
               'rootOrigin':[0,0,0],'materials':len(set(self.mi))}
        return obj,stats

def excavator():
    m=Model('wasteland-excavator')
    # Continuous track loops: open centres reveal road wheels and suspension.
    outer=[(-2.65,.32),(-2.9,.70),(-2.6,1.15),(2.4,1.15),(2.8,.78),(2.55,.32)]
    inner=[(-2.4,.5),(-2.64,.70),(-2.35,.96),(2.18,.96),(2.52,.77),(2.31,.5)]
    for y in [-1.55,1.55]:
        verts=[(x,yy,z) for yy in [y-.39,y+.39] for ring in [outer,inner] for x,z in ring]
        faces=[];n=6
        for j in range(n):
            k=(j+1)%n
            faces.extend([(j,k,k+12,j+12),(j+6,j+18,k+18,k+6),(j,j+6,k+6,k),(j+12,k+12,k+18,j+18)])
        m.add(verts,faces,0,DARK)
        for i in range(17):
            x=-2.48+i*.30
            m.box((x,y,1.17),(.24,.86,.09),0,RUST)
            m.box((x,y,.29),(.24,.86,.09),0,STEEL)
        for x in [-2.2,-1.45,-.7,.05,.8,1.55,2.2]:
            m.rod((x,y-.41,.72),(x,y+.41,.72),.36,0,STEEL,12)
            m.rod((x,y-.45,.72),(x,y+.45,.72),.12,1,PAINT,10)
    m.box((-.3,0,1.30),(4.3,2.8,.32),0,RUST)
    m.rod((-.7,0,1.45),(-.7,0,1.7),1.0,0,STEEL,20)
    m.box((-1.05,.15,2.06),(2.9,2.55,1.0),1,PAINT)
    for i in range(6):m.box((-2.53,-.75+i*.28,2.1),(.055,.15,.47),0,DARK)
    # A windowless cab: large real openings and torn sheet roof.
    for x in [-1.4,.2]:
        for y in [-1.25,-.10]:m.beam((x,y,2.2),(x+.16,y,3.5),.10,.10,0)
    for z in [2.3,3.5]:
        m.beam((-1.4,-1.25,z),(.35,-1.25,z),.09,.09,1)
        m.beam((.35,-1.25,z),(.35,-.1,z),.09,.09,1)
    m.slab((-.55,-.68,3.57),(1.85,1.36,.13),1,PAINT,.03)
    m.box((-.8,-.65,2.49),(.55,.50,.2),0,DARK)
    m.box((-.99,-.65,2.82),(.16,.56,.60),0,DARK,(0,.14,0))
    for a,b,w in [((.35,.46,2.0),(2.7,.46,3.35),.50),((2.7,.46,3.35),(4.2,.46,1.0),.41),((4.2,.46,1.0),(5.8,.46,.72),.30)]:
        for side in [-.32,.32]:
            m.beam(Vector(a)+Vector((0,side,0)),Vector(b)+Vector((0,side,0)),w,.15,1)
        m.rod((a[0],a[1]-.55,a[2]),(a[0],a[1]+.55,a[2]),.21,0,RUST,14)
    m.rod((.4,.45,1.75),(2.04,.45,2.5),.16,0,STEEL,12)
    m.rod((2.04,.45,2.5),(2.8,.45,2.9),.09,0,(.28,.27,.22),12)
    m.rod((2.8,.45,3.2),(3.8,.45,1.85),.12,0,RUST,12)
    # Curved, open bucket with individually broken digging teeth.
    curve=[(5.45,.95),(5.55,.45),(5.9,.16),(6.8,.13),(7.0,.42)]
    verts=[(x,y,z) for y in [-.43,1.4] for x,z in curve]
    faces=[(i,i+1,i+6,i+5) for i in range(4)]+[(0,1,2,3,4),(9,8,7,6,5)]
    m.add(verts,faces,0,RUST)
    for y in [-.3,.1,.5,.9,1.3]:m.beam((6.74,y,.16),(7.35,y,.07),.15,.13,0,RUST)
    m.rod((-1.9,1.05,2.5),(-1.75,1.05,3.45),.095,0,STEEL,10)
    for i in range(10):m.slab((R.uniform(-2,1),R.uniform(-1.0,1.0),2.57),(.38,.28,.013),0,RUST,R.random()*6)
    return m.finish()

def turbine():
    m=Model('wasteland-wind-turbine')
    m.slab((-5.4,0,.18),(4.3,4.1,.36),2,CONCRETE,.1)
    m.shell([(-5.4,0,.28),(-5.4,0,2.8),(-5.25,.1,5.0)],[1.05,.85,.69],.13,1,(.46,.44,.36),24,.32)
    for i in range(12):
        a=i*math.tau/12
        m.rod((-5.4+math.cos(a)*1.24,math.sin(a)*1.24,.26),(-5.4+math.cos(a)*1.24,math.sin(a)*1.24,.61),.065,0,RUST,8)
    m.shell([(-3.6,.35,.58),(-.2,.75,.80),(3.6,1.1,1.37)],[.67,.56,.46],.08,1,(.44,.43,.35),24,.16)
    # Internal ladder spilled from the mast, and cable still trailing to nacelle.
    for y in [-.30,.18]:m.rod((-3.8,y,.15),(3.5,y,.37),.045,0,RUST,8)
    for i in range(12):m.rod((-3.5+i*.57,-.30,.17+i*.017),(-3.5+i*.57,.18,.17+i*.017),.035,0,STEEL,8)
    m.box((4.5,1.1,1.52),(2.8,1.65,1.42),1,(.33,.34,.29),(0,.09,.09))
    for i in range(7):m.box((3.65+i*.23,.24,1.5),(.10,.035,.65),0,DARK)
    m.box((4.2,1.1,2.25),(1.3,1.25,.12),0,RUST,(.2,.25,0))
    hub=Vector((6.05,1.1,1.25))
    m.rod(hub-Vector((.1,0,.5)),hub+Vector((.1,0,.5)),.60,0,RUST,18)
    def blade(direction,length,width,drop,broken=False):
        direction=Vector(direction).normalized();side=Vector((-direction.y,direction.x,0));verts=[]
        rings=14
        for i in range(rings):
            t=i/(rings-1);center=hub+direction*length*t+Vector((0,0,-drop*t+.45*math.sin(t*math.pi)))
            w=width*(.34+.80*math.sin((.13+t*.87)*math.pi))*(1-t*.65)
            if broken and i==rings-1:w*=1.8
            for across,height in [(-1,0),(-.4,.11),(.6,.08),(1,0),(.1,-.06),(-.7,-.05)]:
                verts.append(center+side*w*across+Vector((0,0,height)))
        faces=[]
        for i in range(rings-1):
            for j in range(6):
                if broken and i==rings-2 and j in [1,2]:continue
                a=i*6+j;b=i*6+(j+1)%6;faces.append((a,b,b+6,a+6))
        faces.append(tuple(reversed(range(6))))
        m.add(verts,faces,1,(.46,.45,.37))
        m.rod(hub,hub+direction*length*.31,.085,0,RUST,8)
    blade((-.8,-.6,0),10.1,.91,.99)
    blade((.12,1,0),6.4,.75,1.07)
    blade((.94,-.3,0),2.8,.80,.52,True)
    for i in range(9):
        a=i*math.tau/9;m.rod((-5.25+.66*math.cos(a),.1+.66*math.sin(a),4.88),(-5.15+.68*math.cos(a),.1+.7*math.sin(a),5.4+R.random()*.3),.029,0,RUST,6)
    return m.finish()

def cooling():
    m=Model('wasteland-cooling-tower')
    n=40;levels=6;verts=[];heights=[]
    # Missing foreground shell exposes the basin. Irregular top is fractured,
    # not a complete high tower or a simple open cylinder.
    for j in range(n+1):
        a=j*math.tau/n
        height=(9.7+R.uniform(-1.2,1.2)) if 0.06<a<3.6 else R.uniform(1.5,3.3)
        if 1.7<a<2.25:height-=2.2
        heights.append(height)
    heights[-1]=heights[0]
    for inset in [0,.30]:
        for k in range(levels):
            for j in range(n+1):
                t=k/(levels-1);a=j*math.tau/n;z=1.6+(heights[j]-1.6)*t
                r=8.3-2.7*math.sin(min(1,z/13)*math.pi*.80)-inset
                verts.append((r*math.cos(a),r*math.sin(a),z))
    faces=[];row=n+1;layer=row*levels
    for k in range(levels-1):
        for j in range(n):
            if (j in [27,28,29] and k>=1) or (j in [5,6] and k==2):continue
            a=k*row+j;faces.extend([(a,a+1,a+1+row,a+row),(a+layer+row,a+layer+row+1,a+layer+1,a+layer)])
    for j in range(n):
        a=(levels-1)*row+j;faces.append((a,a+layer,a+layer+1,a+1))
    m.add(verts,faces,2,CONCRETE)
    for j in range(28):
        a=j*math.tau/28;b=a+.13
        m.beam((8.0*math.cos(a),8.0*math.sin(a),.12),(7.4*math.cos(b),7.4*math.sin(b),1.7),.28,.3,2,CONCRETE)
        if j%2==0:m.beam((8.0*math.cos(b),8.0*math.sin(b),.12),(7.4*math.cos(a),7.4*math.sin(a),1.7),.22,.23,2,CONCRETE)
    for j in range(0,n,2):
        a=j*math.tau/n;z=heights[j];r=8.3-2.7*math.sin(min(1,z/13)*math.pi*.80)
        m.rod((r*math.cos(a),r*math.sin(a),z-.4),((r+.1)*math.cos(a+.018),(r+.1)*math.sin(a+.018),z+R.uniform(.3,.95)),.035,0,RUST,6)
    m.shell([(0,0,.05),(0,0,.30)],[7.2,7.2],.3,2,(.25,.25,.21),32)
    for x in [-3.3,1.6]:
        m.rod((x,-6,.55),(x,3,.55),.27,0,RUST,12)
        for y in [-3,0,3]:m.rod((x-.12,y,.55),(x-.12,y,2.3 if y==3 else 1.0),.16,0,STEEL,10)
    m.rubble(28,10.2)
    for i in range(7):m.slab((R.uniform(-4,4),R.uniform(-5,2),R.uniform(.25,.6)),(R.uniform(1.5,3.5),R.uniform(1,2.8),.36),2,CONCRETE,R.random()*6)
    return m.finish()

def tunnel():
    m=Model('wasteland-tunnel')
    def arch(y,length,segments,skip=(),r=6.45):
        verts=[]
        for yy in [y,y+length]:
            for rr in [r,r+.76]:
                for j in range(segments+1):
                    a=j*math.pi/segments;verts.append((rr*math.cos(a),yy,1+rr*math.sin(a)))
        faces=[];row=segments+1
        for j in range(segments):
            if j in skip:continue
            a=j;b=j+1
            faces.extend([(a,b,b+2*row,a+2*row),(a+row,a+3*row,b+3*row,b+row),
                          (a,a+row,b+row,b),(a+2*row,b+2*row,b+3*row,a+3*row)])
            if j==0 or j-1 in skip:faces.append((a,a+2*row,a+3*row,a+row))
            if j==segments-1 or j+1 in skip:faces.append((b,b+row,b+3*row,b+2*row))
        m.add(verts,faces,2,CONCRETE)
    arch(-3,.80,28,skip=[10,11,12])
    arch(-2.2,5.6,28,skip=[8,9,10,11,12,13,14,15])
    arch(3.4,.70,28,skip=[14,15,16])
    for x in [-6.80,6.80]:
        m.box((x,.55,.52),(.80,7.5,1.05),2,CONCRETE)
    # Roadbed is split with a real gap and staggered chipped edges.
    for x,y,w,d in [(-3.4,-.9,5.5,8.9),(2.6,1.2,4.8,7.8),(1.8,-4.0,4.4,2.0)]:
        m.slab((x,y,.05),(w,d,.18),2,(.105,.104,.09),.02*x)
    for y in [-3.3,-.8,1.7]:m.box((0,y,.157),(.16,1.1,.018),1,(.47,.4,.25),(0,0,.05))
    for y in [-3.03,-2.75,3.38,3.8]:
        for j in list(range(7,11))+list(range(13,17)):
            a=j*math.pi/28;r=6.65
            m.rod((r*math.cos(a),y,1+r*math.sin(a)),(r*math.cos(a+.06),y+R.uniform(-.1,.15),1+r*math.sin(a+.06)+.42),.032,0,RUST,6)
    for x in [-5.8,5.8]:
        for y in [-3,-.5,2.1]:
            m.rod((x,y,.1),(x,y,1.0),.055,0,RUST,8)
        m.beam((x,-3.3,.82),(x,1.9,.82),.12,.14,0,STEEL)
    m.slab((-2.8,-4.5,.46),(3.2,2.1,.82),2,CONCRETE,.4)
    m.slab((4.0,-4.7,.24),(2.8,1.4,.48),2,CONCRETE,-.2)
    for i in range(18):
        x=R.uniform(-6,6);y=R.uniform(-5,5)
        m.slab((x,y,.19),(R.uniform(.35,1.2),R.uniform(.35,1),.24),2,CONCRETE,R.random()*6)
    return m.finish()

def solar():
    m=Model('wasteland-solar-farm')
    def panel(at,angle,damaged=False,collapsed=False):
        at=Vector(at);rot=Matrix.Rotation(angle,3,'X')
        def p(v):return at+rot@Vector(v)
        for x in [-1.40,1.40]:
            m.beam(p((x,-1.0,0)),p((x,1.0,0)),.065,.07,0,STEEL)
        for y in [-1,1]:
            if damaged and y>0:continue
            m.beam(p((-1.44,y,0)),p((1.44,y,0)),.065,.07,0,STEEL)
        for row in range(3):
            for col in range(6):
                if damaged and (col,row) in [(0,2),(1,2),(4,1),(5,1),(5,2)]:continue
                center=p((-.1-1.12+col*.48,-.65+row*.65,.023))
                m.box(center,(.45,.60,.026),3,PANEL,rot)
                # Pale cell bus bars break large blue plates into legible modules.
                for dx in [-.11,.11]:
                    x=-.1-1.12+col*.48+dx;y=-.91+row*.65
                    m.add([p((x-.006,y,.040)),p((x+.006,y,.040)),p((x+.006,y+.52,.040)),p((x-.006,y+.52,.040))],[(0,1,2,3)],0,(.21,.24,.22))
        if not collapsed:
            for x in [-1.05,1.05]:
                top=p((x,0,-.10));m.beam((top.x,top.y,.08),top,.085,.11,0,RUST)
                m.beam((top.x,top.y-.70,.1),p((x,.75,-.08)),.04,.05,0,STEEL)
        if damaged:
            m.beam(p((.92,.0,-.01)),p((1.65,.64,-.32)),.045,.055,0,RUST)
    for row in range(3):
        for col in range(4):
            if (col,row) in [(3,2),(0,0)]:continue
            panel((-5.3+col*3.35,-3.5+row*3.0,1.45 if (col,row)!=(0,2) else .35),
                  .35 if (col,row)!=(0,2) else -.14,damaged=(col+row)%3==1,collapsed=(col,row)==(0,2))
    panel((-5.8,-4.6,.21),-.08,True,True)
    # Standalone recovery pump/tank at the rear corner of the array.
    m.rod((4.8,4.65,1.0),(7.2,4.65,1.0),.78,1,(.31,.29,.20),20)
    for x in [5.2,6.8]:
        m.beam((x,4.1,.03),(x,4.1,.75),.16,.16,0,RUST)
        m.beam((x,5.2,.03),(x,5.2,.75),.16,.16,0,RUST)
    m.rod((4.2,4.65,.25),(4.2,4.65,1.15),.36,0,RUST,16)
    m.rod((4.2,4.65,1.15),(4.8,4.65,1.15),.10,0,STEEL,10)
    m.rod((4.2,4.65,.3),(2.7,4.65,.3),.10,0,STEEL,10)
    m.rod((2.7,4.65,.3),(2.7,3.0,.3),.10,0,RUST,10)
    m.box((6.0,5.72,.55),(1.1,.52,1.05),1,PAINT,(.03,0,.05))
    m.box((6.0,5.44,.62),(.76,.025,.5),0,DARK)
    for i in range(4):m.box((5.73+i*.18,5.42,.60),(.05,.02,.32),0,RUST)
    return m.finish()

roots=[];report=[]
for build in [excavator,turbine,cooling,tunnel,solar]:
    obj,stats=build();roots.append(obj);report.append(stats)
    print('INDUSTRY_MODEL',json.dumps(stats),flush=True)
assert len(roots)==5
assert sum(r['triangles'] for r in report)<=25000
bpy.ops.object.select_all(action='DESELECT')
for obj in roots:obj.select_set(True)
bpy.context.view_layer.objects.active=roots[0]
export=ROOT/'godot/art/wasteland-industry.glb'
bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_materials='EXPORT',export_extras=True)
raw=export.read_bytes();chunk_length=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+chunk_length])
assert len(gltf['scenes'][0]['nodes'])==5 and len(gltf['meshes'])==5
assert len(gltf['materials'])==4
assert {gltf['nodes'][i]['name'] for i in gltf['scenes'][0]['nodes']}=={obj.name for obj in roots}
assert all('COLOR_0' in primitive['attributes'] for mesh in gltf['meshes'] for primitive in mesh['primitives'])
assert all(not any(field in node for field in ['translation','rotation','scale','matrix','children']) for node in gltf['nodes'])
assert sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives'])==sum(r['triangles'] for r in report)
manifest={'generator':'tools/art/wasteland_industry/build.py','source':'original procedural mesh construction; no third-party assets',
          'unit':'metres','up':'Godot +Y','topLevelMeshCount':5,'sharedMaterialCount':4,
          'triangles':sum(r['triangles'] for r in report),'exportBytes':len(raw),
          'validation':'Five identity root meshes, exact IDs, four materials, vertex colors on every primitive, exported triangle counts match source',
          'models':report}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

# Gallery layout exists only in the editable .blend/contact sheet, never the GLB.
layout=[(-25,15,0),(0,15,0),(25,15,0),(-15,-12,0),(15,-12,0)]
for obj,at in zip(roots,layout):obj.location=at
ground_mat=bpy.data.materials.new('Review only / desert');ground_mat.diffuse_color=(.23,.18,.12,1);ground_mat.use_nodes=True
ground_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.23,.18,.12,1)
ground_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.98
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.11));floor=bpy.context.object;floor.name='REVIEW ONLY / ground';floor.data.materials.append(ground_mat)
for obj,at in zip(roots,layout):
    bpy.ops.object.text_add(location=(at[0],at[1]-8.5,.015));label=bpy.context.object
    label.name='REVIEW ONLY / '+obj.name;label.data.body=obj.name.replace('wasteland-','').upper().replace('-',' ');label.data.size=.70;label.data.align_x='CENTER'
    label.data.extrude=.004
    label_mat=bpy.data.materials.get('Review only / labels')
    if not label_mat:
        label_mat=bpy.data.materials.new('Review only / labels');label_mat.diffuse_color=(.64,.58,.42,1)
    label.data.materials.append(label_mat)
world=bpy.data.worlds.new('Dust haze review sky');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.53,.62,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
bpy.ops.object.light_add(type='SUN',location=(0,0,30));sun=bpy.context.object;sun.rotation_euler=(.43,-.52,-.3);sun.data.energy=2.1;sun.data.angle=.15
bpy.ops.object.camera_add(location=(15,-69,73));cam=bpy.context.object
cam.rotation_euler=(Vector((0,3,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=82;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=1350;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'contact-sheet.png')
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'WastelandIndustry.blend'))
bpy.ops.render.render(write_still=True)
print('INDUSTRY_COMPLETE',json.dumps(manifest),flush=True)
