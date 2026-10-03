"""ART100 / 25 individually authored wasteland assemblies, metres, Godot Y up.

Run Blender 5.1 --background --threads 4 --python tools/art/art100_wasteland/build.py.
Original ten GLBs are read only. Runtime geometry is exported at identity roots;
the source contains an arranged inspection gallery. No external asset downloads.
"""
import bpy, bmesh, math, json, struct, random, argparse, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art100/wasteland';OUT.mkdir(parents=True,exist_ok=True)
(OUT/'textures').mkdir(exist_ok=True);(OUT/'renders').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
S=bpy.context.scene;S.unit_settings.system='METRIC'
sys.path.insert(0,str(Path(__file__).parent))
from refine import touchup
from fine_comb import repair, rebuild_solar, repair_final, REPAIR_NOTES
palette=json.loads((ROOT/'assets/art200/palette.json').read_text())
def linear(hexcode):
    values=[int(hexcode.lstrip('#')[i:i+2],16)/255 for i in [0,2,4]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)
def xyz(v):return Vector((v[0],-v[2],v[1]))

# A restrained common palette; small roughness variation and isolated paint wear
# produce portable PBR maps rather than runtime procedural noise.
PALETTE=[('Graphite forged steel',(.072,.091,.087),.72,.49),
 ('Desert ochre enamel',(.40,.29,.14),.32,.63),
 ('Mineral teal enamel',(.10,.235,.213),.30,.62),
 ('Lime aggregate concrete',(.41,.365,.279),0,.88),
 ('Scoured warm alloy',(.44,.45,.405),.82,.39),
 ('Seals and dark recesses',(.025,.037,.035),.08,.80),
 ('Ceramic marking cream',(.68,.65,.49),.08,.58),
 ('Oxide exposed steel',(.255,.125,.061),.48,.72),
 ('Blue black photovoltaic',(.036,.080,.109),.36,.29)]
for idx,substrate in [(0,'steel'),(3,'concrete'),(4,'aged_aluminium'),(5,'rubber'),(7,'rust')]:
    label,col,metal,rough=PALETTE[idx];PALETTE[idx]=(label,linear(palette['substrates'][substrate]),metal,rough)
