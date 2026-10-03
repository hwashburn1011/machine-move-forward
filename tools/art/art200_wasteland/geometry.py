"""Portable metre-scale geometry helpers; local ART200 snapshot."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector
S=None
M=[]

def xyz(v):return Vector((v[0],-v[2],v[1]))

class Model:
    def __init__(self,name):self.name=name;self.v=[];self.f=[];self.mi=[];self.sm=[]
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
        clean(ob,bevel,bool(extra));return ob

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
