"""Original industrial modeling primitives and portable texture authoring."""
import bpy, bmesh, math, random
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/iron-nomad'
for folder in ['source', 'exports', 'optimized', 'textures', 'preview']:
    (OUT / folder).mkdir(parents=True, exist_ok=True)
def srgb(c):
    return tuple(x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4 for x in c)

def noise(size,cells,seed):
    r=np.random.default_rng(seed);g=r.random((cells,cells),dtype=np.float32)
    t=np.arange(size,dtype=np.float32)*cells/size;i=t.astype(np.int32);f=t-i;f=f*f*(3-2*f)
    a=g[i[:,None]%cells,i[None,:]%cells];b=g[i[:,None]%cells,(i[None,:]+1)%cells]
    c=g[(i[:,None]+1)%cells,i[None,:]%cells];d=g[(i[:,None]+1)%cells,(i[None,:]+1)%cells]
    return (a*(1-f[None,:])+b*f[None,:])*(1-f[:,None])+(c*(1-f[None,:])+d*f[None,:])*f[:,None]

def save_image(name,data,color=False):
    import struct,zlib
    h,w=data.shape[:2];pixels=(np.clip(data,0,1)*255+.5).astype(np.uint8)[::-1]
    raw=b''.join(b'\x00'+row.tobytes() for row in pixels)
    def chunk(kind,value):return struct.pack('>I',len(value))+kind+value+struct.pack('>I',zlib.crc32(kind+value)&4294967295)
    path=OUT/'textures'/f'{name}.png'
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
    im=bpy.data.images.load(str(path),check_existing=False);im.name=name
    im.colorspace_settings.name='sRGB' if color else 'Non-Color';im.pack();return im

def plain(name,color,metal=0,rough=.5,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*srgb(color),1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*srgb(color),1);p.inputs['Emission Strength'].default_value=emission
    return m
M = {}
CACHE = {}
PARTS = []
ANCHORS = []
rng = random.Random(4401)

def materials():
    for key, name, base, rust, metallic in [
        ('paint', 'WarmIvory_PaintedSteel', (.43,.41,.355), (.145,.056,.020), .35),
        ('red', 'OxideRed_PaintedSteel', (.18,.048,.020), (.075,.061,.046), .35),
        ('dark', 'Charcoal_Steel', (.09,.103,.106), (.20,.12,.068), .72),
        ('steel', 'Aged_BareMetal', (.25,.272,.267), (.125,.078,.040), .83),
        ('brass', 'Worn_HandrailBrass', (.36,.265,.13), (.16,.125,.073), .66),
    ]:
        size = 2048 if key in ['paint','red'] else 1024
        seed = len(M)*137+19
        n = .45*noise(size,9,seed)+.3*noise(size,43,seed+1)+.25*noise(size,173,seed+2)
        fine = noise(size,431,seed+3)
        y,x = np.mgrid[:size,:size]/size
        wear = np.clip((.45*n+.55*fine-.67)*16,0,1)
        # Narrow rain/oil runs, strongest below scattered fasteners. Broad paint stays intact.
        leaks=np.zeros_like(n)
        r=np.random.default_rng(seed)
        for _ in range(28):
            cx,cy=r.uniform(0,1,2);length=r.uniform(.08,.5);width=r.uniform(.001,.012)
            streak=np.exp(-((x-cx)/(width*(1+np.clip(cy-y,0,1)*2)))**2)
            streak*=np.clip((cy-y)*80,0,1)*np.clip(1-(cy-y)/length,0,1)
            leaks=np.maximum(leaks,streak*r.uniform(.3,.9))
        rustmask=np.maximum(wear,leaks*.62)
        if key in ['paint','red']:
            macro=noise(size,12,seed+48)
            scar=np.clip((.72*macro+.28*noise(size,74,seed+77)-.655)*16,0,1)
            rustmask=np.maximum(rustmask,scar)
        color=np.array(base)*(1-rustmask[:,:,None])+np.array(rust)*rustmask[:,:,None]
        color*= (.78+.28*n)[:,:,None]
        rough=.57+.17*n+.18*rustmask
        height=.055*n-.08*wear+.008*fine
        dx=(np.roll(height,-1,1)-np.roll(height,1,1))*4
        dy=(np.roll(height,-1,0)-np.roll(height,1,0))*4
        norm=np.stack([-dx,-dy,np.ones_like(n)],axis=2);norm/=np.linalg.norm(norm,axis=2)[:,:,None]
        mat=plain('Nomad_'+name,base,metallic,.65)
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;bs=nodes.get('Principled BSDF')
        tex=nodes.new('ShaderNodeTexImage');tex.image=save_image(name+'_BaseColor',color,True);links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        tex=nodes.new('ShaderNodeTexImage');tex.image=save_image(name+'_Normal',norm*.5+.5)
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.7
        links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        tex=nodes.new('ShaderNodeTexImage');tex.image=save_image(name+'_ORM',np.stack([np.ones_like(n),rough,np.clip(metallic-.45*rustmask,0,1)],axis=2))
        sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
        M[key]=mat
    for key,col,metal,rough,em in [
        ('black',(.012,.017,.018),.1,.72,0),('rubber',(.027,.030,.027),0,.88,0),
        ('chrome',(.43,.48,.49),.94,.22,0),('cyan',(.013,.61,.95),.1,.3,3.5),
        ('amber',(1,.38,.065),.1,.3,6),('lamp',(1,.74,.39),.0,.2,9),
        ('glass',(.012,.045,.061),.70,.17,0),('ink',(.77,.70,.53),.0,.8,0),
        ('cloth',(.23,.16,.085),0,.95,0),('wood',(.16,.11,.065),0,.94,0),
        ('signal',(.95,.06,.01),0,.35,4),
    ]: M[key]=plain('Nomad_'+key,col,metal,rough,em)
    return M