M=[]
for idx,(name,col,metal,rough) in enumerate(PALETTE):
    mat=bpy.data.materials.new('ART100 / '+name);mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    rng=np.random.default_rng(1600+idx);n=256
    grain=rng.normal(0,.012,(n,n));field=np.zeros((n,n))
    for grid,weight in [(8,.030),(32,.016)]:
        coarse=rng.uniform(-1,1,(grid,grid));field+=np.repeat(np.repeat(coarse,n//grid,0),n//grid,1)*weight
    for _ in range(5):field=(field+np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))/5
    rgb=np.clip(np.array(col)[None,None,:]*(1+field[:,:,None]+grain[:,:,None]),0,1)
    if idx in [1,2,7]:
        # Sparse short chips, not an all-over mottled camouflage treatment.
        for j in range(36):
            x,y=rng.integers(0,252,2);length=int(rng.integers(1,5))
            rgb[y:y+1,x:x+length]=np.array((.15,.115,.077))
    for suffix,arr in [('base',rgb),('rough',np.repeat(np.clip(rough+field*.5+grain*.3,.1,1)[:,:,None],3,2))]:
        im=bpy.data.images.new('art100_wasteland_'+str(idx)+'_'+suffix,n,n)
        if suffix=='rough':im.colorspace_settings.name='Non-Color'
        im.pixels.foreach_set(np.concatenate([arr,np.ones((n,n,1))],2).astype(np.float32).ravel())
        im.filepath_raw=str(OUT/'textures'/f'{idx}-{suffix}.png');im.file_format='PNG';im.save();im.pack()
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color' if suffix=='base' else 'Roughness'])
    M.append(mat)

# Preserve per-model surface counts while extending the old collection's paint
# choices to the same fourteen subdued families as the new original sites.
family_materials={}
rough_image=bpy.data.images.load(str(ROOT/'assets/art200/wasteland/textures/paint-roughness.png'));rough_image.colorspace_settings.name='Non-Color';rough_image.pack()
for family in palette['families']:
    pair=[]
    for role in ['secondary','paint']:
        ma=bpy.data.materials.new('ART100 / '+family['id']+' '+role);ma.use_nodes=True
        bs=ma.node_tree.nodes['Principled BSDF'];bs.inputs['Metallic'].default_value=.25;bs.inputs['Roughness'].default_value=.70
        im=bpy.data.images.load(str(ROOT/'assets/art200/wasteland/textures'/f'{family["id"]}-{role}.png'));im.pack()
        for image,socket in [(im,'Base Color'),(rough_image,'Roughness')]:
            node=ma.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;ma.node_tree.links.new(node.outputs['Color'],bs.inputs[socket])
        pair.append(ma)
    family_materials[family['id']]=pair

class Model:
    def __init__(self,name):self.name=name;self.v=[];self.f=[];self.mi=[];self.sm=[];self.letter_parts=[]
    def stencil(self,label,p,size):
        bpy.ops.object.text_add(location=xyz(p));o=bpy.context.object
        o.data.body=label;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=4;o.data.extrude=.002
        o.rotation_euler=(math.pi/2,0,0);bpy.ops.object.convert(target='MESH');o=bpy.context.object
        o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4);o.data.materials.append(M[4])
        clean(o,0,True,False);self.letter_parts.append(o)
    def add(self,vs,fs,mat=0,smooth=False):
        off=len(self.v);self.v.extend(xyz(v) for v in vs)
        self.f.extend(tuple(off+i for i in f) for f in fs);self.mi.extend([mat]*len(fs));self.sm.extend([smooth]*len(fs))
    def box(self,p,d,mat=0,angle=0):
        v=[];co=math.cos(angle);si=math.sin(angle)
        for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            x=a*d[0]/2;y=b*d[1]/2;z=c*d[2]/2
            v.append((p[0]+x*co-z*si,p[1]+y,p[2]+x*si+z*co))
        self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def tube(self,a,b,r,mat=0,n=20,r2=None):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
        if u.length<.01:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u);vs=[]
        for p,rr in [(a,r),(b,r if r2 is None else r2)]:
            vs.extend(p+rr*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n)) for i in range(n))
        self.add(vs,[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,True)
    def ring(self,p,outer,inner,h,mat=0,n=36,axis='Y'):
        vs=[]
        for hh,rr in [(-h/2,outer),(h/2,outer),(h/2,inner),(-h/2,inner)]:
            for i in range(n):
                a=i*math.tau/n;v=(rr*math.cos(a),hh,rr*math.sin(a))
                if axis=='Z':v=(v[0],v[2],v[1])
                if axis=='X':v=(v[1],v[0],v[2])
                vs.append(Vector(p)+Vector(v))
        self.add(vs,[(j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i) for j in range(4) for i in range(n)],mat,True)
    def beam(self,a,b,w,d,mat=0):
        a,b=Vector(a),Vector(b);q=(b-a).to_track_quat('Y','Z').to_matrix();v=[]
        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            v.append((a+b)/2+q@Vector((x*w/2,y*(b-a).length/2,z*d/2)))
        self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def cable(self,pts,r=.035,mat=5):
        for a,b in zip(pts,pts[1:]):self.tube(a,b,r,mat,10)
    def bolts(self,p,spacing,count=4,axis='Y',radius=.032):
        for i in range(count):
            a=math.tau*i/count;v=Vector(p)
            if axis=='Y':v+=Vector((spacing*math.cos(a),0,spacing*math.sin(a)));di=Vector((0,.032,0))
            else:v+=Vector((spacing*math.cos(a),spacing*math.sin(a),0));di=Vector((0,0,.032))
            self.tube(v,v+di,radius,4,6)
    def panel(self,p,d,mat=2,bolts=True):
        self.box(p,d,mat)
        if bolts:
            for x in [-1,1]:
                for y in [-1,1]:
                    v=(p[0]+x*(d[0]/2-.065),p[1]+y*(d[1]/2-.065),p[2]+d[2]/2)
                    self.tube(v,(v[0],v[1],v[2]+.02),.025,4,6)
    def grille(self,p,w,h,rows=7):
        self.box(p,(w,h,.045),5)
        for i in range(rows):self.box((p[0],p[1]-h*.40+i*h*.8/max(1,rows-1),p[2]+.032),(w*.87,.033,.045),0)
    def foot(self,p,w=.55):
        self.box((p[0],.055,p[2]),(w,.11,w),0)
        for x in [-1,1]:
            for z in [-1,1]:self.tube((p[0]+x*w*.33,.11,p[2]+z*w*.33),(p[0]+x*w*.33,.145,p[2]+z*w*.33),.027,4,6)
    def ladder(self,x,z,top,start=.25):
        for xx in [x-.27,x+.27]:self.tube((xx,start,z),(xx,top,z),.03,0)
        for y in np.arange(start+.12,top,.29):self.tube((x-.27,y,z),(x+.27,y,z),.022,4,12)
    def wheel(self,x,y,z,r=.56,width=.28):
        self.tube((x,y,z-width/2),(x,y,z+width/2),r,5,32)
        self.tube((x,y,z-width/2-.015),(x,y,z+width/2+.015),r*.65,1,32)
        self.tube((x,y,z-width/2-.04),(x,y,z+width/2+.04),r*.20,4,20)
        self.ring((x,y,z+width/2+.027),r*.49,r*.40,.023,0,32,'Z')
        self.bolts((x,y,z+width/2+.043),r*.31,6,'Z',.025)
    def finish(self,extra=None,bevel=.018):
        me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.f);me.update()
        ob=bpy.data.objects.new(self.name,me);S.collection.objects.link(ob)
        for m in M:me.materials.append(m)
        for f,mi,sm in zip(me.polygons,self.mi,self.sm):f.material_index=mi;f.use_smooth=sm
        if extra:
            bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);extra.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.join()
        ob.name=self.name
        # Keep landmarks to six draw surfaces. Only consolidate visually close
        # minor finishes, retaining the large painted/concrete design fields.
        used={f.material_index for f in ob.data.polygons}
        for source,dest in [(5,0),(6,4),(7,1)]:
            if len(used)<=6:break
            if source in used and dest in used:
                for f in ob.data.polygons:
                    if f.material_index==source:f.material_index=dest
                used={f.material_index for f in ob.data.polygons}
        clean(ob,bevel,bool(extra))
        if self.letter_parts:
            bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
            for part in self.letter_parts:part.select_set(True)
            bpy.context.view_layer.objects.active=ob;bpy.ops.object.join()
        return ob

def clean(ob,bevel,weld=False,ground=True):
    bpy.context.view_layer.objects.active=ob
    bm=bmesh.new();bm.from_mesh(ob.data)
    if weld:bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000005)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    if bevel:
        mo=ob.modifiers.new('Machined and worn edge radii','BEVEL');mo.width=bevel;mo.segments=1;mo.limit_method='ANGLE';mo.angle_limit=.65
        mo.affect='EDGES';bpy.ops.object.modifier_apply(modifier=mo.name)
    # Remove collapsed bevel slivers and planar triangulation left by import.
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
    bad=[f for f in bm.faces if f.calc_area()<1e-10]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    bmesh.ops.dissolve_limit(bm,angle_limit=.0005,verts=list(bm.verts),edges=list(bm.edges),delimit={'NORMAL','MATERIAL'})
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(ob.data);bm.free()
    mo=ob.modifiers.new('Face area weighted corner normals','WEIGHTED_NORMAL');mo.keep_sharp=True;mo.weight=40
    bpy.ops.object.modifier_apply(modifier=mo.name)
    me=ob.data
    # A consistent metre-based triplanar UV projection for all portable textures.
    for old in list(me.uv_layers):me.uv_layers.remove(old)
    uv=me.uv_layers.new(name='MeterSurfaceUV')
    coords=np.empty((len(me.loops),2),dtype=np.float32)
    for poly in me.polygons:
        axis=max(range(3),key=lambda k:abs(poly.normal[k]));a,b=[k for k in range(3) if k!=axis]
        for li in poly.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co;coords[li]=(p[a]*.41,p[b]*.41)
    uv.data.foreach_set('uv',coords.ravel())
    # Ground every assembly exactly. Internal elements retain their relationships.
    if ground:
        low=min(v.co.z for v in me.vertices)
        for v in me.vertices:v.co.z-=low
    me.update()

