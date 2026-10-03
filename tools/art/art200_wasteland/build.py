"""ART200 / 25 NEW complete original roadside and industrial assemblies.
Metres, Godot Y up, coherent muted shared colour families, no third-party art.
Blender --background --threads 4 --python tools/art/art200_wasteland/build.py
Append -- --skip-render to rebuild geometry only.
"""
import bpy,bmesh,json,math,random,sys,struct
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/art200/wasteland'
OUT.mkdir(parents=True,exist_ok=True)
for d in ['textures','renders']: (OUT/d).mkdir(exist_ok=True)
sys.path.insert(0,str(Path(__file__).parent));import geometry as g
from refine import touchup, FINE_COMB
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
S=bpy.context.scene;S.unit_settings.system='METRIC';g.S=S
palette=json.loads((ROOT/'assets/art200/palette.json').read_text())
def linear(h):
    rgb=[int(h.lstrip('#')[i:i+2],16)/255 for i in [0,2,4]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
def mat(name,color,metal,rough):
    m=bpy.data.materials.new('ART200 Wasteland / '+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
sub=palette['substrates']
M=[mat('steel',sub['steel'],.7,.54),mat('seam oxide',sub['rust'],.35,.79),mat('mineral dust',sub['dust'],0,.94),
   mat('aggregate concrete',sub['concrete'],0,.92),mat('aged aluminium',sub['aged_aluminium'],.74,.42),
   mat('rubber and recesses',sub['rubber'],.03,.84),mat('faded ceramic lettering','#C1B8A5',0,.69),mat('dark oxide',sub['dark_rust'],.3,.82)]
families={};N=256;rng=np.random.default_rng(20102026)
rough=.70+rng.normal(0,.018,(N,N))
roughimage=bpy.data.images.new('ART200 paint fine roughness',N,N);roughimage.colorspace_settings.name='Non-Color'
roughimage.pixels.foreach_set(np.stack([rough,rough,rough,np.ones((N,N))],-1).astype(np.float32).ravel())
roughimage.filepath_raw=str(OUT/'textures/paint-roughness.png');roughimage.file_format='PNG';roughimage.save();roughimage.pack()
for j,f in enumerate(palette['families']):
    families[f['id']]=(len(M),len(M)+1)
    for role in ['paint','secondary']:
        m=mat(f['id']+' '+role,f[role],.22,.70);p=m.node_tree.nodes.get('Principled BSDF')
        rr=np.random.default_rng(2100+j*2+(role=='secondary'));field=rr.normal(0,.005,(N,N))
        coarse=rr.uniform(-.028,.028,(16,16));field+=np.repeat(np.repeat(coarse,16,0),16,1)
        for _ in range(6):field=(field+np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))/5
        rgb=np.array(linear(f[role]))[None,None,:]*(1+field[:,:,None])
        # Restrained isolated coating chips, never orange speckles over the paint.
        for _ in range(24):
            x,y=rr.integers(1,252,2);rgb[y:y+1,x:x+int(rr.integers(1,4))]*=.80
        im=bpy.data.images.new('ART200 '+f['id']+' '+role,N,N)
        im.pixels.foreach_set(np.concatenate([rgb,np.ones((N,N,1))],2).astype(np.float32).ravel())
        im.filepath_raw=str(OUT/'textures'/f'{f["id"]}-{role}.png');im.file_format='PNG';im.save();im.pack()
        for image,socket in [(im,'Base Color'),(roughimage,'Roughness')]:
            node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],p.inputs[socket])
        M.append(m)
g.M=M;xyz=g.xyz

class Kit(g.Model):
    def __init__(self,name,family,theme,features):
        super().__init__('art200-'+name);self.family=family;self.p,self.s=families[family];self.theme=theme;self.features=features
        self.groups={};self.current='Structure';self.letter_parts=[]
    def role(self,s):self.current=s
    def add(self,vs,fs,mat=0,smooth=False):
        first=len(self.v);super().add(vs,fs,mat,smooth)
        self.groups.setdefault(self.current,[]).extend(range(first,len(self.v)))
    def profile(self,xy,z,depth,mat):
        n=len(xy);v=[(x,y,zz) for zz in [z-depth/2,z+depth/2] for x,y in xy]
        self.add(v,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def roof(self,x0,x1,y0,y1,z,depth,mat):
        self.profile([(x0,y0-.08),(x1,y1-.08),(x1,y1+.08),(x0,y0+.08)],z,depth,mat)
    def arch(self,at,ro,ri,depth,mat,segments=24):
        x,y,z=at;v=[]
        for zz in [z-depth/2,z+depth/2]:
            for r in [ro,ri]:v.extend((x+r*math.cos(i*math.pi/segments),y+r*math.sin(i*math.pi/segments),zz) for i in range(segments+1))
        n=segments+1;fs=[]
        for i in range(segments):
            fs.extend([(i,i+1,n+i+1,n+i),(2*n+i,3*n+i,3*n+i+1,2*n+i+1),
                       (i,2*n+i,2*n+i+1,i+1),(n+i,n+i+1,3*n+i+1,3*n+i)])
        fs.extend([(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)])
        first=len(self.sm);self.add(v,fs,mat)
        for i in range(segments):self.sm[first+4*i+2]=True;self.sm[first+4*i+3]=True
    def text(self,body,at,size,mat=6):
        self.role('Integral lettering / '+body)
        bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER'
        o.data.size=size;o.data.extrude=.002;o.data.resolution_u=4;o.rotation_euler=(math.pi/2,0,0)
        bpy.ops.object.convert(target='MESH');o=bpy.context.object
        # Fine extruded lettering must not clamp the structural edge radii.
        # Keep it separate through bevel/normal cleanup, then join for runtime.
        o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4)
        o.data.materials.append(M[mat]);g.clean(o,0,True,ground=False)
        group='Integral lettering / '+body
        o.vertex_groups.new(name=group).add(list(range(len(o.data.vertices))),1,'REPLACE')
        self.groups[group]=[];self.letter_parts.append(o);self.role('Structure')
    def nameplate(self,label,at,width,size=.23):
        self.box(at,(width,.48,.07),self.p)
        self.text(label,(at[0],at[1],at[2]+.040),size)
    def steps(self,x,z,w,rise=.18,count=3):
        for i in range(count):self.box((x,(i+1)*rise/2,z-i*.30),(w,(i+1)*rise,.42),3)
    def frame(self,x,y,z,w,h,mat=0):
        for xx in [x-w/2,x+w/2]:self.box((xx,y,z),(.09,h,.12),mat)
        for yy in [y-h/2,y+h/2]:self.box((x,yy,z),(w,.09,.12),mat)
    def finish(self):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.f);me.update()
        ob=bpy.data.objects.new(self.name,me);S.collection.objects.link(ob)
        for m in M:me.materials.append(m)
        for f,mi,sm in zip(me.polygons,self.mi,self.sm):f.material_index=mi;f.use_smooth=sm
        for name,indices in self.groups.items():
            if indices:ob.vertex_groups.new(name=name).add(indices,1,'REPLACE')
        used={f.material_index for f in me.polygons}|({6} if self.letter_parts else set())
        for src,dst in [(5,0),(6,4),(7,1),(2,3)]:
            if len(used)<=6:break
            if src in used and dst in used:
                for f in me.polygons:
                    if f.material_index==src:f.material_index=dst
                if src==6:
                    for part in self.letter_parts:part.data.materials[0]=M[dst]
                used={f.material_index for f in me.polygons}|({6 if M[6] in [p.data.materials[0] for p in self.letter_parts] else 4} if self.letter_parts else set())
        assert len(used)<=6,(self.name,used)
        g.clean(ob,.018,False)
        if self.letter_parts:
            bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
            for part in self.letter_parts:part.select_set(True)
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.join()
        # Portable tangent generation needs triangles. Preserve weighted normals.
        tri=ob.modifiers.new('Portable runtime triangulation','TRIANGULATE');tri.keep_custom_normals=True
        bpy.ops.object.modifier_apply(modifier=tri.name)
        return ob

