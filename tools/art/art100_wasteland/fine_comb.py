"""Independent review repairs: real support paths, anchored steel and grounded debris.

All old geometry changes are applied in memory after importing the preserved
original runtime sources. Native authoring coordinates here are Godot +Y up.
"""
import bmesh, math

REPAIR_NOTES={
'diner':'Ten seat pedestals, two counter legs, roof/fascia return brackets, right upright/rib ties and a grounded sign footing.',
'greenhouse':'Four feet connect the central raised growing bed to the foundation.',
'passenger-coach':'Twelve seat pedestals, endwall sill, boarding-step returns and broken-roof-rib tie; modest hidden spring segmentation optimization.',
'service-station':'Five steel return tabs connect rear fascia to the canopy structure.',
'cooling-tower':'Individual loose concrete fragments are grounded after whole-assembly origin normalization.',
'solar-farm':'Original solar layout rebuilt with continuous cell battens, connected braces and grounded soleplates; fallen panels individually seated; tank supports and controller grounded.',
'tunnel':'Reinforcement originates inside real fractured concrete edges; unsupported road paint removed and loose rubble grounded.',
'freight-bogie':'Diagonal hangers connect both transverse brake beams into the sideframe.'}

def components(mesh):
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
    seen=set();groups=[]
    for v in bm.verts:
        if v in seen:continue
        group={v};todo=[v];seen.add(v)
        while todo:
            a=todo.pop()
            for e in a.link_edges:
                b=e.other_vert(a)
                if b not in seen:seen.add(b);group.add(b);todo.append(b)
        faces={f for a in group for f in a.link_faces}
        pts=[(v.co.x,v.co.z,-v.co.y) for v in group]
        lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)]
        groups.append((group,faces,lo,hi))
    return bm,groups

def rebuild_solar(m):
    """Keep original arrangement and torn silhouette, give each module a load path."""
    def panel(at,angle,damaged=False,fallen=False):
        start=len(m.v);co=math.cos(angle);si=math.sin(angle)
        def p(v):
            u,vv,w=v
            return (at[0]+u,at[2]+si*vv+co*w,-at[1]-co*vv+si*w)
        for x in [-1.46,1.46]:m.beam(p((x,-1.03,0)),p((x,1.03,0)),.065,.070,0)
        for v in [-1.03,1.03]:
            if damaged and v>0:continue
            m.beam(p((-1.46,v,0)),p((1.46,v,0)),.065,.070,0)
        # Every cell has a continuous transverse batten attached to perimeter.
        for v in [-.65,0,.65]:m.beam(p((-1.46,v,-.025)),p((1.46,v,-.025)),.045,.075,0)
        for x in [-1.05,1.05]:m.beam(p((x,-1, -.065)),p((x,1,-.065)),.08,.08,0)
        for row in range(3):
            for col in range(6):
                if damaged and (col,row) in [(0,2),(1,2),(4,1),(5,1),(5,2)]:continue
                cx=-1.22+col*.48;cv=-.65+row*.65
                vs=[p((cx+x*.225,cv+y*.30,.023+z*.013)) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
                m.add(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],8)
                for dx in [-.11,.11]:
                    # Thin printed conductors lie on the glass skin; a planar
                    # strip avoids wasting bevel geometry on sub-centimetre ink.
                    m.add([p((cx+dx-.0045,cv-.26,.0361)),p((cx+dx+.0045,cv-.26,.0361)),
                           p((cx+dx+.0045,cv+.26,.0361)),p((cx+dx-.0045,cv+.26,.0361))],[(0,1,2,3)],4)
        if damaged:m.beam(p((.92,0,-.01)),p((1.65,.64,-.32)),.045,.055,7)
        if fallen:
            low=min(v.z for v in m.v[start:])
            for v in m.v[start:]:v.z-=low
        else:
            for x in [-1.05,1.05]:
                top=p((x,0,-.10));base=(top[0],.065,top[2])
                m.box(base,(.35,.13,.38),0)
                m.beam((top[0],.08,top[2]),top,.085,.11,7)
                # Diagonal ends in the same fixed footing and in a back batten.
                m.beam((top[0],.12,top[2]),p((x,.65,-.08)),.045,.05,0)
    for row in range(3):
        for col in range(4):
            if (col,row) in [(3,2),(0,0)]:continue
            fallen=(col,row)==(0,2)
            panel((-5.3+col*3.35,-3.5+row*3,1.45 if not fallen else .35),.35 if not fallen else -.14,(col+row)%3==1,fallen)
    panel((-5.8,-4.6,.21),-.08,True,True)
    m.tube((4.8,1,-4.65),(7.2,1,-4.65),.78,2,32)
    for x in [5.2,6.8]:
        for z in [-4.1,-5.2]:
            m.box((x,.075,z),(.30,.15,.30),0);m.beam((x,.075,z),(x,.75,z),.16,.16,7)
        m.box((x,.71,-4.65),(.20,.16,1.22),0)
    m.tube((4.2,.05,-4.65),(4.2,1.15,-4.65),.36,7,24)
    m.tube((4.2,1.15,-4.65),(4.8,1.15,-4.65),.10,0,16)
    m.cable([(4.2,.30,-4.65),(2.7,.30,-4.65),(2.7,.30,-3)],.10,7)
    m.box((6,.54,-5.72),(1.1,1.08,.52),2)
    m.box((6,.075,-5.72),(1.23,.15,.65),0)
    m.box((6,.62,-5.44),(.76,.5,.025),5)
    for i in range(4):m.box((5.73+i*.18,.60,-5.42),(.05,.32,.02),7)