roots=[];entries=[]
def add(m,status,theme,extra=None,features='',collision='box'):
    repair(m,extra)
    family,refinement=touchup(m)
    ob=m.finish(extra);roots.append(ob)
    repair_final(ob)
    for i,ma in enumerate(ob.data.materials):
        if ma==M[1]:ob.data.materials[i]=family_materials[family][0]
        elif ma==M[2]:ob.data.materials[i]=family_materials[family][1]
    tri=ob.modifiers.new('Portable runtime triangulation','TRIANGULATE');tri.keep_custom_normals=True
    bpy.ops.object.modifier_apply(modifier=tri.name)
    # Historic non-planar polygons can yield collapsed triangles. Remove only
    # zero-area remnants, then project each actual triangle for valid tangents.
    bm=bmesh.new();bm.from_mesh(ob.data)
    bad=[f for f in bm.faces if f.calc_area()<1e-10]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(ob.data);bm.free();me=ob.data;me.update()
    coords=np.empty((len(me.loops),2),dtype=np.float32)
    for poly in me.polygons:
        axis=max(range(3),key=lambda k:abs(poly.normal[k]));a,b=[k for k in range(3) if k!=axis]
        for li in poly.loop_indices:
            p=me.vertices[me.loops[li].vertex_index].co;coords[li]=(p[a]*.41,p[b]*.41)
    me.uv_layers.active.data.foreach_set('uv',coords.ravel())
    entries.append({'id':m.name,'status':status,'theme':theme,'features':features,'palette_family':family,'phase2_refinement':refinement,
        'fine_comb_refinement':REPAIR_NOTES.get(m.name.removeprefix('wasteland-'),'Independent review found no concrete defect requiring a further geometry change.'),'collision':{'kind':collision}})
    print('BUILT',m.name,flush=True)
    return ob

# Existing assemblies stay recognisable: original silhouettes and real openings
# survive, with actual new service hardware, framing and legible edge treatment.
originals={}
for file in ['wasteland-places.glb','wasteland-industry.glb']:
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/art'/file))
    for ob in sorted(set(bpy.data.objects)-before,key=lambda o:o.name):
        if ob.type!='MESH':continue
        ob.name=ob.name.split('.')[0].split(' /')[0];originals[ob.name]=ob
        for ca in list(ob.data.color_attributes):ob.data.color_attributes.remove(ca)
        oldm=list(ob.data.materials);mapping=[]
        for ma in oldm:
            s=ma.name.lower()
            mapping.append(3 if ('concrete' in s or 'lime' in s) else 2 if ('petrol' in s) else 7 if 'red oxide' in s else 8 if 'photovoltaic' in s else 1 if 'paint' in s else 0)
        if ob.name=='wasteland-wind-turbine':mapping=[6 if i==1 else i for i in mapping]
        material_indices=[mapping[p.material_index] for p in ob.data.polygons]
        ob.data.materials.clear()
        for ma in M:ob.data.materials.append(ma)
        for p,mi in zip(ob.data.polygons,material_indices):p.material_index=mi