models=[];entries=[]
def done(m):
    refinement=touchup(m)
    ob=m.finish();models.append(ob);entries.append({'id':m.name,'status':'new','palette_family':m.family,'theme':m.theme,'features':m.features,'phase2_refinement':refinement,
        'fine_comb_refinement':FINE_COMB.get(m.name.removeprefix('art200-'),'Independent review found no concrete defect requiring a further geometry change.'),'editable_component_groups':list(m.groups)})
    print('ART200_WASTELAND_BUILT',m.name,flush=True)

# 01 A shallow banking pavilion and separate drive-up tube island are one site.
m=Kit('brasswell-teller-bank','denim','roadside business','Drive-through bank with recessed teller window, pneumatic transfer island, clerestory and secured night chute')
m.box((0,.17,0),(6.2,.34,4.6),3)
for x in [-2.3,2.3]:m.box((x,1.53,-.8),(.22,2.4,2.4),m.p)
m.box((0,1.53,-1.9),(4.8,2.4,.2),m.p);m.box((0,.90,.4),(4.8,1.1,.18),m.s)
m.frame(0,1.97,.46,4.5,1.03,4);m.box((0,1.46,.64),(4.6,.10,.48),4)
m.roof(-2.7,2.7,3.00,3.36,-.5,3.4,m.p)
for x in [-2.3,2.3]:m.tube((x,2.58,.4),(x,3.0+(x+2.7)/5.4*.36-.02,.4),.06,0)
m.nameplate('BRASSWELL TRUST',(0,2.88,1.27),3.2,.24)
m.role('Drive-up pneumatic island');m.box((3.8,.16,0),(1.45,.32,2.2),3);m.box((3.8,.90,0),(.55,1.20,.55),m.p)
m.tube((3.8,1.3,0),(3.8,2.7,0),.12,4);m.cable([(3.8,2.70,0),(3.8,3.40,0),(2.3,3.40,0),(2.3,2.6,0)],.11,0)
m.panel((3.8,1.30,.30),(.40,.4,.05),m.s);m.box((-1.6,1.02,.56),(.7,.38,.12),0)
done(m)

# 02 Low butterfly-roof reception with luggage shelf and sheltered open porch.
m=Kit('dustmile-motel-office','rose','roadside business','Butterfly-roof motel reception, real open clerestory, luggage alcove, counter and late-arrival key cabinet')
m.box((0,.2,0),(6.7,.4,4.8),3)
m.box((0,1.5,-1.8),(5.6,2.6,.22),m.p)
for x in [-2.7,2.7]:m.box((x,1.5,-.8),(.22,2.6,2.2),m.p)
m.roof(-3.3,0,3.20,2.82,-.2,4.5,m.s);m.roof(0,3.3,2.82,3.35,-.2,4.5,m.s)
for x in [-2.8,2.8]:m.tube((x,.4,1.6),(x,3.20,1.6),.065,0)
m.role('Reception fittings');m.box((-.7,.98,.65),(3.1,1.16,.85),m.p);m.box((-.7,1.6,.65),(3.4,.10,1.02),4)
m.box((1.68,.65,-.7),(1.15,.4,.75),m.s);m.box((1.68,.42,-.7),(1.0,.22,.65),0)
m.panel((1.70,1.65,-1.66),(.8,1.05,.055),m.s)
for x in [1.5,1.9]:
    for y in [1.35,1.65,1.95]:m.box((x,y,-1.62),(.12,.08,.035),0)
m.nameplate('DUSTMILE ROOMS',(-.6,2.63,2.08),3.7,.28);m.steps(0,2.6,2.1,count=2)
done(m)

# 03 Rail parcel loading room with a broken sawtooth roof and real sorting bins.
m=Kit('parcel-post-depot','petrol','roadside business','Sawtooth-roof parcel depot, recessed sorting pigeonholes, roller transfer bench and loading platform')
m.box((0,.48,0),(7.4,.96,4.7),3)
for x in [-3.4,3.4]:m.box((x,2.0,-.45),(.2,2.12,3.6),m.p)
m.box((0,2.0,-2.15),(6.9,2.1,.20),m.p)
for x in [-3.5,-1.15,1.2]:m.roof(x,x+2.3,3.14,3.78,-.4,4.0,m.s);m.box((x+2.3,3.4,-.4),(.11,.62,4.0),0)
m.role('Parcel sorting wall');m.box((0,1.60,-1.65),(4.7,1.28,.66),m.s)
for x in np.arange(-2.25,2.3,.5):m.box((float(x),2.17,-1.37),(.045,.85,.56),0)
for y in [1.76,2.18,2.6]:m.box((0,y,-1.35),(4.65,.045,.60),0)
m.role('Loading rollers');m.box((.8,1.34,.55),(3.9,.14,1.12),0)
for x in np.arange(-1.0,2.65,.28):m.tube((float(x),1.44,.06),(float(x),1.44,1.02),.08,4,16)
for x in [-.9,2.5]:m.box((x,1.10,.55),(.13,.38,.84),0)
m.nameplate('PARCEL POST / 12',(0,2.97,1.65),4.9,.30);m.steps(-2.65,3.46,1.15,rise=.24,count=4)
for x in [-2,2]:
    local=x+3.5 if x<0 else x-1.2
    m.tube((x,3.18,1.60),(x,3.14+local/2.3*.64-.02,1.60),.035,0)
