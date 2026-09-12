"""Original Blender desert ruin library. Run with Blender --background --python.

Z is up, metres. Each finished archetype is one mesh and one shared PBR atlas.
Openings are geometry, not black window decals. Keep the editable parts in .blend.
"""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/desert-ruins'
PUBLIC=ROOT/'public/models/props/ruins'
random.seed(271828)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Desert review sky')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.42,.50,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
mat=bpy.data.materials.new('DesertSharedAtlas');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value=.85
bsdf.inputs['Metallic'].default_value=1
for suffix in ['BaseColor','Normal','ORM']:
    path=OUT/'textures'/('DesertAtlas_'+suffix+('.jpg' if suffix=='BaseColor' else '.png'))
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(path));tex.label=suffix
    if suffix!='BaseColor':tex.image.colorspace_settings.name='Non-Color'
    if suffix=='BaseColor':links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    elif suffix=='Normal':
        bump=nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.65
        links.new(tex.outputs['Color'],bump.inputs['Color']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
    else:
        separate=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],separate.inputs['Color'])
        links.new(separate.outputs['Green'],bsdf.inputs['Roughness']);links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])

parts=[];library=[];report=[]

def uv_project(o,tile):
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    coords=[v.co for v in o.data.vertices]
    lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)]
    for p in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            u=(v[a]-lo[a])/max(.001,hi[a]-lo[a]);vv=(v[b]-lo[b])/max(.001,hi[b]-lo[b])
            uv.data[li].uv=((tile%4+.018+u*.964)/4,(3-tile//4+.018+vv*.964)/4)

def mesh(name,verts,faces,tile=0,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.data.materials.append(mat)
    for p in data.polygons:p.use_smooth=smooth
    uv_project(o,tile);parts.append(o);return o

def box(name,at,size,tile=0,bevel=.04,rot=None):
    x,y,z=[s/2 for s in size]
    o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile)
    o.location=at
    if rot:o.rotation_euler=rot
    if bevel:
        mod=o.modifiers.new('Worn rounded edges','BEVEL');mod.width=min(bevel,min(size)*.24);mod.segments=2
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return o

def rod(name,a,b,r=.055,tile=5,segments=10):
    d=Vector(b)-Vector(a);length=d.length
    verts=[]
    for z in [-length/2,length/2]:
        verts.extend([(math.cos(i*math.tau/segments)*r,math.sin(i*math.tau/segments)*r,z) for i in range(segments)])
    faces=[tuple(reversed(range(segments))),tuple(range(segments,segments*2))]
    faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    o=mesh(name,verts,faces,tile,True);o.location=(Vector(a)+Vector(b))*.5
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

def ring(name,at,radius,tube=.07,tile=2,rotation=(math.pi/2,0,0)):
    n=24;m=6;verts=[];faces=[]
    for i in range(n):
        a=i*math.tau/n
        for j in range(m):
            b=j*math.tau/m;r=radius+math.cos(b)*tube
            verts.append((r*math.cos(a),r*math.sin(a),math.sin(b)*tube))
    for i in range(n):
        for j in range(m):faces.append((i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m))
    o=mesh(name,verts,faces,tile,True);o.location=at;o.rotation_euler=rotation;return o

def jagged_slab(name,at,w,d,h=.22,tile=0):
    outline=[(-w/2,-d/2),(w*.31,-d/2),(w*.5,-d*.37),(w*.41,-d*.18),(w*.5,d*.12),(w*.35,d/2),(-w*.12,d*.43),(-w/2,d/2)]
    n=len(outline);verts=[(x,y,z) for z in [-h/2,h/2] for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name,verts,faces,tile);o.location=at;return o

def wall(name,origin,w,h,tile=1,along_y=False,broken=False):
    # Bays leave true window voids and expose the room behind each opening.
    origin=Vector(origin);bays=max(1,round(w/2.7));bay=w/bays
    def piece(label,dx,z,ww,hh):
        at=origin+Vector((0,dx,z) if along_y else (dx,0,z))
        return box(name+' '+label,at,(.26,ww,hh) if along_y else (ww,.26,hh),tile,.045)
    for i in range(bays):
        x=-w/2+bay*(i+.5)
        if broken and i==bays-1:
            piece('shattered sill',x,.37,bay,.74)
            for j in range(4):piece('broken masonry',x-bay*.35+j*.29,.8+j*.17,.32,.4+j*.31)
            continue
        piece('sill',x,.45,bay,.9)
        piece('lintel',x,h-.27,bay,.54)
        piece('pier',x-bay*.5+.18,h*.5,.36,h)
        piece('jamb',x+bay*.5-.10,h*.5,.20,h)
        piece('inner stone sill',x,.97,bay-.35,.12)
        # Shattered wooden/steel window rails, with no solid glass filler.
        at=origin+Vector((0,x,0) if along_y else (x,0,0))
        rod(name+' exposed window mullion',at+Vector((0,0,1)),at+Vector((0,0,h-.5)),.025,9,8)

def rubble(w,d,count=20):
    for i in range(count):
        x=random.uniform(-w*.7,w*.7);y=random.uniform(-d*.7,d*.7)
        o=jagged_slab('fallen concrete', (x,y,random.uniform(.08,.3)),random.uniform(.3,1.2),random.uniform(.3,.9),random.uniform(.15,.38),random.choice([0,1,6]))
        o.rotation_euler=(random.uniform(-.4,.4),random.uniform(-.4,.4),random.uniform(0,6.28))

def house():
    w=8;d=6
    jagged_slab('sand buried foundation',(0,0,.1),w+1,d+1,.3)
    wall('street facade',(0,-d/2,0),w,3.6,1,broken=True)
    wall('back wall',(0,d/2,0),w,3.2,6,broken=True)
    wall('surviving side',(-w/2,0,0),d,3.6,1,True)
    wall('collapsed side',(w/2,0,0),d,2.5,6,True,True)
    for y in [-3,-1.5,0,1.5,3]:
        rod('exposed rafter',(-4,y,3.6),(0,y,5.4),.09,9)
        if y<1:rod('broken roof rafter',(0,y,5.4),(3.1,y,4),.09,9)
        rod('roof tie',(-4,y,3.6),(2.6,y,3.6),.07,9)
    rod('ridge beam',(0,-3.3,5.4),(0,3.3,5.4),.11,9)
    for i in range(9):box('remaining corrugated roof',(-2.2,-2.9+i*.42,4.42),(3.9,.37,.07),7,.015,(0,-.423,0))
    rubble(w,d,22)

def frame_building(floors=4,w=11,d=9):
    for f in range(floors):
        z=f*3.3
        # Fractured edge changes with height; the top floors are partially collapsed.
        sw=w*(1 if f<floors-2 else .75);sd=d*(1 if f<floors-1 else .7)
        jagged_slab('fractured floor slab',(0,0,z+.15),sw,sd,.3)
        for x in [-w*.43,0,w*.43]:
            for y in [-d*.42,d*.42]:
                if f==floors-1 and x>0:continue
                h=3.3 if f<floors-1 else random.uniform(1,3)
                box('structural column',(x,y,z+h/2),(.42,.42,h),0,.04)
                if f==floors-1:
                    for j in range(3):rod('exposed column rebar',(x+(j-1)*.12,y,z+h),(x+(j-1)*.12+.1,y+.07,z+h+.9),.025,2,6)
        if f<floors-1:
            wall('fragmented facade',(0,-d*.46,z),w,3.2,1 if f%2==0 else 0,broken=True)
            if f%2==0:wall('exposed brick partition',(-w*.44,0,z),d*.67,3,6,True,True)
        # Fallen floor edge and surviving balcony make each storey legible.
        if f>0:
            for j in range(4):rod('dangling slab reinforcement',(-w*.3+j*.7,-d*.49,z),( -w*.3+j*.7,-d*.61,z-.5-random.random()),.025,2,6)
            box('balcony cantilever',(-w*.21,-d*.55,z), (w*.4,1.8,.18),0,.025)
            for x in [-w*.4,-w*.2,0]:rod('bent balcony rail',(x,-d*.66,z),(x-.1,-d*.66,z+.95),.04,5,8)
            rod('balcony handrail',(-w*.4,-d*.66,z+.95),(0,-d*.66,z+.95),.035,5,8)
    # Fallen stair flight beneath the open side.
    for i in range(8):box('remaining stair tread',(w*.34,i*.30-d*.25,.25+i*.28),(2,.34,.18),0,.018)
    rubble(w,d,28)

def factory():
    w=16;d=11
    for x in [-8,-4,0,4,8]:
        for y in [-5.5,5.5]:
            rod('industrial upright',(x,y,0),(x,y,6.5),.16,2,12)
        rod('roof truss',(x,-5.5,6.5),(x,0,8.2),.13,5)
        if x<6:rod('broken roof truss',(x,0,8.2),(x,4.1,6.9),.13,5)
        rod('lower truss tie',(x,-5.5,6.5),(x,3,6.5),.07,5)
    wall('factory wall',(0,-5.5,0),16,4.1,6,broken=True)
    for i in range(16):box('peeled sheet cladding',(-7+i*.55,5.45,2.1),(.49,.05,4.2),7,.006,(.1 if i%4==0 else 0,0,0))
    for z in [1.1,3.2,5.3]:rod('industrial pipe',(-7,2,z),(7,2,z),.17,2,14)
    rod('broken chimney',(5,3,0),(5.1,3,12),.95,6,18)
    for z in [2,4,6,8,10]:ring('chimney bands',(5,3,z),.99,.055,5,(0,0,0))
    rubble(w,d,28)

def overpass():
    for x in [-8,8]:
        box('bridge pier',(x,0,3.8),(1.6,3,7.6),0,.08)
        box('pier cap',(x,0,7.7),(6,4,.9),0,.06)
        jagged_slab('broken roadway',(x-1,0,8.5),10,6,.8,10)
        for y in [-2.7,2.7]:
            for j in range(4):rod('highway safety post',(x-5+j*1.8,y,8.9),(x-5+j*1.8,y,9.8),.04,5)
            rod('broken guardrail',(x-5,y,9.5),(x+1,y,9.5),.09,5)
        for j in range(7):rod('bridge exposed rebar',(x+2,j*.65-2,8.4),(x+4+random.random(),j*.65-2,8.1-random.random()),.035,2,6)
    o=jagged_slab('collapsed road slab',(0,2,1.8),7,5,.7,10);o.rotation_euler=(.3,.38,.2)
    rubble(20,7,22)

def wheel(x,y,z,r=.48):
    # Wheel axle is X; real hollow tyre/rim rather than a capped cylinder.
    ring('torn tyre',(x,y,z),r,.13,4,(0,math.pi/2,0))
    ring('exposed wheel rim',(x,y,z),r*.68,.07,2,(0,math.pi/2,0))
    for a in range(6):
        ang=a*math.tau/6;rod('wheel spoke',(x,y,z),(x,y+math.cos(ang)*r*.65,z+math.sin(ang)*r*.65),.028,5,6)

def car(bus=False):
    w=2.15 if not bus else 2.7;length=4.9 if not bus else 9.6
    roof=1.95 if not bus else 3.25
    # Chassis, sills and rounded fenders enclose an empty passenger compartment.
    box('exposed chassis',(0,0,.4),(w*.75,length,.18),5,.055)
    for x in [-w/2,w/2]:
        box('corroded sill',(x,0,.78),(.13,length,.40),3,.06)
        for y in [-length*.32,length*.32]:wheel(x,y,.51,.48 if not bus else .57)
        box('lower cabin skin',(x,length*.08,1.15),(.095,length*.64,.42),3,.045)
        for y in ([-1.15,.45,1.75] if not bus else [-3.9,-2.6,-1.3,0,1.3,2.6,3.9]):
            rod('open window pillar',(x,y,1.32),(x*.86,y+.15,roof),.045,3,10)
        rod('window upper frame',(x*.86,-length*.28,roof),(x*.86,length*.39,roof),.055,3,10)
    box('rounded surviving roof',(0,length*.06,roof+.025),(w*.89,length*.70,.11),2,.12)
    for y in [-length*.32,length*.32]:rod('bare axle',(-w*.54,y,.5),(w*.54,y,.5),.08,5)
    for y in ([-.6,.6] if not bus else [-3,-1.8,-.6,.6,1.8,3]):
        for x in [-.6,.6]:
            box('torn seat cushion',(x,y,.81),(.54,.57,.12),4,.07)
            box('seat metal back',(x,y+.24,1.16),(.54,.09,.67),4,.06,(.12,0,0))
    # Empty radiator opening framed with rounded rails, no solid black grille.
    front=-length/2
    for x in [-w*.49,w*.49]:box('front fender',(x,front+.4,.87),(.35,.92,.45),3,.12)
    box('bent bumper',(0,front-.1,.47),(w*1.06,.15,.17),5,.055,(0,.03,.05))
    for x in [-w*.34,w*.34]:ring('missing headlamp socket',(x,front,.98),.18,.048,5)
    for x in [-w*.20,w*.20]:rod('radiator frame',(x,front,.61),(x,front,1.14),.036,2,8)
    rod('radiator top rail',(-w*.37,front,1.18),(w*.37,front,1.18),.04,2)
    if not bus:
        # A raised hood leaves an actual empty engine bay below it.
        box('peeled open hood',(0,front+.64,1.58),(w*.76,1.34,.085),2,.1,(-.28,.03,0))
        box('gutted engine block',(0,front+.7,.65),(.54,.6,.4),5,.09)
        rod('bare steering shaft',(-.43,-.62,.92),(-.43,-.8,1.35),.038,5)
        ring('steering wheel',(-.43,-.83,1.38),.22,.025,5,(.4,0,0))
    else:
        box('bus brow',(0,front+.03,2.91),(w,.15,.2),3,.08)
        for x in [-w/2,0,w/2]:rod('empty windscreen divider',(x,front,1.4),(x*.85,front+.3,3),.05,3)
        # Door panel ripped out and hanging on a hinge.
        box('hanging bus door',(w*.7,-2.9,1.17),(.07,1,1.82),2,.035,(.13,-.15,-.65))
    box('rear body shell',(0,length*.49,1.07),(w,.13,.82),3,.06)
    for i in range(8):
        box('body fragment',(random.uniform(-w,w),random.uniform(-length*.6,length*.6),.12),(.25,.45,.04),2,.015,(.2,.1,random.uniform(0,6.28)))

def tanker():
    car(False)
    # Detached, torn-open tank lying alongside the tractor remains.
    n=32;verts=[];faces=[]
    for y in [-4,0,4]:
        for i in range(n):
            a=i*math.tau/n;rr=1.35+(random.uniform(-.1,.1) if y==4 else 0)
            verts.append((math.cos(a)*rr+3.1,y,math.sin(a)*rr+1.45))
    for j in range(2):
        for i in range(n):
            if j==1 and 3<i<10:continue
            faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    tank=mesh('ruptured tanker shell',verts,faces,7,True)
    solid=tank.modifiers.new('Tank wall thickness','SOLIDIFY');solid.thickness=.05
    for y in [-3.7,-1.3,1.3,3.7]:ring('tanker steel ribs',(3.1,y,1.45),1.37,.06,2)
    for x in [2.2,4]:box('tank saddle chassis',(x,0,.31),(.2,8.3,.3),5,.03)
    for y in [-2.6,2.6]:wheel(4.15,y,.5);wheel(2.1,y,.5)

def sign(w=9,h=4,z=6,tile=12):
    # Fragmented sign sheets share one continuous UV layout across missing panels.
    cols=8;rows=4
    for i in range(cols):
        for j in range(rows):
            if (i,j) in [(7,0),(6,0),(7,1),(0,3)]:continue
            x0=-w/2+i*w/cols;x1=x0+w/cols*.98;z0=z+j*h/rows;z1=z0+h/rows*.985
            verts=[(x0,-.12,z0),(x1,-.12,z0+(random.uniform(0,.15) if j==0 else 0)),(x1,-.12,z1),(x0,-.12,z1)]
            o=mesh('torn advertising skin',verts,[(0,1,2,3)],tile)
            uv=o.data.uv_layers.active
            for loop in o.data.loops:
                v=o.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv=((tile%4+.018+(v.x/w+.5)*.964)/4,(3-tile//4+.018+(v.z-z)/h*.964)/4)
            mod=o.modifiers.new('Sheet thickness','SOLIDIFY');mod.thickness=.025
    for x in [-w*.33,w*.33]:
        rod('sign support',(x,0,0),(x,0,z+h+.1),.13,2,12)
        rod('sign diagonal',(x,1.3,0),(x,0,z+h*.7),.07,5)
        box('concrete footing',(x,0,.2),(.9,1,.4),0,.045)
    for zz in [z,z+h*.5,z+h]:
        rod('exposed billboard frame',(-w*.52,.1,zz),(w*.52,.1,zz),.07,5)
    for i in range(6):rod('billboard rear cross brace',(-w*.5+i*w/6,.15,z),(-w*.5+(i+1)*w/6,.15,z+h),.035,5)
    for i in range(12):rod('maintenance ladder rung',(-w*.35,.24,i*.42),(-w*.35+.45,.24,i*.42),.028,5,8)

def pylon():
    for x,y in [(-1.9,-1.9),(1.9,-1.9),(1.9,1.9),(-1.9,1.9)]:
        rod('pylon leg',(x,y,0),(x*.25,y*.25,18),.11,2)
    for z in [0,3,6,9,12,15]:
        a=1.9*(1-z/24);b=1.9*(1-(z+3)/24)
        for side in [-1,1]:
            rod('lattice X',(-a,side*a,z),(b,side*b,z+3),.045,5,8)
            rod('lattice X',(a,side*a,z),(-b,side*b,z+3),.045,5,8)
            rod('lattice side',(side*a,-a,z),(side*b,b,z+3),.045,5,8)
    for z,w in [(12,6.5),(16,5)]:
        rod('crossarm',(-w/2,0,z),(w/2,0,z),.11,5)
        for x in [-w/2,w/2]:
            for zz in range(5):ring('ceramic insulator',(x,0,z-.15-zz*.13),.15,.035,1,(0,0,0))
            rod('snapped dangling cable',(x,0,z-.8),(x+.8,.2,z-4),.024,5,8)

def water_tower():
    for x in [-2,2]:
        for y in [-2,2]:
            rod('water tower leg',(x,y,0),(x*.72,y*.72,10),.12,2)
            rod('water tower X',(x,y,1),(-x,-y,9),.055,5)
    rod('elevated tank',(0,0,9),(0,0,13.5),2.8,7,32)
    for z in [9.2,11,13.3]:ring('tank band',(0,0,z),2.83,.07,2,(0,0,0))
    rod('water downpipe',(1.8,0,.2),(1.8,0,10),.15,2,12)

BUILDERS=[('ruin-house',house),('ruin-shop',lambda:frame_building(2,9,7)),('ruin-apartment',lambda:frame_building(4,12,10)),('ruin-tower',lambda:frame_building(8,13,11)),('ruin-factory',factory),('overpass',overpass),('wreck-car',lambda:car(False)),('wreck-bus',lambda:car(True)),('wreck-tanker',tanker),('billboard',lambda:sign()),('water-sign',lambda:sign(7,3.6,4.5,13)),('road-sign',lambda:sign(3.5,2.2,2.8,15)),('pylon',pylon),('water-tower',water_tower)]

for idx,(name,builder) in enumerate(BUILDERS):
    parts=[];builder()
    coll=bpy.data.collections.new(name+' editable components');scene.collection.children.link(coll)
    # Keep the non-destructive source, hidden during renders/exports.
    for o in parts:
        for owner in list(o.users_collection):owner.objects.unlink(o)
        coll.objects.link(o)
    originals=list(parts)
    bpy.ops.object.select_all(action='DESELECT')
    for o in originals:o.select_set(True)
    bpy.context.view_layer.objects.active=originals[0]
    bpy.ops.object.duplicate()
    copies=list(bpy.context.selected_objects)
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    joined=bpy.context.object;joined.name=name
    # Library mesh origin remains in game coordinates, before staging the review grid.
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for owner in list(joined.users_collection):owner.objects.unlink(joined)
    scene.collection.objects.link(joined)
    coll.hide_render=True;coll.hide_viewport=True
    joined['archetype']=name;joined['original_art']=True
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    joined.data.calc_loop_triangles()
    triangles=len(joined.data.loop_triangles)
    report.append({'name':name,'triangles':triangles,'vertices':len(joined.data.vertices),'size_m':list(joined.dimensions)})
    bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/(name+'.fbx')),use_selection=True,object_types={'MESH'},add_leaf_bones=False,axis_forward='-Y',axis_up='Z',use_mesh_modifiers=True)
    library.append(joined)
    print('BUILT',name,triangles,flush=True)

# Preserve the same origin and UVs for reduced distant meshes. Never normalize
# LODs independently: missing tiny debris must not change their scale or pivot.
lods=[]
for original in library:
    lod=original.copy();lod.data=original.data.copy();scene.collection.objects.link(lod)
    lod.name=original.name+'__lod'
    bpy.ops.object.select_all(action='DESELECT');lod.select_set(True)
    bpy.context.view_layer.objects.active=lod
    dec=lod.modifiers.new('Distant silhouette','DECIMATE');dec.ratio=.32
    dec.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    lod.data.calc_loop_triangles()
    next(r for r in report if r['name']==original.name)['lod_triangles']=len(lod.data.loop_triangles)
    lods.append(lod)
# One atlas/library download with both levels. Runtime batches reuse it.
bpy.ops.object.select_all(action='DESELECT')
for o in library+lods:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/'desert-ruins.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_image_format='AUTO')
for o in lods:bpy.data.objects.remove(o,do_unlink=True)
(OUT/'source'/'model-report.json').write_text(json.dumps(report,indent=2))

# Stage the .blend as a readable contact sheet; original modelling collections stay intact.
for i,o in enumerate(library):o.location=((i%4)*31,(i//4)*30,0)
floor_mat=bpy.data.materials.new('Review sand');floor_mat.diffuse_color=(.36,.25,.13,1)
bpy.ops.mesh.primitive_plane_add(size=240,location=(45,40,-.17));bpy.context.object.data.materials.append(floor_mat)
bpy.ops.object.light_add(type='SUN',location=(0,0,35));sun=bpy.context.object;sun.rotation_euler=(.65,-.5,-.6);sun.data.energy=3;sun.data.angle=.06
bpy.ops.object.camera_add(location=(155,-147,139));camera=bpy.context.object
camera.rotation_euler=(Vector((43,43,6))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=177;scene.camera=camera
scene.render.resolution_x=1800;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for image in bpy.data.images:
    if image.source=='FILE':image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/'DesertRuins.blend'))
scene.render.filepath=str(ROOT/'docs/art/desert-ruins/blender-library.png')
bpy.ops.render.render(write_still=True)
print('DESERT_LIBRARY_COMPLETE',json.dumps(report),flush=True)