for key,ob in originals.items():
    m=Model(key)
    if key=='wasteland-diner':
        for x in [-4.6,-3.1,-1.55,0,1.55,3.1]:
            m.box((x,1.57,2.74),(1.38,.07,.29),4)
        m.box((3.8,3.78,1.60),(1.14,.48,.89),2);m.grille((3.8,3.78,2.057),.94,.31,5)
        for i in range(3):m.box((4.65,.09+i*.095,3.10-i*.25),(1.35,.18+i*.19,.50),3)
        m.panel((-4.63,5.67,3.215),(1.62,.47,.035),2)
        for x in [-5.18,5.18]:m.tube((x,.50,2.50),(x,2.75,2.50),.055,4)
        feature='Radiused seams; deep window sills; bolted sign inset; service vent; grounded entry steps'
    elif key=='wasteland-greenhouse':
        m.box((6.9,.32,2.2),(1.0,.64,1.3),0);m.tube((6.9,.65,2.2),(6.9,1.7,2.2),.40,2,32)
        for y in [.75,1.5]:m.ring((6.9,y,2.2),.43,.39,.045,4)
        m.cable([(6.9,1.40,2.2),(6.1,1.4,2.2),(6.1,.81,2.2),(4.0,.81,2.2)],.062,0)
        for x in [-6.4,-4.3,-2.15,0,2.15,4.3,6.4]:
            for z in [-4,4]:m.box((x,.72,z),(.25,.12,.25),7);m.bolts((x,.785,z),.075,4,radius=.014)
        for x in [-6.6,-6.9,-7.2]:m.box((x,.105,0),(.20,.21,2.0),3)
        feature='Bolted frame shoes; header tank and connected irrigation pipe; threshold paving; softened frame edges'
    elif key=='wasteland-service-station':
        for x in [-3.7,-1.3,2.8]:
            m.panel((x,1.12,-1.035),(.52,.66,.055),1)
            m.cable([(x+.34,1.65,-1.25),(x+.62,1.40,-1.16),(x+.67,.72,-1.13),(x+.40,.66,-1.04),(x+.34,1.18,-1.04)],.035,5)
        for x in [-3.7,2.8]:
            m.box((x,.455,-1.2),(.65,.12,.65),0);m.bolts((x,.52,-1.2),.21,4,radius=.035)
        m.box((3.2,.75,-3.8),(1.2,1.5,.7),2);m.grille((3.2,.90,-3.43),.8,.5)
        m.panel((3.2,1.4,-3.43),(.70,.24,.03),6)
        feature='Fuel hose sweeps; pump access covers; grounded kiosk; ventilated service cabinet; radiused roof and frame'
    elif key=='wasteland-observatory':
        m.panel((5.4,1.1,-1.27),(1.1,1.70,.10),2);m.grille((6.65,1.23,-1.25),.50,.76)
        for x in [-1.15,1.15]:
            m.tube((x,.3,-5.65),(x,1.45,-5.65),.043,0);m.tube((x,1.45,-5.65),(x,2.0,-4.6),.043,0)
        m.box((-.8,3.90,0),(.75,.6,.6),1);m.cable([(-.8,3.9,0),(-.4,4.3,0),(.2,4.4,0)],.05,5)
        for x in [4.3,5.4,6.5]:m.box((x,2.43,1),(.1,.14,3.9),0)
        feature='Receiver electronics; attached cable; service door; roof seam caps; practical stair handrails'
    elif key=='wasteland-passenger-coach':
        for x in [-4.2,4.2]:
            for xx in [x-.58,x+.58]:
                for z in [-1.66,1.66]:m.ring((xx,.58,z),.50,.405,.032,4,22,'Z')
            for z in [-1.42,1.42]:
                for xx in [x-.27,x+.27]:
                    for y in [.75,.81,.87,.93]:m.ring((xx,y,z),.115,.075,.025,0,12)
        m.panel((-3.2,3.17,1.7),(2.1,.31,.03),6)
        for x in [-5.7,5.7]:m.box((x,.62,1.98),(.70,.12,.55),0);m.box((x,.91,1.78),(.7,.12,.3),0)
        feature='Wheel rim flanges; visible coil packs; destination panel; boarding steps; rounded ribs'
    elif key=='wasteland-excavator':
        m.grille((-1.8,2.15,-1.42),.85,.63,8)
        for z in [-1.40,1.4]:
            m.box((-.5,1.50,z),(2.4,.10,.34),0)
            for x in [-1.5,.50]:m.tube((x,1.55,z),(x,2.08,z),.033,4)
            m.tube((-1.5,2.08,z),(.5,2.08,z),.033,4)
        for x in [-1.2,.1]:m.tube((x,3.49,1.23),(x,3.49,1.36),.115,0);m.tube((x,3.49,1.36),(x,3.49,1.38),.085,6)
        m.cable([(.1,2.4,-.45),(1.1,3.0,-.45),(2.65,3.52,-.45),(3.8,1.7,-.45)],.041,5)
        feature='Catwalk and handrails; headlamp bezels; radiator louvers; connected boom hose; track bevels'
    elif key=='wasteland-wind-turbine':
        m.ring((-5.4,.40,0),1.15,.94,.14,4,48);m.bolts((-5.4,.485,0),1.04,16,radius=.045)
        m.panel((-5.4,1.55,.94),(.56,.85,.10),1);m.grille((4.5,1.53,-.26),1.8,.65,8)
        m.cable([(-5.4,.4,.5),(-3.1,.12,1.1),(1.2,.12,1.5),(3.6,.6,1.2)],.055,5)
        feature='Machined mast flange with anchor bolts; inspection panel; nacelle cooling louvers; grounded power cable'
    elif key=='wasteland-cooling-tower':
        for x in [-3.3,1.6]:
            for z in [-3,0,3]:m.ring((x,.56,z),.335,.255,.085,4,24,'Z')
        m.box((7.8,.22,0),(1.4,.44,1.2),3);m.box((7.8,1.05,0),(.85,1.25,.75),2);m.grille((7.8,1.08,.395),.58,.66)
        m.cable([(7.8,.55,-.30),(6.0,.4,-.3),(5.8,.4,-2.6)],.065,0)
        feature='Basin flange joints; pump control pier; fixed conduit; shell edge radii and weighted concrete normals'
    elif key=='wasteland-tunnel':
        for x in [-5.85,5.85]:
            m.tube((x,1.72,-2.94),(x,1.72,3.4),.09,4)
            for z in [-2.8,0,3.4]:m.tube((x,.08,z),(x,1.72,z),.055,0)
            for z in [-2,0,2]:
                m.box((x,2.8,z),(.22,.15,.55),0);m.box((x-.025,2.81,z),(.23,.12,.39),6)
                m.beam((x,2.8,z),(math.copysign(6.4,x),2.8,z),.075,.075,0)
        for x in [-5.85,5.85]:m.panel((x,1.4,3.46),(.46,.75,.05),1)
        feature='Continuous handrail caps; attached inspection lamps; clearance plates; rounded fractured concrete'
    else:
        bpy.data.objects.remove(ob,do_unlink=True);ob=None
        rebuild_solar(m)
        for x in [-.9,2.45]:
            m.box((x,.95,-2.65),(.30,.38,.32),1);m.tube((x,.88,-2.65),(x,.88,-1.9),.048,0)
        m.panel((6,.66,-5.99),(.81,.56,.045),2)
        m.cable([(6,.50,-5.7),(4.5,.16,-5.7),(4.5,.16,-3.8),(2.45,.16,-3.8)],.035,5)
        feature='Array actuator boxes; connected shaft housings; pump control panel; ground cable and refined cell edges'
    add(m,'refined','Old-world ruin',ob,feature)

# 11 / Cistern: recognizable vertical storage vessel with a practical stair,
# manway and ceramic level scale. The inner rim remains a real opening.
m=Model('wasteland-cistern')
m.box((0,.12,0),(4.4,.24,4.0),3);m.ring((0,1.9,0),1.63,1.50,3.5,2,64)
for y in [.30,1.40,2.55,3.64]:m.ring((0,y,0),1.68,1.61,.07,4,64)
m.tube((0,.3,0),(0,.36,0),1.54,0,64)
m.ladder(0,1.73,3.88,.18)
m.tube((1.55,.60,0),(2.18,.60,0),.16,0);m.tube((2.18,.2,0),(2.18,.65,0),.16,0)
m.ring((1.69,.6,0),.25,.16,.065,4,24,'X')
for y in np.arange(.7,3.6,.32):m.box((.8,float(y),1.47),(.13,.045,.025),6)
add(m,'new','Water infrastructure',features='Open rolled rim, continuous welded bands, anchored ladder, outflow and level scale')