done(m)

# 04 A short masonry laundry arcade with independent drum rims and open doors.
m=Kit('thimble-laundrette','celadon','roadside business','Laundry arcade with three circular drum openings, lint service compartment, folded bench and connected wash manifold')
m.box((0,.14,0),(6.6,.28,4.1),3);m.box((0,1.5,-1.65),(6.0,2.7,.2),m.s)
for x in [-2.95,2.95]:m.box((x,1.48,-.15),(.18,2.66,3.2),m.p)
m.box((-.4,2.90,-.2),(5.6,.17,3.55),m.p)
m.role('Three drum washers')
for x in [-1.85,0,1.85]:
    m.box((x,.95,-.58),(1.43,1.35,1.12),m.p);m.box((x,1.52,.005),(1.27,.28,.08),m.s)
    m.tube((x,.9,-.04),(x,.9,.025),.49,0,40);m.ring((x,.9,.065),.51,.37,.11,4,40,'Z')
    m.tube((x+.40,1.51,.04),(x+.40,1.51,.10),.05,0,16)
m.role('Pipework and folding shelf');m.cable([(-2.6,.55,-1.35),(-2.6,2.15,-1.35),(2.65,2.15,-1.35),(2.65,.55,-1.35)],.07,0)
m.box((0,.68,1.35),(3.8,.11,.60),m.s)
for x in [-1.65,1.65]:m.box((x,.38,1.35),(.1,.6,.5),0)
m.nameplate('THIMBLE / WASH & MEND',(-.4,2.64,1.62),5.25,.26)
done(m)

# 05 Brick oven and a partial shop, not another rectangular complete building.
m=Kit('emberside-bakery','clay','roadside business','Broken bakery kitchen centred on a deep brick oven arch, tapered chimney, flour bins and a supported serving ledge')
m.box((0,.15,0),(6.7,.3,5.1),3)
m.role('Brick oven');m.box((-1.45,.9,-.35),(2.6,1.5,2.3),m.p)
m.arch((-1.45,1.15,.90),1.32,1.00,.36,m.s,28)
for x in [-2.65,-.25]:m.box((x,.7,.9),(.30,1.35,.36),m.s)
m.box((-1.45,1.1,.53),(1.96,1.92,.18),0)
for y in [.52,.78,1.04,1.30]:
    for x in [-2.50,-2.1,-1.7,-1.3,-.9,-.5]:m.box((x,y,1.105),(.36,.19,.02),m.s)
m.tube((-1.45,1.66,-.45),(-1.45,2.45,-.45),1.15,m.p,32,r2=.60)
m.box((-1.45,3.15,-.45),(.75,1.6,.85),m.p);m.box((-1.45,4.02,-.45),(.92,.17,1.02),m.s)
m.role('Shop counter and pantry');m.box((1.65,.82,.6),(2.30,1.34,.8),m.s);m.box((1.65,1.55,.6),(2.55,.12,1.0),4)
m.box((2.7,1.3,-1.65),(.18,2.3,1.5),m.p);m.box((1.75,2.05,-1.7),(1.7,.12,.5),m.s)
for x in [1.2,1.8,2.4]:m.box((x,.69,-1.35),(.48,1.08,.60),m.p);m.box((x,1.25,-1.35),(.50,.10,.63),m.s)
m.nameplate('EMBERSIDE BREAD',(1.55,2.28,-1.44),2.8,.22)
done(m)

# 06 Corner pharmacy with octagonal footprint and interior dispensing cubbies.
m=Kit('drylight-pharmacy','plum','roadside business','Chamfered corner pharmacy kiosk with deep dispensing opening, drawer wall and sheltered prescription counter')
m.box((0,.16,0),(5.4,.32,4.6),3)
m.role('Octagonal enclosure')
for x in [-2.2,2.2]:m.box((x,1.48,-.55),(.18,2.32,2.7),m.p)
m.box((0,1.48,-1.90),(4.5,2.32,.18),m.p)
for x in [-1.80,1.80]:m.box((x,1.45,1.03),(1.0,2.25,.16),m.p,angle=math.copysign(.52,x))
m.box((0,2.80,-.2),(5.08,.18,4.18),m.s)
for x in [-2.2,2.2]:
    for z in [-1.75,.65]:m.box((x,2.67,z),(.11,.26,.11),0)
m.box((0,1.04,1.12),(2.15,1.43,.20),m.s);m.box((0,1.78,1.32),(2.45,.10,.60),4)
m.role('Dispensing furniture');m.box((0,1.46,-1.52),(3.85,2.0,.60),m.s)
for x in np.arange(-1.5,1.6,.60):
    for y in [.76,1.16,1.56,1.96]:
        m.panel((float(x),y,-1.195),(.53,.33,.04),m.p,False);m.box((float(x),y,-1.16),(.14,.033,.022),4)
m.nameplate('DRYLIGHT REMEDIES',(0,2.48,1.92),3.40,.25)
done(m)

# 07 Two-post lift sheltered by an asymmetrical workshop ruin.
m=Kit('cinder-auto-lift','oxblood','roadside business','Automotive lift with attached swing arms and carriers, asymmetric workshop roof and complete hydraulic supply cabinet')
m.box((0,.15,0),(7.0,.30,5.0),3)
m.role('Workshop ruin');m.box((-3.15,1.7,0),(.24,3.1,4.5),m.s);m.box((0,1.08,-2.1),(6.5,1.85,.20),m.s)
m.roof(-3.3,.3,3.6,3.12,0,4.8,m.p)
m.box((-3.15,3.4,0),(.16,.43,4.35),0)
m.box((.18,1.72,1.8),(.13,2.85,.13),0);m.box((.18,2.58,-2.1),(.13,1.16,.13),0)
m.role('Lift mechanism')
for x in [-1.45,1.45]:
    m.box((x,.36,0),(.82,.22,.8),0);m.box((x,1.95,0),(.42,3.25,.45),m.p)
    m.box((x,.95,.30),(.48,.65,.24),m.s);m.tube((x,.5,-.08),(x,3.4,-.08),.052,4)
    for z in [-1.05,1.05]:
        m.beam((x,.72,.20),(x*.20,.72,z),.13,.15,0);m.tube((x*.20,.70,z),(x*.20,.82,z),.16,4,20)
