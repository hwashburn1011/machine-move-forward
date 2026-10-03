"""Twenty-five original aged advertising landmarks. Blender5.1, metres, Z up.

Run posters.py first, then blender --background --threads4 --python this-file.
Editable master retains individual beams, panels, fixtures and fasteners.
Runtime export batches each complete assembly into one identity mesh root.
"""
import bpy, bmesh, math, json, sys, random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/art200/signs'
(OUT/'renders').mkdir(parents=True,exist_ok=True)
P=json.loads((ROOT/'assets/art200/palette.json').read_text());DESIGNS=json.loads((OUT/'designs.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
S=bpy.context.scene;S.unit_settings.system='METRIC';parts=[];root=None;roots=[]
def linear(h):
    c=[int(h[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
def mat(name,color,metal=.0,rough=.78):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value=(*linear(color),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
STEEL=mat('A200 signs / oxidized structural steel','#404749',.7,.69)
RUST=mat('A200 signs / exposed iron oxide','#765442',.12,.90)
CONCRETE=mat('A200 signs / aged concrete','#898273',0,.95)
ALLOY=mat('A200 signs / dull zinc fasteners','#898C84',.8,.64)
DARK=mat('A200 signs / disconnected lamp glass','#272B2B',.1,.57)
PAINT={p['id']:mat('A200 signs / '+p['name'],p['paint'],.28,.77) for p in P['families']}
def finish(o,name,m,bevel=0):
    o.name=name;o.parent=root;o.data.materials.append(m);parts.append(o)
    if bevel:
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=2 if bevel>=.015 else 1,affect='EDGES')
        bm.to_mesh(o.data);bm.free()
    for p in o.data.polygons:p.use_smooth=True
    n=o.modifiers.new('Manufactured face normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=45
    return o
def mesh(n,verts,faces):
    me=bpy.data.meshes.new(n);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(n,me);S.collection.objects.link(o);return o
def box(n,p,d,m=STEEL,bevel=.022):
    vs=[(p[0]+x*d[0]/2,p[1]+y*d[1]/2,p[2]+z*d[2]/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    o=mesh(n,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    return finish(o,n,m,min(bevel,min(d)*.22))
def rod(n,a,b,r=.07,m=STEEL,vertices=12):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
    if u.length<.01:u=axis.cross(Vector((0,1,0)))
    u.normalize();v=axis.cross(u);vs=[p+r*(math.cos(k*math.tau/vertices)*u+math.sin(k*math.tau/vertices)*v) for p in [a,b] for k in range(vertices)]
    fs=[tuple(range(vertices-1,-1,-1)),tuple(range(vertices,2*vertices))]+[(k,(k+1)%vertices,(k+1)%vertices+vertices,k+vertices) for k in range(vertices)]
    o=mesh(n,vs,fs)
    return finish(o,n,m,min(.008,r*.15) if r>=.10 else 0)
def beam(n,a,b,w=.16,m=STEEL):
    a,b=Vector(a),Vector(b);d=b-a;basis=d.to_track_quat('Z','Y').to_matrix();c=(a+b)*.5
    assert d.length>1e-6,(n,'A beam needs two distinct attachment points')
    vs=[c+basis@Vector((x*w/2,y*w/2,z*d.length/2)) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    o=mesh(n,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    return finish(o,n,m,min(.02,w*.13))
def hoop(n,c,r,t=.07,m=STEEL,axis='y'):
    vs=[]
    for i in range(48):
        a=i*math.tau/48
        for j in range(6):
            b=j*math.tau/6;xx=(r+t*math.cos(b))*math.cos(a);yy=(r+t*math.cos(b))*math.sin(a);zz=t*math.sin(b)
            vs.append((c[0]+xx,c[1]+(zz if axis=='y' else yy),c[2]+(yy if axis=='y' else zz)))
    fs=[(i*6+j,((i+1)%48)*6+j,((i+1)%48)*6+(j+1)%6,i*6+(j+1)%6) for i in range(48) for j in range(6)]
    return finish(mesh(n,vs,fs),n,m)
def foot(x,y,width=1.2):
    box('Cast footing',(x,y,.18),(width,width,.36),CONCRETE,.045)
    box('Bolted sole plate',(x,y,.385),(width*.60,width*.60,.05),RUST,.01)
    for dx in [-.20,.20]:
        for dy in [-.20,.20]:rod('Foot anchor nut',(x+dx,y+dy,.407),(x+dx,y+dy,.462),.032,ALLOY,6)
def post(x,y,top,r=.17):
    foot(x,y);rod('Load bearing tubular stanchion',(x,y,.405),(x,y,top),r)
    for z in [1.1,top*.47,top*.84]:hoop('Welded post collar',(x,y,z),r+.012,.016,RUST,'z')
def lattice(x,top,spread=1.25):
    box('Continuous tower foundation',(x,1.15,.2),(spread+.85,1.7,.4),CONCRETE,.045)
    for xx in [-spread/2,spread/2]:
        for yy in [.75,1.55]:
            box('Tower leg baseplate',(x+xx,yy,.43),(.40,.40,.06),RUST,.01)
            rod('Lattice tower upright',(x+xx,yy,.46),(x+xx,yy,top),.10)
            for dx in [-.13,.13]:
                for dy in [-.13,.13]:rod('Baseplate captive nut',(x+xx+dx,yy+dy,.46),(x+xx+dx,yy+dy,.505),.025,ALLOY,6)
    for z in range(1,int(top),2):
        for yy in [.75,1.55]:
            beam('Cross braced tower bay',(x-spread/2,yy,z),(x+spread/2,yy,min(z+2,top)),.065,RUST)
            beam('Cross braced tower bay',(x+spread/2,yy,z),(x-spread/2,yy,min(z+2,top)),.065)
        for xx in [-spread/2,spread/2]:beam('Tower wind-load side bracing',(x+xx,.75,z),(x+xx,1.55,min(z+2,top)),.060)
def panel_texture(spec):
    m=mat('A200 original faded ad / '+spec['brand'],'#FFFFFF',.12,.86)
    p=m.node_tree.nodes['Principled BSDF'];t=m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image=bpy.data.images.load(str(ROOT/spec['texture']));t.image.pack();m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    return m
def panels(spec,centerz,poster):
    w,h=spec['width'],spec['panel_height'];cols=6 if w>9 else 4;rows=3 if h>8 else 2
    # Sheet-by-sheet weather loss reveals real rear bracing, not a black decal.
    corner=DESIGNS.index(spec)%4
    missing={[(0,rows-1),(cols-1,rows-1),(0,0),(cols-1,0)][corner]} if spec['form'] not in ['round-crown','record-medallion','hexagon'] else set()
    if spec['form'] in ['broken-cant','rail-sled']:missing.add((cols-1,0))
    if spec['form']=='broken-cant':missing.update([(0,0),(0,rows-1)])
    if spec['form']=='rail-sled':missing.add((cols-2,0))
    for col in range(cols):
        for row in range(rows):
            if (col,row) in missing:continue
            x0=-w/2+col*w/cols+.015;x1=-w/2+(col+1)*w/cols-.015
            z0=centerz-h/2+row*h/rows+.014;z1=centerz-h/2+(row+1)*h/rows-.014
            # Slight corner bites are part of the cut sheet outline.
            bite=[.035,.07,.12,.22,.31][(col*3+row+DESIGNS.index(spec))%5]
            coords=[(x0,z0),(x1-bite,z0),(x1,z0+bite),(x1,z1),(x0+.035,z1),(x0,z1-.06)]
            curled=(col+row+DESIGNS.index(spec))%5==0
            vs=[(x,y-(.09 if curled and j==2 else 0),z) for y in [-.14,-.07] for j,(x,z) in enumerate(coords)];n=len(coords)
            faces=[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(j,j+n,(j+1)%n+n,(j+1)%n) for j in range(n)]
            me=bpy.data.meshes.new('Weathered metal sheet');me.from_pydata(vs,[],faces);me.materials.append(poster);me.materials.append(RUST);me.materials.append(STEEL)
            uv=me.uv_layers.new(name='Original printed artwork')
            for f in me.polygons:
                f.material_index=0 if f.index==0 else (2 if f.index==1 else 1)
                for li in f.loop_indices:
                    vx,vy,vz=me.vertices[me.loops[li].vertex_index].co
                    uv.data[li].uv=((vx+w/2)/w,(vz-centerz+h/2)/h)
            ob=bpy.data.objects.new('Corroded printed panel '+str(col)+'-'+str(row),me);S.collection.objects.link(ob);ob.parent=root;parts.append(ob)
            # Lower right hardware stays inside the actual corroded outline.
            # Sleeves transfer sheet load through the60mm stand-off to rails.
            for x,z in [(x0+.045,z0+.045),(x1-bite-.035,z0+.045),(x0+.045,z1-.045),(x1-.045,z1-.045)]:
                rod('Panel stand-off sleeve',(x,-.078,z),(x,.11,z),.036,STEEL,8)
                rod('Panel captive fixing',(x,-.172,z),(x,.13,z),.025,ALLOY,8)
    for x in [-w/2,w/2]:box('Rusty folded edge channel',(x,.04,centerz),(.13,.22,h+.13),RUST)
    for row in range(rows+1):
        z=centerz-h/2+row*h/rows
        box('Continuous rear rail',(0,.10,z),(w+.2,.22,.13),STEEL)
    for x in [-w/2,-w/4,0,w/4,w/2]:box('Panel rear upright',(x,.13,centerz),(.12,.25,h),STEEL)
    beam('Visible back diagonal',(-w/2,.31,centerz-h/2),(w/2,.31,centerz+h/2),.10,RUST)
    beam('Visible back diagonal',(w/2,.31,centerz-h/2),(-w/2,.31,centerz+h/2),.10)
    return len(missing)
def walkway(w,z):
    for y in [.52,1.30]:box('Service catwalk beam',(0,y,z),(w+.65,.10,.17),STEEL)
    for x in [(-w/2)+i*.36 for i in range(int(w/.36)+1)]:box('Open catwalk tread',(x,.9,z+.05),(.065,.9,.045),RUST,.006)
    for x in [-w/2,-w/4,0,w/4,w/2]:rod('Catwalk balustrade post',(x,1.33,z),(x,1.33,z+.90),.025)
    rod('Continuous rear handrail',(-w/2,1.33,z+.9),(w/2,1.33,z+.9),.032)
def ladder(x,z):
    for dx in [-.27,.27]:rod('Fixed maintenance ladder rail',(x+dx,1.17,.405),(x+dx,1.17,z+1),.032)
    for k in range(int((z+.5)/.38)):rod('Ladder rung',(x-.27,1.17,.58+k*.38),(x+.27,1.17,.58+k*.38),.024,RUST)
    for zz in [1.0,z*.5,z-.3]:
        for dx in [-.27,.27]:rod('Ladder stand-off',(x+dx,.75,zz),(x+dx,1.17,zz),.029)
def lamp(x,z):
    beam('Disconnected floodlight outrigger',(x,.1,z),(x,-.9,z+.1),.06,RUST)
    box('Floodlight enamel housing',(x,-.9,z+.03),(.46,.29,.22),STEEL)
    box('Dead recessed lens',(x,-.99,z-.085),(.36,.19,.018),DARK,.015)
def bounds(objects):
    pts=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
    return Vector([min(p[k] for p in pts) for k in range(3)]),Vector([max(p[k] for p in pts) for k in range(3)])

records=[]
for idx,spec in enumerate(DESIGNS):
    parts=[];root=bpy.data.objects.new(spec['id'],None);S.collection.objects.link(root);roots.append(root)
    root['complete_assembly']=True;root['palette_family']=spec['palette_family'];root['original_fictional_brand']=spec['brand']
    w,h,top=spec['width'],spec['panel_height'],spec['top'];cz=top-h/2;bottom=top-h
    paint=PAINT[spec['palette_family']];form=spec['form']
    # Unique, mechanically coherent structure for each of the25 assemblies.
    if form in ['twin-truss','arched-grain','cinema-crown','portico','portal-gantry','inclined-girders']:
        for x in [-w*.34,w*.34]:lattice(x,top-.05,1.0)
        if form=='inclined-girders':
            for x in [-w*.34,w*.34]:foot(x*.72,3);beam('Raking rear prop',(x*.72,3,.42),(x,.75,bottom+.5),.32,RUST)
        if form in ['arched-grain','cinema-crown']:
            for i in range(8):
                x0=-w/2+i*w/8;x1=x0+w/8;z0=top+math.sin(i/8*math.pi)*1.9;z1=top+math.sin((i+1)/8*math.pi)*1.9
                beam('Segmented architectural crest',(x0,.05,z0),(x1,.05,z1),.18,paint)
                if abs(z0-top)>1e-5:beam('Crest web',(x0,.05,top),(x0,.05,z0),.075)
        if form=='portico':box('Painted bridge lintel',(0,.3,top+.28),(w+1.0,.5,.55),paint)
        if form=='portal-gantry':
            for z in [bottom-.7,bottom-1.25]:box('Deep highway truss chord',(0,.65,z),(w+2,.20,.17),RUST)
            for x in range(-int(w/2),int(w/2)):beam('Triangulated highway truss',(x,.65,bottom-1.25),(x+.7,.65,bottom-.7),.06)
        if form=='cinema-crown':
            for x in [-w*.58,w*.58]:
                box('Theatre vertical blade',(x,.3,cz),(.5,.45,h+2),paint)
                for z in [bottom+.3,top-.3]:
                    beam('Theatre blade welded tie',(math.copysign(w*.49,x),.13,z),(x,.3,z),.14,STEEL)
    elif form in ['stepped-pylon','deco-fin','radio-lattice','hanging-blade']:
        lattice(0,top+1.3,2)
        for z in [bottom,cz,top]:beam('Pylon panel offset',(0,.75,z),(0,.1,z),.25)
        if form=='stepped-pylon':
            for i in range(3):box('Stepped lodge crown',(0,.2,top+.20+i*.36),(w-1-i*1.4,.4,.34),paint)
        elif form=='deco-fin':
            for x in [-w/2-.30,w/2+.30]:box('Cast deco blade',(x,.4,cz+.65),(.36,.60,h+2.1),paint)
        elif form=='radio-lattice':
            rod('Dead receiver mast',(0,.75,top+1.1),(0,.75,top+3.8),.05)
            for z in [top+2,top+2.7,top+3.4]:rod('Receiver aerial',(-1.7,.75,z),(1.7,.75,z),.025,ALLOY)
        else:
            for x in [-w/2,w/2]:rod('Visible suspension clevis',(x,.1,top),(x,.1,top+1),.045,RUST)
            box('Overhead hanging beam',(0,.1,top+1),(w+1,.4,.25),paint)
            beam('Cantilever top connection',(0,.75,top+1),(0,.1,top+1),.26)
    elif form in ['round-crown','tyre-ring','record-medallion','hexagon','shield-tripod']:
        # The central square advertisement is retained within a large silhouette.
        for x,y in [(-1.4,.75),(1.4,.75),(0,3.0)]:
            foot(x,y);beam('Splayed triangulated sign pier',(x,y,.42),(0,.75,bottom+.25),.24)
        box('Sign upright',(0,.75,cz),(1.6,.6,h+.4),STEEL)
        radius=math.hypot(w/2,h/2)+.20
        if form=='hexagon':
            for k in range(6):
                a=2*math.pi*k/6;b=2*math.pi*(k+1)/6
                beam('Hexagonal advertisement surround',(radius*math.cos(a),.1,cz+radius*math.sin(a)),(radius*math.cos(b),.1,cz+radius*math.sin(b)),.24,paint)
                beam('Hexagon radial back stay',(0,.75,cz),(radius*math.cos(a),.1,cz+radius*math.sin(a)),.08)
        elif form=='shield-tripod':
            points=[(-w*.62,top+.6),(w*.62,top+.6),(w*.58,bottom+1),(0,bottom-1.3),(-w*.58,bottom+1)]
            for a,b in zip(points,points[1:]+points[:1]):beam('Folded shield rim',(a[0],.1,a[1]),(b[0],.1,b[1]),.23,paint)
            for p in points:beam('Shield perimeter back stay',(0,.75,cz),(p[0],.1,p[1]),.08)
        else:
            for rr in ([radius,radius+.30,radius+.55] if form=='tyre-ring' else [radius,radius+.18]):hoop('Weathered medallion perimeter',(0,.12,cz),rr,.12 if form=='tyre-ring' else .065,paint)
            for k in range(8):
                a=k*math.pi/4;beam('Perimeter rear support',(0,.75,cz),(radius*math.cos(a),.12,cz+radius*math.sin(a)),.075)
    elif form=='tank-sign':
        for x in [-2.2,2.2]:
            for y in [.8,3.7]:post(x,y,bottom+1,.13)
        rod('Water advertising cistern',(-3,2.2,bottom+1),(3,2.2,bottom+1),1.6,paint,32)
        for x in [-2.5,2.5]:
            for y in [.8,3.7]:beam('Tank sign corner bracket',(x,y,bottom),(x,.10,cz),.12)
    elif form=='rail-sled':
        for x in [-4,4]:
            for y in [-.2,1.8]:
                rod('Parked rail wheel',(x,y-.16,.59),(x,y+.16,.59),.56,RUST,24)
                rod('Wheel hub',(x,y-.20,.59),(x,y+.20,.59),.18,STEEL,16)
        for y in [-.2,1.8]:box('Freight sign underframe',(0,y,1.2),(w+.3,.24,.30),STEEL)
        for x in [-3.5,3.5]:
            box('Advertising car transverse crossmember',(x,.8,1.2),(.28,2.28,.30),STEEL)
            box('Advertising car upright',(x,.75,(bottom+1.2)*.5),(.22,.22,bottom-1.2),STEEL)
            beam('Wagon sign knee brace',(x,.75,2.1),(x*.6,.75,bottom+.1),.12)
        # Cast sleepers beneath the flanged wheel pair are an explicit support.
        for x in [-4,4]:box('Buried concrete rail sleeper',(x,.8,.11),(1.05,3.2,.22),CONCRETE)
    elif form in ['cantilever','broken-cant','offset-canopy']:
        x=-w*.33;lattice(x,top,.95)
        for z in [bottom,top]:beam('Long offset billboard cantilever',(x,.75,z),(w/2,.75,z),.28)
        beam('Cantilever knee compression member',(x,.75,bottom-2),(w*.3,.75,bottom),.21,RUST)
        if form=='broken-cant':
            rod('Snapped parallel support', (w*.30,.75,.42),(w*.30,.75,3.2),.18,RUST);foot(w*.30,.75)
            beam('Remaining brace anchors fractured pier',(w*.30,.75,3.0),(x,.75,bottom-1.4),.19)
        if form=='offset-canopy':box('Sweeping clinic rain cap',(0,-.17,top+.17),(w+.8,1.7,.20),paint)
    elif form in ['v-frame','winged','swept-roof','suspended','stacked-discs']:
        for x in [-w*.29,w*.29]:
            post(x,.75,top+.3,.15);foot(x,2.9);beam('Rear raking buttress',(x,2.9,.42),(x,.75,bottom+.2),.17,RUST)
        if form=='v-frame':
            for x in [-w*.50,w*.50]:beam('Diagonal splayed header',(0,.2,top+.05),(x,.2,top+1.8),.30,paint)
        elif form in ['winged','swept-roof']:
            for side in [-1,1]:beam('Outswept enamel wing',(0,.1,top+.1),(side*(w*.6),.1,top+1.2),.36,paint)
        elif form=='suspended':
            box('Suspension header',(0,.75,top+.65),(w+.3,.4,.32),paint)
            for x in [-w*.32,w*.32]:rod('Forged hanger chain',(x,.1,top-.05),(x,.75,top+.65),.055,RUST)
        else:
            for z in [bottom+h*.25,bottom+h*.75]:hoop('Laundry medallion side silhouette',(0,.15,z),w*.66,.14,paint)
    else:raise ValueError(form)
    # All facades are connected to their structural piers at both rail levels.
    for x in [-w*.30,w*.30]:
        for z in [bottom,top-.1]:beam('Facade stand-off bracket',(x,.1,z),(x,.75,z),.13,STEEL)
    missing=panels(spec,cz,panel_texture(spec));walkway(w,bottom-.20)
    ladder_x=-w*.34 if form not in ['cantilever','broken-cant','offset-canopy'] else -w*.33
    ladder(ladder_x,bottom-.15)
    # Ladder feet meet their own low cast pads; standoffs meet rear steel rails.
    foot(ladder_x,1.17,1.05)
    box('Backing spine sole plate',(ladder_x,.75,.385),(.20,.20,.05),RUST,.008)
    rod('Ladder anchored backing spine',(ladder_x,.75,.405),(ladder_x,.75,bottom+.85),.065)
    for x in [-w*.30,w*.30]:lamp(x,bottom-.08)
    box('Isolated service switch box',(-w*.34,.94,1.75),(.38,.32,.55),paint)
    rod('Severed power conduit',(-w*.34,1.10,.405),(-w*.34,1.10,1.48),.025,RUST)
    bpy.context.view_layer.update();lo,hi=bounds(parts)
    for o in parts:o.location.z-=lo.z
    bpy.context.view_layer.update();lo,hi=bounds(parts)
    rec=dict(spec);rec.update(source='assets/art200/signs/Art200_Advertising-editable.blend',dimensions_m=[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y],
        bounds_godot={'min':[lo.x,lo.z,-hi.y],'max':[hi.x,hi.z,-lo.y]},missing_panels=missing,
        features='Original '+spec['brand']+' graphics; '+form.replace('-',' ')+' structure, true corroded panel loss, exposed rear bracing, supported service catwalk, bolted feet, maintenance ladder and disconnected floodlights.',
        source_parts=len(parts),runtime='Seeded native desert advertising landmark; original fictional brand; no new interaction.')
    records.append(rec)
    root['assembly_id']=spec['id'];root['physical_units']='metres'
    print('BUILT',idx+1,spec['id'],flush=True)

# Preserve all component meshes before batching.
for i,r in enumerate(roots):r.location=(i%5*27,i//5*28,0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Art200_Advertising-editable.blend'))
for r in roots:r.location=(0,0,0)
models=[]
for rec,r in zip(records,roots):
    r.name=rec['id']+' editable root'
    bpy.ops.object.select_all(action='DESELECT');objects=[o for o in r.children_recursive if o.type=='MESH']
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();o=bpy.context.object
    o.parent=None;o.name=rec['id'];bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mod=o.modifiers.new('Portable triangles and tangent basis','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    used=sorted({f.material_index for f in o.data.polygons});mapping={old:i for i,old in enumerate(used)};mats=[o.data.materials[x] for x in used]
    indices=[mapping[f.material_index] for f in o.data.polygons];o.data.materials.clear()
    for m in mats:o.data.materials.append(m)
    for f,i in zip(o.data.polygons,indices):f.material_index=i
    uv=o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
    o.data.uv_layers.active=uv;uv.active_render=True
    uv_values=np.zeros(len(o.data.loops)*2,dtype=np.float32)
    for f in o.data.polygons:
        is_print=o.data.materials[f.material_index].name.startswith('A200 original faded ad /')
        if not is_print:continue
        for li in f.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            uv_values[li*2]=(v.x+rec['width']/2)/rec['width'];uv_values[li*2+1]=(v.z-rec['top']+rec['panel_height'])/rec['panel_height']
    uv.data.foreach_set('uv',uv_values)
    rec['triangles']=len(o.data.polygons);rec['materials']=len(mats);models.append(o);bpy.data.objects.remove(r,do_unlink=True)
    assert rec['triangles']<35000 and len(mats)<=8,(rec['id'],rec['triangles'],len(mats))
    print('BATCHED',rec['id'],rec['triangles'],flush=True)
bpy.ops.object.select_all(action='DESELECT')
for o in models:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art200-signs.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_tangents=True,export_materials='EXPORT')
(OUT/'manifest.json').write_text(json.dumps({'models':records,'count':25,'new':25,'refined':0,'palette_families':sorted({r['palette_family'] for r in records}),'triangles':sum(r['triangles'] for r in records)},indent=2)+'\n')
if '--skip-render' in sys.argv:
    print('ART200_SIGNS_EXPORTED',len(models),flush=True)
    sys.exit(0)

# Neutral daylight inspection renders preserve pigment differences.
root=None;parts=[]
S.render.engine='CYCLES';S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=1100;S.render.resolution_y=1300;S.render.resolution_percentage=100
if S.world is None:S.world=bpy.data.worlds.new('Art200 review neutral world')
S.render.image_settings.file_format='PNG';S.world.color=(.18,.18,.18);S.view_settings.view_transform='AgX'
S.world.use_nodes=True;S.world.node_tree.nodes['Background'].inputs[0].default_value=(.31,.33,.34,1);S.world.node_tree.nodes['Background'].inputs[1].default_value=.55
floor=box('Review ground',(0,0,-.06),(2000,2000,.1),mat('Review neutral ground','#777D7C',0,1),0);floor.parent=None
for name,loc,power,size in [('Key',(-15,-25,32),5500,18),('Fill',(21,-5,17),3000,15),('Rim',(2,17,29),5200,12)]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.name=name;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,9))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;S.camera=camera;camera.data.type='ORTHO';camera.data.lens=48
for o in models:o.hide_render=True
for idx,(o,rec) in enumerate(zip(models,records)):
    o.hide_render=False;bpy.context.view_layer.update();lo,hi=bounds([o]);center=(lo+hi)*.5
    camera.location=center+Vector((.55,-1.6,.48))*max(hi.z,hi.x-lo.x);camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=max((hi.z-lo.z)*1.20,(hi.x-lo.x)*1.47);S.render.filepath=str(OUT/'renders'/f'{idx+1:02d}-{rec["id"]}.png')
    bpy.ops.render.render(write_still=True);o.hide_render=True
    print('RENDERED',rec['id'],flush=True)
print('ART200_SIGNS_COMPLETE',len(models),sum(r['triangles'] for r in records),flush=True)