# 12 / Rail switch: field lever, pivoting tongue and three real rail heads.
m=Model('wasteland-rail-switch')
for x in np.arange(-3.2,3.3,.55):m.box((float(x),.115,0),(.23,.23,2.65),7)
for z in [-.8,.8]:m.box((0,.28,z),(7.1,.12,.18),0);m.box((0,.36,z),(7.1,.07,.09),4)
m.beam((-3,.38,.68),(3,.38,-.45),.09,.065,4)
for x in np.arange(-2.7,3,.55):
    for z in [-.8,.8]:m.box((float(x),.285,z),(.20,.035,.30),0)
m.box((-1,.23,2.0),(1.10,.46,.75),3);m.box((-1,.65,2),( .45,.6,.4),2)
m.tube((-1,.90,2),(-.4,1.7,2),.043,0);m.tube((-.56,1.60,2),(-.31,1.82,2),.079,1)
m.beam((-1,.35,1.7),(-1,.35,.7),.085,.065,0)
add(m,'new','Abandoned transport',features='Rail profiles, turnout blade, sleepers, tie plates and connected manual switch')

# 13 / Container shelter: missing side panel makes the shelter legible and usable.
m=Model('wasteland-container-shelter')
m.box((0,.22,0),(6.2,.44,3.0),0)
for x in [-3,3]:
    for z in [-1.4,1.4]:m.box((x,1.52,z),(.16,2.60,.16),0)
for z in [-1.43,1.43]:
    m.box((0,2.8,z),(6.2,.18,.15),0)
    if z<0:m.box((0,1.55,z),(6.0,2.4,.045),2)
    else:
        m.box((-2.15,1.55,z),(1.65,2.4,.045),2);m.box((2.5,1.55,z),(1,2.4,.045),2)
for x in np.arange(-2.85,3,.25):
    m.box((float(x),1.55,-1.48),(.06,2.35,.055),2)
    if x<-1.35 or x>2.0:m.box((float(x),1.55,1.48),(.06,2.35,.055),2)
m.box((0,2.92,0),(6.2,.08,3.0),1)
for x in [-3,3]:m.box((x,1.55,0),(.08,2.4,2.7),2)
m.box((-.3,.61,-.8),(3.3,.28,.75),7);m.box((-.3,.50,-.8),(3.0,.20,.55),0)
m.box((1.65,.95,-.72),(.95,1.25,.75),1);m.grille((1.65,1.10,-.32),.6,.5)
m.box((.3,.11,1.90),(2.3,.22,.9),3);m.panel((-2.1,2.2,1.50),(1.1,.34,.03),6)
add(m,'new','Survivor shelter',features='Open side portal, structural corner posts, corrugation, interior bunk, cabinet and threshold')

# 14 / Survey rover: six wheel science crawler with an elevated sample gantry.
m=Model('wasteland-survey-rover')
m.box((0,.80,0),(3.35,.42,1.75),0);m.box((.50,1.30,0),(1.60,.65,1.55),1)
for x in [-1.32,0,1.32]:
    for z in [-.94,.94]:m.wheel(x,.60,z,.60,.33);m.box((x,1.23,z),(.95,.10,.49),2)
for x in [-.65,.6]:
    for z in [-.62,.62]:m.beam((x,1.15,z),(x-.18,2.2,z),.072,.072,0)
m.box((-.20,2.24,0),(1.54,.11,1.53),2)
m.box((-.48,1.22,0),(.68,.15,.68),5);m.box((-.74,1.56,0),(.15,.65,.69),5)
m.grille((1.28,1.33,.80),.65,.43,5);m.tube((-1.15,.95,-.6),(-1.15,3.02,-.6),.048,0)
m.tube((-1.15,2.92,-.6),(-1.15,3.15,-.6),.12,6,20)
m.box((-1.55,1.13,0),(.40,.28,1.40),2)
for z in [-.72,.72]:
    m.beam((1.25,1.4,z),(1.25,2.90,z),.075,.075,0)
    m.beam((1.25,2.90,z),(-1.60,2.90,z),.075,.075,0)
m.beam((-1.45,2.90,-.72),(-1.45,2.90,.72),.09,.09,4)
m.tube((-1.45,1.76,0),(-1.45,2.85,0),.048,0)
m.box((-1.45,1.65,0),(.34,.24,.30),1)
add(m,'new','Survey expedition',features='Six bolted wheels, elevated science gantry, suspended coring head, open cabin and beacon mast')

# 15 / Signal gantry: trussed span with three distinct dead signal housings.
m=Model('wasteland-signal-gantry')
for x in [-3.9,3.9]:
    m.box((x,.24,0),(1.2,.48,1.3),3);m.box((x,3.10,0),(.30,5.7,.40),0)
    m.beam((x+math.copysign(.43,x),.48,0),(x,2.1,0),.14,.14,0)
for offset in [0,.58]:
    pts=[(-3.9,5.6+offset,0),(-2.4,6.20+offset,0),(0,6.62+offset,0),(2.4,6.20+offset,0),(3.9,5.6+offset,0)]
    for a,b in zip(pts,pts[1:]):m.beam(a,b,.14,.23,0)
def arch_height(x):
    x=abs(x)
    return 6.62-x*.42/2.4 if x<=2.4 else 6.20-(x-2.4)*.60/1.5
for x in np.arange(-3.6,3.5,.7):
    a=float(x);b=a+.7
    m.beam((a,arch_height(a),0),(b,arch_height(b)+.58,0),.075,.085,4)
for x in [-2.5,0,2.5]:
    m.box((x,4.95,.17),(.73,1.3,.44),1)
    m.tube((x,5.58,.17),(x,arch_height(x),0),.045,0)
    for y in [4.65,5.19]:m.tube((x,y,.36),(x,y,.51),.21,0);m.tube((x,y,.51),(x,y,.53),.145,5)
m.ladder(3.9,-.30,5.8,.5)
add(m,'new','Railway wayfinding',features='Peaked arch truss, braced piers, three pendant dual signals and inspection ladder')

# 16 / Transformer: rugged three phase apparatus with actual fin banks.
m=Model('wasteland-buried-transformer')
m.box((0,.12,0),(3.9,.24,3.1),3);m.box((0,1.04,0),(2.05,1.58,1.5),2)
for z in [-.85,.85]:
    for x in np.arange(-.90,1.0,.15):m.box((float(x),1.02,z),(.055,1.32,.45),0)