m.box((2.7,.75,-1.2),(.62,1.2,.85),m.p);m.cable([(2.7,1.25,-1.2),(1.45,1.25,-1.2),(1.45,.65,0)],.05,0)
m.grille((2.7,.83,-.755),.42,.60);m.nameplate('CINDER MOTOR WORKS',(-1.5,1.70,-1.97),3.0,.22)
done(m)

# 08 Curved-front ticket booth and mechanically connected turnstile.
m=Kit('rook-ticket-booth','olive','roadside business','Transit ticket booth with chamfered side walls, ticket slot, segmented canopy and a grounded tripod turnstile')
m.box((0,.14,0),(5.1,.28,3.9),3)
for x in [-1.8,0]:m.box((x,1.46,-.8),(.18,2.36,2.35),m.p)
m.box((-.9,1.46,-1.9),(1.98,2.36,.18),m.p);m.box((-.9,.9,.4),(1.98,1.24,.16),m.s)
m.frame(-.9,1.99,.46,1.88,.99,4);m.box((-.9,1.53,.63),(2.08,.09,.45),4)
m.arch((-.9,2.60,-.65),1.20,1.05,2.8,m.s)
m.role('Turnstile and queue rail');m.box((1.45,.95,.25),(.34,1.60,.4),m.p);m.tube((1.45,1.45,.35),(1.45,1.45,.57),.16,4)
for a in [0,120,240]:
    r=math.radians(a);m.tube((1.45,1.45,.55),(1.45+.68*math.cos(r),1.45+.68*math.sin(r),.70),.041,4)
for z in [-1.25,1.25]:m.tube((2.1,.28,z),(2.1,1.28,z),.04,0)
m.tube((2.1,1.28,-1.25),(2.1,1.28,1.25),.04,0);m.nameplate('ROOK TRANSIT',(-.9,2.53,.49),1.75,.17)
done(m)

# 09 Long low scale bed reads differently to every other compound.
m=Kit('switchback-weighbridge','slate','roadside business','Freight weighbridge with tapered approach ramps, stiffened scale deck and a fully supported operator shelter')
m.box((0,.28,0),(10.5,.56,3.4),0)
for z in [-1.72,1.72]:m.box((0,.55,z),(10.6,.13,.16),m.p)
for x in np.arange(-5,5.1,.5):m.box((float(x),.595,0),(.065,.055,3.2),4)
for x,sgn in [(-5.25,-1),(5.25,1)]:m.profile([(x,0),(x+sgn*1.9,0),(x,.56)],0,3.4,3)
m.role('Operator hut');m.box((-2.8,.12,-3.0),(2.6,.24,2.1),3)
for x in [-3.9,-1.7]:m.box((x,1.39,-3.10),(.14,2.3,1.7),m.p)
m.box((-2.8,1.39,-3.9),(2.3,2.3,.14),m.p);m.box((-2.8,.77,-2.3),(2.3,1.08,.13),m.s)
m.frame(-2.8,1.91,-2.25,2.2,1.15,4);m.roof(-4.15,-1.45,2.68,2.49,-3,2.3,m.s)
m.box((-2.8,1.52,-2.53),(1.3,.4,.38),0);m.box((-2.8,1.55,-2.32),(.95,.16,.025),m.s)
m.nameplate('SWITCHBACK SCALE',(-2.8,2.32,-2.18),2.05,.16)
done(m)

# 10 Three public phone alcoves on a single sculpted concrete pedestal.
m=Kit('lastcall-exchange','heather','roadside business','Public communications alcoves with raised hoods, physical handsets, restrained cords and protected terminal faces')
m.box((0,.13,0),(4.75,.26,2.0),3)
for x in [-1.50,0,1.50]:
    m.role('Phone alcove');m.box((x,1.52,-.4),(1.20,2.53,.15),m.p)
    for dx in [-.61,.61]:m.box((x+dx,1.52,.02),(.10,2.53,.96),m.s)
    m.arch((x,2.72,.02),.68,.54,1.05,m.s)
    m.panel((x,1.65,-.28),(.62,.80,.11),0);m.box((x,1.91,-.209),(.38,.14,.032),m.s)
    for dx in [-.11,0,.11]:
        for y in [1.45,1.56,1.67]:m.box((x+dx,y,-.201),(.055,.045,.025),4)
    m.tube((x-.43,1.35,-.13),(x-.43,1.93,-.13),.055,0)
    for y in [1.35,1.93]:m.tube((x-.43,y,-.23),(x-.43,y,-.05),.085,0)
    m.cable([(x-.43,1.4,-.13),(x-.48,.91,-.08),(x-.26,.79,-.02),(x+.06,1.18,-.17)],.017,0)
m.nameplate('LASTCALL EXCHANGE',(0,.54,.54),3.5,.23)
done(m)

# 11 Thick insulated room, large strap hinges and real service louver depth.
m=Kit('ochre-icehouse','verdigris','roadside business','Cold store with a thick insulated hatch, strap hinges, raised dry sill and integrated compressor alcove')
m.box((0,.14,0),(5.3,.28,4.3),3);m.box((0,1.46,-.30),(4.7,2.63,3.55),m.p)
m.box((0,2.88,-.3),(5.0,.18,3.95),m.s)
m.role('Insulated hatch');m.box((-.65,1.47,1.535),(1.94,2.36,.15),0);m.panel((-.65,1.47,1.65),(1.73,2.16,.15),m.s)
for y in [.75,2.12]:m.box((-1.14,y,1.765),(.87,.12,.10),4)
m.box((-.03,1.40,1.79),(.10,.53,.10),0);m.steps(-.65,2.66,2.1,rise=.14,count=2)
m.role('Integrated compressor bay');m.box((2.17,.77,-.2),(1.32,1.28,2.0),0);m.grille((2.17,.85,.82),1.10,.89,10)
m.cable([(1.6,.7,.0),(2.15,.7,.0),(2.15,1.65,-.6),(1.5,1.65,-.6)],.08,4)
m.box((-.15,2.76,1.70),(3.65,.24,.07),m.p);m.text('OCHRE COLD STORAGE',(-.15,2.76,1.74),.16)
done(m)