def group(name,at=(0,0,0),parent=None,rotation=None):
    o=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(o)
    o.parent=parent;o.location=at
    if rotation:o.rotation_euler=rotation
    return o

def anchor(name,at,parent=None,role='light',**props):
    o=group(name,at,parent);o['anchorRole']=role
    for k,v in props.items():o[k]=v
    ANCHORS.append(o);return o

def uvmap(mesh,tile=4):
    uv=mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(v[axes[0]]/tile,v[axes[1]]/tile)

def instance(name,mesh,mat,parent=None,at=(0,0,0),rotation=None):
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o)
    o.parent=parent;o.location=at
    if rotation:o.rotation_euler=rotation
    if not mesh.materials:mesh.materials.append(mat)
    o.material_slots[0].link='OBJECT';o.material_slots[0].material=mat
    PARTS.append(o);return o

def mesh(name,verts,faces,mat,parent=None,bevel=0):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    if bevel:
        bm=bmesh.new();bm.from_mesh(m)
        bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=3,affect='EDGES')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free();m.update()
    uvmap(m);return instance(name,m,mat,parent)

def box(name,at,size,mat,parent=None,bevel=.025,rotation=None):
    key=('box',tuple(round(v,5) for v in size),bevel)
    if key not in CACHE:
        bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
        for v in bm.verts:
            for i in range(3):v.co[i]*=size[i]
        if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(size)*.3),segments=3,affect='EDGES')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        m=bpy.data.meshes.new(name);bm.to_mesh(m);bm.free();m.update();uvmap(m);CACHE[key]=m
    return instance(name,CACHE[key],mat,parent,at,rotation)

def cylinder(name,a,b,r,mat,parent=None,r2=None,n=24):
    a,b=Vector(a),Vector(b);length=(b-a).length;r2=r if r2 is None else r2
    key=('cyl',round(length,5),r,r2,n)
    if key not in CACHE:
        vertices=[(rad*math.cos(i*math.tau/n),rad*math.sin(i*math.tau/n),z) for rad,z in [(r,-length/2),(r2,length/2)] for i in range(n)]
        faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        m=bpy.data.meshes.new(name);m.from_pydata(vertices,[],faces);m.update();uvmap(m)
        for p in m.polygons:p.use_smooth=p.index>=2
        CACHE[key]=m
    o=instance(name,CACHE[key],mat,parent,(a+b)*.5)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def beam(name,a,b,width,depth,mat,parent=None,bevel=.015):
    a,b=Vector(a),Vector(b);o=box(name,(a+b)*.5,(width,depth,(b-a).length),mat,parent,bevel)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def tube(name,points,r,mat,parent=None,smooth=True):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=10
    curve.bevel_depth=r;curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER' if smooth else 'POLY')
    if smooth:
        spline.bezier_points.add(len(points)-1)
        for p,v in zip(spline.bezier_points,points):p.co=v;p.handle_left_type=p.handle_right_type='AUTO'
    else:
        spline.points.add(len(points)-1)
        for p,v in zip(spline.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,curve);bpy.context.scene.collection.objects.link(o);o.parent=parent
    curve.materials.append(mat);PARTS.append(o);return o