for x in [-.66,0,.66]:
    m.tube((x,1.82,0),(x,2.68,0),.09,6)
    for y in np.arange(1.95,2.6,.13):m.tube((x,float(y),0),(x,float(y)+.042,0),.16,6)
    m.tube((x,2.66,0),(x,2.75,0),.075,4)
m.panel((0,1.16,1.1),(.84,.72,.055),1);m.tube((.82,1.70,.55),(.82,2.4,.55),.035,0)
m.ring((.82,2.40,.55),.15,.10,.035,0,24,'Z')
add(m,'new','Power infrastructure',features='Dense separate cooling fins, ribbed insulators, oil gauge, gasketed access cover')

# 17 / Pipeline valve: full diameter hollow pipe with strapped saddles.
m=Model('wasteland-pipeline-valve')
for x in [-1.45,1.45]:m.box((x,.2,0),(.76,.4,1.64),3);m.box((x,.50,0),(.5,.36,1.30),0)
m.ring((0,1.03,0),.66,.56,4.6,7,48,'X')
for x in [-2.1,2.1,-.44,.44]:m.ring((x,1.03,0),.76,.55,.12,4,48,'X')
m.tube((0,1.4,0),(0,2.10,0),.31,2,32);m.tube((0,2.08,0),(0,2.73,0),.06,4)
m.ring((0,2.78,0),.54,.48,.075,1,40)
for a in range(0,360,90):
    t=math.radians(a);m.tube((0,2.78,0),(.48*math.cos(t),2.78,.48*math.sin(t)),.033,1)
m.panel((0,1.35,.66),(.35,.32,.035),6)
add(m,'new','Industrial salvage',features='Open pipe bore, bolted flange rings, valve bonnet, handwheel spokes and grounded saddles')

# 18 / Scrap press: open throat and platen held on guide columns.
m=Model('wasteland-scrap-press')
m.box((0,.2,0),(3.8,.4,2.8),0);m.box((0,.58,0),(2.9,.36,2.0),7)
for x in [-1.55,1.55]:
    for z in [-.94,.94]:m.box((x,2.05,z),(.25,3.25,.25),2);m.foot((x,0,z),.6)
m.box((0,3.75,0),(3.55,.50,2.40),2);m.tube((0,2.8,0),(0,3.48,0),.32,0);m.tube((0,2.1,0),(0,2.8,0),.18,4)
m.box((0,2.06,0),(2.7,.30,1.75),1)
for x in [-1.1,1.1]:m.tube((x,.7,0),(x,3.5,0),.072,4)
m.box((2.05,.67,0),(.6,1.34,1.0),2);m.grille((2.05,.74,.52),.40,.50,6)
m.cable([(1.5,3.6,-.9),(2.0,3.3,-.9),(2.05,1.2,-.2)],.065,5)
for x in [-.8,-.3,.2,.7]:m.box((x,.92,.08),(.37,.30,.9),7,angle=x*.3)
add(m,'new','Industrial salvage',features='Open press throat, hydraulic ram, chromed guide rods, attached reservoir and compacted scrap')

# 19 / Sensor mast: tension bracing returns to grounded footplates.
m=Model('wasteland-sensor-mast')
m.box((0,.12,0),(1.0,.24,1.0),3)
m.tube((0,.22,0),(0,5.1,0),.14,0,24,r2=.08)
for x,z in [(-1.7,-1),(1.7,-1),(0,1.8)]:
    m.foot((x,0,z),.35);m.cable([(x,.13,z),(0,3.45,0)],.024,4)
m.box((0,4.25,0),(1.7,.1,.1),0)
for x in [-.78,.78]:m.tube((x,3.8,0),(x,4.75,0),.04,4)
m.box((0,5.13,0),(.75,.28,.49),2);m.tube((0,5.10,.22),(0,5.10,.39),.135,0);m.tube((0,5.10,.40),(0,5.10,.415),.098,8)
m.box((0,.90,.27),(.43,.65,.35),2);m.panel((0,.95,.46),(.29,.38,.03),1)
m.cable([(0,4.9,.06),(.16,3,.06),(.16,1.1,.25)],.025,5)
add(m,'new','Story survey node',features='Three tension anchors, paired antenna, sealed optic hood, wired field controller')

# 20 / Cable drum: spooled rings and end plate spokes read from both sides.
m=Model('wasteland-cable-drum')
for x in [-1.05,1.05]:
    m.ring((x,1.30,0),1.30,.26,.12,2,48,'X')
    m.tube((x-.10,1.30,0),(x+.10,1.30,0),.26,4,24)
    for a in range(0,360,60):
        t=math.radians(a);m.beam((x,1.3,0),(x,1.3+1.15*math.cos(t),1.15*math.sin(t)),.065,.065,0)
m.tube((-1,1.3,0),(1,1.3,0),.52,0,40)
for x in np.arange(-.87,.91,.13):m.ring((float(x),1.3,0),1.08,.97,.10,5,48,'X')
m.box((-1.2,.08,0),(.55,.16,2.8),7);m.box((1.2,.08,0),(.55,.16,2.8),7)
m.cable([(.6,.55,.65),(1.2,.12,1.1),(1.7,.12,1.5),(2.2,.12,1.2)],.046,5)
for x in [-1.65,1.65]:
    for z in [-.8,.8]:
        m.foot((x,0,z),.45);m.beam((x,.14,z),(x,3.1,z),.12,.12,0)
    m.beam((x,3.1,-.8),(x,3.1,.8),.14,.14,1)
m.beam((-1.65,3.1,0),(1.65,3.1,0),.20,.18,1)
m.tube((0,2.6,0),(0,3.04,0),.04,0);m.ring((0,2.55,0),.16,.10,.045,4,24,'Z')
add(m,'new','Transport salvage',features='Shop lifting frame, suspended chain loop, reinforced reel plates, cable layering and chocks')