# 12 Tailor's broken shop with a treadle workbench and tensioning dress form.
m=Kit('threadbare-tailor','umber','roadside business','Open garment workshop with stepped parapet, treadle sewing machine, fabric cutting table and articulated display form')
m.box((0,.16,0),(5.8,.32,4.7),3)
m.box((0,1.53,-1.95),(5.15,2.42,.18),m.s);m.box((-2.5,1.53,-.5),(.18,2.42,3.1),m.s)
m.profile([(-2.58,2.68),(-2.58,3.00),(-1.6,3.0),(-1.6,3.30),(1.5,3.3),(1.5,2.95),(2.58,2.95),(2.58,2.68)],-1.95,.22,m.p)
m.role('Treadle sewing bench');m.box((-.80,1.15,.15),(2.35,.12,1.08),m.p)
for x in [-1.65,.05]:
    for z in [-.20,.53]:m.beam((x,.32,z),(x,1.10,z),.06,.06,0)
m.box((-.8,.59,.16),(.75,.06,.44),0);m.box((-.9,1.29,.15),(1.15,.16,.42),0)
m.box((-.5,1.56,.15),(.24,.46,.32),0);m.box((-.85,1.80,.15),(.87,.14,.3),0);m.tube((-1.18,1.3,.15),(-1.18,1.8,.15),.022,4)
m.ring((-.37,1.65,.34),.19,.12,.06,4,24,'Z')
m.role('Dress form');m.tube((1.65,.30,.1),(1.65,1.0,.1),.04,0);m.tube((1.65,.32,.1),(1.65,.42,.1),.38,0)
m.tube((1.65,.96,.1),(1.65,1.85,.1),.26,m.p,24,r2=.35);m.tube((1.65,1.85,.1),(1.65,2.05,.1),.11,m.s,20)
m.nameplate('THREADBARE REPAIRS',(0,2.84,-1.825),4.6,.28)
done(m)

# 13 A reciprocating compressor: crankcase, flywheel, cylinders, small housing.
m=Kit('crosswind-compressor-house','ochre','industrial relic','Open compressor shelter with broad flywheel, opposed cylinder cooling fins, receiver and motor belt guard')
m.box((0,.18,0),(5.8,.36,4.3),3)
for x in [-2.5,2.5]:
    for z in [-1.7,1.7]:m.box((x,1.88,z),(.16,3.4,.16),0)
m.roof(-2.8,2.8,3.65,3.35,0,3.95,m.s)
m.role('Reciprocating compressor');m.box((-.5,.73,0),(2.4,.75,1.15),m.p)
m.ring((-.8,1.10,.78),.79,.60,.16,0,40,'Z');m.tube((-.8,1.1,.5),(-.8,1.1,.9),.15,4)
for a in range(0,360,60):
    r=math.radians(a);m.tube((-.8,1.1,.78),(-.8+.67*math.cos(r),1.1+.67*math.sin(r),.78),.048,0)
for x in [-1.12,.20]:
    m.tube((x,1.0,0),(x,1.93,0),.30,m.p,24)
    for y in np.arange(1.20,1.94,.13):m.ring((x,float(y),0),.37,.27,.04,4,24)
m.role('Air receiver');m.tube((1.65,.70,-.6),(1.65,2.47,-.6),.57,m.p,32)
for z in [-.95,-.25]:m.box((1.65,.55,z),(.62,.39,.13),0)
for y in [.80,2.35]:m.ring((1.65,y,-.6),.60,.54,.06,4)
m.cable([(.20,1.93,0),(.2,2.2,0),(1.65,2.2,-.6)],.07,0)
done(m)

# 14 A paired grain elevator with a central lifting leg and truck-load spout.
m=Kit('sinter-grain-elevator','stone','industrial relic','Paired tapered grain bins with ladder cage, central elevator leg, connected transfer head and gravity loading spout')
m.box((0,.16,0),(7.1,.32,4.7),3)
for x in [-1.8,1.8]:
    m.role('Grain silo shell');m.tube((x,1.55,0),(x,5.40,0),1.22,m.p,48)
    m.tube((x,.92,0),(x,1.55,0),.33,m.s,32,r2=1.22)
    m.tube((x,5.40,0),(x,6.10,0),1.22,m.s,48,r2=.12)
    for z in [-.72,.72]:m.box((x,.86,z),(.13,1.08,.13),0)
    for y in [1.7,2.8,3.9,5.2]:m.ring((x,y,0),1.24,1.18,.05,4,48)
m.role('Elevator and transfer trunk');m.box((0,3.58,-1.63),(.62,6.5,.6),m.p)
for x in [-1.8,1.8]:m.cable([(0,6.72,-1.63),(x,6.72,-1.63),(x,5.95,0)],.19,0)
m.cable([(0,6.4,-1.63),(0,5.3,1.55),(0,3.6,2.0)],.24,m.s)
m.ladder(0,-1.97,6.65,.35)
done(m)

# 15 Working-mechanism silhouette with articulated horse head and pivot cheeks.
m=Kit('borewell-pumpjack','oxblood','industrial relic','Oil-field walking beam pump with A-frame pivot, curved horsehead, crank counterweights and suspended polished rod')
m.box((0,.19,0),(7.3,.38,3.3),3)
m.role('Walking beam support')
for z in [-.72,.72]:
    m.beam((-1.15,.38,z),(.10,3.20,z),.20,.20,0);m.beam((1.3,.38,z),(.10,3.20,z),.20,.20,0)
m.tube((.1,3.20,-.90),(.1,3.20,.90),.20,4)
m.beam((-2.7,3.75,0),(2.6,2.78,0),.35,.54,m.p)
m.profile([(-2.9,3.42),(-3.2,3.88),(-2.82,4.65),(-2.2,4.5),(-2.36,3.4)],0,.63,m.s)
m.tube((-2.97,.52,0),(-2.97,3.7,0),.042,4);m.box((-2.97,.63,0),(.65,.50,.65),m.p)
m.role('Counterweighted crank');m.box((1.80,.72,0),(1.1,.68,1.1),m.p)
for z in [-.76,.76]:
    m.tube((1.8,1.1,z-.07),(1.8,1.1,z+.07),.58,0,32)
    m.beam((1.50,1.5,z),(2.40,2.83,z),.14,.13,m.s)
    m.box((2.20,.84,z),(.7,.55,.22),m.s)
