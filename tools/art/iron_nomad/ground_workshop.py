"""Repair expanded framing and give the workshop complete, mounted assemblies.

Runs on the derived gameplay scene, never on the reference master. All new
measurements are game metres; feet, pipe collars and ceiling hangers terminate
on the same deck surfaces used by runtime collision.
"""
import math
import bpy
from mathutils import Vector, Matrix


def ground_workshop(scene, root, profile, kit, game, source):
    sx, sz, sy = profile['scale']
    floor = profile['deckSurface'] - 3.6
    ceiling = profile['deckSurface'] - .18
    def mat(part):
        return next(m for m in bpy.data.materials if part.lower() in m.name.lower())
    steel, bare, brass = mat('Charcoal_Steel'), mat('Aged_BareMetal'), mat('Worn_HandrailBrass')
    rubber, amber, cyan = mat('rubber'), mat('Amber'), mat('Cyan')
    module = kit.group('Grounded_Workshop_Assemblies', parent=root)
    module['module'] = True
    def box(name, at, size, material=steel, bevel=.012):
        return kit.box(name, source(at), (size[0]/sx, size[2]/sy, size[1]/sz), material, module, bevel=bevel)
    def rod(name, a, b, r=.035, material=bare):
        return kit.cylinder(name, source(a), source(b), r, material, module, n=20)
    def tube(name, points, r=.035, material=brass):
        return kit.tube(name, [source(p) for p in points], r, material, module)
    def bounds(obj):
        pts = [game(obj.matrix_world @ Vector(p)) for p in obj.bound_box]
        return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
    def erase(objects):
        names = {o.name for o in objects}
        for name in names:
            obj = bpy.data.objects.get(name)
            if obj: bpy.data.objects.remove(obj, do_unlink=True)
        return len(names)
    def foot(name, x, z, top, width=.22, depth=.22):
        box(name+' deck shoe', (x,floor+.025,z), (width,.05,depth), bare)
        if top > floor+.05:
            box(name+' mounted pedestal', (x,(top+floor+.05)/2,z), (width*.55,top-floor-.05,depth*.55))
        for dx in [-.34,.34]:
            for dz in [-.34,.34]:
                rod(name+' anchor bolt',(x+dx*width,floor+.05,z+dz*depth),(x+dx*width,floor+.073,z+dz*depth),.015,brass)

    scene.view_layers[0].update()
    # The old reference's outward braces reached beyond the new end girders
    # and above deck level. Replace their endpoint geometry, not just visibility.
    removed = erase([o for o in scene.objects if o.name.startswith('Triangular deck brace')])
    frame = kit.group('Fitted_Deck_Gussets', parent=root); frame['module'] = True
    braces = []
    for x in [-10.725,10.725]:
        for z in [-12.74,-7.67,-2.6,2.6,7.67,12.74]:
            for deck in [8.83,12.43,16.03]:
                for direction in [-1,1]:
                    end = z + direction*.86
                    if abs(end)>12.8: continue
                    a,b = (x,deck-1.05,z),(x,deck-.33,end)
                    kit.beam('Fitted inboard deck brace',source(a),source(b),.16,.19,steel,frame)
                    braces.append({'base':a,'end':b})
                    box('Brace welded receiver',(x,deck-.38,end),(.24,.17,.26),bare)

    # Replace disconnected schematic-looking boards, relays and pipe fragments.
    cabinets = [o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('Small utility cabinet')]
    dead = [o for c in cabinets for o in [c,*c.children_recursive]]
    prefixes = ('Cabinet control switch','Front bay suspended distribution board',
                'Distribution panel relay','Distribution armored conduit',
                'Front bay overhead copper manifold','Main steam transfer pipe','Pipe coupling flange')
    dead.extend(o for o in scene.objects if o.name.startswith(prefixes))
    removed += erase(dead)

    # Cabinets face into the aisle (+Z along the fore bay, -X along starboard).
    enclosures = []
    def cabinet(name, x, z, angle=0):
        members = set(scene.objects)
        box(name+' bolted plinth',(x,floor+.075,z),(.92,.15,.65),bare)
        box(name+' enclosure',(x,floor+.93,z),(.82,1.56,.54),steel,.035)
        box(name+' inset service door',(x,floor+1.0,z+.282),(.71,1.24,.035),bare)
        for yy in [.56,.86,1.16]:
            box(name+' relay bezel',(x,floor+yy,z+.312),(.57,.19,.035),steel)
            rod(name+' status lens',(x-.18,floor+yy,z+.334),(x-.18,floor+yy,z+.35),.023,amber)
            rod(name+' selector shaft',(x+.15,floor+yy,z+.334),(x+.15,floor+yy,z+.38),.03,rubber)
        box(name+' display gasket',(x,floor+1.49,z+.311),(.54,.16,.026),rubber)
        for yy in [1.465,1.505]:
            box(name+' display trace',(x-.07,floor+yy,z+.327),(.31,.01,.008),cyan,.001)
        for xx in [-.29,.29]:
            for yy in [.43,1.57]:
                rod(name+' door fastener',(x+xx,floor+yy,z+.305),(x+xx,floor+yy,z+.33),.017,brass)
        tube(name+' grab handle',[(x+.29,floor+.86,z+.31),(x+.29,floor+.86,z+.38),(x+.29,floor+1.10,z+.38),(x+.29,floor+1.10,z+.31)],.018,bare)
        for yy in [1.28,1.33,1.38]:
            box(name+' recessed vent',(x,floor+yy,z+.306),(.45,.014,.012),rubber,.002)
        tube(name+' deck conduit',[(x-.3,floor+.28,z-.15),(x-.3,floor+.13,z-.15),(x-.3,floor+.1,z-.38)],.035,rubber)
        box(name+' conduit deck gland',(x-.3,floor+.06,z-.38),(.13,.12,.13),brass)
        for xx in [-.34,.34]:
            for zz in [-.22,.22]:
                rod(name+' foundation bolt',(x+xx,floor+.15,z+zz),(x+xx,floor+.18,z+zz),.022,brass)
        # Rotate the complete assembly, including conduit/fasteners, as one.
        scene.view_layers[0].update()
        pivot=Vector(source((x,floor,z)))
        rotation=Matrix.Translation(pivot) @ Matrix.Rotation(angle,4,'Z') @ Matrix.Translation(-pivot)
        for obj in set(scene.objects)-members: obj.matrix_world=rotation @ obj.matrix_world
        enclosures.append({'name':name,'x':x,'z':z,'floor':floor,'facing':'aisle'})
    cabinet('Fore electrical distribution A',-6.0,-11.0)
    cabinet('Fore electrical distribution B',1.0,-11.0)
    cabinet('Starboard service controls A',9.6,-9.8,-math.pi/2)
    cabinet('Starboard service controls B',9.6,9.0,-math.pi/2)

    # Rotate complete port machinery banks to put vents/readouts on the aisle.
    banks=[o for o in scene.objects if o.name.startswith('Machine backing')]
    for bank in banks:
        lo,hi=bounds(bank); center=(lo+hi)/2
        associated=[bank]
        for obj in scene.objects:
            if obj.type=='EMPTY' and obj.name.startswith(('Starboard workshop machine vent','Bay equipment status')):
                p=game(obj.matrix_world.translation)
                if abs(p.z-center.z)<.8: associated.extend([obj,*obj.children_recursive])
        saved={o:o.matrix_world.copy() for o in associated}
        pivot=Vector(source(center));rotation=Matrix.Translation(pivot) @ Matrix.Rotation(math.pi,4,'Z') @ Matrix.Translation(-pivot)
        # Apply parents first so children keep the same assembly transform.
        def depth(obj):
            return 0 if obj.parent is None else 1+depth(obj.parent)
        for obj in sorted(saved,key=depth):
            obj.matrix_world=rotation @ saved[obj]
        box('Machine bank continuous plinth',(center.x,(floor+lo.y)/2,center.z),(.62,max(.05,lo.y-floor),1.48),bare)

    scene.view_layers[0].update()
    # Ground every bench, pump and vessel; add real valve stems and saddles.
    for obj in list(scene.objects):
        if obj.name.startswith('Bench pedestal'):
            lo,hi=bounds(obj);c=(lo+hi)/2;foot('Workbench',c.x,c.z,max(floor+.05,lo.y),.20,.58)
        elif obj.name.startswith('Workshop pump skid'):
            lo,hi=bounds(obj)
            box('Pump anti-vibration base',((lo.x+hi.x)/2,(floor+lo.y)/2,(lo.z+hi.z)/2),(hi.x-lo.x,max(.025,lo.y-floor),hi.z-lo.z),rubber)
            for x in [lo.x+.2,hi.x-.2]:
                for z in [lo.z+.18,hi.z-.18]:foot('Pump skid',x,z,hi.y,.16,.16)
            # Motor's lower shell is above the skid: shaped saddle blocks close it.
            for x in [(lo.x+hi.x)/2-.35,(lo.x+hi.x)/2+.35]:
                box('Pump motor saddle',(x,hi.y+.105,(lo.z+hi.z)/2),(.18,.21,.42),bare)
        elif obj.name.startswith('Vertical pressure vessel'):
            lo,hi=bounds(obj);c=(lo+hi)/2
            box('Pressure vessel foot',(c.x,(floor+lo.y)/2,c.z),(.62,max(.04,lo.y-floor),.64),bare)
            rod('Vessel valve stem',(c.x,floor+.874,c.z),(c.x,floor+.874,c.z-.36),.045,brass)
        elif obj.name.startswith('Pump isolation handwheel'):
            lo,hi=bounds(obj);c=(lo+hi)/2
            rod('Pump valve mounted stem',(c.x,c.y,c.z),(c.x,c.y,c.z+.37),.04,brass)

    # Concentric steam risers pass through sealed deck collars, rather than
    # ending above the floor. Overhead pipes have crossbars and roof hangers.
    for x in [-9.9,9.9]:
        for z in [-12.1,12.1]:
            rod('Continuous steam riser',(x,8.83,z),(x,16.03,z),.12,brass)
            for y in [8.83,12.43,16.03]:
                rod('Steam riser sealed collar',(x,y-.05,z),(x,y+.065,z),.20,bare)
                box('Steam riser deck flange',(x,y+.02,z),(.42,.04,.42),steel)
    for z in [-11.95,-11.67,-11.39]:
        tube('Closed overhead steam header',[(-9.9,floor+.3,z),(-9.9,ceiling-.32,z),(-8.9,ceiling-.25,z),(8.9,ceiling-.25,z),(9.9,ceiling-.32,z),(9.9,floor+.3,z)],.042,brass)
        for x in [-9.9,9.9]:
            rod('Header deck penetration',(x,floor,z),(x,floor+.32,z),.065,bare)
    for x in [-8,-4,0,4,8]:
        box('Header supporting crossbar',(x,ceiling-.32,-11.67),(.08,.07,.93),bare)
        for z in [-12.05,-11.29]:
            rod('Header ceiling hanger',(x,ceiling-.32,z),(x,ceiling,z),.021,bare)
            box('Header ceiling fixing',(x,ceiling-.022,z),(.17,.044,.17),steel)
    scene.view_layers[0].update()
    report={'removedFragments':removed,'braces':braces,'enclosures':enclosures}
    print('GROUNDED_WORKSHOP',report,flush=True)
    return report