def repair(m,extra=None):
    k=m.name.removeprefix('wasteland-')
    if extra and k in ['cooling-tower','tunnel']:
        bm,groups=components(extra.data)
        dead=[]
        for vs,fs,lo,hi in groups:
            size=[b-a for a,b in zip(lo,hi)];mats={f.material_index for f in fs}
            # Only individual low, small, concrete fragments move. Foundation,
            # shell and road slabs retain their authored fracture geometry.
            if mats=={3} and .005<lo[1]<.20 and hi[1]<.62 and max(size[0],size[2])<2.1:
                for v in vs:v.co.z-=lo[1]
            if k=='tunnel':
                if mats=={0} and lo[1]>5 and max(size)<1.0:dead.extend(vs)
                if lo[0]>-.15 and hi[0]<.15 and .13<lo[1]<.24 and size[1]<.04 and 1<size[2]<1.3:dead.extend(vs)
        if dead:bmesh.ops.delete(bm,geom=list(set(dead)),context='VERTS')
        bm.to_mesh(extra.data);bm.free()
    if k=='diner':
        for x in [-4.65,-3.1,-1.55,0,1.55]:
            for z in [-1.65,1.70]:m.box((x,.755,z),(.20,.36,.47),0)
        for x in [1.55,4.05]:m.box((x,.91,.45),(.18,.70,.79),0)
        for x in [-4.8,-3.2,-1.6,0,1.6,3.2]:m.beam((x,2.93,-2.68),(x,2.99,-3.23),.09,.09,0)
        for z in [-2.62,2.62]:
            m.box((5,1.45,z),(.15,.20,.20),0)
            m.beam((5,2.68,z),(4.8,2.86,z),.085,.085,0)
        m.box((-4.90,.365,3.10),(.50,.22,.50),3)
    elif k=='greenhouse':
        for x in [-.80,.80]:
            for z in [-2.55,2.55]:m.box((x,.30,z),(.20,.16,.25),0)
    elif k=='passenger-coach':
        # Coordinates precede this mesh's final whole-model ground correction.
        for x in [-4.50,-3.20,-1.90,-.60,.70,2.0]:
            for z in [-.99,.99]:m.box((x,1.46,z),(.18,.42,.52),0)
        m.box((5.9,1.32,0),(.17,.18,3.13),0)
        for x in [-5.7,5.7]:m.beam((x,.88,1.80),(x,1.10,1.52),.075,.09,0)
        m.beam((4.0,3.35,1.62),(4.2,3.42,1.62),.085,.085,0)
    elif k=='service-station':
        for x in [-5.7,-3.7,-1.6,.6,2.7]:m.box((x,4.43,-3.81),(.14,.15,.40),0)
    elif k=='tunnel':
        # Each new bar begins within a real slab edge and bends into its gap.
        for z,edges in [(2.45,[(9.8,10.7),(13.2,12.35)]),(2.65,[(9.8,10.7),(13.2,12.35)]),
                        (2.85,[(9.8,10.7),(13.2,12.35)]),(-3.52,[(13.8,14.65),(17.2,16.35)]),
                        (-3.72,[(13.8,14.65),(17.2,16.35)]),(-3.93,[(13.8,14.65),(17.2,16.35)])]:
            for a,b in edges:
                a*=math.pi/28;b*=math.pi/28;r=6.75
                m.cable([(r*math.cos(a),1.04+r*math.sin(a),z),
                         (r*math.cos(b),1.04+r*math.sin(b)+.08,z+.05)],.026,7)
    elif k=='freight-bogie':
        for x in [-1.13,1.13]:
            for z in [-.67,.67]:m.beam((x,.38,z),(x,.95,.99 if z>0 else -.99),.075,.075,0)

def repair_final(ob):
    if ob.name not in ['wasteland-cooling-tower','wasteland-tunnel']:return
    bm,groups=components(ob.data)
    for vs,fs,lo,hi in groups:
        size=[b-a for a,b in zip(lo,hi)]
        names={ob.data.materials[f.material_index].name for f in fs}
        if all('Lime aggregate concrete' in n for n in names) and .001<lo[1]<.22 and hi[1]<.65 and max(size[0],size[2])<2.1:
            for v in vs:v.co.z-=lo[1]
    bm.to_mesh(ob.data);bm.free()