done(m)

# 16 Short pedestrian service bridge, deck ties supported by complete trusses.
m=Kit('lattice-truss-bridge','petrol','transport relic','Short industrial footbridge with triangular side trusses, deck stringers, broken approach abutment and real walkable span')
for x in [-4.7,4.7]:m.box((x,.45,0),(1.0,.90,3.1),3)
m.box((0,1.0,0),(9.8,.22,2.35),0)
for x in np.arange(-4.6,4.7,.36):m.box((float(x),1.145,0),(.30,.07,2.25),m.p)
for z in [-1.28,1.28]:
    m.beam((-4.8,1.14,z),(4.8,1.14,z),.14,.14,0)
    m.beam((-4.8,2.48,z),(4.8,2.48,z),.14,.14,m.s)
    for x in [-4.8,-2.4,0,2.4,4.8]:m.beam((x,1.14,z),(x,2.48,z),.12,.12,0)
    for i,x in enumerate([-4.8,-2.4,0,2.4]):m.beam((x,1.14 if i%2==0 else 2.48,z),(x+2.4,2.48 if i%2==0 else 1.14,z),.09,.10,m.p)
for i in range(4):m.box((-6.46+i*.35,(i+1)*.23/2,0),(.42,(i+1)*.23,2.35),3)
done(m)

# 17 A hollow perforated drum formed by rings and longitudinal rails, not decals.
m=Kit('reclaimer-trommel','clay','industrial relic','Rotating reclamation screen with genuinely open sieve lattice, drive rings, inclined frame and feed hopper')
m.box((0,.15,0),(6.4,.30,3.3),3)
m.role('Trommel cradle');
for x in [-2.15,2.15]:
    for z in [-.90,.90]:m.beam((x,.3,z),(x,1.6,z),.13,.13,0)
for z in [-.9,.9]:m.beam((-2.35,1.05,z),(2.35,1.55,z),.15,.15,m.p)
m.role('Open rotating sieve')
for x in np.arange(-2.1,2.2,.46):m.ring((float(x),1.82,0),.94,.87,.06,m.p,40,'X')
for a in range(0,360,20):
    t=math.radians(a);m.tube((-2.20,1.82+.90*math.cos(t),.90*math.sin(t)),(2.20,1.82+.90*math.cos(t),.90*math.sin(t)),.023,4,10)
for x in [-1.65,1.65]:m.ring((x,1.82,0),1.01,.88,.14,0,40,'X')
m.role('Feed hopper');m.profile([(-3.0,.65),(-2.3,.85),(-2.3,1.85),(-3.15,2.50),(-3.15,2.10),(-2.55,1.70),(-2.55,1.1),(-3.0,.92)],0,1.25,m.s)
for z in [-.48,.48]:m.box((-2.88,.61,z),(.14,.64,.14),0)
m.box((1.5,.78,-1.10),(.75,.8,.58),m.p);m.cable([(1.5,1.15,-1.1),(1.5,1.25,-.8)],.12,0)
done(m)

# 18 A depot water column with a large pivoted elbow and a hanging canvas hose.
m=Kit('rail-water-crane','denim','transport relic','Steam-depot water crane with flanged column, supported swing neck, valve spindle and lowered filling hose')
m.box((0,.16,0),(4.5,.32,3.4),3)
m.tube((-.9,.32,0),(-.9,3.58,0),.34,m.p,36)
for y in [.48,1.17,3.3]:m.ring((-.9,y,0),.47,.31,.10,4,36)
m.cable([(-.9,3.55,0),(-.9,4.12,0),(1.75,4.12,0),(2.0,3.85,0)],.23,m.s)
m.beam((-.9,2.8,0),(1.5,4.10,0),.095,.10,0)
m.tube((2.0,2.0,0),(2.0,3.87,0),.18,0,24)
for y in np.arange(2.08,3.88,.20):m.ring((2,float(y),0),.19,.16,.023,m.p,24)
m.tube((-.9,.9,.28),(-.9,.9,.72),.075,4);m.ring((-.9,.9,.79),.37,.30,.075,m.s,32,'Z')
for a in [0,120,240]:
    t=math.radians(a);m.tube((-.9,.9,.79),(-.9+.31*math.cos(t),.9+.31*math.sin(t),.79),.035,m.s)
done(m)

# 19 Discharge hopper with a true tapered funnel and hinged grizzly mesh.
m=Kit('ballast-loader','olive','industrial relic','Aggregate loading hopper with tapered discharge body, open grizzly screen, four braced columns and lever-driven gate')
m.box((0,.16,0),(4.7,.32,4.2),3)
for x in [-1.45,1.45]:
    for z in [-1.15,1.15]:m.box((x,2.14,z),(.19,3.7,.19),0)
for z in [-1.15,1.15]:m.beam((-1.45,.4,z),(1.45,2.8,z),.095,.095,0)
m.role('Open tapered hopper')
for z in [-1.35,1.35]:m.profile([(-1.8,4.1),(1.8,4.1),(.48,2.50),(-.48,2.50)],z,.13,m.p)
for x in [-1.79,1.79]:m.box((x,3.82,0),(.15,.58,2.7),m.s)
for x in np.arange(-1.65,1.7,.3):m.beam((float(x),4.13,-1.35),(float(x),4.13,1.35),.065,.08,4)
m.box((0,2.5,0),(1.08,.20,2.3),m.s);m.box((0,2.20,0),(.72,.50,.80),m.p)
m.tube((.1,2.4,.52),(.90,2.4,.52),.05,4);m.tube((.9,2.4,.52),(.9,3.05,.52),.04,0)
done(m)