# 21 / Crawler wreck: remains of an unmanned heavy carrier, broken forward tray.
m=Model('wasteland-crawler-wreck')
for z in [-1.15,1.15]:
    for x in [-1.5,-.75,0,.75,1.5]:m.wheel(x,.52,z,.48,.35)
    for y in [.12,1.03]:m.box((0,y,z),(3.8,.16,.68),0)
    for x in np.arange(-1.75,1.8,.22):
        for y in [.055,1.12]:m.box((float(x),y,z),(.16,.09,.72),7)
m.box((-.3,1.25,0),(3.0,.32,2.1),0);m.box((-.8,1.8,0),(1.9,.82,1.75),2)
m.grille((-.8,1.8,.90),1.45,.54,8);m.panel((-.8,2.26,0),(1.4,.07,1.2),1,False)
m.box((1.9,.42,0),(1.7,.22,1.85),7,angle=.18)
for z in [-.72,.72]:m.beam((.60,1.4,z),(2.50,.45,z),.10,.10,0)
m.tube((-.8,2.24,0),(-.8,2.6,0),.11,0);m.box((-.8,2.6,0),(.60,.27,.48),1)
add(m,'new','Robot carrier wreck',features='Twin exposed tracked undercarriages, radiator body, broken supported tray and optical command head')

# 22 / Condenser: lattice fan grill above coil rows and receiver cylinders.
m=Model('wasteland-water-condenser')
m.box((0,.12,0),(3.6,.24,2.45),0)
for x in [-1.5,1.5]:
    for z in [-.95,.95]:m.box((x,1.45,z),(.13,2.65,.13),0)
for z in [-.98,.98]:m.box((0,2.87,z),(3.35,.14,.28),2)
for x in [-1.53,0,1.53]:m.box((x,2.87,0),(.28,.14,1.82),2)
for x in [-.83,.83]:
    m.ring((x,2.97,0),.70,.57,.08,4,40)
    m.tube((x,2.86,0),(x,3.015,0),.10,0,24)
    for a in range(0,360,90):
        t=math.radians(a)
        m.beam((x+.09*math.cos(t),2.88,.09*math.sin(t)),(x+.53*math.cos(t),2.83,.53*math.sin(t)),.19,.10,0)
    for a in range(0,180,30):
        t=math.radians(a);m.tube((x+.58*math.cos(t),3.03,.58*math.sin(t)),(x-.58*math.cos(t),3.03,-.58*math.sin(t)),.014,0,8)
for y in np.arange(.95,2.50,.15):m.tube((-1.35,float(y),.86),(1.35,float(y),.86),.041,4,16)
for x in [-1.35,1.35]:m.tube((x,.85,.86),(x,2.48,.86),.085,0)
for x in [-.9,.0,.9]:m.tube((x,.25,0),(x,.72,0),.30,2,32);m.ring((x,.60,0),.315,.292,.032,4)
m.panel((1.6,1.65,0),(.12,.70,.70),1,False)
m.beam((1.50,1.65,-.95),(1.50,1.65,.95),.11,.10,0)
m.cable([(-1.35,.85,.86),(-1.35,.47,.5),(-.90,.47,.3)],.060,0)
add(m,'new','Survival infrastructure',features='Twin guarded fan rings, condenser tubes, three receiver vessels and connected drain')

# 23 / Freight bogie: open bolster, visible axle and spring packs.
m=Model('wasteland-freight-bogie')
for x in [-1.65,0,1.65]:
    m.tube((x,.63,-1.12),(x,.63,1.12),.14,0)
    for z in [-1.02,1.02]:
        m.wheel(x,.63,z,.62,.18);m.ring((x,.63,z),.66,.55,.055,4,32,'Z')
for z in [-.84,.84]:
    m.box((0,.92,z),(4.6,.23,.28),0)
    for x in [-.43,.43]:
        for y in [.99,1.09,1.19,1.29]:m.ring((x,y,z),.16,.11,.052,4,20)
m.box((0,1.37,0),(1.52,.23,2.05),2);m.ring((0,1.57,0),.48,.24,.19,0,32)
for x in [-1.13,1.13]:m.beam((x,.35,-.80),(x,.35,.80),.10,.10,7)
for z in [-1.22,1.22]:
    m.beam((-1.65,.55,z),(1.65,.55,z),.12,.12,4)
    for x in [-1.65,0,1.65]:m.tube((x,.55,z-.04),(x,.55,z+.04),.13,0)
m.box((0,1.80,0),(2.8,.70,1.30),2)
m.grille((0,1.8,.69),2.10,.45,5)
add(m,'new','Locomotive salvage',features='Six locomotive wheels, exposed connecting rods, traction casing, spring packs and kingpin socket')

# 24 / Checkpoint: counterweighted arm leaves a readable walking opening.
m=Model('wasteland-checkpoint-gate')
m.box((-2.3,.22,0),(1.3,.44,1.4),3);m.box((-2.3,1.24,0),(.84,1.62,.78),2)
m.panel((-2.3,1.19,.42),(.60,1.05,.055),1);m.grille((-2.3,1.32,.47),.40,.40,5)
m.box((.2,1.96,0),(5.85,.18,.20),6)
for x in np.arange(-1.9,3.1,.60):m.box((float(x),1.963,.107),(.24,.19,.022),7,angle=0)
m.box((-3.1,1.8,0),(.60,.60,.55),0);m.tube((-2.3,1.96,-.48),(-2.3,1.96,.48),.16,4)
m.tube((-3.1,1.96,0),(-2.3,1.96,0),.09,0)
m.box((3.0,.95,0),(.18,1.90,.20),0);m.foot((3,0,0),.55)
m.box((-3.8,1.40,.15),(.10,2.8,.10),0);m.panel((-3.8,2.35,.15),(.72,.63,.09),1)
m.box((-3.8,.10,.15),(.70,.2,.70),3)
add(m,'new','Story border checkpoint',features='Arm pivot, visible counterweight, striped enamel, mechanical rest and warning sign')

