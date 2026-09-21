"""Resolve expansion seams and rebuild believable maintenance access in Blender."""
import math
import bpy
from mathutils import Vector


def refine_services(scene, root, profile, kit, game, source):
    sx, sz, sy = profile['scale']
    def mat(part): return next(m for m in bpy.data.materials if part.lower() in m.name.lower())
    steel, bare, brass = mat('Charcoal_Steel'), mat('Aged_BareMetal'), mat('Worn_HandrailBrass')
    rubber, amber = mat('rubber'), mat('Amber')
    module = kit.group('Refined_Service_Access', parent=root); module['module'] = True
    def box(name, at, size, material=steel, bevel=.012):
        return kit.box(name, source(at), (size[0]/sx,size[2]/sy,size[1]/sz),material,module,bevel=bevel)
    def rod(name,a,b,r=.032,material=brass):
        return kit.cylinder(name,source(a),source(b),r,material,module,n=16)
    def tube(name,points,r=.025,material=rubber):
        return kit.tube(name,[source(p) for p in points],r,material,module)
    def bounds(obj):
        pts=[game(obj.matrix_world@Vector(v)) for v in obj.bound_box]
        return Vector([min(p[i] for p in pts) for i in range(3)]),Vector([max(p[i] for p in pts) for i in range(3)])
    def pad(name,x,y,z,size=.22):
        box(name+' mounting plate',(x,y+.018,z),(size,.036,size),bare)
        for dx in [-.35,.35]:
            for dz in [-.35,.35]:
                rod(name+' anchor stud',(x+dx*size,y+.037,z+dz*size),(x+dx*size,y+.065,z+dz*size),.022,bare)

    # Remove the old unbracketed ladders, unsupported crown rails and detached stays.
    ladders=[o for o in scene.objects if o.type=='EMPTY' and o.name.startswith(('Bridge access ladder','Furnace service ladder'))]
    old=[]
    for o in ladders: old.extend(o.children_recursive);old.append(o)
    prefixes=('Service crown railing','Crown handrail post','Awning mast','Canopy tension line',
              'Tensioned antenna stay','Aerial power span','Microwave reflector mounting bracket',
              'Command tower segmented riser','Antenna cable clamp')
    old.extend(o for o in scene.objects if o.name.startswith(prefixes))
    names=list(dict.fromkeys(o.name for o in old))
    for name in names:
        o=bpy.data.objects.get(name)
        if o: bpy.data.objects.remove(o,do_unlink=True)
    scene.view_layers[0].update()

    ladder_report=[]
    def ladder(name,x,z,bottom,top,wall_x,direction,top_mount=None):
        # Rungs run along Z, so the complete ladder stands clear of the wall.
        half=.34
        for side in [-1,1]:
            zz=z+side*half
            rod(name+' upright',(x,bottom+.05,zz),(x,top+.88,zz),.043)
            tube(name+' overrun handhold',[(x,top+.88,zz),(x+direction*.20,top+.96,zz),(x+direction*.42,top+.88,zz),(x+direction*.42,top+.08,zz)],.042,brass)
            pad(name,x,bottom,zz,.18)
            for y in [bottom+.5,(bottom+top)/2,top-.32 if top_mount is None else top_mount]:
                rod(name+' stand-off bracket',(x,y,zz),(wall_x,y,zz),.045,bare)
                box(name+' wall fixing',(wall_x,y,zz),(.045,.19,.17),bare)
        for i in range(math.floor((top-bottom)/.28)):
            y=bottom+.2+i*.28
            rod(name+' serrated rung',(x,y,z-half),(x,y,z+half),.032,bare)
        box(name+' amber foot marker',(x-direction*.07,bottom+.012,z),(.08,.015,.57),amber,.003)
        ladder_report.append({'name':name,'x':x,'z':z,'bottom':bottom,'landing':top,'wallX':wall_x,'clearance':abs(x-wall_x)})

    roof=scene.objects['Command cabin roof'];lo,hi=bounds(roof)
    body_lo,_=bounds(scene.objects['Command house lower structure'])
    ladder_x=lo.x-.36;ladder_z=-6.24;deck=profile['deckSurface']
    ladder('Bridge maintenance ladder',ladder_x,ladder_z,deck,hi.y,body_lo.x,1,hi.y-.1)
    box('Bridge ladder transfer sill',((ladder_x+lo.x+.13)/2,hi.y-.035,ladder_z),(lo.x+.13-ladder_x,.07,.75),bare)

    for furnace_name in ['Furnace_A','Furnace_B']:
        furnace=scene.objects[furnace_name]
        center=game(furnace.matrix_world.translation)
        shell=next(o for o in furnace.children if o.name.startswith('Riveted stack shell'))
        slo,shi=bounds(shell)
        landing=shi.y-1.62
        inner,outer=1.26,1.82
        verts=[];faces=[];segments=64
        for i in range(segments):
            a=i*math.tau/segments;b=(i+1)*math.tau/segments
            # Every second tread is slightly recessed: a readable service ring.
            y=landing-(.008 if i%2 else 0)
            start=len(verts)
            for radius,angle in [(inner,a),(outer,a),(outer,b),(inner,b)]:
                verts.append(source((center.x+radius*math.cos(angle),y,center.z+radius*math.sin(angle))))
            faces.append((start,start+1,start+2,start+3))
        platform=kit.mesh(furnace_name+' grated maintenance ring',verts,faces,bare,module)
        solid=platform.modifiers.new('Service tread thickness','SOLIDIFY');solid.thickness=.045
        # A proper gap admits the ladder rather than putting a rail across it.
        for h in [.45,.94]:
            points=[(center.x+outer*math.cos(a),landing+h,center.z+outer*math.sin(a)) for a in [math.radians(15)+i*math.radians(330)/64 for i in range(65)]]
            tube(furnace_name+' service ring guard',points,.032,brass)
        for i in range(1,12):
            a=i*math.tau/12
            at=(center.x+outer*math.cos(a),landing,center.z+outer*math.sin(a))
            rod(furnace_name+' ring stanchion',at,(at[0],landing+.94,at[2]))
            if i%2==0:
                rod(furnace_name+' service ring bracket',(center.x+1.0*math.cos(a),landing-.72,center.z+1.0*math.sin(a)),at,.07,bare)
        ladder(furnace_name+' maintenance ladder',center.x+outer+.03,center.z,deck,landing,center.x+1.01,-1)
        return_x,return_z=center.x-1.5,center.z-.8
        rod(furnace_name+' return pipe deck coupling',(return_x,deck,return_z),(return_x,deck+.35,return_z),.12,brass)
        pad(furnace_name+' return pipe',return_x,deck,return_z,.32)

    # Sealed roof penetrations and concentric collars replace offset loose rings.
    cabin=game(scene.objects['CommandHouse_and_Navigation'].matrix_world.translation)
    for x,z in [(cabin.x+1.5,cabin.z+.56),(cabin.x,cabin.z+.08)]:
        top=hi.y+3.6
        rod('Bridge sealed aerial riser',(x,hi.y,z),(x,top,z),.073,bare)
        pad('Bridge riser',x,hi.y,z,.28)
        for i in range(6):
            y=hi.y+.2+i*.55
            rod('Bridge riser fitted collar',(x,y-.028,z),(x,y+.028,z),.097,brass)
        rod('Bridge riser weather cap',(x,top-.04,z),(x,top+.035,z),.10,bare)

    # Support the awning at its actual deformed corners, with clevises and feet.
    canopy=scene.objects['Sagging weather canopy']
    for i in [0,24,600,624]:
        p=game(canopy.matrix_world@canopy.data.vertices[i].co)
        foot=(p.x,deck,p.z);head=(p.x,p.y+.28,p.z)
        rod('Awning anchored post',foot,head,.066,bare);pad('Awning',p.x,deck,p.z,.3)
        rod('Awning corner clevis',(p.x,p.y-.035,p.z),(p.x,p.y+.05,p.z),.092,brass)
        tube('Awning corner lashing',[(p.x-.08,p.y,p.z),(p.x-.08,p.y+.17,p.z),(p.x+.08,p.y+.17,p.z),(p.x+.08,p.y,p.z)],.015,rubber)

    # Attached dish brackets terminate on the nearest mast, not in midair.
    masts=[o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('Lattice mast')]
    for dish in [o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('Microwave aerial dish')]:
        p=game(dish.matrix_world.translation)
        mast=min(masts,key=lambda o:(game(o.matrix_world.translation)-p).length_squared)
        m=game(mast.matrix_world.translation)
        rod('Dish triangulated mount',(m.x,p.y-.18,m.z),p,.048,bare)
        rod('Dish diagonal mount',(m.x,p.y-.65,m.z),p,.032,bare)
    for mast in masts:
        p=game(mast.matrix_world.translation)
        if p.y<deck+.5:
            # Fill any old reference-space gap at the feet with a welded plinth.
            box('Radio mast foundation',(p.x,(p.y+deck)/2,p.z),(.8,max(.08,p.y-deck),.8),steel)
            pad('Radio mast',p.x,deck,p.z,.9)
        tips=[bounds(o)[1].y for o in mast.children_recursive if o.type=='MESH']
        head=(p.x,max(tips)-1.2,p.z)
        for side in [-1,1]:
            x,z=p.x+side*.95,p.z+.85
            floor=hi.y if body_lo.x<x<hi.x and lo.z<z<hi.z else deck
            tube('Anchored mast guy',[head,(x,floor+.07,z)],.012,bare)
            pad('Mast guy',x,floor,z,.15)

    # Underslung gearboxes visibly attach to the chassis instead of hanging free.
    for obj in [o for o in scene.objects if o.name.startswith('Suspended undercarriage reduction gearbox')]:
        a,b=bounds(obj)
        for x in [a.x+.18,b.x-.18]:
            for z in [a.z+.18,b.z-.18]:
                rod('Gearbox chassis hanger',(x,b.y-.02,z),(x,8.66,z),.085,bare)
                box('Gearbox hanger saddle',(x,8.60,z),(.3,.12,.28),steel)

    scene.view_layers[0].update()
    print('REFINED_SERVICE_ACCESS',{'removed':len(names),'ladders':ladder_report},flush=True)
    return ladder_report