# 20 Kiln: deep circular firebox, split door, kiln furniture and chimney.
m=Kit('ceramic-kiln','umber','industrial relic','Ceramic works kiln with a deep circular opening, segment masonry rim, hinged fire door, chimney and cooling rack')
m.box((0,.17,0),(5.6,.34,4.4),3)
m.tube((-.9,1.42,-1.25),(-.9,1.42,.65),1.13,m.p,48)
m.tube((-.9,1.42,.66),(-.9,1.42,.70),.86,0,40);m.ring((-.9,1.42,.77),1.14,.85,.20,m.s,48,'Z')
m.role('Fire door and hinge');m.tube((-2.02,.63,.79),(-2.02,2.23,.79),.055,0)
m.box((-2.32,1.42,1.10),(.88,1.67,.16),m.p,angle=-.80)
for y in [.78,2.05]:m.beam((-2.02,y,.79),(-2.29,y,1.07),.11,.10,0)
m.box((-2.57,1.42,1.30),(.12,.43,.12),4)
m.box((-.9,2.95,-.95),(.57,1.72,.60),m.p);m.box((-.9,3.83,-.95),(.76,.14,.80),m.s)
m.role('Cooling shelves')
for x in [.9,2.3]:
    for z in [-1.3,.4]:m.box((x,1.14,z),(.07,1.6,.07),0)
for y in [.55,1.12,1.7]:
    m.box((1.6,y,-.45),(1.6,.08,1.95),4)
    for x in [1.12,1.7,2.1]:m.tube((x,y+.06,-.45),(x,y+.33,-.45),.15,m.s,16,r2=.12)
done(m)

# 21 Small field clinic uses a barrel roof and a fold-out covered stretcher bay.
m=Kit('desert-ambulatory','celadon','roadside business','Compact field clinic with barrel roof, recessed entrance, porch handrails, supply cubbies and a stretcher bay')
m.box((0,.26,0),(5.6,.52,3.8),3)
for x in [-2.45,2.45]:m.box((x,1.43,-.2),(.18,1.82,3.05),m.p)
m.box((0,1.43,-1.68),(4.95,1.82,.16),m.p)
m.arch((0,2.26,-.22),2.59,2.46,3.4,m.s,36)
for x in [-1.72,1.72]:m.box((x,1.35,1.23),(1.42,1.64,.18),m.p)
m.box((0,2.25,1.23),(2.1,.18,.18),m.s);m.frame(0,1.39,1.34,1.45,1.74,4)
m.role('Stretcher and access');m.box((1.5,1.0,.25),(.64,.12,2.0),m.s)
for x in [1.18,1.82]:m.tube((x,.57,-.6),(x,.99,-.6),.04,0);m.tube((x,.57,1.05),(x,.99,1.05),.04,0)
m.steps(0,2.6,1.6,rise=.18,count=3)
for x in [-1.07,1.07]:m.tube((x,.03,2.55),(x,1.10,2.55),.036,4);m.tube((x,1.10,2.55),(x,1.52,1.52),.036,4)
m.nameplate('WAYFARER / FIELD CARE',(0,2.58,1.51),3.0,.20)
done(m)

# 22 Quarry saw: large open blade, powered traverse carriage and rail bed.
m=Kit('demolition-cutter','slate','industrial relic','Quarry rail saw with a large exposed circular blade, travelling portal, counterbalanced motor and stone-cutting bed')
m.box((0,.15,0),(7.2,.30,3.7),3)
for z in [-1.48,1.48]:m.box((0,.43,z),(6.8,.26,.17),4)
m.role('Travelling portal')
for z in [-1.45,1.45]:m.box((.75,1.51,z),(.32,2.18,.33),m.p);m.box((.75,.56,z),(1.3,.16,.6),0)
m.box((.75,2.65,0),(.45,.30,3.5),m.s)
m.role('Circular saw carriage');m.box((.75,2.30,.05),(.7,.60,.7),0)
m.tube((.75,1.80,.2),(.75,1.80,.40),1.18,4,64)
m.tube((.75,1.80,.40),(.75,1.80,.49),.20,0,24)
for a in range(0,360,12):
    t=math.radians(a);m.box((.75+1.20*math.cos(t),1.80+1.20*math.sin(t),.32),(.095,.095,.23),4)
m.box((.75,2.2,-.95),(1.16,.78,.92),m.p);m.grille((.75,2.2,-.47),.88,.46)
m.box((-1.8,.55,0),(2.1,.65,1.6),3)
done(m)

# 23 Cyclone with tapered separator body and actually connected side ducts.
m=Kit('sandglass-cyclone','plum','industrial relic','Dust separation plant with tapered cyclone chamber, tangential duct, clean-air stack and wheeled ash receiver')
m.box((0,.16,0),(4.6,.32,3.7),3)
for x in [-1.28,1.28]:
    for z in [-1,1]:m.box((x,1.98,z),(.14,3.65,.14),0)
for x in [-1.28,1.28]:
    m.beam((x,2.63,-1),(x,2.63,1),.12,.12,0)
    for z in [-1,1]:m.beam((x,2.63,z),(x*.57,2.63,z*.62),.10,.10,0)
m.tube((0,2.5,0),(0,4.2,0),1.04,m.p,48);m.tube((0,1.2,0),(0,2.5,0),.28,m.s,36,r2=1.04)
for y in [2.58,4.10]:m.ring((0,y,0),1.07,.99,.055,4,40)
m.tube((0,4.18,0),(0,5.3,0),.29,0,28);m.tube((0,5.3,0),(0,5.40,0),.39,m.s,28)
m.cable([(0,3.6,.87),(1.70,3.6,.87),(1.7,1.04,.87)],.28,0)
m.role('Ash receiver');m.box((0,.64,0),(1.08,.50,.92),m.s)
for x in [-.43,.43]:
    for z in [-.4,.4]:m.tube((x,.36,z-.07),(x,.36,z+.07),.17,0,16)
m.tube((0,.9,0),(0,1.4,0),.22,0)
done(m)

# 24 A capped vent stack with a bracketed inspection balcony and caged ladder.
m=Kit('ventstack-catwalk','heather','industrial relic','Tall industrial vent stack with a complete accessible maintenance balcony, cage ladder, cap and flanged base')
m.box((0,.2,0),(4.8,.4,4.3),3)
m.tube((0,.40,0),(0,6.70,0),.67,m.p,48,r2=.48)
for y in [.55,2.55,4.55,6.6]:m.ring((0,y,0),.71-y*.025,.63-y*.025,.08,4,40)
m.role('Maintenance balcony');m.box((0,3.46,.95),(2.7,.15,2.5),0)
for x in [-1.28,1.28]:
    m.beam((x,3.42,1.95),(0,2.65,.5),.10,.10,0)
    for z in [0,1.99]:m.tube((x,3.5,z),(x,4.52,z),.035,4)
    m.tube((x,4.52,0),(x,4.52,2),.035,4)