# 25 / Relay vault: low utility bunker with a door in a recessed opening.
m=Model('wasteland-relay-vault')
m.box((0,.15,0),(4.9,.30,4.6),3)
for x in [-2.05,2.05]:m.box((x,1.32,0),(.45,2.35,3.95),3)
m.box((0,1.33,-1.8),(3.7,2.35,.45),3);m.box((0,2.63,0),(4.8,.30,4.45),3)
for x in [-1.5,1.5]:m.box((x,1.3,1.81),(1.0,2.3,.44),3)
m.box((0,2.32,1.81),(2.0,.35,.44),3)
m.panel((0,1.3,1.7),(1.70,2.1,.12),2)
for x in [-.78,.78]:m.box((x,1.3,1.81),(.07,2.12,.06),4)
m.ring((0,1.28,1.82),.28,.22,.075,1,32,'Z')
for a in range(0,360,120):
    t=math.radians(a);m.tube((0,1.28,1.85),(.23*math.cos(t),1.28+.23*math.sin(t),1.85),.023,1)
m.box((1.34,2.10,2.05),(.47,.15,.36),0);m.box((1.34,2.08,2.25),(.31,.095,.045),6)
m.tube((-1.45,2.74,-1),(-1.45,3.15,-1),.17,0);m.tube((-1.45,3.13,-1),(-1.45,3.22,-1),.25,4)
m.box((0,.12,2.60),(2.40,.24,.9),3)
add(m,'new','Story relay vault',features='Recessed sealed hatch, rotary lock, concrete lintel, grounded threshold and roof breather')

assert len(roots)==25
for ob,en in zip(roots,entries):
    me=ob.data;me.calc_loop_triangles();p=np.array([v.co[:] for v in me.vertices]);lo=p.min(0);hi=p.max(0)
    gl=[float(lo[0]),float(lo[2]),float(-hi[1])];gh=[float(hi[0]),float(hi[2]),float(-lo[1])]
    bm=bmesh.new();bm.from_mesh(me)
    diag={'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
          'zero_area_faces':sum(f.calc_area()<1e-10 for f in bm.faces),'loose_vertices':sum(not v.link_faces for v in bm.verts)}
    bm.free()
    en.update({'bounds_godot':{'min':gl,'max':gh},'dimensions_m':[round(b-a,4) for a,b in zip(gl,gh)],
       'vertices':len(me.vertices),'triangles':len(me.loop_triangles),'materials':sorted(set(me.materials[f.material_index].name for f in me.polygons)),
       'diagnostics':diag,'ground_min_m':round(gl[1],7),'root_transform':'identity','source':'art100-wasteland.blend'})
    en['collision'].update({'size':[round(b-a,4) for a,b in zip(gl,gh)],'center':[round((a+b)/2,4) for a,b in zip(gl,gh)],
       'note':'Placement collision policy belongs to native scenery. Use segmented or trimesh collision for walkable openings; full bounding boxes are broad-phase hints only.'})
bpy.ops.object.select_all(action='DESELECT')
for ob in roots:ob.select_set(True)
glb=ROOT/'godot/art/art100-wasteland.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_materials='EXPORT',export_extras=True,export_tangents=True)
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'));from repair_tangents import repair
print('Repaired rare cancelling tangents:',repair(glb),flush=True)
raw=glb.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
assert len(doc['meshes'])==25
assert {n['name'] for n in doc['nodes']}=={ob.name for ob in roots}
assert all(not any(k in n for k in ['translation','rotation','scale','matrix','children']) for n in doc['nodes'])
manifest={'collection':'ART100 wasteland','generator':'tools/art/art100_wasteland/build.py','source':'Original authored geometry plus ten original repository models; no third-party assets',
 'unit':'metres','up':'Godot +Y','topLevelMeshCount':25,'newModels':15,'refinedModels':10,'sharedMaterialCount':len(doc['materials']),
 'palette_source':'assets/art200/palette.json','palette_families':sorted({e['palette_family'] for e in entries}),'refinement_pass':'Phase 2 — all 25 models received physical and material refinements',
 'totalTriangles':sum(e['triangles'] for e in entries),'models':entries,'export':str(glb.relative_to(ROOT))}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

# Save a navigable editable gallery. Export has already been done at the origin.
for i,ob in enumerate(roots):ob.location=((i%5)*25,(i//5)*25,0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'art100-wasteland.blend'),compress=True)
if '--skip-render' in sys.argv:
    print('ART100_WASTELAND_GEOMETRY_COMPLETE',manifest['totalTriangles'],flush=True)
    raise SystemExit(0)

# Each assembly gets its own framed, lit material review. The source stays clean.
S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=768;S.render.resolution_y=576;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast'
S.view_settings.exposure=.65
S.world=bpy.data.worlds.new('ART100 photographic daylight');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.52,.63,.73,1)
S.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
ground=bpy.data.materials.new('REVIEW sand');ground.use_nodes=True;ground.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*linear('#888275'),1)
ground.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.018));floor=bpy.context.object;floor.data.materials.append(ground)
bpy.ops.object.light_add(type='SUN',location=(0,-6,10));sun=bpy.context.object;sun.rotation_euler=(.4,-.5,-.4);sun.data.energy=2.1;sun.data.angle=.12
bpy.ops.object.light_add(type='AREA',location=(0,-6,12));area=bpy.context.object;area.data.energy=1200;area.data.size=9
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';S.camera=cam
for ob in roots:ob.hide_render=True;ob.location=(0,0,0)
for i,(ob,en) in enumerate(zip(roots,entries)):
    ob.hide_render=False
    lo=en['bounds_godot']['min'];hi=en['bounds_godot']['max'];w,h,d=en['dimensions_m']
    center=xyz(((lo[0]+hi[0])/2,h*.40,(lo[2]+hi[2])/2))
    cam.location=center+Vector((1,-1.5,1.05)).normalized()*max(w,h,d)*2.8
    if ob.name=='wasteland-observatory':cam.location=center+Vector((-1,1.5,1.05)).normalized()*max(w,h,d)*2.8
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=max(w*1.15,d*1.32,h*1.82,3)*1.20
    area.location=center+Vector((-4,-6,9));area.rotation_euler=(center-area.location).to_track_quat('-Z','Y').to_euler()
    S.render.filepath=str(OUT/'renders'/f'{i+1:02}-{ob.name}.png');bpy.ops.render.render(write_still=True)
    ob.hide_render=True
print('ART100_WASTELAND_COMPLETE',manifest['totalTriangles'],flush=True)