def ring(name,at,axis,r,minor,mat,parent=None,n=64):
    key=('ring',r,minor,n)
    if key not in CACHE:
        verts=[];faces=[];s=8
        for i in range(n):
            a=i*math.tau/n
            for j in range(s):
                b=j*math.tau/s;verts.append(((r+minor*math.cos(b))*math.cos(a),(r+minor*math.cos(b))*math.sin(a),minor*math.sin(b)))
        for i in range(n):
            for j in range(s):faces.append((i*s+j,((i+1)%n)*s+j,((i+1)%n)*s+(j+1)%s,i*s+(j+1)%s))
        m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();uvmap(m)
        for p in m.polygons:p.use_smooth=True
        CACHE[key]=m
    o=instance(name,CACHE[key],mat,parent,at);o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();return o

def bolt(name,at,axis,mat,parent=None,r=.055):
    at=Vector(at);axis=Vector(axis).normalized()
    return cylinder(name,at,at+axis*.035,r,mat,parent,n=6)

def panel(name,at,w,h,mat,parent=None,normal=(0,-1,0),thick=.06):
    # Local XY is the panel face, its +Z normal points out of the wall.
    g=group(name,at,parent);g.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler()
    box(name+' plate',(0,0,0),(w,h,thick),mat,g,min(.025,thick*.25))
    for x in [-w/2+.12,w/2-.12]:
        for y in [-h/2+.12,h/2-.12]:bolt('Panel captive fastener',(x,y,thick/2),(0,0,1),M['steel'],g,.045)
    # Sparse worn edges with dark corrosion beneath, not uniform bright outlines.
    for k in range(4):
        x=rng.uniform(-w*.4,w*.4);yy=(-1 if k%2 else 1)*(h*.5-.022)
        box('Edge paint loss',(x,yy,thick*.5+.002),(rng.uniform(.06,.21),.014,.006),M['dark'],g,0)
    return g

def lamp(name,at,parent=None,normal=(0,-1,0),color='lamp',width=.52,height=.17):
    g=group(name,at,parent);g.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler()
    box('Weatherproof lamp housing',(0,0,0),(width+.14,height+.13,.13),M['dark'],g,.03)
    box('Recessed luminous lens',(0,0,.074),(width,height,.022),M[color],g,.009)
    for x in np.linspace(-width*.4,width*.4,4):box('Lamp protective mullion',(float(x),0,.095),(.013,height,.02),M['steel'],g,.003)
    anchor(name+'_Light',(0,0,.12),g,color=color,watts=35 if color=='lamp' else 15)
    return g

def railing(name,a,b,parent=None,gate=False):
    a,b=Vector(a),Vector(b);n=math.ceil((b-a).length/1.6)
    for i in range(n+1):
        p=a.lerp(b,i/n);cylinder(name+' stanchion',p,p+Vector((0,0,1.06)),.032,M['brass'],parent,n=12)
        box('Railing foot socket',p+Vector((0,0,.04)),(.14,.14,.08),M['dark'],parent,.008)
    for z in [.48,1.04]:cylinder(name+' rail',a+Vector((0,0,z)),b+Vector((0,0,z)),.033,M['brass'],parent,n=12)
    beam('Walkway toe guard',a+Vector((0,0,.10)),b+Vector((0,0,.1)),.12,.035,M['dark'],parent,.006)

def ladder(name,at,height,parent=None):
    g=group(name,at,parent)
    for x in [-.34,.34]:cylinder('Ladder stringer',(x,0,0),(x,0,height),.045,M['brass'],g,n=12)
    for z in np.arange(.1,height,.30):cylinder('Non-slip ladder rung',(-.34,-.035,float(z)),(.34,-.035,float(z)),.025,M['steel'],g,n=12)
    return g

def vent(name,at,w,h,parent=None,normal=(0,-1,0)):
    g=group(name,at,parent);g.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler()
    box('Vent dark cavity',(0,0,0),(w,h,.1),M['black'],g,.035)
    for y in np.arange(-h*.42,h*.45,.12):box('Louver blade',(0,float(y),.065),(w*.92,.055,.08),M['steel'],g,.007,rotation=(.3,0,0))
    return g

def label(text,at,size,parent=None,normal=(0,-1,0),mat=None):
    c=bpy.data.curves.new('Stencil '+text,'FONT');c.body=text;c.size=size;c.align_x='CENTER';c.extrude=.0005;c.resolution_u=3
    o=bpy.data.objects.new('Stencil '+text,c);bpy.context.scene.collection.objects.link(o);o.parent=parent;o.location=at
    o.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler();c.materials.append(mat or M['ink']);PARTS.append(o);return o

def sphere(name,at,scale,mat,parent=None):
    key=('sphere',)
    if key not in CACHE:
        bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=24,v_segments=16,radius=1)
        m=bpy.data.meshes.new(name);bm.to_mesh(m);bm.free();m.update();uvmap(m)
        for p in m.polygons:p.use_smooth=True
        CACHE[key]=m
    o=instance(name,CACHE[key],mat,parent,at);o.scale=scale;return o