m.tube((-1.28,4.52,2),(1.28,4.52,2),.035,4)
m.ladder(0,2.30,4.20,.42)
for x in [-.27,.27]:m.tube((x,3.44,2.10),(x,3.44,2.30),.032,0)
for y in [1.0,1.9,2.8,3.7]:m.ring((0,y,2.30),.48,.445,.045,0,28)
for x in [-.42,.42]:m.tube((x,.90,2.50),(x,4.1,2.50),.022,0)
m.tube((0,6.66,0),(0,6.86,0),.8,m.s,40)
done(m)

# 25 Irrigation span: two wheeled towers, slender suspended pipe and sprinklers.
m=Kit('pivot-irrigator','verdigris','industrial relic','Abandoned centre-pivot irrigation span with two braced wheel towers, triangulated pipe truss and downturned sprinkler heads')
m.role('Wheeled towers')
for x in [-4.1,4.1]:
    for z in [-1.05,1.05]:
        m.tube((x,.61,z-.16),(x,.61,z+.16),.61,0,32);m.tube((x,.61,z-.18),(x,.61,z+.18),.29,m.s,24)
        m.beam((x,.75,z),(x,2.75,0),.09,.10,0)
    m.box((x,.65,0),(.18,.18,2.4),m.p)
m.role('Irrigation pipe truss');m.tube((-5.6,2.84,0),(5.6,2.84,0),.105,m.p,24)
for z in [-.40,.40]:
    m.beam((-4.1,2.25,z),(4.1,2.25,z),.055,.065,0)
    for x in np.arange(-4.1,4.0,1.02):m.beam((float(x),2.25,z),(float(x)+.51,2.84,0),.035,.04,4)
for x in np.arange(-5,5.1,1.0):
    m.tube((float(x),2.84,0),(float(x),2.20,0),.022,0);m.tube((float(x),2.18,0),(float(x),2.23,0),.072,m.s,16)
m.box((-4.1,1.33,.32),(.40,.50,.24),m.p)
done(m)

assert len(models)==25 and len({e['id'] for e in entries})==25
for ob,en in zip(models,entries):
    me=ob.data;me.calc_loop_triangles();pts=np.array([v.co[:] for v in me.vertices]);lo=pts.min(0);hi=pts.max(0)
    gl=[float(lo[0]),float(lo[2]),float(-hi[1])];gh=[float(hi[0]),float(hi[2]),float(-lo[1])]
    bm=bmesh.new();bm.from_mesh(me)
    diag={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
          'zero_area_faces':sum(f.calc_area()<1e-10 for f in bm.faces),'loose_vertices':sum(not v.link_faces for v in bm.verts)};bm.free()
    used=sorted({me.materials[p.material_index].name for p in me.polygons})
    en.update({'dimensions_m':[round(b-a,5) for a,b in zip(gl,gh)],'bounds_godot':{'min':gl,'max':gh},'triangles':len(me.loop_triangles),
      'vertices':len(me.vertices),'materials':used,'material_batches':len(used),'diagnostics':diag,'root_transform':'identity',
      'ground_min_m':round(gl[1],7),'source':'assets/art200/wasteland/Art200Wasteland.blend','collision':'Native placement owns colliders; preserve actual entrances, arches and walking decks.'})
    en['width']=round(max(en['dimensions_m'][0],en['dimensions_m'][2]),5)
bpy.ops.object.select_all(action='DESELECT')
for ob in models:ob.select_set(True)
glb=ROOT/'godot/art/art200-wasteland.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_materials='EXPORT',export_tangents=True)
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'))
from repair_tangents import repair
print('Repaired rare cancelling UV tangents:',repair(glb),flush=True)
raw=glb.read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
assert len(doc['meshes'])==25 and len(doc['scenes'][0]['nodes'])==25
assert all(not any(k in n for k in ['translation','rotation','scale','matrix','children']) for n in doc['nodes'])
manifest={'collection':'ART200 Wasteland','new_models':25,'refined_models':0,'units':'metres','up':'Godot +Y','palette_source':'assets/art200/palette.json',
 'refinement_pass':'Phase 2 — all 25 models received individually authored physical refinement',
 'palette_families':sorted({e['palette_family'] for e in entries}),'total_triangles':sum(e['triangles'] for e in entries),'export_bytes':len(raw),
 'generator':'tools/art/art200_wasteland/build.py','models':entries}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'integration.json').write_text(json.dumps({'runtime':'res://art/art200-wasteland.glb','scale':1,
 'models':[{k:en[k] for k in ['id','width','theme','dimensions_m','palette_family']} for en in entries]},indent=2)+'\n')
for i,ob in enumerate(models):ob.location=((i%5)*20,(i//5)*20,0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Art200Wasteland.blend'),compress=True)
if '--skip-render' in sys.argv:raise SystemExit(0)
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=768;S.render.resolution_y=576;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG'
S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.view_settings.exposure=.65
S.world=bpy.data.worlds.new('Muted daylight review');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.58,.65,.71,1);S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
floor_mat=mat('REVIEW FLOOR','#888275',0,.94)
bpy.ops.mesh.primitive_plane_add(size=120,location=(0,0,-.015));bpy.context.object.data.materials.append(floor_mat)
bpy.ops.object.light_add(type='SUN');sun=bpy.context.object;sun.rotation_euler=(.30,-.45,-.38);sun.data.energy=2.2;sun.data.angle=.12
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';S.camera=cam
for ob in models:ob.location=(0,0,0);ob.hide_render=True
for i,(ob,en) in enumerate(zip(models,entries)):
    selected=next((arg.split('=')[1] for arg in sys.argv if arg.startswith('--render-indices=')),None)
    if selected and i+1 not in [int(x) for x in selected.split(',')]:continue
    ob.hide_render=False;lo=en['bounds_godot']['min'];hi=en['bounds_godot']['max'];w,h,d=en['dimensions_m']
    target=xyz(((lo[0]+hi[0])/2,h*.43,(lo[2]+hi[2])/2))
    cam.location=target+Vector((1,-1.65,1.05)).normalized()*max(w,h,d)*3.0
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(w*1.12,d*1.2,h*1.9)*1.22
    S.render.filepath=str(OUT/'renders'/f'{i+1:02}-{ob.name}.png');bpy.ops.render.render(write_still=True);ob.hide_render=True
print('ART200_WASTELAND_COMPLETE',manifest['total_triangles'],flush=True)
